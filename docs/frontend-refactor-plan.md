# 前端大重构 + 系统优化计划

> 系统名：**基于 Agent 的技术报告生成系统**
> 日期：2026-08-07。约束：前端重构由主代理亲自执行，禁止派子代理做前端；后端优化可派子代理。
> API 契约以 `docs/api-contract.md` 为准（由子代理从后端代码提取）。

## 一、现状评估（重构依据）

### 前端问题清单

1. **死代码 ~900 行**：`components/report/`（AgentChat、ChatInput、ProjectSidebar、ReportPreview、StopButton、AgentIcon、messages/\*）、`components/layout/TopNav.tsx`、`components/FileUploadZone.tsx` 全部无引用；`types/index.ts` 中 AgentType/ChatMessage/AgentState/ReportSession/AgentConfig/MessageType 只被死组件引用；`lib/utils.ts` 的 AGENT_CONFIG_MAP/getAgentConfig/getAgentTypeFromString 同理。
2. **759 行巨石详情页** `app/reports/[id]/page.tsx`：步骤顺序/中文名/颜色 tone 全部硬编码，与后端 planner 重复；事件渲染、预览、版本、聊天全堆一个文件。
3. **管理后台无入口**：Sidebar 无 admin 导航，管理员只能手输 URL；`/admin/*` 与 `/` 用两套独立 AppShell 路由。
4. **admin/dashboard「最近失败任务」是写死的假数据**（hwfee/test001/user123，2024 日期）；且用 `<a href="/admin/tasks">` 整页刷新。
5. **admin/agents 页硬编码 pipeline 步骤和 Pro/Flash 模型标签**，后端已有 `/api/reports/pipeline` 端点可用。
6. **模式标签三处不一致**：dashboard「混合模式/参考型」vs reports「深度模式/参考模式」vs new「基于模板/参考资料」。
7. **性能**：`useNow(1000)` 使详情页每秒整树重渲染；详情页 4 个并发轮询（report/status/artifacts/tool-events 各 3s）。
8. **类型**：`ApiResponse<any[]>`（artifacts/versions/tool-events/chat/rerun）；`ReportTask.status` 缺 `'cancelled'`（后端会设置）；登录/注册 `catch (err: any)`。
9. **UX 杂项**：StatusBadge 用英文标签；错误提示用 `alert()`，无 toast；登录页「记住我」无实际功能；settings 页两个退出登录按钮。
10. **品牌**：Sidebar/登录页写「Report Agent」，应改为系统正式名。

### 后端问题（初步，待 api-contract.md 补充）

- `backend/legacy/`（planner/executor）与 `backend/agents/` 是死代码，新 pipeline 不引用。
- Celery 不可用时用 `asyncio.create_task` 在请求内兜底，进程退出任务即丢。
- 更多见契约文档「后端观察到的可优化点」一节。

## 二、前端重构方案

### 技术决策

- **不折腾依赖**：保持 React 19 + Vite 8 + TS + Tailwind 3.4 + TanStack Query + Zustand + react-router 7 + recharts + lucide-react。新增 0 个运行时依赖（toast/对话框等自写小组件）。
- **设计系统**：CSS 变量 token 化（沿用 shadcn HSL token 体系），`darkMode: 'class'` 已配好，全套页面只用 token 类（`bg-background`/`text-foreground`/`bg-card`/`border-border`/`text-muted-foreground`…），禁止散写 `gray-*`/`blue-600`，为暗色模式留路。
- **视觉方向**：专业 Agent 控制台风——深色侧边栏（slate-950 系）、内容区浅灰底 + 白卡片、品牌色保留蓝（`primary`）、步骤流水线用统一 token 色而非彩虹色。中文界面，所有状态/模式标签统一中文。
- **目录结构**（放弃 Next 风格 `app/**/page.tsx`，改直白的 `pages/`）：
  ```
  src/
    api/        client.ts queries.ts mutations.ts（全类型化）
    components/ ui/（button card input badge skeleton select dialog toast textarea table）
                layout/（AppShell Sidebar AuthGuard）
                report/（详情页拆出的子组件）
    hooks/      useNow（改按需）useDebounce useToast
    lib/        utils.ts（cn/formatters）constants.ts（模式/状态/步骤标签单点真相）
    pages/      Login Register Dashboard Reports NewReport ReportDetail Settings
                admin/ AdminDashboard AdminTasks AdminUsers AdminAgents
    stores/     authStore.ts uiStore.ts
    types/      index.ts（按 api-contract.md 重写）
  ```
- **路由**：`/admin/*` 并入同一个 AppShell，Sidebar 按 `user.is_admin` 显示「管理」分组；App.tsx 懒加载 admin 页面（`React.lazy`）减小主包。

### 页面级改动要点

- **Login/Register**：品牌名改「基于 Agent 的技术报告生成系统」；去掉无功能的「记住我」；错误提示内联；`catch` 用 axios 类型守卫。
- **Dashboard**：统计卡 + 最近报告（复用统一 ReportTable 组件），模式标签统一。
- **Reports 列表**：搜索防抖（useDebounce），删除/停止加确认 dialog，空态/错误态。
- **NewReport**：模式卡片与标签单点来源 `lib/constants.ts`；上传组件内联保留但重做样式；提交错误用 toast。
- **ReportDetail**（重头戏）：拆成 `report/` 下 StepTimeline、StepEventRow、ArtifactPreview、VersionList、ChatComposer、ReportInfoPanel；步骤元信息优先用后端 `/api/reports/pipeline` 返回的名称/顺序，硬编码表仅作 fallback；`useNow` 只包住运行中的时长小组件（隔离每秒重渲染）；聊天区显示会话历史（若契约支持）。
- **Settings**：单退出按钮；表单受控；成功/失败 toast。
- **Admin×4**：dashboard 删假数据（失败任务从 `/api/admin/tasks?status=failed` 拉）、`<a>` 换 `<Link>`；agents 页改从 `/api/reports/pipeline` + `/api/skills` 拉取，删硬编码。

### 删除清单（重构第一步执行）

- `src/components/report/` 整个目录（详情页重写时新建同名目录，先删旧文件）
- `src/components/layout/TopNav.tsx`、`src/components/FileUploadZone.tsx`
- `src/types/index.ts` 旧 chat 类型、`src/lib/utils.ts` 的 AGENT_CONFIG_MAP/getAgentConfig/getAgentTypeFromString/formatStatus（合并进 constants）

### 逻辑修复（顺带完成）

- `ReportTask.status` 补 `'cancelled'`；`NodeStatus`/`AgentNode.status` 与后端枚举对齐（以契约为准）
- 所有 `ApiResponse<any>` 填真实类型
- 状态/模式/步骤中文标签全部收敛到 `lib/constants.ts`

## 三、后端优化（子代理，契约文档完成后启动）

候选（按契约文档「可优化点」确认后裁剪）：
1. 删除 `backend/legacy/`、`backend/agents/` 死代码（先全仓 grep 确认无引用，跑测试验证）
2. `asyncio.create_task` 兜底改可靠方案（或至少日志告警 + 状态落库）
3. 契约文档列出的其它 Critical/Important 项

## 四、验证

- `cd frontend && npm run build`（tsc 严格模式）+ `npm run lint` 全绿
- 后端改动后跑 `backend/test/` 现有测试
- 完成后更新 `AGENTS.md`（目录结构变化）
