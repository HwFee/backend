import os
import tempfile

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import models  # noqa: F401  # 注册所有模型表
from crud.report import ReportCRUD
from models.base import Base


@pytest_asyncio.fixture
async def db_engine():
    """临时文件 sqlite 引擎（NullPool + 文件库，跨会话共享数据）。"""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{path.replace(os.sep, '/')}",
        poolclass=NullPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()
    try:
        os.unlink(path)
    except OSError:
        pass


class TestCancelledGuard:
    @pytest.mark.asyncio
    async def test_update_task_result_does_not_overwrite_cancelled(self, db_engine):
        """核心 bug 回归：任务已取消时，update_task_result 不得把 cancelled 覆盖回 completed。

        模拟 worker 流程：会话先加载任务（缓存旧快照）并提交；随后 API 进程
        在另一会话把任务置为 cancelled；worker 会话再写结果时，守卫应基于
        数据库最新状态跳过写入。
        """
        Session = async_sessionmaker(db_engine, expire_on_commit=False)

        async with Session() as db:
            task = await ReportCRUD.create_task(db, user_id=1, title="t", requirement="r")
            task_id = task.id

        # worker 会话：加载任务实体（status 快照为 pending），并提交结束事务
        async with Session() as db:
            loaded = await ReportCRUD.get_task(db, task_id)
            assert loaded.status == "pending"
            await db.commit()

            # API 进程在另一会话里停止任务
            async with Session() as db2:
                await ReportCRUD.update_task_status(db2, task_id, "cancelled")

            # worker 会话继续写结果 —— 守卫应跳过（直读数据库最新状态）
            await ReportCRUD.update_task_result(db, task_id, "final md", "/pdf", "/docx")

            # 会话内缓存的对象未被改写（守卫没有使用旧快照）
            assert loaded.status == "pending"
            assert loaded.final_report_md is None

        # 数据库真实状态仍为 cancelled，结果字段未写入
        async with Session() as db:
            status = await ReportCRUD.get_task_status(db, task_id)
            fresh = await ReportCRUD.get_task(db, task_id)
            assert status == "cancelled"
            assert fresh.final_report_md is None
            assert fresh.pdf_path is None
            assert fresh.docx_path is None

    @pytest.mark.asyncio
    async def test_update_task_result_writes_when_not_cancelled(self, db_engine):
        """未取消时，update_task_result 正常写入结果并置为 completed。"""
        Session = async_sessionmaker(db_engine, expire_on_commit=False)

        async with Session() as db:
            task = await ReportCRUD.create_task(db, user_id=1, title="t", requirement="r")
            await ReportCRUD.update_task_result(db, task.id, "final md", "/pdf", "/docx")
            fresh = await ReportCRUD.get_task(db, task.id)
            assert fresh.status == "completed"
            assert fresh.final_report_md == "final md"
            assert fresh.pdf_path == "/pdf"
            assert fresh.docx_path == "/docx"

    @pytest.mark.asyncio
    async def test_get_task_status_reads_latest_db_value(self, db_engine):
        """get_task_status 直读状态列，绕开会话 identity map 的旧快照。"""
        Session = async_sessionmaker(db_engine, expire_on_commit=False)

        async with Session() as db:
            task = await ReportCRUD.create_task(db, user_id=1, title="t", requirement="r")
            task_id = task.id

        async with Session() as db_a:
            loaded = await ReportCRUD.get_task(db_a, task_id)
            assert loaded.status == "pending"
            await db_a.commit()

            async with Session() as db_b:
                await ReportCRUD.update_task_status(db_b, task_id, "cancelled")

            # 会话 A 直读状态列：拿到数据库最新值 cancelled，而非缓存快照 pending
            status = await ReportCRUD.get_task_status(db_a, task_id)
            assert status == "cancelled"
            # 实体缓存仍是旧快照，证明列查询绕过了 identity map
            assert loaded.status == "pending"
