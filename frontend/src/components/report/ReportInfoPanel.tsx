import { FileSpreadsheet } from 'lucide-react'
import type { Attachment, ReportTask } from '@/types'
import type { StepRow } from './model'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTimeFull } from '@/lib/utils'
import { modeLabel } from '@/lib/constants'
import { cn } from '@/lib/utils'

/** 详情页左栏：报告元信息 + 附件 + 步骤概览 */
export function ReportInfoPanel({
  report,
  attachments,
  steps,
}: {
  report: ReportTask
  attachments: Attachment[]
  steps: StepRow[]
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-base font-semibold text-foreground">报告信息</h2>
        <h3 className="mt-3 break-words text-lg font-bold leading-snug text-foreground">{report.title}</h3>
        <dl className="mt-4 space-y-3.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">创建时间</dt>
            <dd className="text-foreground">{formatDateTimeFull(report.created_at)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">更新时间</dt>
            <dd className="text-foreground">{formatDateTimeFull(report.updated_at)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">生成模式</dt>
            <dd className="text-foreground">{modeLabel(report.mode)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">状态</dt>
            <dd>
              <StatusBadge status={report.status} />
            </dd>
          </div>
        </dl>
        {report.error_msg && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {report.error_msg}
          </div>
        )}
      </section>

      {attachments.length > 0 && (
        <section className="border-t border-border pt-5">
          <h2 className="text-base font-semibold text-foreground">附件 ({attachments.length})</h2>
          <div className="mt-3 divide-y divide-border rounded-md border border-border">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-success" />
                <span className="min-w-0 flex-1 truncate text-foreground">{att.filename}</span>
                <span
                  className={cn(
                    'text-xs',
                    att.status === 'parsed' ? 'text-success' : 'text-muted-foreground'
                  )}
                >
                  {att.status === 'parsed' ? '已解析' : '待解析'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-border pt-5">
        <h2 className="text-base font-semibold text-foreground">执行步骤</h2>
        <div className="mt-3 space-y-1">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  step.status === 'completed'
                    ? 'bg-success'
                    : step.status === 'failed'
                      ? 'bg-destructive'
                      : step.status === 'running' || step.status === 'planning'
                        ? 'animate-pulse bg-primary'
                        : 'bg-border'
                )}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{step.name}</span>
              <StatusBadge status={step.status} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
