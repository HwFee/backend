import { useState } from 'react'
import { CheckCircle2, ChevronRight, Loader2, RotateCcw, XCircle } from 'lucide-react'
import type { Artifact, ToolEvent } from '@/types'
import type { StepRow } from './model'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StepEventRow } from './StepEventRow'
import { DurationText } from './DurationText'
import { cn } from '@/lib/utils'

function StepMarker({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-5 w-5 text-success" />
  if (status === 'failed') return <XCircle className="h-5 w-5 text-destructive" />
  if (status === 'running' || status === 'planning')
    return <Loader2 className="h-5 w-5 animate-spin text-primary" />
  return <span className="block h-5 w-5 rounded-full border-2 border-border bg-card" />
}

interface StepTimelineProps {
  steps: StepRow[]
  artifactsById: Map<number, Artifact>
  canRerun: boolean
  onRerun: (stepId: string) => void
  rerunningStep?: string | null
  onSelectArtifact: (event: ToolEvent, artifact?: Artifact) => void
}

/** 执行过程时间线（详情页中栏）：步骤可展开查看工具事件，完成后可单独重跑 */
export function StepTimeline({
  steps,
  artifactsById,
  canRerun,
  onRerun,
  rerunningStep,
  onSelectArtifact,
}: StepTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})

  return (
    <div className="relative pl-8">
      {steps.length > 1 && <div className="absolute bottom-5 left-[9px] top-5 w-px bg-border" />}
      <div className="space-y-1">
        {steps.map((step) => {
          const expanded = !!expandedSteps[step.id]
          const active = step.status === 'running' || step.status === 'planning'
          return (
            <div key={step.id} className="relative">
              <span className="absolute -left-8 top-3 z-10 flex h-5 w-5 items-center justify-center bg-card">
                <StepMarker status={step.status} />
              </span>
              <div
                className={cn(
                  'rounded-md border border-transparent transition-colors',
                  expanded ? 'border-border bg-card shadow-sm' : 'hover:bg-accent/60'
                )}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left"
                  onClick={() => setExpandedSteps((prev) => ({ ...prev, [step.id]: !prev[step.id] }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setExpandedSteps((prev) => ({ ...prev, [step.id]: !prev[step.id] }))
                    }
                  }}
                >
                  <ChevronRight
                    className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{step.name}</h3>
                      <StatusBadge status={step.status} />
                    </div>
                    {step.events.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {step.completedEvents}/{step.events.length} 个工具调用
                        {step.artifacts.length ? `，生成 ${step.artifacts.length} 个文件` : ''}
                      </p>
                    )}
                  </div>
                  {canRerun && !active && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRerun(step.id)
                      }}
                      disabled={rerunningStep === step.id}
                      className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      title="重跑此步骤及其下游"
                    >
                      {rerunningStep === step.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      重跑
                    </button>
                  )}
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    <DurationText startedAt={step.startedAt} completedAt={step.completedAt} />
                  </span>
                </div>

                {expanded && step.events.length > 0 && (
                  <div className="border-t border-border px-3 pb-3">
                    <div className="divide-y divide-border">
                      {step.events.map((event) => (
                        <StepEventRow
                          key={event.id}
                          event={event}
                          artifact={event.artifact_id ? artifactsById.get(event.artifact_id) : undefined}
                          onSelectArtifact={onSelectArtifact}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {expanded && step.events.length === 0 && (
                  <div className="border-t border-border px-3 py-3 text-xs text-muted-foreground">
                    该步骤暂无工具事件记录
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
