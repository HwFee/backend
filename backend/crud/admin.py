from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from models.report import ReportTask, AgentNode
from models.user import User


def _format_duration(seconds: float) -> str:
    """将平均耗时秒数格式化为「X分Y秒」/「Y秒」，与前端展示格式保持一致"""
    seconds = int(round(seconds))
    if seconds < 60:
        return f"{seconds}秒"
    return f"{seconds // 60}分{seconds % 60}秒"


class AdminCRUD:
    @staticmethod
    async def get_stats(db: AsyncSession) -> dict:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)
        total_users = await db.scalar(select(func.count(User.id)))
        total_reports = await db.scalar(select(func.count(ReportTask.id)))
        today_reports = await db.scalar(
            select(func.count(ReportTask.id)).where(ReportTask.created_at >= today)
        )
        running_tasks = await db.scalar(
            select(func.count(ReportTask.id)).where(ReportTask.status.in_(["running", "planning"]))
        )
        failed_tasks = await db.scalar(
            select(func.count(ReportTask.id)).where(ReportTask.status == "failed")
        )

        # 平均耗时：ReportTask 没有 completed_at 列（见 models/report.py），
        # 以已完成任务的 updated_at - created_at 近似（updated_at 在任务完成写入最终结果时更新）
        duration_result = await db.execute(
            select(ReportTask.updated_at, ReportTask.created_at)
            .where(ReportTask.status == "completed")
        )
        durations = [
            (updated_at - created_at).total_seconds()
            for updated_at, created_at in duration_result.all()
            if updated_at and created_at
        ]
        avg_seconds = sum(durations) / len(durations) if durations else 0
        avg_duration = _format_duration(avg_seconds)
        pending_failures = failed_tasks

        # 在 SQL 内对 JSON 列做聚合（total_tokens 先转文本再转 NUMERIC），
        # 避免无过滤拉全表后内存求和
        total_tokens = await db.scalar(
            select(func.sum(cast(AgentNode.token_usage["total_tokens"].as_string(), Numeric)))
        )
        total_tokens = int(total_tokens or 0)

        # 趋势：今日新增数 - 昨日新增数（running/failed 为「今日创建且当前处于该状态」- 昨日对应数，
        # 属于可计算的近似口径，不含历史状态快照）
        users_today = await db.scalar(select(func.count(User.id)).where(User.created_at >= today))
        users_yesterday = await db.scalar(
            select(func.count(User.id)).where(User.created_at >= yesterday, User.created_at < today)
        )
        reports_today = await db.scalar(
            select(func.count(ReportTask.id)).where(ReportTask.created_at >= today)
        )
        reports_yesterday = await db.scalar(
            select(func.count(ReportTask.id)).where(
                ReportTask.created_at >= yesterday, ReportTask.created_at < today
            )
        )
        running_today = await db.scalar(
            select(func.count(ReportTask.id)).where(
                ReportTask.status.in_(["running", "planning"]),
                ReportTask.created_at >= today,
            )
        )
        running_yesterday = await db.scalar(
            select(func.count(ReportTask.id)).where(
                ReportTask.status.in_(["running", "planning"]),
                ReportTask.created_at >= yesterday,
                ReportTask.created_at < today,
            )
        )
        failed_today = await db.scalar(
            select(func.count(ReportTask.id)).where(
                ReportTask.status == "failed", ReportTask.created_at >= today
            )
        )
        failed_yesterday = await db.scalar(
            select(func.count(ReportTask.id)).where(
                ReportTask.status == "failed",
                ReportTask.created_at >= yesterday,
                ReportTask.created_at < today,
            )
        )

        return {
            "total_users": total_users,
            "total_reports": total_reports,
            "today_reports": today_reports,
            "running_tasks": running_tasks,
            "failed_tasks": failed_tasks,
            "avg_duration": avg_duration,
            "pending_failures": pending_failures,
            "total_tokens": total_tokens,
            "trends": {
                "total_users": (users_today or 0) - (users_yesterday or 0),
                "total_reports": (reports_today or 0) - (reports_yesterday or 0),
                "today_reports": (reports_today or 0) - (reports_yesterday or 0),
                "running_tasks": (running_today or 0) - (running_yesterday or 0),
                "failed_tasks": (failed_today or 0) - (failed_yesterday or 0),
            },
        }

    @staticmethod
    async def get_token_trend(db: AsyncSession, days: int = 7) -> List[dict]:
        cutoff = datetime.utcnow() - timedelta(days=days)
        result = await db.execute(
            select(AgentNode).where(AgentNode.completed_at >= cutoff)
        )
        nodes = result.scalars().all()
        daily = {}
        for node in nodes:
            if node.completed_at and isinstance(node.token_usage, dict):
                day = node.completed_at.strftime("%m-%d")
                daily[day] = daily.get(day, 0) + node.token_usage.get("total_tokens", 0)
        return [{"date": d, "tokens": t} for d, t in sorted(daily.items())]

    @staticmethod
    async def get_failed_tasks(db: AsyncSession, limit: int = 5) -> List[ReportTask]:
        result = await db.execute(
            select(ReportTask)
            .where(ReportTask.status == "failed")
            .order_by(ReportTask.updated_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_all_tasks(
        db: AsyncSession, skip: int = 0, limit: int = 10,
        status: str = None, mode: str = None, user_id: int = None,
        search: str = None, start_date: datetime = None, end_date: datetime = None
    ) -> List[dict]:
        query = select(ReportTask, User.username).join(User, ReportTask.user_id == User.id)
        if status:
            query = query.where(ReportTask.status == status)
        if mode:
            query = query.where(ReportTask.mode == mode)
        if user_id:
            query = query.where(ReportTask.user_id == user_id)
        if search:
            query = query.where(ReportTask.title.ilike(f"%{search}%"))
        if start_date:
            query = query.where(ReportTask.created_at >= start_date)
        if end_date:
            query = query.where(ReportTask.created_at <= end_date)
        query = query.order_by(ReportTask.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        rows = result.all()
        return [{"task": r[0], "username": r[1]} for r in rows]

    @staticmethod
    async def count_all_tasks(
        db: AsyncSession, status: str = None, mode: str = None, user_id: int = None,
        search: str = None, start_date: datetime = None, end_date: datetime = None
    ) -> int:
        query = select(func.count(ReportTask.id)).join(User, ReportTask.user_id == User.id)
        if status:
            query = query.where(ReportTask.status == status)
        if mode:
            query = query.where(ReportTask.mode == mode)
        if user_id:
            query = query.where(ReportTask.user_id == user_id)
        if search:
            query = query.where(ReportTask.title.ilike(f"%{search}%"))
        if start_date:
            query = query.where(ReportTask.created_at >= start_date)
        if end_date:
            query = query.where(ReportTask.created_at <= end_date)
        return await db.scalar(query) or 0

    @staticmethod
    async def get_users(db: AsyncSession, skip: int = 0, limit: int = 10) -> List[User]:
        result = await db.execute(
            select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def count_users(db: AsyncSession) -> int:
        return await db.scalar(select(func.count(User.id))) or 0
