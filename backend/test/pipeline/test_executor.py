import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pipeline.executor import PipelineExecutor
from pipeline.errors import StepExecutionError, SkillNotFoundError
from pipeline.skill_pool import SkillPool
from pipeline.types import PipelineContext, PipelinePlan, PipelineStep, SkillResult


class FakeSuccessSkill:
    skill_id = "fake.success"
    name = "Fake Success"
    description = "Always succeeds"

    def execute(self, context: PipelineContext, step: PipelineStep) -> SkillResult:
        return SkillResult(
            output=f"result_{step.id}",
            artifacts={f"{step.id}_extra": "extra_data"},
            token_usage={"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
        )


class FakeFailSkill:
    skill_id = "fake.fail"
    name = "Fake Fail"
    description = "Always fails"

    def execute(self, context: PipelineContext, step: PipelineStep) -> SkillResult:
        raise ValueError("Intentional failure")


class FakeContextSkill:
    skill_id = "fake.context"
    name = "Fake Context"
    description = "Reads from context"

    def execute(self, context: PipelineContext, step: PipelineStep) -> SkillResult:
        prev_output = context.artifacts.get("step_a", "none")
        return SkillResult(output=f"got_{prev_output}")


def _make_mock_db():
    db = AsyncMock()
    db.commit = AsyncMock()
    return db


def _make_plan(steps: list[PipelineStep]) -> PipelinePlan:
    return PipelinePlan(id="test_pipeline", task_id=1, steps=steps)


class TestPipelineExecutor:
    @pytest.mark.asyncio
    async def test_execute_single_step(self):
        pool = SkillPool()
        pool.register(FakeSuccessSkill())
        db = _make_mock_db()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            mock_crud.is_task_cancelled = AsyncMock(return_value=False)

            plan = _make_plan([
                PipelineStep("step_a", "Step A", "fake.success", [], "step_a_output"),
            ])
            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})
            result = await executor.execute(context)

            assert result.artifacts["step_a_output"] == "result_step_a"
            assert result.artifacts["step_a_extra"] == "extra_data"

    @pytest.mark.asyncio
    async def test_execute_multiple_steps_chain_output(self):
        pool = SkillPool()
        pool.register(FakeSuccessSkill())
        pool.register(FakeContextSkill())
        db = _make_mock_db()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            mock_crud.is_task_cancelled = AsyncMock(return_value=False)

            plan = _make_plan([
                PipelineStep("step_a", "Step A", "fake.success", [], "step_a"),
                PipelineStep("step_b", "Step B", "fake.context", ["step_a"], "step_b"),
            ])
            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})
            result = await executor.execute(context)

            assert result.artifacts["step_a"] == "result_step_a"
            assert result.artifacts["step_b"] == "got_result_step_a"

    @pytest.mark.asyncio
    async def test_execute_step_failure_raises(self):
        pool = SkillPool()
        pool.register(FakeFailSkill())
        db = _make_mock_db()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            mock_crud.is_task_cancelled = AsyncMock(return_value=False)

            plan = _make_plan([
                PipelineStep("step_fail", "Fail Step", "fake.fail", [], "output"),
            ])
            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})

            with pytest.raises(StepExecutionError) as exc_info:
                await executor.execute(context)
            assert exc_info.value.step_id == "step_fail"

    @pytest.mark.asyncio
    async def test_execute_stops_on_failure(self):
        pool = SkillPool()
        pool.register(FakeFailSkill())
        pool.register(FakeSuccessSkill())
        db = _make_mock_db()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            mock_crud.is_task_cancelled = AsyncMock(return_value=False)

            plan = _make_plan([
                PipelineStep("step_fail", "Fail", "fake.fail", [], "a"),
                PipelineStep("step_ok", "OK", "fake.success", ["step_fail"], "b"),
            ])
            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})

            with pytest.raises(StepExecutionError):
                await executor.execute(context)

            assert "b" not in context.artifacts

    @pytest.mark.asyncio
    async def test_execute_stops_between_steps_when_cancelled(self):
        """协作式取消：步骤之间检测到 cancelled 时，不再执行后续步骤。"""
        pool = SkillPool()
        pool.register(FakeSuccessSkill())
        db = _make_mock_db()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            # 第一个步骤开始前未取消，第二个步骤开始前已取消
            mock_crud.is_task_cancelled = AsyncMock(side_effect=[False, True])

            plan = _make_plan([
                PipelineStep("step_a", "Step A", "fake.success", [], "step_a_output"),
                PipelineStep("step_b", "Step B", "fake.success", [], "step_b_output"),
            ])
            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})
            result = await executor.execute(context)

            # 第一步正常执行，第二步被取消跳过
            assert "step_a_output" in result.artifacts
            assert "step_b_output" not in result.artifacts
            assert "step_b_extra" not in result.artifacts

    @pytest.mark.asyncio
    async def test_execute_marks_db_status(self):
        pool = SkillPool()
        pool.register(FakeSuccessSkill())
        db = _make_mock_db()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            mock_crud.is_task_cancelled = AsyncMock(return_value=False)

            plan = _make_plan([
                PipelineStep("step_a", "Step A", "fake.success", [], "output"),
            ])
            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})
            await executor.execute(context)

            calls = mock_crud.update_node_status.call_args_list
            statuses = [c.args[2] for c in calls]
            assert "running" in statuses
            assert "completed" in statuses

    @pytest.mark.asyncio
    async def test_execute_unknown_skill_raises(self):
        pool = SkillPool()
        db = _make_mock_db()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            mock_crud.is_task_cancelled = AsyncMock(return_value=False)

            plan = _make_plan([
                PipelineStep("step_x", "X", "nonexistent.skill", [], "output"),
            ])
            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})

            with pytest.raises(StepExecutionError):
                await executor.execute(context)
