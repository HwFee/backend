import { Link } from 'react-router-dom'
import { Plus, FileText, CheckCircle2, Loader2, XCircle, ArrowRight } from 'lucide-react'
import { useReports, useReportStats } from '@/api/queries'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ReportTable } from '@/components/reports/ReportTable'

const statCards = [
  { key: 'total', label: '总报告数', icon: FileText, iconClass: 'bg-primary/10 text-primary' },
  { key: 'completed', label: '已完成', icon: CheckCircle2, iconClass: 'bg-success/10 text-success' },
  { key: 'running', label: '生成中', icon: Loader2, iconClass: 'bg-warning/10 text-warning' },
  { key: 'failed', label: '失败', icon: XCircle, iconClass: 'bg-destructive/10 text-destructive' },
] as const

export default function DashboardPage() {
  const { data: reportsData, isLoading: reportsLoading } = useReports(1, 5)
  const { data: stats, isLoading: statsLoading } = useReportStats()
  const reports = Array.isArray(reportsData?.items) ? reportsData.items : []

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
          <p className="mt-1 text-sm text-muted-foreground">报告生成概览与最近动态</p>
        </div>
        <Link to="/reports/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            创建新报告
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.key}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="mt-1 text-3xl font-bold text-card-foreground">
                  {statsLoading ? '-' : (stats?.[card.key] ?? 0)}
                </p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconClass}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">最近报告</h2>
          <Link
            to="/reports"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            查看全部
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Card className="flex-1">
          <CardContent className="p-0">
            {reportsLoading ? (
              <div className="space-y-3 p-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <ReportTable reports={reports} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
