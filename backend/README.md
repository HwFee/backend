# Backend

AI 报告系统后端服务，基于 FastAPI 构建。

## 技术栈

- **FastAPI** —— Web 框架
- **SQLAlchemy 2.0** —— 异步 ORM
- **PostgreSQL** —— 数据库
- **Celery + Redis** —— 异步任务队列
- **LangGraph / LangChain** —— Agent 编排

## 目录说明

```
backend/
├── config/        # 配置文件（database.py、celery.py、settings.py）
├── crud/          # 数据库 CRUD 封装
├── models/        # SQLAlchemy 数据模型
├── pipeline/      # 任务流水线（planner.py、executor.py、skill_pool.py）
├── routers/       # FastAPI 路由
├── schemas/       # Pydantic 请求/响应模型
├── scripts/       # 脚本（seed_dev_user.py 等）
├── services/      # 业务逻辑层
├── skills/        # 技能适配器（对接 skills/ 目录）
├── test/          # 测试用例
├── tools/         # 工具函数（代码执行、数据库查询、网页搜索）
├── utils/         # 通用工具（安全、异常、依赖注入）
└── workers/       # Celery 异步任务
```

## 本地开发

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
uvicorn main:app --reload --port 8000

# 启动 Celery Worker
celery -A config.celery:celery_app worker --loglevel=info

# 运行测试
pytest
```

## 如何启用代码执行沙箱

`data_analyze` 步骤会执行 LLM 生成的分析代码，默认通过 Docker 沙箱运行
（`settings.code_exec_backend="docker"`），**不要在宿主机直接执行**（RCE 风险）。

启用步骤：

1. 启动 Docker Desktop（Windows），确认 daemon 可达：`docker info`。
2. 构建沙箱镜像（内含 pandas/numpy/matplotlib/seaborn/openpyxl，非 root 用户）：

   ```bash
   docker build -f backend/docker/code-runner.Dockerfile -t report-agent-code-runner:latest backend/docker
   ```

3. 无需改代码：默认配置即为 `code_exec_backend="docker"`、镜像 `report-agent-code-runner:latest`，
   可用环境变量 `CODE_EXEC_BACKEND` / `CODE_EXEC_DOCKER_IMAGE` 覆盖。

降级行为：

- daemon 未运行或镜像缺失：`data_analyze` 跳过代码执行，发出 `skipped` 工具事件
  （「代码执行沙箱不可用，数据分析已跳过代码执行」），流水线继续做纯文本分析，**不会回落宿主执行**。
- `CODE_EXEC_BACKEND=disabled`：同样跳过代码执行（事件文案「沙箱已禁用」）。
- `CODE_EXEC_BACKEND=host`：在宿主机直接执行 LLM 生成的代码（任意代码执行风险），
  仅供本地调试，生产环境严禁使用；启用时会打印 RCE 警告日志。

## API 文档

服务启动后访问：http://localhost:8000/docs
