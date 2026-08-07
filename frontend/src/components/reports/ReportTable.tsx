import { Link } from 'react-router-dom'
import { Eye, Square, Trash2 } from 'lucide-react'
import type { ReportTask } from '@/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { modeLabel } from '@/lib/constants'

interface ReportTableProps {
  reports: ReportTask[]
  onStop?: (id: number) => void
  onDelete?: (id: number) => void
}

/** 报告表格：Dashboard 最近报告与报告列表页共用 */
export function ReportTable({ reports, onStop, onDelete }: ReportTableProps) {
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Eye className="mb-3 h-8 w-8" />
        <p className="text-sm">暂无报告</p>
      </div>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
          <th className="px-6 pb-3 pt-4">标题</th>
          <th className="px-6 pb-3 pt-4">生成模式</th>
          <th className="px-6 pb-3 pt-4">状态</th>
          <th className="px-6 pb-3 pt-4">创建时间</th>
          <th className="px-6 pb-3 pt-4">更新时间</th>
          <th className="px-6 pb-3 pt-4">操作</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {reports.map((report) => {
          const stoppable = report.status === 'running' || report.status === 'planning' || report.status === 'pending'
          return (
            <tr key={report.id} className="transition-colors hover:bg-accent/50">
              <td className="max-w-0 truncate px-6 py-3.5 font-medium text-foreground" style={{ maxWidth: '20rem' }}>
                <Link to={`/reports/${report.id}`} className="hover:text-primary hover:underline">
                  {report.title}
                </Link>
              </td>
              <td className="px-6 py-3.5 text-muted-foreground">{modeLabel(report.mode)}</td>
              <td className="px-6 py-3.5">
                <StatusBadge status={report.status} />
              </td>
              <td className="px-6 py-3.5 text-muted-foreground">{formatDateTime(report.created_at)}</td>
              <td className="px-6 py-3.5 text-muted-foreground">{formatDateTime(report.updated_at)}</td>
              <td className="px-6 py-3.5">
                <div className="flex items-center gap-1.5">
                  <Link to={`/reports/${report.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
                      <Eye className="h-3.5 w-3.5" />
                      查看
                    </Button>
                  </Link>
                  {stoppable && onStop && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs text-warning hover:text-warning"
                      onClick={() => onStop(report.id)}
                    >
                      <Square className="h-3.5 w-3.5" />
                      停止
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 px-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(report.id)}
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
