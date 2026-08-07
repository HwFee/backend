import { Workflow } from 'lucide-react'
import { useSkills } from '@/api/queries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PIPELINE_STEP_LABELS, PIPELINE_STEP_ORDER } from '@/lib/constants'

const STEP_SKILL_IDS: Record<string, string> = {
  requirement_intake: 'requirement.intake',
  outline_plan: 'planning.outline',
  research_collect: 'research.collect',
  data_analyze: 'data.analyze',
  draft_report: 'writing.draft_report',
  de_ai_polish: 'writing.de_ai_polish',
  quality_check: 'review.quality_check',
  export_files: 'export.report_files',
}

export default function AdminAgentsPage() {
  const { data: skills, isLoading } = useSkills()
  const skillByIds = new Map((skills || []).map((s) => [s.skill_id, s]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Skill Pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">报告生成流水线的步骤编排与 Skill 注册表</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline 执行流程</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            {PIPELINE_STEP_ORDER.map((stepId, index) => {
              const skill = skillByIds.get(STEP_SKILL_IDS[stepId])
              return (
                <div key={stepId} className="flex items-center gap-3">
                  <div className="flex flex-col items-center rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="mb-1.5 text-sm font-medium text-card-foreground">
                      {skill?.name || PIPELINE_STEP_LABELS[stepId]}
                    </div>
                    <div className="mb-1 text-xs text-muted-foreground">{stepId}</div>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {STEP_SKILL_IDS[stepId]}
                    </span>
                  </div>
                  {index < PIPELINE_STEP_ORDER.length - 1 && <div className="h-px w-6 bg-border" />}
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            data_analyze 仅在任务包含附件时插入；步骤编排以后端 pipeline/planner.py 为准。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skill 注册表</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(skills || []).map((skill) => (
                <div
                  key={skill.skill_id}
                  className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Workflow className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-card-foreground">{skill.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{skill.description || skill.skill_id}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {skill.skill_id}
                  </span>
                </div>
              ))}
              {(skills || []).length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">暂无注册的 Skill</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
