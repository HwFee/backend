import asyncio
import logging
import os
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.celery import celery_app, is_celery_available
from config.settings import settings
from crud.report import ReportCRUD
from models.report import ReportTask
from schemas.report import (
    AgentNodeResponse,
    AttachmentResponse,
    NodeResponse,
    ReportGenerateResponse,
    ReportResultResponse,
    ReportStatusResponse,
    ReportTaskResponse,
)
from schemas.responses import ApiResponse, PaginatedResponse
from utils.dependencies import get_db, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])
skills_router = APIRouter(prefix="/api", tags=["skills"])


@skills_router.get("/skills", response_model=ApiResponse[list])
async def list_skills():
    from workers.report_worker import _build_skill_pool
    pool = _build_skill_pool()
    skills = [{"skill_id": m.skill_id, "name": m.name, "description": m.description} for m in pool.list()]
    return ApiResponse(status_code=200, message="获取成功", data=skills)


def _run_report_inline(task_id: int):
    """Celery 不可用时，使用 asyncio.create_task 在后台执行报告生成"""
    try:
        from workers.report_worker import _generate_report_async

        asyncio.create_task(_generate_report_async(task_id))
    except Exception as e:
        logger.error(f"[Report] 启动 inline 任务 {task_id} 失败: {e}")


@router.post("/generate", response_model=ApiResponse[ReportGenerateResponse], status_code=201)
async def generate_report(
    title: str = Form(...),
    requirement: str = Form(...),
    mode: str = Form(default="generate"),
    files: Optional[List[UploadFile]] = File(default=None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """提交报告生成任务（支持附件上传）"""
    # 限制文件数量
    if files and len(files) > 50:
        from utils.exceptions import AppException
        raise AppException(status_code=400, message="附件数量超过限制（最多50个）")

    # 限制单文件大小（默认 20MB，通过 settings.max_upload_file_size_mb 配置）
    if files:
        max_size = settings.max_upload_file_size_mb * 1024 * 1024
        for file in files:
            safe_name = Path(file.filename or "").name
            size = getattr(file, "size", None)
            if size is None:
                # UploadFile.size 仅在文件落盘时可用；逐块读取统计大小，避免把超大文件整体载入内存
                size = 0
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > max_size:
                        break
                await file.seek(0)
            if size > max_size:
                from utils.exceptions import AppException
                raise AppException(
                    status_code=400,
                    message=f"附件 {safe_name} 超过大小限制（最大 {settings.max_upload_file_size_mb}MB）",
                )

    # FastAPI form 字段默认 latin-1 解码，但前端实际发送 GBK/UTF-8 编码
    def _fix_encoding(s: str) -> str:
        # 先尝试 latin-1 -> utf-8（标准情况）
        try:
            decoded = s.encode('latin-1').decode('utf-8')
            if decoded != s:
                return decoded
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        # 再尝试 latin-1 -> gbk（Windows 中文环境）
        try:
            decoded = s.encode('latin-1').decode('gbk')
            if decoded != s:
                return decoded
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        return s

    title = _fix_encoding(title)
    requirement = _fix_encoding(requirement)
    mode = _fix_encoding(mode)

    logger.info(f"[Report] 用户 {current_user.id} 提交报告任务: title={title}, mode={mode}")

    task = await ReportCRUD.create_task(
        db, user_id=current_user.id, title=title, requirement=requirement, mode=mode
    )
    logger.info(f"[Report] 任务已创建: task_id={task.id}, status={task.status}")

    # 保存上传文件并创建附件记录
    if files:
        upload_dir = Path(f"uploads/reports/{task.id}").resolve()
        os.makedirs(upload_dir, exist_ok=True)
        for file in files:
            # 安全处理文件名，防止路径穿越
            safe_name = Path(file.filename or "").name
            if not safe_name:
                from utils.exceptions import AppException
                raise AppException(status_code=400, message="附件文件名不能为空")

            file_path = upload_dir / safe_name
            # 确保解析后的路径仍在上传目录内
            if not str(file_path.resolve()).startswith(str(upload_dir)):
                from utils.exceptions import AppException
                raise AppException(status_code=400, message="非法文件名")

            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            await ReportCRUD.create_attachment(
                db,
                task_id=task.id,
                filename=safe_name,
                file_path=str(file_path),
                file_type=file.content_type or "application/octet-stream",
            )
        logger.info(f"[Report] 任务 {task.id} 保存了 {len(files)} 个附件")

    # 触发异步任务
    celery_available = is_celery_available()
    dispatch_error = None

    if celery_available:
        try:
            result = celery_app.send_task(
                "workers.report_worker.generate_report",
                args=[task.id],
            )
            celery_task_id = getattr(result, "id", None)
            logger.info(
                f"[Report] 任务 {task.id} 已发送到 Celery, celery_task_id={celery_task_id}"
            )
        except Exception as e:
            logger.error(f"[Report] 任务 {task.id} 发送到 Celery 失败: {e}")
            dispatch_error = str(e)
            if not settings.run_reports_inline_when_celery_unavailable:
                await ReportCRUD.update_task_status(
                    db, task.id, "failed", error_msg=f"Celery 发送失败: {e}"
                )
                from utils.exceptions import AppException
                raise AppException(
                    status_code=503, message="任务队列不可用，请稍后重试"
                )
    else:
        dispatch_error = "Celery broker 不可达"
        if not settings.run_reports_inline_when_celery_unavailable:
            await ReportCRUD.update_task_status(
                db, task.id, "failed", error_msg="任务队列未启动"
            )
            from utils.exceptions import AppException
            raise AppException(
                status_code=503, message="任务队列未启动，请联系管理员"
            )

    # Celery 不可用或发送失败时，尝试 inline 执行
    if dispatch_error:
        logger.warning(f"[Report] 任务 {task.id} 将使用 inline 模式执行，原因: {dispatch_error}")
        try:
            _run_report_inline(task.id)
        except Exception as e:
            logger.error(f"[Report] inline 任务 {task.id} 启动失败: {e}")
            await ReportCRUD.update_task_status(
                db, task.id, "failed", error_msg=f"任务启动失败: {e}"
            )
            from utils.exceptions import AppException
            raise AppException(status_code=500, message=f"任务启动失败: {e}")

    return ApiResponse(
        status_code=201,
        message="报告生成任务已提交",
        data=ReportGenerateResponse(
            task_id=task.id, status=task.status
        ),
    )


@router.get("", response_model=ApiResponse[PaginatedResponse[ReportTaskResponse]])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    page: int = 1,
    page_size: int = 10,
    search: str = None,
    status: str = None,
):
    """获取当前用户的报告列表（支持分页和筛选）"""
    skip = (page - 1) * page_size
    tasks = await ReportCRUD.get_user_tasks(
        db, user_id=current_user.id, skip=skip, limit=page_size,
        search=search, status=status
    )
    total = await ReportCRUD.count_user_tasks(
        db, user_id=current_user.id, search=search, status=status
    )
    total_pages = (total + page_size - 1) // page_size
    return ApiResponse(
        status_code=200,
        message="获取成功",
        data=PaginatedResponse(
            items=[ReportTaskResponse.model_validate(t) for t in tasks],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ),
    )


@router.get("/stats", response_model=ApiResponse[dict])
async def get_report_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取当前用户的报告统计"""
    from sqlalchemy import func, case
    result = await db.execute(
        select(
            func.count(ReportTask.id).label("total"),
            func.sum(case((ReportTask.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case((ReportTask.status.in_(["running", "planning"]), 1), else_=0)).label("running"),
            func.sum(case((ReportTask.status == "failed", 1), else_=0)).label("failed"),
        ).where(ReportTask.user_id == current_user.id)
    )
    row = result.one()
    return ApiResponse(
        status_code=200,
        message="获取成功",
        data={
            "total": row.total or 0,
            "completed": row.completed or 0,
            "running": row.running or 0,
            "failed": row.failed or 0,
        },
    )


@router.get("/{task_id}", response_model=ApiResponse[ReportTaskResponse])
async def get_report(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取报告详情"""
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    return ApiResponse(
        status_code=200,
        message="获取成功",
        data=ReportTaskResponse.model_validate(task),
    )


@router.get(
    "/{task_id}/status", response_model=ApiResponse[ReportStatusResponse]
)
async def get_report_status(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取报告任务状态和节点进度"""
    task = await ReportCRUD.get_task_with_attachments(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    raw_nodes = task.nodes or []
    # Deduplicate: keep only the latest node per step_id
    node_map = {}
    for n in raw_nodes:
        if n.node_id not in node_map or n.id > node_map[n.node_id].id:
            node_map[n.node_id] = n
    raw_nodes = list(node_map.values())

    nodes = []
    for n in raw_nodes:
        node_resp = NodeResponse.model_validate(n)
        # Compute output_summary from output_data content
        if node_resp.output_data:
            content = node_resp.output_data.get("content", "")
            if content:
                node_resp.output_summary = content[:200] if len(content) > 200 else content
        nodes.append(node_resp)

    # Compute progress from nodes
    total_steps = len(raw_nodes)
    completed_steps = sum(1 for n in raw_nodes if n.status == "completed")
    running_node = next((n for n in raw_nodes if n.status == "running"), None)
    progress = {
        "total_steps": total_steps,
        "completed_steps": completed_steps,
        "current_step": running_node.node_id if running_node else None,
    } if total_steps > 0 else None

    attachments = [
        AttachmentResponse(
            id=a.id,
            filename=a.filename,
            file_type=a.file_type,
            status="parsed" if a.parsed_content else "pending",
            parsed_length=len(a.parsed_content) if a.parsed_content else 0,
        )
        for a in (task.attachments or [])
    ]

    return ApiResponse(
        status_code=200,
        message="获取成功",
        data=ReportStatusResponse(
            id=task.id,
            status=task.status,
            mode=task.mode,
            progress=progress,
            nodes=nodes,
            attachments=attachments,
        ),
    )


@router.get("/{task_id}/attachments", response_model=ApiResponse[List[AttachmentResponse]])
async def get_report_attachments(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取报告附件列表"""
    task = await ReportCRUD.get_task_with_attachments(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    attachments = [
        AttachmentResponse(
            id=a.id,
            filename=a.filename,
            file_type=a.file_type,
            status="parsed" if a.parsed_content else "pending",
            parsed_length=len(a.parsed_content) if a.parsed_content else 0,
        )
        for a in (task.attachments or [])
    ]

    return ApiResponse(
        status_code=200,
        message="获取成功",
        data=attachments,
    )


@router.get(
    "/{task_id}/result", response_model=ApiResponse[ReportResultResponse]
)
async def get_report_result(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取报告结果（含下载链接）"""
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    pdf_url = f"/static/{task.pdf_path}" if task.pdf_path else None
    docx_url = f"/static/{task.docx_path}" if task.docx_path else None

    return ApiResponse(
        status_code=200,
        message="获取成功",
        data=ReportResultResponse(
            task_id=task.id,
            status=task.status,
            title=task.title,
            markdown_content=task.final_report_md,
            pdf_url=pdf_url,
            docx_url=docx_url,
            completed_at=task.updated_at,
        ),
    )


@router.post("/{task_id}/stop", response_model=ApiResponse)
async def stop_report(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """停止报告生成任务"""
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    if task.status not in ("pending", "planning", "running"):
        from utils.exceptions import AppException
        raise AppException(
            status_code=400,
            message=f"任务当前状态为 {task.status}，无法停止"
        )

    await ReportCRUD.update_task_status(db, task_id, "cancelled")
    logger.info(f"[Report] 任务 {task_id} 已被用户 {current_user.id} 停止")
    return ApiResponse(status_code=200, message="任务已停止", data={"status": "cancelled"})


@router.delete("/{task_id}", response_model=ApiResponse)
async def delete_report(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """删除报告"""
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    await ReportCRUD.delete_task(db, task_id)
    return ApiResponse(status_code=200, message="删除成功", data=None)


@router.get("/{task_id}/pipeline", response_model=ApiResponse[dict])
async def get_report_pipeline(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task_with_attachments(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    dag_plan = task.dag_plan or {}
    is_pipeline = dag_plan.get("pipeline", False)
    steps = dag_plan.get("steps", [])

    # Deduplicate: keep only the latest node per step_id
    node_map = {}
    for n in (task.nodes or []):
        if n.node_id not in node_map or n.id > node_map[n.node_id].id:
            node_map[n.node_id] = n
    step_details = []

    if is_pipeline and steps:
        for s in steps:
            node = node_map.get(s["id"])
            step_details.append({
                "id": s["id"],
                "name": s.get("name", s["id"]),
                "skill_id": s.get("skill_id", ""),
                "status": node.status if node else "pending",
                "started_at": node.started_at.isoformat() if node and node.started_at else None,
                "completed_at": node.completed_at.isoformat() if node and node.completed_at else None,
            })
    else:
        for n in (task.nodes or []):
            step_details.append({
                "id": n.node_id,
                "name": n.node_id,
                "skill_id": n.agent_type,
                "status": n.status,
                "started_at": n.started_at.isoformat() if n.started_at else None,
                "completed_at": n.completed_at.isoformat() if n.completed_at else None,
            })

    return ApiResponse(
        status_code=200,
        message="获取成功",
        data={
            "pipeline_id": f"pipeline_{task.id}" if is_pipeline else None,
            "task_id": task.id,
            "status": task.status,
            "is_pipeline": is_pipeline,
            "steps": step_details,
        },
    )


@router.get("/{task_id}/steps", response_model=ApiResponse[list])
async def get_report_steps(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task_with_attachments(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    steps = []
    for n in (task.nodes or []):
        steps.append({
            "id": n.node_id,
            "skill_id": n.agent_type,
            "status": n.status,
            "started_at": n.started_at.isoformat() if n.started_at else None,
            "completed_at": n.completed_at.isoformat() if n.completed_at else None,
        })

    return ApiResponse(status_code=200, message="获取成功", data=steps)
