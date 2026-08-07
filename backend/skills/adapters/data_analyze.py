import logging
import os
import re
from datetime import datetime

from pipeline.types import PipelineContext, PipelineStep, SkillResult
from services.llm_client import DeepSeekClient
from services.model_router import ModelRouter
from tools.code_executor import CodeExecutor, SandboxUnavailable

logger = logging.getLogger(__name__)


class DataAnalyzeSkill:
    skill_id = "data.analyze"
    name = "数据分析"
    description = "表格/CSV/数据分析，生成图表和洞察"

    SYSTEM_PROMPT = """你是一个专业的数据分析师，擅长用 Python 进行数据处理和可视化分析。

# 工作流程
1. 分析附件数据文件（CSV、Excel、JSON 等）
2. 编写完整、可运行的 Python 代码
3. 代码执行后，解释分析结果

# 编码规范
- 代码必须完整可运行，使用 print() 输出关键结果
- 如果需要图表，保存为 PNG 文件并 print 输出文件路径
- 必须处理异常和空数据情况
- 代码块用 ```python 包裹

# 可用库
pandas, numpy, matplotlib, seaborn, json, csv, os, sys"""

    def __init__(self):
        self.client = DeepSeekClient()
        self.executor = CodeExecutor(timeout=60)

    def execute(self, context: PipelineContext, step: PipelineStep) -> SkillResult:
        attachments = context.artifacts.get("attachments", [])
        research_notes = context.artifacts.get("research_notes", "")

        attachments_info = self._build_attachments_info(attachments)
        user_content = f"研究资料：\n{research_notes}\n\n{attachments_info}\n\n请编写 Python 代码完成数据分析："

        code_started = datetime.utcnow()
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        model = ModelRouter.select("data")
        response = self.client.chat_sync(messages=messages, model=model)

        code = response.get("content", "")
        extracted_code = self._extract_code(code)

        if extracted_code:
            exec_started = datetime.utcnow()
            try:
                exec_result = self.executor.run(extracted_code)
            except SandboxUnavailable as e:
                # 沙箱不可用（daemon 未运行/镜像缺失）：不回落宿主执行，跳过代码分析
                logger.warning("数据分析跳过代码执行：%s", e)
                exec_result = {"success": False, "output": "", "error": str(e), "skipped": True}

            if exec_result.get("skipped"):
                if "禁用" in exec_result.get("error", ""):
                    description = "代码执行沙箱已禁用，数据分析已跳过代码执行"
                else:
                    description = "代码执行沙箱不可用，数据分析已跳过代码执行"
                event_status = "skipped"
            else:
                description = (
                    "代码执行成功"
                    if exec_result.get("success")
                    else f"代码执行失败: {exec_result.get('error', '')[:80]}"
                )
                event_status = "completed" if exec_result.get("success") else "failed"

            context.tool_events.append({
                "event_type": "analyze_data",
                "title": "执行数据分析代码",
                "description": description,
                "status": event_status,
                "input_data": {"code_preview": extracted_code[:300]},
                "output_data": {
                    "output": exec_result.get("output", "")[:500],
                    "success": exec_result.get("success", False),
                    "skipped": exec_result.get("skipped", False),
                },
                "started_at": exec_started,
                "completed_at": datetime.utcnow(),
            })
        else:
            exec_result = {"success": False, "output": "", "error": "未能提取有效代码"}

        chart_files = []
        if exec_result.get("success"):
            for line in exec_result.get("output", "").split("\n"):
                line = line.strip()
                if line.endswith((".png", ".jpg", ".svg")) and os.path.exists(line):
                    chart_files.append(line)
                    context.tool_events.append({
                        "event_type": "generate_chart",
                        "title": f"生成图表 {os.path.basename(line)}",
                        "description": f"图表文件: {line}",
                        "status": "completed",
                        "input_data": {},
                        "output_data": {"file": line},
                        "started_at": None,
                        "completed_at": datetime.utcnow(),
                    })

        explanation = self._explain_results(exec_result)

        context.tool_events.append({
            "event_type": "create_file",
            "title": "创建 数据分析.md",
            "description": f"生成数据分析报告，包含 {len(chart_files)} 个图表",
            "status": "completed",
            "input_data": {},
            "output_data": {"filename": "数据分析.md", "chart_count": len(chart_files)},
            "started_at": code_started,
            "completed_at": datetime.utcnow(),
        })

        return SkillResult(
            output=explanation,
            artifacts={"analysis_code": extracted_code, "chart_files": chart_files},
            token_usage=response.get("usage", {}),
        )

    def _build_attachments_info(self, attachments) -> str:
        if not attachments:
            return ""
        lines = ["# 附件文件"]
        for i, att in enumerate(attachments, 1):
            if isinstance(att, dict):
                path = att.get("local_path") or att.get("file_path") or att.get("path", "")
                fname = att.get("filename", "")
                if path:
                    lines.append(f"{i}. {fname}: {path}")
        return "\n".join(lines)

    def _extract_code(self, content: str) -> str:
        match = re.search(r"```python\n(.*?)```", content, re.DOTALL)
        if match:
            return match.group(1).strip()
        match = re.search(r"```\n(.*?)```", content, re.DOTALL)
        if match:
            return match.group(1).strip()
        return content.strip()

    def _explain_results(self, exec_result: dict) -> str:
        if exec_result.get("skipped"):
            return f"数据分析已跳过代码执行：{exec_result.get('error', '沙箱不可用')}"
        if not exec_result.get("success"):
            return f"代码执行失败：{exec_result.get('error', '未知错误')}"
        output = exec_result.get("output", "")
        if not output.strip():
            return "代码执行成功，但没有输出内容。"
        return f"## 分析结果\n\n```\n{output}\n```"
