import asyncio
import json
import logging
import traceback
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from crud.artifact import ArtifactCRUD
from crud.report import ReportCRUD
from models.report import ReportToolEvent
from pipeline.errors import PipelineAbortedError, StepExecutionError
from pipeline.skill_pool import SkillPool
from pipeline.types import PipelineContext, PipelinePlan, PipelineStep
from services.model_router import ModelRouter

logger = logging.getLogger(__name__)

ARTIFACT_CONFIG = {
    "requirement_intake": {
        "logical_name": "需求解析",
        "filename": "需求解析.json",
        "artifact_type": "json",
    },
    "outline_plan": {
        "logical_name": "报告大纲",
        "filename": "报告大纲.md",
        "artifact_type": "markdown",
    },
    "research_collect": {
        "logical_name": "资料摘要",
        "filename": "资料摘要.md",
        "artifact_type": "markdown",
    },
    "data_analyze": {
        "logical_name": "数据分析",
        "filename": "数据分析.md",
        "artifact_type": "markdown",
    },
    "draft_report": {
        "logical_name": "初稿",
        "filename": "初稿.md",
        "artifact_type": "markdown",
    },
    "de_ai_polish": {
        "logical_name": "润色稿",
        "filename": "润色稿.md",
        "artifact_type": "markdown",
    },
    "quality_check": {
        "logical_name": "评审意见",
        "filename": "评审意见.md",
        "artifact_type": "markdown",
    },
    "export_files": {
        "logical_name": "最终报告",
        "filename": "最终报告.md",
        "artifact_type": "markdown",
    },
}


class PipelineExecutor:
    def __init__(self, plan: PipelinePlan, skill_pool: SkillPool, db: AsyncSession):
        self.plan = plan
        self.skill_pool = skill_pool
        self.db = db
        self._db_lock = asyncio.Lock()
        self._node_db_ids: dict[str, int] = {}
        self._step_results: dict[str, dict] = {}
        self._step_artifact_ids: dict[str, int] = {}

    async def execute(self, context: PipelineContext) -> PipelineContext:
        for step in self.plan.steps:
            # 协作式取消：每个新步骤开始前检查任务是否已被用户停止。
            # 步骤内部的 LLM 调用无法中途打断，取消在步骤边界生效。
            if await ReportCRUD.is_task_cancelled(self.plan.task_id):
                logger.warning(
                    f"[PipelineExecutor] 任务 {self.plan.task_id} 已取消，停止执行后续步骤"
                )
                break
            failed_deps = self._check_dependencies(step)
            if failed_deps:
                await self._skip_step(step, failed_deps)
                continue
            await self._mark_running(step)
            events_before = len(context.tool_events)
            try:
                skill = self.skill_pool.get(step.skill_id)
                result = await asyncio.to_thread(skill.execute, context, step)
                context.artifacts[step.output_key] = result.output
                for k, v in result.artifacts.items():
                    context.artifacts[k] = v
                self._step_results[step.id] = {
                    "output": result.output,
                    "token_usage": result.token_usage,
                }
                await self._mark_completed(step, result)
                await self._persist_tool_events(context, step, events_before)
            except Exception as e:
                await self._mark_failed(step, e)
                raise StepExecutionError(step.id, e) from e
        return context

    def _check_dependencies(self, step: PipelineStep) -> list[str]:
        failed = []
        for dep_id in step.depends_on:
            if dep_id not in self._step_results:
                failed.append(dep_id)
        return failed

    async def _skip_step(self, step: PipelineStep, failed_deps: list[str]):
        skip_msg = f"跳过执行：前置节点 {', '.join(failed_deps)} 失败"
        logger.warning(f"[PipelineExecutor] {skip_msg} (step={step.id})")
        model = ModelRouter.select(step.skill_id)
        async with self._db_lock:
            db_node = await ReportCRUD.create_agent_node(
                self.db, self.plan.task_id, step.id, step.skill_id, model
            )
            self._node_db_ids[step.id] = db_node.id
            await ReportCRUD.update_node_status(
                self.db, db_node.id, "failed",
                output_data={"error": skip_msg},
            )
            await self.db.commit()

    async def _mark_running(self, step: PipelineStep):
        model = ModelRouter.select(step.skill_id)
        async with self._db_lock:
            db_node = await ReportCRUD.create_agent_node(
                self.db, self.plan.task_id, step.id, step.skill_id, model
            )
            self._node_db_ids[step.id] = db_node.id
            await ReportCRUD.update_node_status(self.db, db_node.id, "running")
            await self.db.commit()

    async def _mark_completed(self, step: PipelineStep, result):
        output_for_db = {}
        raw_output = str(result.output) if result.output else ""
        output_for_db["content"] = raw_output[:2000] if len(raw_output) > 2000 else raw_output
        for k, v in result.artifacts.items():
            val_str = str(v) if v else ""
            output_for_db[k] = val_str[:2000] if len(val_str) > 2000 else val_str
        async with self._db_lock:
            db_id = self._node_db_ids[step.id]
            await ReportCRUD.update_node_status(
                self.db, db_id, "completed",
                output_data=output_for_db,
                token_usage=result.token_usage,
            )
            try:
                await self._write_artifact(step, result)
            except Exception as e:
                logger.warning(f"[PipelineExecutor] Artifact write failed for step {step.id}: {e}")
            await self.db.commit()

    async def _write_artifact(self, step: PipelineStep, result):
        config = ARTIFACT_CONFIG.get(step.id)
        if not config:
            logger.warning(f"[PipelineExecutor] No artifact config for step {step.id}")
            return

        content = result.output
        if config["artifact_type"] == "json" and not isinstance(content, str):
            content = json.dumps(content, ensure_ascii=False, indent=2)
        elif not isinstance(content, str):
            content = str(content) if content else ""

        if step.id == "export_files":
            polished = self._step_results.get("de_ai_polish", {}).get("output", "")
            if polished:
                content = polished

        existing = await ArtifactCRUD.get_artifact_by_step(
            self.db, self.plan.task_id, step.id
        )
        if existing:
            await ArtifactCRUD.create_version(
                db=self.db,
                artifact_id=existing.id,
                content=content,
                source_type="skill_rerun",
                change_reason=f"Pipeline step {step.id} completed",
                created_by="system",
                source_step_id=step.id,
                metadata={"token_usage": result.token_usage},
            )
            self._step_artifact_ids[step.id] = existing.id
        else:
            artifact = await ArtifactCRUD.create_artifact(
                db=self.db,
                report_id=self.plan.task_id,
                step_id=step.id,
                skill_id=step.skill_id,
                logical_name=config["logical_name"],
                filename=config["filename"],
                artifact_type=config["artifact_type"],
                content=content,
                source_type="initial_generation",
                change_reason=f"Pipeline step {step.id} completed",
                created_by="system",
                metadata={"token_usage": result.token_usage},
            )
            self._step_artifact_ids[step.id] = artifact.id
        logger.info(f"[PipelineExecutor] Artifact written for step {step.id}: {config['filename']}")

    async def _mark_failed(self, step: PipelineStep, error: Exception):
        error_msg = str(error)
        tb = traceback.format_exc()
        logger.error(f"[PipelineExecutor] Step {step.id} failed: {error_msg}\n{tb}")
        async with self._db_lock:
            db_id = self._node_db_ids.get(step.id)
            if db_id:
                await ReportCRUD.update_node_status(
                    self.db, db_id, "failed",
                    output_data={"error": error_msg, "traceback": tb},
                )
                await self.db.commit()

    async def _persist_tool_events(self, context: PipelineContext, step: PipelineStep, events_before: int):
        new_events = context.tool_events[events_before:]
        if not new_events:
            return
        async with self._db_lock:
            for i, evt in enumerate(new_events):
                db_event = ReportToolEvent(
                    report_id=self.plan.task_id,
                    step_id=step.id,
                    skill_id=step.skill_id,
                    event_type=evt.get("event_type", "unknown"),
                    title=evt.get("title", ""),
                    description=evt.get("description"),
                    status=evt.get("status", "completed"),
                    input_data=evt.get("input_data"),
                    output_data=evt.get("output_data"),
                    artifact_id=evt.get("artifact_id"),
                    artifact_version_id=evt.get("artifact_version_id"),
                    started_at=evt.get("started_at"),
                    completed_at=evt.get("completed_at"),
                    sort_order=events_before + i,
                )
                self.db.add(db_event)
            await self.db.commit()
        logger.info(f"[PipelineExecutor] Persisted {len(new_events)} tool events for step {step.id}")
