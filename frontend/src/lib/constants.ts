import type { ReportMode } from '@/types'

/**
 * 全局文案单点真相：状态 / 模式 / 流水线步骤的中文标签。
 * 任何页面不得再各自维护标签表。
 */

export const SYSTEM_NAME = '基于 Agent 的技术报告生成系统'
export const SYSTEM_NAME_SHORT = 'Report Agent'

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export const STATUS_LABELS: Record<string, string> = {
  pending: '排队中',
  planning: '规划中',
  running: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

/** 状态 → 语义色（供 badge / 图标使用 token 类名） */
export const STATUS_TONES: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'muted'> = {
  pending: 'muted',
  planning: 'info',
  running: 'warning',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'muted',
}

export const MODE_LABELS: Record<ReportMode, string> = {
  generate: '从零生成',
  template: '基于模板',
  reference: '参考资料',
  edit: '迭代修改',
}

export const MODE_DESCRIPTIONS: Record<ReportMode, string> = {
  generate: '从零开始，AI 根据您的需求生成完整的报告内容。',
  template: '使用预设模板为基础，快速生成标准化报告。',
  reference: '基于上传的参考文档，生成带引用的专业报告。',
  edit: '基于已有报告或初稿，进行优化和扩展。',
}

export const REPORT_MODES: ReportMode[] = ['generate', 'template', 'reference', 'edit']

/** 流水线步骤的默认顺序与中文名（后端 /api/reports/pipeline 不可用时兜底） */
export const PIPELINE_STEP_ORDER = [
  'requirement_intake',
  'outline_plan',
  'research_collect',
  'data_analyze',
  'draft_report',
  'de_ai_polish',
  'quality_check',
  'export_files',
] as const

export const PIPELINE_STEP_LABELS: Record<string, string> = {
  requirement_intake: '需求理解',
  outline_plan: '生成大纲',
  research_collect: '资料收集',
  data_analyze: '数据分析',
  draft_report: '撰写初稿',
  de_ai_polish: '去 AI 化润色',
  quality_check: '质量检查',
  export_files: '导出文件',
}

/** 工具事件类型 → 中文名 */
export const TOOL_EVENT_LABELS: Record<string, string> = {
  analyze_requirement: '解析需求',
  search: '搜索资料',
  read_url: '读取网页',
  read_file: '读取文件',
  create_file: '创建文件',
  edit_file: '编辑文件',
  analyze_data: '分析数据',
  generate_chart: '生成图表',
  review: '质量检查',
  export_pdf: '导出 PDF',
  export_docx: '导出 DOCX',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status
}

export function modeLabel(mode?: string): string {
  return (mode && MODE_LABELS[mode as ReportMode]) || mode || '-'
}

export function stepLabel(stepId: string): string {
  return PIPELINE_STEP_LABELS[stepId] || stepId
}
