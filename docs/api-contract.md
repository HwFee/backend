# 后端 API 契约文档（基于 Agent 的技术报告生成系统）

> 本文档是后端 `FastAPI` 服务的**唯一事实来源**，供前端整体重写时作为接口依据。
> 依据代码逐一核对生成（2026-08-07），覆盖：`backend/routers/`、`backend/models/`、`backend/schemas/`、`backend/services/`、`backend/pipeline/`、`backend/config/`、`backend/workers/`。
> 旧文档 `backend/docs/api接口规范.md`（GBK 编码）已过时，其中描述的 `/api/v1/*` 前缀与 SSE 实时推送**在现代码中均不存在**，请勿参考。

---

## 0. 全局概览

### 0.1 服务入口与基础信息

| 项 | 值 |
|---|---|
| 框架 | FastAPI + SQLAlchemy 2.0 (async) + Celery + Redis |
| 进程入口 | `backend/main.py`，`uvicorn main:app --port 8000`（见 `start.sh`，CWD 为 `backend/`） |
| API 根 | `http://<host>:8000`（前端 `VITE_API_URL` 默认 `http://localhost:8000`） |
| 接口文档 | `GET /docs`（Swagger UI，默认开启） |
| 健康检查 | `GET /health` → `{"status_code":200,"message":"Healthy","data":null}` |
| 根路由 | `GET /` → `{"message":"Welcome to the FastAPI Backend!"}` |
| 数据库 | PostgreSQL（asyncpg），启动时 `Base.metadata.create_all` 自动建表 |
| 表清单 | `users`、`user_tokens`、`report_tasks`、`agent_nodes`、`report_attachments`、`report_artifacts`、`artifact_versions`、`report_tool_events` |

### 0.2 全部端点清单（38 个业务路由 + 2 个杂项）

| # | 方法 | 路径 | 认证 | 所属 |
|---|---|---|---|---|
| 1 | POST | `/api/user/register` | 否 | user.py |
| 2 | POST | `/api/user/login` | 否 | user.py |
| 3 | POST | `/api/user/refresh` | Bearer(refresh) | user.py |
| 4 | GET | `/api/user/profile` | 是 | user.py |
| 5 | PUT | `/api/user/profile` | 是 | user.py |
| 6 | PUT | `/api/user/password` | 是 | user.py |
| 7 | GET | `/api/skills` | 否 | report.py |
| 8 | POST | `/api/reports/generate` | 是 | report.py |
| 9 | GET | `/api/reports` | 是 | report.py |
| 10 | GET | `/api/reports/stats` | 是 | report.py |
| 11 | GET | `/api/reports/{task_id}` | 是 | report.py |
| 12 | GET | `/api/reports/{task_id}/status` | 是 | report.py |
| 13 | GET | `/api/reports/{task_id}/attachments` | 是 | report.py |
| 14 | GET | `/api/reports/{task_id}/result` | 是 | report.py |
| 15 | POST | `/api/reports/{task_id}/stop` | 是 | report.py |
| 16 | DELETE | `/api/reports/{task_id}` | 是 | report.py |
| 17 | GET | `/api/reports/{task_id}/pipeline` | 是 | report.py |
| 18 | GET | `/api/reports/{task_id}/steps` | 是 | report.py |
| 19 | GET | `/api/reports/{task_id}/artifacts` | 是 | artifact.py |
| 20 | GET | `/api/reports/{task_id}/artifacts/latest` | 是 | artifact.py |
| 21 | GET | `/api/reports/{task_id}/artifacts/{artifact_id}` | 是 | artifact.py |
| 22 | GET | `/api/reports/{task_id}/artifacts/{artifact_id}/versions` | 是 | artifact.py |
| 23 | POST | `/api/reports/{task_id}/artifacts/{artifact_id}/restore` | 是 | artifact.py |
| 24 | POST | `/api/reports/{task_id}/chat` | 是 | artifact.py |
| 25 | POST | `/api/reports/{task_id}/rerun/{step_id}` | 是 | artifact.py |
| 26 | GET | `/api/reports/{task_id}/tool-events` | 是 | artifact.py |
| 27 | GET | `/api/admin/stats` | 是+admin | admin.py |
| 28 | GET | `/api/admin/token-trend` | 是+admin | admin.py |
| 29 | GET | `/api/admin/failed-tasks` | 是+admin | admin.py |
| 30 | GET | `/api/admin/tasks` | 是+admin | admin.py |
| 31 | POST | `/api/admin/tasks/{task_id}/stop` | 是+admin | admin.py |
| 32 | DELETE | `/api/admin/tasks/{task_id}` | 是+admin | admin.py |
| 33 | GET | `/api/admin/users` | 是+admin | admin.py |
| 34 | PUT | `/api/admin/users/{user_id}/role` | 是+admin | admin.py |
| 35 | DELETE | `/api/admin/users/{user_id}` | 是+admin | admin.py |
| 36 | GET | `/health` | 否 | main.py |
| 37 | GET | `/` | 否 | main.py |
| — | GET | `/static/*` | 否 | main.py 静态挂载 |
| — | GET | `/docs`、`/openapi.json` | 否 | FastAPI 内置 |

> 路由注册顺序见 `main.py:41-45`：user → report → skills → artifact → admin。`artifact.py` 的 router 前缀同样是 `/api/reports`（tag 为 `artifacts`）。
> 注意：**没有 SSE / WebSocket / Streaming 端点**。前端目前通过轮询获取进度（见第 7.6 节）。

### 0.3 全局包装与错误格式（详见第 7 章）

所有业务端点响应均包一层：

```json
{ "status_code": 200, "message": "获取成功", "data": { ... } }
```

错误响应同样是该结构：`status_code` 为 HTTP 状态码，`message` 为可展示错误信息。全局处理器见 `main.py:52-85`。

---

## 1. 认证与用户（`/api/user/*`）

鉴权方式：JWT Bearer Token。`access_token` 有效期 **15 分钟**（`settings.access_token_expire_minutes`），`refresh_token` 有效期 **7 天**（`settings.refresh_token_expire_days`），HS256 签名。
刷新令牌以明文存储在 `user_tokens` 表，登录成功会**删除该用户所有旧刷新令牌**（`crud/user.py:46`）——即每次登录都会把其他设备登出。

### 1.1 POST `/api/user/register` 注册

请求体（JSON）：

| 字段 | 类型 | 必填 | 校验/说明 |
|---|---|---|---|
| username | string | 是 | 3–50 字符 |
| password | string | 是 | 6–128 字符 |
| email | string(EmailStr) | 是 | 合法邮箱格式 |

行为：用户名/邮箱已存在 → 409 `用户已存在` / `邮箱已存在`。

响应 201：

```json
{
  "status_code": 201,
  "message": "用户注册成功",
  "data": {
    "id": 1, "username": "HwFee", "email": "a@b.com",
    "bio": null, "avatar_url": null, "gender": "unknown",
    "is_admin": false,
    "created_at": "2026-08-07T07:00:00Z", "updated_at": "2026-08-07T07:00:00Z"
  }
}
```

> 注册后**不返回 token**，需再调登录。

### 1.2 POST `/api/user/login` 登录

请求体（JSON，**不是** OAuth2 form-encoded）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| username | string | 是 | 3–50 字符 |
| password | string | 是 | 6–128 字符 |

行为：用户名或密码错误 → 401 `用户名或密码错误`。

响应 200：

```json
{
  "status_code": 200,
  "message": "登录成功",
  "data": {
    "access_token": "<jwt>",
    "refresh_token": "<jwt>",
    "token_type": "bearer",
    "user": { "id": 1, "username": "HwFee", "email": "a@b.com", "bio": null,
              "avatar_url": null, "gender": "unknown", "is_admin": false,
              "created_at": "...", "updated_at": "..." }
  }
}
```

### 1.3 POST `/api/user/refresh` 刷新令牌

请求方式特殊：**不接收 JSON body**，通过 `Authorization: Bearer <refresh_token>` 传递（`oauth2_scheme` 依赖，`routers/user.py:58-60`）。
行为：refresh_token 无效/过期/类型不匹配或 DB 中不存在 → 401 `Token无效或已过期或类型不匹配`。成功后**轮换**刷新令牌（旧刷新令牌立即失效）。

响应 200：

```json
{
  "status_code": 200,
  "message": "Token刷新成功",
  "data": { "access_token": "<jwt>", "refresh_token": "<新jwt>", "token_type": "bearer" }
}
```

### 1.4 GET `/api/user/profile` 获取个人信息

认证：access_token。响应 200：

```json
{
  "status_code": 200,
  "message": "获取成功",
  "data": { "id": 1, "username": "HwFee", "email": "a@b.com",
            "role": "user", "created_at": "2026-08-07T07:00:00Z" }
}
```

`role` 取值：`"admin"`（`is_admin=true`）或 `"user"`。

### 1.5 PUT `/api/user/profile` 更新资料

请求体（JSON）：`ProfileUpdateRequest`，**无任何校验**（`routers/user.py:22-24`）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| username | string | 是 | 无长度/唯一性校验（重名会触发数据库唯一约束 → 500） |
| email | string | 是 | 无邮箱格式校验 |

响应 200：`{ "status_code": 200, "message": "更新成功", "data": null }`

### 1.6 PUT `/api/user/password` 修改密码

请求体（JSON）：`PasswordUpdateRequest`：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| old_password | string | 是 | 旧密码 |
| new_password | string | 是 | 新密码 |
| confirm_password | string | 是 | 必须与 new_password 一致，否则 400 `两次输入的新密码不一致` |

行为：旧密码错误 → 400 `旧密码错误`。
响应 200：`{ "status_code": 200, "message": "密码修改成功", "data": null }`

---

## 2. 报告（`/api/reports/*`）

### 2.1 任务状态机（TaskStatus，`models/report.py:12-18`）

```
pending ──→ planning ──→ running ──→ completed
  │            │            │
  │            │            ├──→ failed（任一步骤抛异常）
  │            │            └──→ cancelled（仅用户/管理员调用 stop，见 2.8）
  └────────────┴──────────────（stop 可在 pending/planning/running 时调用）
```

精确枚举值（字符串）：

| 值 | 含义 | 触发点 |
|---|---|---|
| `pending` | 已创建待执行 | `POST /api/reports/generate` 创建任务时 |
| `planning` | 规划中（解析附件、生成 DAG） | worker 开始，`workers/report_worker.py:106` |
| `running` | 流水线执行中 | worker 执行前，`report_worker.py:115`；chat/rerun 时也会置为 running |
| `completed` | 完成（有最终报告） | `ReportCRUD.update_task_result` |
| `failed` | 失败（`error_msg` 有原因） | worker 异常 / Celery 不可用且未开 inline / stop 以外错误 |
| `cancelled` | 用户停止 | `POST .../stop` |

**重要**：`stop` 只改 DB 状态，**不传播到正在执行的 worker**；worker 跑完后会调用 `update_task_result` 把状态覆盖回 `completed`（见第 8 节可优化点 #1）。

### 2.2 流水线（Pipeline）步骤标识（前端进度展示的事实依据）

8 个固定步骤（`pipeline/planner.py`），`data_analyze` 仅在**有附件**时出现：

| step_id | 中文名 | skill_id | output_key（context 键） |
|---|---|---|---|
| `requirement_intake` | 需求理解 | `requirement.intake` | `normalized_requirement` |
| `outline_plan` | 生成大纲 | `planning.outline` | `report_outline` |
| `research_collect` | 资料收集 | `research.collect` | `research_notes` |
| `data_analyze` | 数据分析（仅附件） | `data.analyze` | `data_insights` |
| `draft_report` | 撰写初稿 | `writing.draft_report` | `draft_report` |
| `de_ai_polish` | 去 AI 化润色 | `writing.de_ai_polish` | `polished_report` |
| `quality_check` | 质量检查 | `review.quality_check` | `quality_report` |
| `export_files` | 导出文件 | `export.report_files` | `exported_files` |

依赖关系（`chat_orchestrator.py:17-37`）：`outline_plan`←`requirement_intake`；`research_collect`←`requirement_intake`；`data_analyze`←`research_collect`；`draft_report`←`outline_plan+research_collect(+data_analyze)`；`de_ai_polish`←`draft_report`；`quality_check`←`de_ai_polish+requirement_intake`；`export_files`←`de_ai_polish`。

`agent_nodes` 表中的 `node_id` = 上述 step_id；`agent_type` = skill_id（注意：`steps` 接口把 `agent_type` 当 skill_id 返回）。节点状态枚举 `NodeStatus`：`pending` / `running` / `completed` / `failed`（`models/report.py:29-33`）。

### 2.3 POST `/api/reports/generate` 提交生成任务（multipart/form-data）

认证：access_token。**注意：请求体不是 JSON**，而是 `Form + File` 混合：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| title | string(Form) | 是 | 报告标题 |
| requirement | string(Form) | 是 | 报告需求正文 |
| mode | string(Form) | 否 | 默认 `"generate"`；模型注释允许 `generate/template/reference/edit`，但代码除存储外不区分 |
| files | 文件数组(UploadFile) | 否 | 附件，**最多 50 个**，超限 → 400 `附件数量超过限制（最多50个）`；**单文件大小上限 20MB**（`settings.max_upload_file_size_mb`，可配置），超限 → 400 `附件 {文件名} 超过大小限制（最大 20MB）` |

特殊行为：

- 服务端会对 title/requirement/mode 做 **`_fix_encoding` 双重解码 hack**（`routers/report.py:67-82`，先 `latin-1→utf-8` 再 `latin-1→gbk`）。前端若用浏览器原生 `FormData`（UTF-8）发送，正常文本不会变；但包含 `€`、`é` 等 latin-1 可编码字符时可能被误改。**契约要求前端始终以 UTF-8 编码发送表单。**
- 附件保存到 `<CWD>/uploads/reports/{task_id}/`（绝对路径入库），随后 worker 解析其文本内容（docx/xlsx/pdf/txt/md/html，见 `services/file_parser.py`）。**附件文件本身没有任何下载端点。**
- 任务创建后：Celery 可用则 `send_task("workers.report_worker.generate_report", [task_id])`；不可用则视 `run_reports_inline_when_celery_unavailable`（默认 true）在请求进程内 `asyncio.create_task` 后台执行；两者都失败 → 503/500。
- 若 Celery 不可达且未开 inline：任务置为 `failed`，返回 503。

响应 201：

```json
{
  "status_code": 201,
  "message": "报告生成任务已提交",
  "data": { "task_id": 42, "status": "pending", "message": "报告生成任务已提交" }
}
```

### 2.4 GET `/api/reports` 报告列表（分页+筛选）

认证：access_token。Query 参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| page | int | 否 | 默认 1（从 1 开始） |
| page_size | int | 否 | 默认 10 |
| search | string | 否 | 按 `title` 模糊匹配（`ILIKE %search%`） |
| status | string | 否 | 精确匹配任务状态（见 2.1 枚举） |

响应 200：

```json
{
  "status_code": 200, "message": "获取成功",
  "data": {
    "items": [
      { "id": 42, "user_id": 1, "title": "xxx", "requirement": "需求...",
        "status": "running", "mode": "generate",
        "final_report_md": null, "pdf_path": null, "docx_path": null,
        "error_msg": null, "dag_plan": null,
        "created_at": "2026-08-07T07:00:00Z", "updated_at": "2026-08-07T07:00:00Z" }
    ],
    "total": 3, "page": 1, "page_size": 10, "total_pages": 1
  }
}
```

> 注意：列表项**包含完整 `final_report_md` 与 `dag_plan`**（可能很大）。`created_at`/`updated_at` 若 DB 为 naive 时间会补 UTC 时区（`schemas/report.py:38-44`）。只返回当前用户的任务。

### 2.5 GET `/api/reports/stats` 报告统计

认证：access_token。响应 200：

```json
{
  "status_code": 200, "message": "获取成功",
  "data": { "total": 10, "completed": 6, "running": 2, "failed": 1 }
}
```

> `running` 统计口径为 `status IN ('running','planning')`，**不含 `pending`**（`routers/report.py:224`）。仅当前用户。

### 2.6 GET `/api/reports/{task_id}` 报告详情

认证：access_token；非本人或不存在 → 404 `报告不存在`。
响应与列表项同构（`ReportTaskResponse`，含 `final_report_md`、`dag_plan` 全量）。

### 2.7 GET `/api/reports/{task_id}/status` 任务状态 + 节点进度（前端轮询主接口）

认证：access_token。响应 200：

```json
{
  "status_code": 200, "message": "获取成功",
  "data": {
    "id": 42,
    "status": "running",
    "mode": "generate",
    "progress": { "total_steps": 8, "completed_steps": 3, "current_step": "draft_report" },
    "nodes": [
      { "node_id": "requirement_intake", "agent_type": "requirement.intake",
        "status": "completed", "started_at": "2026-08-07T07:00:01Z",
        "completed_at": "2026-08-07T07:00:10Z",
        "input_data": null,
        "output_data": { "content": "…（截断到 2000 字符）" },
        "output_summary": "content 前 200 字符…", "retry_count": 0 }
    ],
    "attachments": [
      { "id": 5, "filename": "data.xlsx", "file_type": "application/vnd...",
        "status": "parsed", "parsed_length": 1234 }
    ]
  }
}
```

字段说明：

- `progress`：按**去重后的节点**（同 step_id 保留最新一条，按 DB id）计算；`total_steps=0`（尚无节点）时为 `null`；`current_step` 为当前 `running` 节点 node_id，无运行中节点时为 `null`。
- `nodes[].output_data.content`：步骤产出，**截断至 2000 字符**（`pipeline/executor.py:131-136`）。`output_summary` 由接口从 content 取前 200 字符拼出。
- `attachments[].status`：派生值，仅 `"parsed"`（有 parsed_content）或 `"pending"`（`routers/report.py:307`），无 `parsing/failed` 中间态。
- **轮询语义**：建议仅在 `status ∈ pending/planning/running` 时轮询（3s），completed/failed 停止（前端现状如此）。

### 2.8 POST `/api/reports/{task_id}/stop` 停止任务

认证：access_token。无请求体。
仅当 `status ∈ {pending, planning, running}`，否则 400 `任务当前状态为 X，无法停止`。
响应 200：`{ "status_code":200, "message":"任务已停止", "data":{"status":"cancelled"} }`
> 仅改库，**不会真正终止 worker 执行**（见 2.1 末尾警告）。

### 2.9 DELETE `/api/reports/{task_id}` 删除报告

认证：access_token。级联删除节点/附件/产物/版本/工具事件（ORM cascade）。**不删除磁盘上的附件与导出文件。**
响应 200：`{ "status_code":200, "message":"删除成功", "data":null }`

### 2.10 GET `/api/reports/{task_id}/pipeline` DAG 规划视图

认证：access_token。响应 200：

```json
{
  "status_code": 200, "message": "获取成功",
  "data": {
    "pipeline_id": "pipeline_42",
    "task_id": 42,
    "status": "running",
    "is_pipeline": true,
    "steps": [
      { "id": "requirement_intake", "name": "需求理解", "skill_id": "requirement.intake",
        "status": "completed", "started_at": "…", "completed_at": "…" }
    ]
  }
}
```

- `pipeline_id`：`is_pipeline=true` 时为 `"pipeline_{task_id}"`，否则 `null`。
- steps 来自 `task.dag_plan.steps`（worker 写入的 `{id, skill_id, name}`）与节点表按 step_id 合并；无节点的步骤 `status="pending"`。
- 非 pipeline（老任务无 dag_plan）时降级为节点表全量，`name=node_id`、`skill_id=agent_type`。

### 2.11 GET `/api/reports/{task_id}/steps` 节点步骤列表

认证：access_token。响应 200：

```json
{ "status_code": 200, "message": "获取成功",
  "data": [ { "id": "requirement_intake", "skill_id": "requirement.intake",
              "status": "completed", "started_at": "…", "completed_at": "…" } ] }
```

> 与 `/pipeline` 的差异：本接口**不去重**（rerun 后同 step_id 会出现多条），字段名也不同（无 name，`id`=node_id）。前端若用 `steps` 拼进度，需注意去重。

---

## 3. 产物/版本（`/api/reports/{task_id}/artifacts*`）

产物模型（`models/report.py:111-158`）：

- `ReportArtifact`：每步流水线产出一个 artifact，`step_id`（= step_id）、`skill_id`、`logical_name`（稳定标识，见下表）、`filename`（显示名）、`artifact_type`（`markdown/json/text/binary`）。
- `ArtifactVersion`：每个 artifact 关联多版本，`version` 从 1 递增，`content_hash` = SHA256，`source_type` 枚举：`initial_generation / skill_rerun / user_edit / chat_edit / export`。
- `current_version_id` 指向当前版本；恢复/重跑都会新建版本并移动指针。

各步骤产物固定配置（`pipeline/executor.py:19-60`）：

| step_id | logical_name | filename | artifact_type |
|---|---|---|---|
| requirement_intake | 需求解析 | 需求解析.json | json |
| outline_plan | 报告大纲 | 报告大纲.md | markdown |
| research_collect | 资料摘要 | 资料摘要.md | markdown |
| data_analyze | 数据分析 | 数据分析.md | markdown |
| draft_report | 初稿 | 初稿.md | markdown |
| de_ai_polish | 润色稿 | 润色稿.md | markdown |
| quality_check | 评审意见 | 评审意见.md | markdown |
| export_files | **最终报告** | 最终报告.md | markdown |

### 3.1 GET `/api/reports/{task_id}/artifacts` 产物列表

认证：access_token；非本人 → 404。按创建时间升序返回全部 artifact。
响应 200（`data` 为数组）：

```json
[{
  "id": 10, "report_id": 42, "step_id": "de_ai_polish", "skill_id": "writing.de_ai_polish",
  "logical_name": "润色稿", "filename": "润色稿.md", "artifact_type": "markdown",
  "current_version_id": 55,
  "current_version": {
    "id": 55, "version": 2, "content": "…全文…", "content_hash": "sha256hex",
    "change_reason": "Pipeline step de_ai_polish completed", "created_by": "system",
    "source_type": "skill_rerun", "source_step_id": "de_ai_polish",
    "extra_metadata": {"token_usage": {...}}, "created_at": "2026-08-07T07:00:00Z"
  },
  "version_count": 2,
  "created_at": "…", "updated_at": "…"
}]
```

`current_version` 为 null 时 `current_version_id` 也为 null（如被清空）。

### 3.2 GET `/api/reports/{task_id}/artifacts/latest` 最新最终报告

认证：access_token。行为：优先取 `logical_name == "最终报告"` 的产物，没有则取列表最后一个，都没有 → `data: null`（HTTP 200）。响应结构同 3.1 单条。

### 3.3 GET `/api/reports/{task_id}/artifacts/{artifact_id}` 产物详情

认证：access_token；artifact 不属于该任务 → 404 `产物不存在`。响应结构同 3.1 单条（含 `current_version` 全量内容）。

### 3.4 GET `/api/reports/{task_id}/artifacts/{artifact_id}/versions` 版本列表

认证：access_token。按 `version` 降序。响应 200（数组）：

```json
[{
  "id": 55, "version": 2, "content": "…", "content_hash": "…",
  "change_reason": "…", "created_by": "user", "source_type": "chat_edit",
  "source_step_id": null, "extra_metadata": null, "created_at": "…"
}]
```

### 3.5 POST `/api/reports/{task_id}/artifacts/{artifact_id}/restore` 恢复版本

请求体（JSON）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| version_id | int | 是 | 要恢复的源版本 ID（不存在 → 400 `Source version X not found`） |
| created_by | string | 否 | 默认 `"user"` |

行为：以源版本内容**新建一个版本**（`source_type="user_edit"`，`change_reason="Restored from version N"`，`extra_metadata.restored_from_version=N`），并设为当前版本。
特殊：若该 artifact 是 `最终报告`，同步更新 `task.final_report_md`，并**清空 `pdf_path`/`docx_path`**（`routers/artifact.py:289-293`）——即恢复后旧 PDF/DOCX 链接失效，需重新导出。
响应 200：data 为新版本对象（结构同 3.4 单项）。

### 3.6 POST `/api/reports/{task_id}/chat` 对话编辑（同步、长耗时）

请求体（JSON）：`ChatEditRequest`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| message | string | 是 | 用户修改指令 |
| target_step_id | string | 否 | 指定重跑步骤（优先级最高） |
| target_artifact_id | int | 否 | 指定要编辑的产物 |

前置条件：任务 `status ∈ {completed, failed}`，否则 400 `报告尚未完成，无法编辑`。
**行为（同步执行，可能耗时数分钟）**：按优先级分派——

1. `target_step_id` 或消息中出现 `@步骤名/@step_id`（如 `@润色`、`@de_ai_polish`）→ 重跑该步骤及其下游（`rerun_from_step`）；
2. 否则若 `target_artifact_id` → LLM 直接改写该产物内容（`_edit_artifact`，新版本 `source_type="chat_edit"`，`created_by="user_{id}"`）；
3. 否则消息命中关键词（资料/搜索/调研/大纲/初稿/润色/检查/导出/数据等，见 `chat_orchestrator.py:360-374`）→ 重跑对应步骤；
4. 否则 → LLM 直接改写最终报告（`_edit_final_report`；不存在“最终报告”产物时自动创建）。

响应 200（data 为 `dict`，**结构随 action 变化**）：

```json
// 重跑分支
{ "action": "rerun", "step_id": "de_ai_polish", "affected_steps": ["de_ai_polish","quality_check","export_files"],
  "change_reason": "<message>", "status": "completed" }
// 失败时
{ "action": "rerun", "step_id": "…", "affected_steps": ["…"], "status": "failed", "error": "…" }
// 编辑产物分支
{ "action": "edit_artifact", "artifact_id": 10, "new_version": 3, "status": "completed" }
// 编辑最终报告分支
{ "action": "edit_final_report", "message": "…", "status": "completed" }
// 找不到任务/步骤（HTTP 仍是 200！）
{ "error": "Task not found", "action": "none" }
```

> ⚠️ 前端必须同时检查 HTTP 状态码与 `data.action`/`data.error`：目标不存在时后端返回 200 + `error` 字段。
> ⚠️ 编辑/重跑后任务回到 `running`，最终回 `completed`；若 `final_report_md` 被改写，`pdf_path/docx_path` 会被清空（需重新导出）。
> ⚠️ **无超时/无取消**：请求期间若浏览器断开，后端仍继续执行到完成。

### 3.7 POST `/api/reports/{task_id}/rerun/{step_id}` 重跑指定步骤

认证：access_token。无请求体。
前置条件：任务 `status ∈ {completed, failed}`，否则 400 `报告尚未完成，无法重跑`。
行为：等价于 3.6 的「重跑分支」（`change_reason="User requested rerun"`）。step_id 不在规划中 → 200 + `{"error": "Step X not found", "action": "none"}`。
响应 200：同 3.6 重跑分支（`action:"rerun"`，成功 `status:"completed"`，失败 `status:"failed"` + `error`）。

### 3.8 GET `/api/reports/{task_id}/tool-events` 工具事件流

认证：access_token。Query：`step_id`（可选，按步骤过滤）。按 `sort_order` 升序。响应 200（数组）：

```json
[{
  "id": 77, "report_id": 42, "step_id": "research_collect", "skill_id": "research.collect",
  "event_type": "search", "title": "搜索 \"xxx\"", "description": "找到 5 条结果",
  "status": "completed",
  "input_data": {"query": "xxx"},
  "output_data": {"result_count": 5, "results": [{"title":"…","link":"…","snippet":"…"}]},
  "artifact_id": null, "artifact_version_id": null,
  "started_at": "…", "completed_at": "…", "sort_order": 0
}]
```

**event_type 全量枚举**（代码中出现的取值）：

| event_type | 产生位置 | output_data 形状 |
|---|---|---|
| `analyze_requirement` | requirement_intake | `{"parsed": "…"}` |
| `search` | research_collect | `{"result_count", "results":[{title,link,snippet}]}` |
| `read_url` | research_collect | `{"title", "snippet"}` |
| `read_file` | research_collect | `{"length"}` |
| `create_file` | 大纲/资料/初稿/数据分析 | `{"filename", "length"}` 或 `{"filename","chart_count"}` |
| `edit_file` | de_ai_polish | `{"filename","length"}` 或 `{"skipped":true}` |
| `analyze_data` | data_analyze | `{"output"(≤500), "success", "skipped"}`；沙箱不可用/禁用时事件 `status="skipped"` 且 `skipped=true`，流水线继续文本分析 |
| `generate_chart` | data_analyze | `{"file": "相对路径.png"}` |
| `review` | quality_check | `{"passed": bool, "summary"}` |
| `export_pdf` | export_files | 成功 `{"filename","path"}` / 失败空对象 |
| `export_docx` | export_files | 同上 |
| `skill_execution` | 外置 skill（PromptSkillAdapter） | `{"length","preview"}` |

`status` 字段取值：`completed` / `failed` / `skipped`（沙箱不可用或禁用时 `analyze_data` 事件为 `skipped`；模型默认 `"completed"`，无强制校验）。
> 前端可用 `title/description/status/started_at/completed_at` 渲染步骤内的时间线。轮询建议 3s（前端现状无条件 3s 轮询，含已完成任务，可优化）。

---

## 4. 管理后台（`/api/admin/*`）

认证：access_token **且 `user.is_admin == true`**，否则 403 `需要管理员权限`（`routers/admin.py:14-17`）。

### 4.1 GET `/api/admin/stats` 总体统计

响应 200：

```json
{
  "status_code": 200, "message": "获取成功",
  "data": {
    "total_users": 5, "total_reports": 12, "today_reports": 3,
    "running_tasks": 2, "failed_tasks": 1,
    "avg_duration": "8分32秒",
    "pending_failures": 1,
    "total_tokens": 123456,
    "trends": { "total_users": 0, "total_reports": 0, "today_reports": 0,
                "running_tasks": 0, "failed_tasks": 0 }
  }
}
```

> `avg_duration` 为已完成任务 `updated_at - created_at` 的平均耗时（`ReportTask` 无 `completed_at` 列，属近似口径，见 `crud/admin.py`）；`trends` 为今日新增数 − 昨日新增数（running/failed 为「今日创建且当前处于该状态」− 昨日对应数，属近似口径）。`pending_failures` 恒等于 `failed_tasks`。`today_reports` 以 `datetime.utcnow()` 当日 0 点为界（UTC，非本地时区）。

### 4.2 GET `/api/admin/token-trend` Token 趋势

Query：`days`（默认 7）。按 `completed_at` 聚合 `token_usage.total_tokens`，日期格式 `MM-DD`。
响应 200：

```json
{ "status_code": 200, "message": "获取成功",
  "data": { "data": [ { "date": "08-01", "tokens": 1200 }, { "date": "08-02", "tokens": 3400 } ] } }
```

### 4.3 GET `/api/admin/failed-tasks` 失败任务

Query：`limit`（默认 5）。按 `updated_at` 降序。
响应 200（数组）：

```json
[ { "id": 9, "title": "xxx", "failed_at": "2026-08-07T06:00:00Z", "error_msg": "..." } ]
```

### 4.4 GET `/api/admin/tasks` 全量任务列表（分页+筛选）

Query 参数：`page`(1) / `page_size`(10) / `status` / `mode` / `user_id`(int) / `search`(标题 ILIKE) / `start_date` / `end_date`（ISO 格式，`datetime.fromisoformat` 解析，解析失败 → 422）。
响应 200（items 字段与用户列表不同，含 username）：

```json
{
  "status_code": 200, "message": "获取成功",
  "data": {
    "items": [ { "id": 42, "title": "xxx", "username": "HwFee",
                 "status": "running", "mode": "generate",
                 "created_at": "…", "updated_at": "…", "error_msg": null } ],
    "total": 12, "page": 1, "page_size": 10, "total_pages": 2
  }
}
```

### 4.5 POST `/api/admin/tasks/{task_id}/stop`

无请求体。仅 `pending/planning/running` 可停，否则 400 `任务当前状态无法停止`。响应 200 `{"status_code":200,"message":"任务已停止","data":null}`（同样不真正终止 worker）。

### 4.6 DELETE `/api/admin/tasks/{task_id}`

响应 200 `{"status_code":200,"message":"删除成功","data":null}`。

### 4.7 GET `/api/admin/users` 用户列表

Query：`page`(1) / `page_size`(10)。按 `created_at` 降序。
响应 200：

```json
{ "status_code": 200, "message": "获取成功",
  "data": { "items": [ { "id": 1, "username": "HwFee", "email": "a@b.com",
                         "role": "user", "created_at": "…" } ],
            "total": 5, "page": 1, "page_size": 10, "total_pages": 1 } }
```

### 4.8 PUT `/api/admin/users/{user_id}/role` 修改角色

**role 是 Query 参数**（非 body）：`PUT /api/admin/users/{user_id}/role?role=admin`。
`user.is_admin = (role == "admin")`，其余值一律置为普通用户（无校验、无白名单）。
响应 200 `{"status_code":200,"message":"更新成功","data":null}`；用户不存在 → 404。

### 4.9 DELETE `/api/admin/users/{user_id}`

直接 `db.delete(user)`（**级联删除该用户的 report_tasks？无——`users` 与 `report_tasks` 无外键，任务会变成孤儿数据**，`routers/admin.py:174-185`，`crud/report.py` 的级联只在任务侧）。响应 200 `{"status_code":200,"message":"删除成功","data":null}`。

---

## 5. 技能（`/api/skills`）

### 5.1 GET `/api/skills` 技能列表（无需认证）

响应 200：

```json
{ "status_code": 200, "message": "获取成功",
  "data": [ { "skill_id": "requirement.intake", "name": "需求理解", "description": "清洗用户需求，提取目标、主题、格式、约束" } ] }
```

来源：`workers/report_worker.py:25-45` 的 `_build_skill_pool()`——8 个内置 adapter + 从项目根 `skills/` 目录按 `SKILL.md` frontmatter 加载的外置 skill（`SkillPackageLoader("../skills")`，映射关系见 `skills/prompt_adapter.py:12-24`，如 `data-analyst→data.analyze`、`humanizer→writing.de_ai_polish` 等）。
> `services/skill_registry.py` 中的全局 `skill_registry`（读 `<CWD>/skills`）只被已废弃的 `agents/` 使用，不是该接口的数据源。

---

## 6. 静态资源与文件 URL 规则

| 规则 | 值 |
|---|---|
| 静态挂载 | `app.mount("/static", StaticFiles(directory="images"))`（`main.py:48`），目录相对**进程 CWD** |
| 导出文件存放 | `<CWD>/images/reports/report_{task_id}_{unix_ts}.pdf|.docx`（`services/export.py` + `skills/adapters/export_report.py`） |
| 数据库存储 | `report_tasks.pdf_path / docx_path` 存**相对路径**，如 `reports/report_42_1779874837.pdf` |
| 下载 URL | 接口返回 `pdf_url = "/static/{pdf_path}"`，即浏览器最终访问 `/static/reports/report_42_....pdf` |
| 默认头像 | `User.avatar_url` 默认 `/static/default.png`（`backend/images/` 下有 default.png / default_feamle.png / default_male.png） |
| 附件上传目录 | `<CWD>/uploads/reports/{task_id}/`（**未被静态挂载，无下载端点**） |
| 前端拼接 | 前端以 `VITE_API_URL`（默认 `http://localhost:8000`）为 base，拼接 `${base}/static/${path}` |

> ⚠️ **CWD 依赖**：`start.sh` 将 CWD 设为 `backend/`，此时静态目录为 `backend/images/`，导出文件写入 `backend/images/reports/`——两者一致可工作；若从项目根启动，则对应项目根 `images/`。**切勿混用**（项目根 `images/reports/` 现存的历史文件即混跑产物）。建议前端直接用接口返回的相对 URL 拼接，不要自行猜测绝对路径。

---

## 7. 全局约定

### 7.1 认证头

```
Authorization: Bearer <access_token>
```

- access_token 15 分钟过期（JWT `exp` + `type:"access"`）。
- refresh 端点要求 `Authorization: Bearer <refresh_token>`（`type:"refresh"`）。
- 认证失败统一 401：`Token无效或已过期或类型不匹配`（`TokenInvalidException`）；token 有效但用户已被删除 → 404 `该用户不存在`。
- 无 token / 格式错误：401 `Not authenticated`（OAuth2PasswordBearer 默认行为）。

### 7.2 响应包装 `ApiResponse`

```python
class ApiResponse(BaseModel, Generic[T]):
    status_code: int = 200
    message: str = "Success"
    data: Optional[T] = None
```

所有端点（含错误）均为该三层结构。**HTTP 状态码 == `status_code` 字段**（异常处理器按 `exc.status_code` 返回，`main.py:52-59`）。

### 7.3 错误响应格式（AppException 形状）

| HTTP | 触发场景 | message 示例 |
|---|---|---|
| 400 | 业务校验失败（密码不一致、状态不允许、版本不存在、非法文件名等） | `两次输入的新密码不一致` |
| 401 | token 无效/过期/类型错误 | `Token无效或已过期或类型不匹配` |
| 403 | 非管理员访问 admin | `需要管理员权限` |
| 404 | 资源不存在/非本人 | `报告不存在` / `产物不存在` / `该用户不存在` |
| 409 | 用户名/邮箱已存在 | `用户已存在` / `邮箱已存在` |
| 422 | Pydantic 请求校验失败 | `参数校验错误: <首个错误msg>`，`data` 为 `exc.errors()` 完整列表 |
| 500 | 未捕获异常 | `服务器内部错误`（日志含堆栈，响应不含细节） |

> ⚠️ 例外：chat/rerun 的“任务/步骤/产物不存在”返回 **HTTP 200 + `data={"error": ..., "action": "none"}`**（见 3.6），前端需特判。
> ⚠️ 唯一约束冲突（如并发注册、重名 profile 更新）未被捕获 → 走 500。

### 7.4 分页参数

所有分页端点统一：`page`（1 起）、`page_size`（默认 10）；响应 `PaginatedResponse`：

```json
{ "items": [], "total": 0, "page": 1, "page_size": 10, "total_pages": 0 }
```

`total_pages = ceil(total / page_size)`；`page_size` 无上限校验。

### 7.5 时间格式

- DB 列 `DateTime(timezone=True)`（PostgreSQL timestamptz，`func.now()` 为 UTC）。
- 响应序列化：pydantic `datetime` → ISO8601（如 `2026-08-07T07:00:00Z`）；接口对 naive 值补 UTC（`schemas/report.py` 的 `_ensure_utc_timezone`）。
- `started_at/completed_at`（节点、工具事件）可能为 `null`（未开始/未结束，部分事件构造时 started_at 为 None）。

### 7.6 轮询语义（当前前端实现，供重写参考）

- 列表 `/api/reports`：5s 轮询。
- 详情/状态 `/api/reports/{id}`、`/{id}/status`：状态为 `completed|failed` 时停止轮询，否则 3s。
- 产物 `/artifacts`、`/tool-events`：**无条件 3s 轮询**（含已完成任务，浪费请求，建议按状态门控）。
- chat/rerun/stop/generate 为一次性请求；chat/rerun 同步阻塞直至流水线完成（分钟级）。

### 7.7 后端配置（前端间接依赖项，`config/settings.py`）

| 配置 | 默认值 | 说明 |
|---|---|---|
| `access_token_expire_minutes` | 15 | access token 寿命（前端可据此安排自动刷新） |
| `refresh_token_expire_days` | 7 | refresh token 寿命 |
| `run_reports_inline_when_celery_unavailable` | true | Celery 不可用时任务是否在本进程内联执行 |
| `max_upload_file_size_mb` | 20 | 附件单文件大小上限（MB），超限 → 400 |
| `code_exec_backend` | `docker` | 代码执行后端（data_analyze 步骤）：`docker`（默认，沙箱）/ `disabled`（禁用，跳过代码执行）/ `host`（宿主机直接执行，**RCE 风险，生产严禁**） |
| `code_exec_docker_image` | `report-agent-code-runner:latest` | Docker 沙箱镜像名（构建见 `backend/README.md`） |
| `debug` | false | 未在代码中实际影响行为（搜遍无 `settings.debug` 使用） |
| `allowed_hosts` | 无默认 | **未在代码中使用**（无 Host 头校验） |
| `redis_url` | `redis://localhost:6379/0` | Celery broker/backend |
| CORS | `http://localhost:5173`、`http://127.0.0.1:5173` | 仅这两个源（`main.py:31-37`） |

Celery 配置（`config/celery.py`）：json 序列化、时区 Asia/Shanghai（`enable_utc=True`）、`task_time_limit=600`（10 分钟硬超时，超时任务被 kill → 状态会停在 `running`，不会自动置 failed）、`worker_prefetch_multiplier=1`。

---

## 8. 后端观察到的可优化点

按严重度排序。均为代码观察，未做任何修改。行号以当前代码为准。

> 修复进展（2026-08-07）：#2 的「代码执行 RCE」已修复（Docker 沙箱，见下）；#3 的「单文件大小限制」、#5 的「artifact 列表 N+1」与「admin stats 全表扫描」、#7 的「占位数据」已修复；其余条目保持不变，行号随代码更新可能偏移。

### 🔴 高优先级

1. **停止/取消任务不生效（状态竞态覆盖）** — `routers/report.py:389-410` 与 `routers/admin.py:99-112` 只把 DB 状态置为 `cancelled`，没有向 worker 传递取消信号；`pipeline/executor.py` 执行中也从不检查状态。worker 跑完后 `ReportCRUD.update_task_result`（`crud/report.py:114-128`）无条件把状态写回 `completed`，用户看到的“已取消”会被覆盖。另外 Celery `task_time_limit=600` 超时后任务状态停留在 `running`（无人兜底置 failed）。

2. ~~**任意已登录用户可触发宿主机任意 Python 代码执行**~~ **已修复（2026-08-07）** — 原 `tools/code_executor.py` 在**服务器宿主进程**用 `subprocess.run(["python", temp])` 执行模型生成的代码（`data_analyze` 步骤：上传附件即可触发），一旦注入恶意代码（读 `.env`、删文件）即 RCE。修复机制：
   - 默认改为 **Docker 沙箱**（`settings.code_exec_backend`，默认 `docker`）：`docker run --rm --network none --memory 512m --cpus 1 --pids-limit 64 --read-only --tmpfs /tmp`，非 root 用户（uid 1000）、只读根文件系统，每轮执行独立临时目录挂载 `/workspace`（脚本与图表），图表执行后复制回进程 CWD；镜像 `report-agent-code-runner:latest`（`backend/docker/code-runner.Dockerfile`，构建见 `backend/README.md`）。
   - daemon 不可用/镜像缺失时抛 `SandboxUnavailable`，`data_analyze` 适配器捕获后发出 `skipped` 工具事件（「代码执行沙箱不可用，数据分析已跳过代码执行」）并**继续流水线做文本分析，不回落宿主执行**。
   - 旧宿主子进程路径仅剩 `code_exec_backend="host"` 显式开启时可达，且打 RCE 警告日志；默认配置永不触达。

3. **附件上传缺少文件大小限制与类型白名单** — `routers/report.py:56-64` 仅限制数量（≤50），无单文件大小上限（可 OOM/占满磁盘）；`file_type` 直接取 `content_type` 存入，worker 解析时对不认识的类型只返回占位串（`services/file_parser.py:142-147`）。且上传文件存入 `uploads/` 后**无任何下载端点**（`/static` 只挂 `images/`），用户上传的附件永远无法取回；`delete_task` 也不清理磁盘文件。

4. **`_fix_encoding` 双重解码 hack** — `routers/report.py:67-82`。对每个 form 字符串先试 `latin-1→utf-8` 再 `latin-1→gbk`。这是对“前端没按 UTF-8 发表单”的补偿，副作用：合法的 latin-1 可编码字符（`€`、`é`、`¼` 等）会被错误解码成别的字符，且结果不可预测（取决于两次尝试）。正确做法是前端用 `Blob`/`FormData` 强制 UTF-8，服务端删除此 hack。

5. **N+1 查询与全表扫描** —
   - `routers/artifact.py:91-98`（及 147、196、245）对每个 artifact 循环调 `ArtifactCRUD.get_artifact_versions` 查版本 → 产物越多查询越多；`get_report_artifacts` 只 `selectinload(current_version)` 未预载 versions（`crud/artifact.py:136-148`）。
   - `crud/admin.py:28-33` 的 `get_stats` 用 `select(AgentNode.token_usage)` **无过滤拉全表** JSON 列再内存求和，token 数增长后必慢。
   - `get_latest_artifact`（`routers/artifact.py:125-176`）先拉全部产物再全量拉版本。

### 🟡 中优先级

6. **死代码/未使用模块** —
   - `backend/legacy/`（`LangGraphExecutor`、`WorkflowPlanner`）与 `backend/agents/` 整包仅互相引用，当前 pipeline 路径已不用。
   - `services/skill_registry.py`、`services/tool_registry.py`、`utils/token_tracker.py`、`tools/db_query.py` 仅被测试引用。
   - `schemas/admin.py` 全部（`AdminStatsResponse` 等）无业务引用；`schemas/report.py` 的 `ReportGenerateRequest`/`OutputFormat`/`AgentNodeResponse` 未被任何端点使用（generate 用 Form）；`routers/report.py:17`、`crud/report.py:9` 有未用导入。
   - `models/report.py:46` `model_routing`、`:54` `template_file_id` 定义了但全代码无读写；`pipeline/errors.py` 的 `PipelineAbortedError` 未使用。
   - `mode` 字段支持 `template/reference/edit`，但 worker/planner 不区分。

7. **硬编码占位数据** — `crud/admin.py:24` `avg_duration = "8分32秒"` 写死；`:44` `trends` 全 0；`pending_failures` 恒等于 `failed_tasks`。管理面板会展示假数据。

8. **错误处理不一致** — chat/rerun 的“不存在”场景返回 HTTP 200 + `{"error":..., "action":"none"}`（`services/chat_orchestrator.py:64-65, 109, 116, 199`），与全站 AppException 约定相悖，前端需双重判断；部分业务异常在路由内 `try/except ValueError` 转 AppException（`routers/artifact.py:281-287`），风格不统一。

9. **路径穿越防护质量一般（字符串前缀比较）** — `routers/report.py:108` `str(file_path.resolve()).startswith(str(upload_dir))` 是字符串前缀匹配：Windows 大小写不敏感文件系统下大小写变体能绕过、目录前缀（`uploads/reports/1` vs `uploads/reports/10`）存在误判风险；`safe_name = Path(filename).name` 虽已挡住主要穿越，但该 guard 属防御性弱实现，建议改用 `Path.is_relative_to()`（3.9+）或 `os.path.commonpath` 做严格判断。

10. **Token/密码相关** —
    - refresh token 明文存库（`models/user.py:28-32`、`crud/user.py:46-50`），数据库泄露即全部会话可伪造；登录会删除该用户全部旧 refresh token（`crud/user.py:46`），多设备用户会互相登出。
    - `OAuth2PasswordBearer(tokenUrl="/api/user/login")`（`utils/dependencies.py:23`）指向的是 JSON 登录接口，Swagger“Authorize”走 form-encoded 会失败（仅影响文档调试）。
    - `update_user`（`crud/user.py:72-80`）不校验新用户名/邮箱唯一性 → 撞唯一约束时返回 500 而非 409；`create_user` 的查重+插入存在 TOCTOU 竞态（并发注册同用户名 → IntegrityError 500）。

11. **时间与统计口径问题** —
    - `GET /api/reports/{task_id}/result` 的 `completed_at` 实为 `task.updated_at`（`routers/report.py:384`），语义有误导。
    - `/stats` 的 running 口径为 `running+planning`，**不含 pending**（`routers/report.py:224`）；与用户预期“刚提交的任务算进行中”不符。
    - `crud/admin.py` 用 `datetime.utcnow()`（naive UTC）与 aware 列比较、按 `strftime("%m-%d")` 分组，时区/本地化语义混乱。
    - 附件 `status` 接口只派生 `parsed|pending`，而 `schemas/report.py:51` 注释写 `pending|parsing|parsed|failed`，注释与实现不符。

12. **`/steps` 与 `/status`、`/pipeline` 的节点去重行为不一致** — `/status` 与 `/pipeline` 对同 step_id 只保留最新节点，`/steps`（`routers/report.py:486-507`）不去重且字段名不同（`id` vs `node_id`），前端两个接口无法直接互换。

13. **导出失败被静默吞掉** — `services/export.py` 的 `export_docx`/`export_pdf` 在异常/ImportError 时返回 `None`（`services/export.py:176-179, 337-340`），worker 只在 `pdf_path/docx_path` 为空时兜底再试一次（`workers/report_worker.py:153-167`），仍然失败也**照常把任务置为 completed**，用户拿到无 PDF/DOCX 的“成功”任务。

14. **quality_check 结论解析过宽** — `skills/adapters/quality_review.py:89-95` 只要没出现 `NEEDS_REVISION` 就算 PASS（含模型乱输出）；`data_analyze` 的图表路径靠 `os.path.exists(line)` 探测（`data_analyze.py:76`），模型可伪造路径。

15. **CWD 强依赖** — `main.py:48` 静态目录、导出路径（`services/export.py` 各方法）、`uploads/`（`routers/report.py:97`）、`SkillPackageLoader("../skills")`（`skills/loader.py:9`）、`SkillRegistry("skills")`（`services/skill_registry.py:16`）全部依赖进程启动目录。建议改为 `Path(__file__).parent` 锚定。

16. **轮询与接口轻量化** — 列表接口返回全量 `final_report_md`（`ReportTaskResponse`），列表页数据量大；产物/tool-events 前端无条件 3s 轮询（含已完成任务）。建议拆分轻量列表 schema + 按状态门控轮询。
