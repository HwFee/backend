import logging
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from crud.artifact import ArtifactCRUD
from crud.report import ReportCRUD
from crud.tool_event import ToolEventCRUD
from models.report import ArtifactVersion
from schemas.responses import ApiResponse
from utils.dependencies import get_db, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["artifacts"])


class ArtifactVersionResponse(BaseModel):
    id: int
    version: int
    content: Optional[str] = None
    content_hash: Optional[str] = None
    change_reason: Optional[str] = None
    created_by: Optional[str] = None
    source_type: str
    source_step_id: Optional[str] = None
    extra_metadata: Optional[dict] = None
    created_at: str
    model_config = ConfigDict(from_attributes=True)


class ArtifactResponse(BaseModel):
    id: int
    report_id: int
    step_id: str
    skill_id: str
    logical_name: str
    filename: str
    artifact_type: str
    current_version_id: Optional[int] = None
    current_version: Optional[ArtifactVersionResponse] = None
    version_count: int = 0
    created_at: str
    updated_at: str
    model_config = ConfigDict(from_attributes=True)


class RestoreVersionRequest(BaseModel):
    version_id: int
    created_by: str = "user"


class ChatEditRequest(BaseModel):
    message: str
    target_step_id: Optional[str] = None
    target_artifact_id: Optional[int] = None


class ToolEventResponse(BaseModel):
    id: int
    report_id: int
    step_id: str
    skill_id: str
    event_type: str
    title: str
    description: Optional[str] = None
    status: str
    input_data: Optional[dict] = None
    output_data: Optional[dict] = None
    artifact_id: Optional[int] = None
    artifact_version_id: Optional[int] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    sort_order: int = 0
    model_config = ConfigDict(from_attributes=True)


@router.get("/{task_id}/artifacts", response_model=ApiResponse[List[ArtifactResponse]])
async def get_report_artifacts(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    artifacts = await ArtifactCRUD.get_report_artifacts(db, task_id)
    # 单次 GROUP BY 查询统计各产物的版本数，避免逐产物循环查询版本（N+1）
    version_counts = {}
    if artifacts:
        version_result = await db.execute(
            select(ArtifactVersion.artifact_id, func.count(ArtifactVersion.id))
            .where(ArtifactVersion.artifact_id.in_([a.id for a in artifacts]))
            .group_by(ArtifactVersion.artifact_id)
        )
        version_counts = {artifact_id: count for artifact_id, count in version_result.all()}
    result = []
    for art in artifacts:
        cv = art.current_version
        cv_resp = None
        if cv:
            cv_resp = ArtifactVersionResponse(
                id=cv.id,
                version=cv.version,
                content=cv.content,
                content_hash=cv.content_hash,
                change_reason=cv.change_reason,
                created_by=cv.created_by,
                source_type=cv.source_type,
                source_step_id=cv.source_step_id,
                extra_metadata=cv.extra_metadata,
                created_at=cv.created_at.isoformat() if cv.created_at else "",
            )
        result.append(ArtifactResponse(
            id=art.id,
            report_id=art.report_id,
            step_id=art.step_id,
            skill_id=art.skill_id,
            logical_name=art.logical_name,
            filename=art.filename,
            artifact_type=art.artifact_type,
            current_version_id=art.current_version_id,
            current_version=cv_resp,
            version_count=version_counts.get(art.id, 0),
            created_at=art.created_at.isoformat() if art.created_at else "",
            updated_at=art.updated_at.isoformat() if art.updated_at else "",
        ))
    return ApiResponse(status_code=200, message="获取成功", data=result)


@router.get("/{task_id}/artifacts/latest", response_model=ApiResponse[Optional[ArtifactResponse]])
async def get_latest_artifact(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    artifacts = await ArtifactCRUD.get_report_artifacts(db, task_id)
    final_art = None
    for art in artifacts:
        if art.logical_name == "最终报告":
            final_art = art
            break
    if not final_art and artifacts:
        final_art = artifacts[-1]
    if not final_art:
        return ApiResponse(status_code=200, message="无产物", data=None)

    versions = await ArtifactCRUD.get_artifact_versions(db, final_art.id)
    cv = final_art.current_version
    cv_resp = None
    if cv:
        cv_resp = ArtifactVersionResponse(
            id=cv.id,
            version=cv.version,
            content=cv.content,
            content_hash=cv.content_hash,
            change_reason=cv.change_reason,
            created_by=cv.created_by,
            source_type=cv.source_type,
            source_step_id=cv.source_step_id,
            extra_metadata=cv.extra_metadata,
            created_at=cv.created_at.isoformat() if cv.created_at else "",
        )
    return ApiResponse(status_code=200, message="获取成功", data=ArtifactResponse(
        id=final_art.id,
        report_id=final_art.report_id,
        step_id=final_art.step_id,
        skill_id=final_art.skill_id,
        logical_name=final_art.logical_name,
        filename=final_art.filename,
        artifact_type=final_art.artifact_type,
        current_version_id=final_art.current_version_id,
        current_version=cv_resp,
        version_count=len(versions),
        created_at=final_art.created_at.isoformat() if final_art.created_at else "",
        updated_at=final_art.updated_at.isoformat() if final_art.updated_at else "",
    ))


@router.get("/{task_id}/artifacts/{artifact_id}", response_model=ApiResponse[ArtifactResponse])
async def get_artifact_detail(
    task_id: int,
    artifact_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    art = await ArtifactCRUD.get_artifact(db, artifact_id)
    if not art or art.report_id != task_id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="产物不存在")

    versions = await ArtifactCRUD.get_artifact_versions(db, art.id)
    cv = art.current_version
    cv_resp = None
    if cv:
        cv_resp = ArtifactVersionResponse(
            id=cv.id,
            version=cv.version,
            content=cv.content,
            content_hash=cv.content_hash,
            change_reason=cv.change_reason,
            created_by=cv.created_by,
            source_type=cv.source_type,
            source_step_id=cv.source_step_id,
            extra_metadata=cv.extra_metadata,
            created_at=cv.created_at.isoformat() if cv.created_at else "",
        )
    return ApiResponse(status_code=200, message="获取成功", data=ArtifactResponse(
        id=art.id,
        report_id=art.report_id,
        step_id=art.step_id,
        skill_id=art.skill_id,
        logical_name=art.logical_name,
        filename=art.filename,
        artifact_type=art.artifact_type,
        current_version_id=art.current_version_id,
        current_version=cv_resp,
        version_count=len(versions),
        created_at=art.created_at.isoformat() if art.created_at else "",
        updated_at=art.updated_at.isoformat() if art.updated_at else "",
    ))


@router.get("/{task_id}/artifacts/{artifact_id}/versions", response_model=ApiResponse[List[ArtifactVersionResponse]])
async def get_artifact_versions(
    task_id: int,
    artifact_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    art = await ArtifactCRUD.get_artifact(db, artifact_id)
    if not art or art.report_id != task_id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="产物不存在")

    versions = await ArtifactCRUD.get_artifact_versions(db, artifact_id)
    result = []
    for v in versions:
        result.append(ArtifactVersionResponse(
            id=v.id,
            version=v.version,
            content=v.content,
            content_hash=v.content_hash,
            change_reason=v.change_reason,
            created_by=v.created_by,
            source_type=v.source_type,
            source_step_id=v.source_step_id,
            extra_metadata=v.extra_metadata,
            created_at=v.created_at.isoformat() if v.created_at else "",
        ))
    return ApiResponse(status_code=200, message="获取成功", data=result)


@router.post("/{task_id}/artifacts/{artifact_id}/restore", response_model=ApiResponse[ArtifactVersionResponse])
async def restore_artifact_version(
    task_id: int,
    artifact_id: int,
    req: RestoreVersionRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    art = await ArtifactCRUD.get_artifact(db, artifact_id)
    if not art or art.report_id != task_id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="产物不存在")

    try:
        new_version = await ArtifactCRUD.restore_version(
            db, artifact_id, req.version_id, created_by=req.created_by
        )
    except ValueError as e:
        from utils.exceptions import AppException
        raise AppException(status_code=400, message=str(e))

    if art.logical_name == "最终报告":
        task.final_report_md = new_version.content
        task.pdf_path = None
        task.docx_path = None
        await db.commit()

    return ApiResponse(status_code=200, message="版本恢复成功", data=ArtifactVersionResponse(
        id=new_version.id,
        version=new_version.version,
        content=new_version.content,
        content_hash=new_version.content_hash,
        change_reason=new_version.change_reason,
        created_by=new_version.created_by,
        source_type=new_version.source_type,
        source_step_id=new_version.source_step_id,
        extra_metadata=new_version.extra_metadata,
        created_at=new_version.created_at.isoformat() if new_version.created_at else "",
    ))


@router.post("/{task_id}/chat", response_model=ApiResponse[dict])
async def chat_edit(
    task_id: int,
    req: ChatEditRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    if task.status not in ("completed", "failed"):
        from utils.exceptions import AppException
        raise AppException(status_code=400, message="报告尚未完成，无法编辑")

    from services.chat_orchestrator import ChatOrchestrator
    orchestrator = ChatOrchestrator(db)
    result = await orchestrator.process_message(
        task_id=task_id,
        message=req.message,
        target_step_id=req.target_step_id,
        target_artifact_id=req.target_artifact_id,
        user_id=current_user.id,
    )
    return ApiResponse(status_code=200, message="处理完成", data=result)


@router.post("/{task_id}/rerun/{step_id}", response_model=ApiResponse[dict])
async def rerun_step(
    task_id: int,
    step_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    if task.status not in ("completed", "failed"):
        from utils.exceptions import AppException
        raise AppException(status_code=400, message="报告尚未完成，无法重跑")

    from services.chat_orchestrator import ChatOrchestrator
    orchestrator = ChatOrchestrator(db)
    result = await orchestrator.rerun_from_step(
        task_id=task_id,
        step_id=step_id,
        user_id=current_user.id,
        change_reason="User requested rerun",
    )
    return ApiResponse(status_code=200, message="重跑完成", data=result)


@router.get("/{task_id}/tool-events", response_model=ApiResponse[List[ToolEventResponse]])
async def get_tool_events(
    task_id: int,
    step_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await ReportCRUD.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        from utils.exceptions import AppException
        raise AppException(status_code=404, message="报告不存在")

    if step_id:
        events = await ToolEventCRUD.get_events_by_step(db, task_id, step_id)
    else:
        events = await ToolEventCRUD.get_events_by_report(db, task_id)

    result = []
    for evt in events:
        result.append(ToolEventResponse(
            id=evt.id,
            report_id=evt.report_id,
            step_id=evt.step_id,
            skill_id=evt.skill_id,
            event_type=evt.event_type,
            title=evt.title,
            description=evt.description,
            status=evt.status,
            input_data=evt.input_data,
            output_data=evt.output_data,
            artifact_id=evt.artifact_id,
            artifact_version_id=evt.artifact_version_id,
            started_at=evt.started_at.isoformat() if evt.started_at else None,
            completed_at=evt.completed_at.isoformat() if evt.completed_at else None,
            sort_order=evt.sort_order,
        ))
    return ApiResponse(status_code=200, message="获取成功", data=result)
