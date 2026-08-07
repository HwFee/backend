import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  isActiveStatus,
  useArtifactVersions,
  useReport,
  useReportArtifacts,
  useReportPipeline,
  useReportStatus,
  useToolEvents,
} from '@/api/queries'
import { useChatEdit, useRerunStep, useRestoreVersion } from '@/api/mutations'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { buildStepRows } from '@/components/report/model'
import { StepTimeline } from '@/components/report/StepTimeline'
import { ReportInfoPanel } from '@/components/report/ReportInfoPanel'
import { ArtifactPreview } from '@/components/report/ArtifactPreview'
import { ChatComposer } from '@/components/report/ChatComposer'
import type { ToolEvent, Artifact } from '@/types'

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const reportId = Number(id)

  const { data: report, isLoading } = useReport(reportId)
  const { data: statusData } = useReportStatus(reportId)
  const { data: pipeline } = useReportPipeline(reportId)

  const active = isActiveStatus(report?.status) || isActiveStatus(statusData?.status)
  const { data: artifactData } = useReportArtifacts(reportId, active)
  const { data: toolEventData } = useToolEvents(reportId, undefined, active)

  const artifacts = useMemo(() => (Array.isArray(artifactData) ? artifactData : []), [artifactData])
  const toolEvents = useMemo(() => (Array.isArray(toolEventData) ? toolEventData : []), [toolEventData])
  const nodes = useMemo(() => statusData?.nodes || [], [statusData])
  const attachments = statusData?.attachments || []

  const [selectedArtifactId, setSelectedArtifactId] = useState<number | null>(null)
  const [rerunningStep, setRerunningStep] = useState<string | null>(null)
  const [confirmRerun, setConfirmRerun] = useState<string | null>(null)

  const chatMutation = useChatEdit()
  const rerunMutation = useRerunStep()
  const restoreMutation = useRestoreVersion()

  const artifactsById = useMemo(() => new Map(artifacts.map((art) => [art.id, art])), [artifacts])
  const finalArtifact = useMemo(
    () => artifacts.find((art) => art.logical_name === '最终报告') || artifacts[artifacts.length - 1] || null,
    [artifacts]
  )
  const selectedArtifact = useMemo(
    () => (selectedArtifactId ? artifactsById.get(selectedArtifactId) || null : finalArtifact),
    [artifactsById, finalArtifact, selectedArtifactId]
  )
  const { data: versions } = useArtifactVersions(reportId, selectedArtifact?.id)

  const stepRows = useMemo(
    () =>
      buildStepRows({
        nodes,
        pipelineSteps: pipeline?.steps,
        artifacts,
        toolEvents,
      }),
    [nodes, pipeline, artifacts, toolEvents]
  )

  const canEdit = report?.status === 'completed' || report?.status === 'failed'

  const handleSelectArtifact = (event: ToolEvent, artifact?: Artifact) => {
    const target = artifact || (event.artifact_id ? artifactsById.get(event.artifact_id) : undefined)
    if (target) setSelectedArtifactId(target.id)
  }

  const handleChatSend = async (message: string) => {
    const mentionedStep = stepRows.find(
      (step) => message.includes(`@${step.name}`) || message.includes(`@${step.id}`)
    )
    const resp = await chatMutation.mutateAsync({
      taskId: reportId,
      message,
      targetStepId: mentionedStep?.id,
      targetArtifactId: mentionedStep ? undefined : selectedArtifact?.id,
    })
    if (resp.error) {
      toast.error(resp.error)
    } else {
      toast.success('修改指令已处理')
    }
    return resp
  }

  const handleRerun = async () => {
    if (!confirmRerun) return
    const stepId = confirmRerun
    setConfirmRerun(null)
    setRerunningStep(stepId)
    try {
      const resp = await rerunMutation.mutateAsync({ taskId: reportId, stepId })
      if (resp.error) toast.error(resp.error)
      else toast.success('步骤重跑完成')
    } catch {
      toast.error('重跑失败')
    } finally {
      setRerunningStep(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_360px] gap-4">
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <p>报告不存在或已被删除</p>
        <button onClick={() => navigate('/reports')} className="mt-3 text-sm text-primary hover:underline">
          返回报告列表
        </button>
      </div>
    )
  }

  return (
    <div className="-m-6 flex h-screen flex-col overflow-hidden px-6 py-5">
      <header className="mb-4 flex shrink-0 items-center gap-3">
        <button
          onClick={() => navigate('/reports')}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">报告详情</h1>
          <StatusBadge status={report.status} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_360px] gap-4">
        {/* 左栏：报告信息 */}
        <aside className="min-h-0 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-sm">
          <ReportInfoPanel report={report} attachments={attachments} steps={stepRows} />
        </aside>

        {/* 中栏：执行过程 + 对话编辑 */}
        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-sm">
          <div className="shrink-0 border-b border-border px-5 py-3.5">
            <h2 className="text-base font-semibold text-card-foreground">执行过程</h2>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <StepTimeline
              steps={stepRows}
              artifactsById={artifactsById}
              canRerun={canEdit}
              rerunningStep={rerunningStep}
              onRerun={(stepId) => setConfirmRerun(stepId)}
              onSelectArtifact={handleSelectArtifact}
            />
          </div>
          <ChatComposer
            disabled={!canEdit}
            disabledHint={active ? '报告生成完成后可发送修改指令' : undefined}
            pending={chatMutation.isPending}
            onSend={handleChatSend}
          />
        </section>

        {/* 右栏：产物预览 + 操作 + 版本 */}
        <aside className="min-h-0">
          <ArtifactPreview
            artifact={selectedArtifact}
            fallbackMarkdown={report.final_report_md}
            isRunning={active}
            pdfPath={report.pdf_path}
            docxPath={report.docx_path}
            versions={versions || []}
            restoring={restoreMutation.isPending}
            onRestoreVersion={(versionId) => {
              if (!selectedArtifact) return
              restoreMutation.mutate(
                { taskId: reportId, artifactId: selectedArtifact.id, versionId },
                {
                  onSuccess: () => toast.success('已恢复到所选版本'),
                  onError: () => toast.error('版本恢复失败'),
                }
              )
            }}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={!!confirmRerun}
        onClose={() => setConfirmRerun(null)}
        onConfirm={handleRerun}
        title="重跑步骤"
        description="将重跑该步骤及其全部下游步骤，相关产物会生成新版本。确定重跑？"
        confirmText="重跑"
      />
    </div>
  )
}
