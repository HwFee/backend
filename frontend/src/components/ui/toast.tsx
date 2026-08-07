import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useToastStore, type ToastKind } from '@/lib/toast'
import { cn } from '@/lib/utils'

const icons: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const toneClasses: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-primary',
}

export function Toaster() {
  const { toasts, dismiss } = useToastStore()
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.kind]
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-lg"
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneClasses[t.kind])} />
            <p className="flex-1 text-sm text-card-foreground">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
