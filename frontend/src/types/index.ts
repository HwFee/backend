/**
 * API 类型定义 —— 以 docs/api-contract.md（后端代码提取）为准。
 * 旧版 agent-chat 类型（AgentType/ChatMessage/AgentState/ReportSession 等）已随死代码删除。
 */

export interface User {
  id: number
  username: string
  email: string
  is_admin: boolean
}

export type ReportMode = 'generate' | 'template' | 'reference' | 'edit'

export type ReportTaskStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface Attachment {
  id: number
  filename: string
  file_type: string
  status: 'pending' | 'parsing' | 'parsed' | 'failed'
  parsed_length?: number
}

export interface StepNodeStatus {
  node_id: string
  agent_type?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  started_at?: string | null
  completed_at?: string | null
  input_data?: Record<string, unknown>
  output_data?: {
    content?: string
    sources?: { link: string; title: string }[]
    [key: string]: unknown
  }
}

export interface ReportStatus {
  id: number
  status: string
  mode: ReportMode
  progress?: {
    current_step: string
    total_steps: number
    completed_steps: number
  }
  nodes: StepNodeStatus[]
  attachments: Attachment[]
}

export interface ReportGenerateResponse {
  task_id: number
  status: string
  message: string
}

export interface ReportTask {
  id: number
  user_id: number
  title: string
  requirement: string
  status: ReportTaskStatus
  mode?: ReportMode
  dag_plan?: Record<string, unknown>
  model_routing?: string
  final_report_md?: string
  pdf_path?: string
  docx_path?: string
  error_msg?: string
  created_at: string
  updated_at: string
}

export interface ArtifactVersion {
  id: number
  version: number
  content?: string
  content_hash?: string
  change_reason?: string
  created_by?: string
  source_type?: 'initial_generation' | 'skill_rerun' | 'user_edit' | 'chat_edit' | 'export'
  source_step_id?: string | null
  extra_metadata?: Record<string, unknown> | null
  created_at?: string
}

export interface Artifact {
  id: number
  report_id: number
  step_id: string
  skill_id: string
  logical_name: string
  filename: string
  artifact_type: string
  current_version_id?: number
  current_version?: ArtifactVersion
  version_count?: number
  created_at: string
  updated_at: string
}

export interface ToolEvent {
  id: number
  report_id: number
  step_id: string
  skill_id: string
  event_type: string
  title: string
  description?: string
  status: string
  input_data?: Record<string, unknown>
  output_data?: Record<string, unknown>
  artifact_id?: number | null
  artifact_version_id?: number | null
  started_at?: string | null
  completed_at?: string | null
  sort_order?: number
}

export interface ApiResponse<T> {
  status_code: number
  message: string
  data: T
}

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface ReportGenerateRequest {
  title: string
  requirement: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface ReportStats {
  total: number
  completed: number
  running: number
  failed: number
}

export interface UserProfile {
  id: number
  username: string
  email: string
  role: string
  created_at: string
}

export interface AdminStats {
  total_users: number
  total_reports: number
  today_reports: number
  running_tasks: number
  failed_tasks: number
  avg_duration: string
  pending_failures: number
  total_tokens: number
  trends: Record<string, number>
}

export interface AdminTask {
  id: number
  title: string
  username: string
  status: string
  mode: string
  created_at: string
  updated_at: string
  error_msg?: string
}

export interface AdminUser {
  id: number
  username: string
  email: string
  role: string
  created_at: string
}

export interface TokenTrendPoint {
  date: string
  tokens: number
}

/** 后端 /api/reports/{task_id}/pipeline 返回的 DAG 规划视图 */
export interface PipelineStep {
  id: string
  name: string
  skill_id: string
  status: string
  started_at?: string | null
  completed_at?: string | null
}

export interface PipelineView {
  pipeline_id: string | null
  task_id: number
  status: string
  is_pipeline: boolean
  steps: PipelineStep[]
}

/** chat/rerun 响应：action 联合（注意失败也可能是 HTTP 200 + error 字段） */
export interface ChatEditResponse {
  action: 'rerun' | 'edit_artifact' | 'edit_final_report' | 'none' | string
  status?: string
  error?: string
  step_id?: string
  affected_steps?: string[]
  artifact_id?: number
  new_version?: number
  message?: string
  change_reason?: string
}

export interface AdminFailedTask {
  id: number
  title: string
  failed_at?: string
  error_msg?: string
}

/** 后端 /api/reports/pipeline 返回的流水线步骤定义（admin agents 页与详情页兜底共用） */
export interface SkillInfo {
  skill_id: string
  name: string
  description?: string
}
