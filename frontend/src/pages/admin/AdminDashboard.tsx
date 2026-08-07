import { Link } from 'react-router-dom'
import {
  Users,
  FileText,
  Calendar,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  Zap,
  ChevronRight,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAdminFailedTasks, useAdminStats, useAdminTokenTrend } from '@/api/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useAdminStats()
  const { data: tokenTrend } = useAdminTokenTrend(7)
  const { data: failedTasks, isLoading: failedLoading } = useAdminFailedTasks(5)

  const mainStats = [
    { label: '总用户数', value: stats?.total_users ?? 0, icon: Users, change: stats?.trends?.total_users ?? 0 },
    { label: '总报告数', value: stats?.total_reports ?? 0, icon: FileText, change: stats?.trends?.total_reports ?? 0 },
    { label: '今日生成数', value: stats?.today_reports ?? 0, icon: Calendar, change: stats?.trends?.today_reports ?? 0 },
    { label: '运行中任务', value: stats?.running_tasks ?? 0, icon: Loader2, change: stats?.trends?.running_tasks ?? 0 },
    { label: '失败任务', value: stats?.failed_tasks ?? 0, icon: AlertCircle, change: stats?.trends?.failed_tasks ?? 0 },
  ]

  const subStats = [
    { label: '平均生成耗时', value: stats?.avg_duration || '-', icon: Clock, iconClass: 'bg-primary/10 text-primary' },
    { label: '待处理失败', value: stats?.pending_failures ?? 0, icon: AlertTriangle, iconClass: 'bg-warning/10 text-warning' },
    { label: 'Token 使用量', value: stats?.total_tokens?.toLocaleString() || '0', icon: Zap, iconClass: 'bg-success/10 text-success' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">管理仪表盘</h1>
        <p className="mt-1 text-sm text-muted-foreground">系统运行概览</p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        {mainStats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <stat.icon className="h-5 w-5 text-muted-foreground" />
              {stat.change !== 0 && (
                <div className={`flex items-center gap-1 text-xs ${stat.change >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {stat.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {stat.change >= 0 ? '+' : ''}
                  {stat.change}
                </div>
              )}
            </div>
            <p className="mt-2 text-2xl font-bold text-card-foreground">{isLoading ? '-' : stat.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {subStats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.iconClass}`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-lg font-bold text-card-foreground">{isLoading ? '-' : stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-card-foreground">Token 使用量趋势（近 7 天）</h3>
          </div>
          <div className="p-4">
            {tokenTrend && tokenTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={tokenTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--popover))',
                      color: 'hsl(var(--popover-foreground))',
                      fontSize: '12px',
                    }}
                  />
                  <Line type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                暂无 Token 使用数据
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-card-foreground">最近失败任务</h3>
            <Link to="/admin/tasks" className="flex items-center gap-1 text-xs text-primary hover:underline">
              查看全部
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-4">
            {failedLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : failedTasks && failedTasks.length > 0 ? (
              <div className="space-y-3">
                {failedTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-card-foreground">{task.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDateTime(task.failed_at)}
                        {task.error_msg ? ` · ${task.error_msg}` : ''}
                      </p>
                    </div>
                    <Link to={`/reports/${task.id}`} className="shrink-0 text-xs text-primary hover:underline">
                      查看详情
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                暂无失败任务
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
