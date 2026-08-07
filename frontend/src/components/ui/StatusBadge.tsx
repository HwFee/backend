import { cn } from '@/lib/utils'
import { STATUS_LABELS, STATUS_TONES } from '@/lib/constants'

const toneClasses: Record<string, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
}

/** 任务/步骤状态徽章：中文标签 + 语义色，全局统一 */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONES[status] || 'muted'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className
      )}
    >
      {STATUS_LABELS[status] || status}
    </span>
  )
}
