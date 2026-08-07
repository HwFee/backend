"""data_analyze 适配器在代码执行沙箱不可用/禁用时的降级行为测试。

覆盖：daemon 不可用 → SandboxUnavailable → 适配器不抛异常、发出 skipped
工具事件、继续文本分析；backend=disabled 同样降级；成功路径保持 completed。
全部通过 mock 实现，不要求真实 Docker daemon / DeepSeek API。
"""

import subprocess

import pytest

import tools.code_executor as code_executor_module
from config.settings import settings
from pipeline.types import PipelineContext, PipelineStep
from skills.adapters.data_analyze import DataAnalyzeSkill


def _make_skill():
    skill = DataAnalyzeSkill()
    # 不真实调用 DeepSeek：返回一段包含 python 代码块的响应
    skill.client.chat_sync = lambda messages, model: {
        "content": "```python\nimport pandas as pd\nprint('ok')\n```",
        "usage": {},
    }
    return skill


def _make_context():
    return PipelineContext(
        task_id=1,
        requirement="test",
        artifacts={
            "attachments": [{"filename": "a.csv", "local_path": "a.csv"}],
            "research_notes": "",
        },
    )


def _make_step():
    return PipelineStep("data_analyze", "数据分析", "data.analyze", [], "data_insights")


def _analyze_events(context):
    return [e for e in context.tool_events if e["event_type"] == "analyze_data"]


class TestDataAnalyzeSandboxDegradation:
    def test_daemon_down_degrades_gracefully(self, monkeypatch):
        def fake_run(argv, **kwargs):
            if argv[:2] == ["docker", "info"]:
                return subprocess.CompletedProcess(
                    argv, 1, stdout="", stderr="Cannot connect to the Docker daemon"
                )
            raise AssertionError(f"unexpected argv: {argv}")

        monkeypatch.setattr(subprocess, "run", fake_run)
        monkeypatch.setattr(code_executor_module, "_docker_daemon_ok", None)

        skill = _make_skill()
        context = _make_context()
        result = skill.execute(context, _make_step())  # 不应抛异常

        assert "跳过代码执行" in result.output
        assert result.artifacts["chart_files"] == []
        analyze = _analyze_events(context)
        assert len(analyze) == 1
        assert analyze[0]["status"] == "skipped"
        assert "沙箱不可用" in analyze[0]["description"]
        assert analyze[0]["output_data"]["skipped"] is True

    def test_disabled_backend_degrades_gracefully(self, monkeypatch):
        monkeypatch.setattr(settings, "code_exec_backend", "disabled")

        skill = _make_skill()  # 在 monkeypatch 之后构造，executor 才会选中 disabled 后端
        context = _make_context()
        result = skill.execute(context, _make_step())  # 不应抛异常

        assert "跳过代码执行" in result.output
        assert result.artifacts["chart_files"] == []
        analyze = _analyze_events(context)
        assert len(analyze) == 1
        assert analyze[0]["status"] == "skipped"
        assert "已禁用" in analyze[0]["description"]

    def test_success_path_emits_completed_event(self, monkeypatch):
        def fake_run(argv, **kwargs):
            if argv[:2] == ["docker", "info"]:
                return subprocess.CompletedProcess(argv, 0, stdout="ok", stderr="")
            if argv[:3] == ["docker", "image", "inspect"]:
                return subprocess.CompletedProcess(argv, 0, stdout="[]", stderr="")
            if argv[:2] == ["docker", "run"]:
                return subprocess.CompletedProcess(argv, 0, stdout="分析结果输出\n", stderr="")
            raise AssertionError(f"unexpected argv: {argv}")

        monkeypatch.setattr(subprocess, "run", fake_run)
        monkeypatch.setattr(code_executor_module, "_docker_daemon_ok", None)

        skill = _make_skill()
        context = _make_context()
        result = skill.execute(context, _make_step())

        assert "分析结果输出" in result.output
        analyze = _analyze_events(context)
        assert len(analyze) == 1
        assert analyze[0]["status"] == "completed"
        assert analyze[0]["output_data"]["success"] is True
        assert analyze[0]["output_data"]["skipped"] is False
