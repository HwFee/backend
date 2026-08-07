import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Square, Trash2 } from 'lucide-react'
import { useAdminTasks } from '@/api/queries'
import { useAdminDeleteTask, useAdminStopTask } from '@/api/mutations'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { formatDateTime } from '@/lib/utils'
import { MODE_LABELS, STATUS_LABELS, modeLabel } from '@/lib/constants'

const statusOptions = [
  { value: '', label: '全部状态' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

const modeOptions = [
  { value: '', label: '全部模式' },
  ...Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label })),
]

export default function AdminTasksPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<{ kind: 'stop' | 'delete'; id: number } | null>(null)
  const { data, isLoading } = useAdminTasks(page, pageSize, filters)
  const stopTask = useAdminStopTask()
  const deleteTask = useAdminDeleteTask()

  const handleConfirm = async () => {
    if (!confirm) return
    try {
      if (confirm.kind === 'delete') {
        await deleteTask.mutateAsync(confirm.id)
        toast.success('任务已删除')
      } else {
        await stopTask.mutateAsync(confirm.id)
        toast.success('已发送停止指令')
      }
    } catch {
      toast.error('操作失败')
    } finally {
      setConfirm(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">任务管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">查看和管理全平台报告任务</p>
      </div>

      <div className="flex items-center gap-3">
        <Select
          className="w-36"
          value={filters.status || ''}
          onChange={(v) => {
            setFilters({ ...filters, status: v })
            setPage(1)
          }}
          options={statusOptions}
        />
        <Select
          className="w-36"
          value={filters.mode || ''}
          onChange={(v) => {
            setFilters({ ...filters, mode: v })
            setPage(1)
          }}
          options={modeOptions}
        />
      </div>

      <div className="flex flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-6 pb-3 pt-4">用户</th>
                  <th className="px-6 pb-3 pt-4">报告标题</th>
                  <th className="px-6 pb-3 pt-4">状态</th>
                  <th className="px-6 pb-3 pt-4">模式</th>
                  <th className="px-6 pb-3 pt-4">创建时间</th>
                  <th className="px-6 pb-3 pt-4">更新时间</th>
                  <th className="px-6 pb-3 pt-4">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.items?.map((task) => {
                  const stoppable = ['pending', 'planning', 'running'].includes(task.status)
                  return (
                    <tr key={task.id} className="transition-colors hover:bg-accent/50">
                      <td className="px-6 py-3.5 text-muted-foreground">{task.username}</td>
                      <td className="max-w-0 truncate px-6 py-3.5 font-medium text-foreground" style={{ maxWidth: '16rem' }}>
                        {task.title}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground">{modeLabel(task.mode)}</td>
                      <td className="px-6 py-3.5 text-muted-foreground">{formatDateTime(task.created_at)}</td>
                      <td className="px-6 py-3.5 text-muted-foreground">{formatDateTime(task.updated_at)}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Link to={`/reports/${task.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
                              <Eye className="h-3.5 w-3.5" />
                              查看
                            </Button>
                          </Link>
                          {stoppable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 px-2 text-xs text-warning hover:text-warning"
                              onClick={() => setConfirm({ kind: 'stop', id: task.id })}
                            >
                              <Square className="h-3.5 w-3.5" />
                              停止
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 px-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirm({ kind: 'delete', id: task.id })}
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {data?.items?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-sm text-muted-foreground">
                      暂无任务
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {data && data.total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s)
              setPage(1)
            }}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
        title="删除任务"
        description="删除后不可恢复，任务及其所有产物将一并移除。确定删除？"
        confirmText="删除"
        destructive
        loading={deleteTask.isPending}
      />
      <ConfirmDialog
        open={confirm?.kind === 'stop'}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
        title="停止任务"
        description="确定停止该任务？"
        confirmText="停止"
        loading={stopTask.isPending}
      />
    </div>
  )
}
