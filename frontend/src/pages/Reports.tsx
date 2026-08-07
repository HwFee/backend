import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useReports } from '@/api/queries'
import { useDeleteReport, useStopReport } from '@/api/mutations'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { ReportTable } from '@/components/reports/ReportTable'
import { useDebounce } from '@/hooks/useDebounce'
import { STATUS_LABELS } from '@/lib/constants'

const statusOptions = [
  { value: '', label: '全部状态' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

export default function ReportsPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('')
  const search = useDebounce(searchInput)
  const [confirm, setConfirm] = useState<{ kind: 'stop' | 'delete'; id: number } | null>(null)

  const { data, isLoading } = useReports(page, pageSize, search || undefined, status || undefined)
  const deleteMutation = useDeleteReport()
  const stopMutation = useStopReport()

  const handleConfirm = async () => {
    if (!confirm) return
    try {
      if (confirm.kind === 'delete') {
        await deleteMutation.mutateAsync(confirm.id)
        toast.success('报告已删除')
      } else {
        await stopMutation.mutateAsync(confirm.id)
        toast.success('已发送停止指令')
      }
    } catch {
      toast.error(confirm.kind === 'delete' ? '删除失败' : '停止失败')
    } finally {
      setConfirm(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">报告列表</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理你创建的所有报告</p>
        </div>
        <Link to="/reports/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            创建报告
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center rounded-md border border-input bg-card px-3 shadow-sm">
          <Search className="mr-2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索报告标题"
            className="h-10 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          className="w-36"
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          options={statusOptions}
        />
      </div>

      <Card className="flex flex-1 flex-col">
        <CardContent className="flex flex-1 flex-col p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <ReportTable
                  reports={data?.items ?? []}
                  onStop={(id) => setConfirm({ kind: 'stop', id })}
                  onDelete={(id) => setConfirm({ kind: 'delete', id })}
                />
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
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
        title="删除报告"
        description="删除后不可恢复，报告及其所有产物文件将一并移除。确定删除？"
        confirmText="删除"
        destructive
        loading={deleteMutation.isPending}
      />
      <ConfirmDialog
        open={confirm?.kind === 'stop'}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
        title="停止生成"
        description="停止后当前进度会保留，但无法从中断处继续。确定停止？"
        confirmText="停止"
        loading={stopMutation.isPending}
      />
    </div>
  )
}
