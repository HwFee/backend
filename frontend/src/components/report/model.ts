import type { Artifact, PipelineStep, StepNodeStatus, ToolEvent } from '@/types'
import { PIPELINE_STEP_LABELS, PIPELINE_STEP_ORDER } from '@/lib/constants'

export interface StepRow {
  id: string
  name: string
  status: string
  startedAt?: string | null
  completedAt?: string | null
  events: ToolEvent[]
  completedEvents: number
  artifacts: Artifact[]
}

const statusPriority = (s: string) =>
  s === 'completed' ? 3 : s === 'running' || s === 'planning' ? 2 : s === 'failed' ? 0 : 1

/**
 * 组装步骤时间线视图模型：
 * - 节点去重（rerun 后同 step_id 多条，保留状态最优的一条）
 * - 步骤顺序与名称优先取后端 /pipeline 返回的规划，缺失时用 constants 兜底
 */
export function buildStepRows({
  nodes,
  pipelineSteps,
  artifacts,
  toolEvents,
}: {
  nodes: StepNodeStatus[]
  pipelineSteps?: PipelineStep[]
  artifacts: Artifact[]
  toolEvents: ToolEvent[]
}): StepRow[] {
  const nodeByStep = new Map<string, StepNodeStatus>()
  for (const node of nodes) {
    const existing = nodeByStep.get(node.node_id)
    if (!existing || statusPriority(node.status) > statusPriority(existing.status)) {
      nodeByStep.set(node.node_id, node)
    }
  }

  const pipelineByStep = new Map<string, PipelineStep>()
  pipelineSteps?.forEach((step) => pipelineByStep.set(step.id, step))

  const eventsByStep = new Map<string, ToolEvent[]>()
  for (const event of toolEvents) {
    const list = eventsByStep.get(event.step_id) || []
    list.push(event)
    eventsByStep.set(event.step_id, list)
  }
  for (const list of eventsByStep.values()) {
    list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)
  }

  const allStepIds = new Set<string>()
  pipelineSteps?.forEach((step) => allStepIds.add(step.id))
  nodes.forEach((node) => allStepIds.add(node.node_id))
  artifacts.forEach((art) => allStepIds.add(art.step_id))
  toolEvents.forEach((event) => allStepIds.add(event.step_id))

  const orderOf = (stepId: string) => {
    const pi = pipelineSteps?.findIndex((s) => s.id === stepId) ?? -1
    if (pi >= 0) return pi
    const ci = (PIPELINE_STEP_ORDER as readonly string[]).indexOf(stepId)
    return ci >= 0 ? 100 + ci : 200
  }

  return Array.from(allStepIds)
    .sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b))
    .map((stepId) => {
      const node = nodeByStep.get(stepId)
      const planned = pipelineByStep.get(stepId)
      const events = eventsByStep.get(stepId) || []
      const started = node?.started_at || planned?.started_at || events[0]?.started_at || events[0]?.completed_at
      const completed =
        node?.completed_at || planned?.completed_at || events[events.length - 1]?.completed_at
      return {
        id: stepId,
        name: planned?.name || PIPELINE_STEP_LABELS[stepId] || stepId,
        status: node?.status || planned?.status || (events.length ? 'completed' : 'pending'),
        startedAt: started,
        completedAt: completed,
        events,
        completedEvents: events.filter((event) => event.status === 'completed').length,
        artifacts: artifacts.filter((art) => art.step_id === stepId),
      }
    })
}
