import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pipeline.executor import PipelineExecutor
from pipeline.skill_pool import SkillPool
from pipeline.types import PipelineContext, PipelinePlan, PipelineStep, SkillResult


class FakeSkill:
    skill_id = "fake.test"
    name = "Fake"
    description = "Test"

    def execute(self, context: PipelineContext, step: PipelineStep) -> SkillResult:
        return SkillResult(output=f"result_{step.id}")


class FailingSkill:
    skill_id = "fake.fail"
    name = "Failing"
    description = "Always fails"

    def execute(self, context: PipelineContext, step: PipelineStep) -> SkillResult:
        raise ValueError("Intentional failure")


class TestPipelineExecutorDependsOn:
    @pytest.mark.asyncio
    async def test_skips_step_when_dependency_failed(self):
        pool = SkillPool()
        pool.register(FailingSkill())
        pool.register(FakeSkill())
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            mock_crud.is_task_cancelled = AsyncMock(return_value=False)

            plan = PipelinePlan(
                id="test",
                task_id=1,
                steps=[
                    PipelineStep("step_a", "A", "fake.fail", [], "output_a"),
                    PipelineStep("step_b", "B", "fake.test", ["step_a"], "output_b"),
                ],
            )

            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})

            with pytest.raises(Exception):
                await executor.execute(context)

            assert "output_a" not in context.artifacts
            assert "output_b" not in context.artifacts

    @pytest.mark.asyncio
    async def test_executes_when_all_dependencies_succeeded(self):
        pool = SkillPool()
        pool.register(FakeSkill())
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            mock_crud.is_task_cancelled = AsyncMock(return_value=False)

            plan = PipelinePlan(
                id="test",
                task_id=1,
                steps=[
                    PipelineStep("step_a", "A", "fake.test", [], "output_a"),
                    PipelineStep("step_b", "B", "fake.test", ["step_a"], "output_b"),
                ],
            )

            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})
            result = await executor.execute(context)

            assert "output_a" in result.artifacts
            assert "output_b" in result.artifacts

    @pytest.mark.asyncio
    async def test_marks_skipped_step_as_failed(self):
        pool = SkillPool()
        pool.register(FailingSkill())
        pool.register(FakeSkill())
        db = AsyncMock()
        db.commit = AsyncMock()

        with patch("pipeline.executor.ReportCRUD") as mock_crud:
            mock_node = MagicMock()
            mock_node.id = 100
            mock_crud.create_agent_node = AsyncMock(return_value=mock_node)
            mock_crud.update_node_status = AsyncMock()
            mock_crud.is_task_cancelled = AsyncMock(return_value=False)

            plan = PipelinePlan(
                id="test",
                task_id=1,
                steps=[
                    PipelineStep("step_a", "A", "fake.fail", [], "output_a"),
                    PipelineStep("step_b", "B", "fake.test", ["step_a"], "output_b"),
                ],
            )

            executor = PipelineExecutor(plan, pool, db)
            context = PipelineContext(task_id=1, requirement="test", artifacts={})

            with pytest.raises(Exception):
                await executor.execute(context)

            calls = mock_crud.update_node_status.call_args_list
            statuses = [c.args[2] for c in calls]
            assert "failed" in statuses
