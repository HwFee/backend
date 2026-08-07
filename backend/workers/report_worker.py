import logging
import os
from datetime import datetime

from config.celery import celery_app
from config.database import WorkerSession
from crud.report import ReportCRUD
from pipeline.executor import PipelineExecutor
from pipeline.planner import PipelinePlanner
from pipeline.skill_pool import SkillPool
from pipeline.types import PipelineContext
from services.file_parser import parse_file
from skills.adapters.requirement_intake import RequirementIntakeSkill
from skills.adapters.outline_plan import OutlinePlanSkill
from skills.adapters.research_collect import ResearchCollectSkill
from skills.adapters.data_analyze import DataAnalyzeSkill
from skills.adapters.report_draft import ReportDraftSkill
from skills.adapters.de_ai_polish import DeAiPolishSkill
from skills.adapters.quality_review import QualityReviewSkill
from skills.adapters.export_report import ExportReportSkill

logger = logging.getLogger(__name__)


def _build_skill_pool() -> SkillPool:
    from skills.loader import SkillPackageLoader
    from skills.prompt_adapter import PromptSkillAdapter

    pool = SkillPool()
    pool.register(RequirementIntakeSkill())
    pool.register(OutlinePlanSkill())
    pool.register(ResearchCollectSkill())
    pool.register(DataAnalyzeSkill())
    pool.register(ReportDraftSkill())
    pool.register(DeAiPolishSkill())
    pool.register(QualityReviewSkill())
    pool.register(ExportReportSkill())

    loader = SkillPackageLoader()
    for pkg in loader.discover():
        adapter = PromptSkillAdapter(pkg)
        pool.register(adapter)
        logger.info(f"[Worker] Registered prompt skill: {adapter.skill_id}")

    return pool


_tables_ensured = False


async def _ensure_tables():
    """确保所有表存在（Celery worker 不经过 FastAPI lifespan）"""
    global _tables_ensured
    if _tables_ensured:
        return
    try:
        from config.database import async_engine
        from models.base import Base
        import models  # noqa: ensure all models registered

        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[Worker] 数据库表检查完成")
    except Exception as e:
        logger.warning(f"[Worker] create_all failed: {e}")
    _tables_ensured = True


@celery_app.task(bind=True, max_retries=3)
def generate_report(self, task_id: int):
    # 注意：若 worker 进程被硬杀（OOM/崩溃/重启），任务会卡在 running 且没有任何
    # 进程内钩子可清理——本任务未配置软/硬超时。后续可通过 worker 启动时扫描
    # 孤儿 running 任务并置为 failed 来兜底（当前未实现）。
    logger.info(f"[Worker] 收到任务: task_id={task_id}")
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        return loop.run_until_complete(_generate_report_async(task_id))
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(_generate_report_async(task_id))
        except Exception as e:
            logger.exception(f"[Worker] 任务 {task_id} 执行失败，准备重试: {e}")
            raise self.retry(exc=e, countdown=60)


async def _generate_report_async(task_id: int):
    await _ensure_tables()
    # 任务可能已被用户取消（例如上一次失败重试期间）。已取消则直接返回，
    # 不进入执行流程，也不改写任何状态（保持 cancelled）。
    if await ReportCRUD.is_task_cancelled(task_id):
        logger.info(f"[Worker] 任务 {task_id} 已取消，跳过执行")
        return False
    async with WorkerSession() as db:
        try:
            task = await ReportCRUD.get_task_with_attachments(db, task_id)
            if not task:
                logger.error(f"[Worker] 任务 {task_id} 不存在")
                return False
            logger.info(f"[Worker] 任务 {task_id} 获取成功, mode={task.mode}, attachments={len(task.attachments)}")

            for attachment in task.attachments:
                try:
                    content = parse_file(attachment.file_path, attachment.file_type)
                    attachment.parsed_content = content
                    logger.info(f"[Worker] 附件解析成功: {attachment.filename}")
                except Exception as e:
                    logger.warning(f"[Worker] 附件解析失败: {attachment.filename}, error={e}")
                    attachment.parsed_content = f"[Parse failed: {e}]"
            await db.commit()

            # 附件解析期间用户可能已停止任务：进入执行前再确认一次
            if await ReportCRUD.is_task_cancelled(task_id):
                logger.info(f"[Worker] 任务 {task_id} 在附件解析期间被取消，中止执行")
                return False

            await ReportCRUD.update_task_status(db, task_id, "planning")
            logger.info(f"[Worker] 任务 {task_id} 状态更新为 planning")

            planner = PipelinePlanner()
            plan = planner.plan(task)
            task.dag_plan = {"pipeline": True, "steps": [{"id": s.id, "skill_id": s.skill_id, "name": s.name} for s in plan.steps]}
            await db.commit()
            logger.info(f"[Worker] 任务 {task_id} Pipeline 规划完成")

            await ReportCRUD.update_task_status(db, task_id, "running")
            logger.info(f"[Worker] 任务 {task_id} 状态更新为 running")

            attachments_data = []
            for att in task.attachments:
                attachments_data.append({
                    "filename": att.filename,
                    "content": att.parsed_content or "",
                    "file_path": att.file_path,
                })

            context = PipelineContext(
                task_id=task.id,
                requirement=task.requirement,
                artifacts={
                    "requirement": task.requirement,
                    "title": task.title,
                    "mode": task.mode,
                    "attachments": attachments_data,
                },
            )

            skill_pool = _build_skill_pool()
            executor = PipelineExecutor(plan, skill_pool, db)
            context = await executor.execute(context)
            logger.info(f"[Worker] 任务 {task_id} Pipeline 执行完成")

            # 取消可能发生在最后一个步骤执行期间（步骤内无法打断），
            # 执行完再确认一次：已取消则跳过导出与结果写入，保持 cancelled 状态。
            if await ReportCRUD.is_task_cancelled(task_id):
                logger.info(f"[Worker] 任务 {task_id} 已取消，跳过导出与结果写入")
                return False

            final_report = context.artifacts.get("polished_report") or context.artifacts.get("draft_report", "")

            quality_passed = context.artifacts.get("quality_passed")
            quality_report = context.artifacts.get("quality_report")
            if quality_report:
                logger.info(f"[Worker] 任务 {task_id} 质量检查: passed={quality_passed}")

            exported = context.artifacts.get("exported_files", {})
            pdf_path = exported.get("pdf_path")
            docx_path = exported.get("docx_path")

            if not pdf_path or not docx_path:
                from services.export import ExportService
                if not pdf_path:
                    pdf_filename = f"report_{task_id}_{int(datetime.now().timestamp())}.pdf"
                    pdf_full_path = "/".join(["images", "reports", pdf_filename])
                    os.makedirs(os.path.dirname(pdf_full_path), exist_ok=True)
                    if ExportService.export_pdf(final_report, pdf_full_path):
                        pdf_path = "/".join(["reports", pdf_filename])

                if not docx_path:
                    docx_filename = f"report_{task_id}_{int(datetime.now().timestamp())}.docx"
                    docx_full_path = "/".join(["images", "reports", docx_filename])
                    os.makedirs(os.path.dirname(docx_full_path), exist_ok=True)
                    if ExportService.export_docx(final_report, docx_full_path):
                        docx_path = "/".join(["reports", docx_filename])

            await ReportCRUD.update_task_result(
                db, task_id, final_report, pdf_path, docx_path
            )
            logger.info(f"[Worker] 任务 {task_id} 完成, 状态更新为 completed")

            return True

        except Exception as e:
            logger.exception(f"[Worker] 任务 {task_id} 执行失败: {e}")
            # 用户已停止的任务保持 cancelled，不覆盖为 failed
            if not await ReportCRUD.is_task_cancelled(task_id):
                await ReportCRUD.update_task_status(
                    db, task_id, "failed", error_msg=str(e)
                )
                await db.commit()
            raise
