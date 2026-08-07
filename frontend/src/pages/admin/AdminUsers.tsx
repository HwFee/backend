import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useAdminUsers } from '@/api/queries'
import { useAdminDeleteUser, useAdminUpdateUserRole } from '@/api/mutations'
import { useAuthStore } from '@/stores/authStore'
import { Card, CardContent } from '@/components/ui/card'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { formatDateTime } from '@/lib/utils'

const roleOptions = [
  { value: 'user', label: '普通用户' },
  { value: 'admin', label: '管理员' },
]

export default function AdminUsersPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const { data, isLoading } = useAdminUsers(page, pageSize)
  const { user: currentUser } = useAuthStore()
  const updateRole = useAdminUpdateUserRole()
  const deleteUser = useAdminDeleteUser()

  const handleRoleChange = async (userId: number, role: string) => {
    try {
      await updateRole.mutateAsync({ userId, role })
      toast.success('角色已更新')
    } catch {
      toast.error('角色更新失败')
    }
  }

  const handleDelete = async () => {
    if (deleteTarget === null) return
    try {
      await deleteUser.mutateAsync(deleteTarget)
      toast.success('用户已删除')
    } catch {
      toast.error('删除失败')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理系统用户与角色</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="px-6 pb-3 pt-4">ID</th>
                    <th className="px-6 pb-3 pt-4">用户名</th>
                    <th className="px-6 pb-3 pt-4">邮箱</th>
                    <th className="px-6 pb-3 pt-4">角色</th>
                    <th className="px-6 pb-3 pt-4">注册时间</th>
                    <th className="px-6 pb-3 pt-4">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.items?.map((user) => {
                    const isSelf = user.id === currentUser?.id
                    return (
                      <tr key={user.id} className="transition-colors hover:bg-accent/50">
                        <td className="px-6 py-3.5 text-muted-foreground">{user.id}</td>
                        <td className="px-6 py-3.5 font-medium text-foreground">
                          {user.username}
                          {isSelf && <span className="ml-2 text-xs text-muted-foreground">（我）</span>}
                        </td>
                        <td className="px-6 py-3.5 text-muted-foreground">{user.email}</td>
                        <td className="px-6 py-3.5">
                          <Select
                            className="w-32"
                            value={user.role}
                            onChange={(role) => handleRoleChange(user.id, role)}
                            options={roleOptions}
                          />
                        </td>
                        <td className="px-6 py-3.5 text-muted-foreground">{formatDateTime(user.created_at)}</td>
                        <td className="px-6 py-3.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 px-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(user.id)}
                            disabled={isSelf}
                            title={isSelf ? '不能删除当前登录账号' : '删除用户'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除用户"
        description="删除后该用户将无法登录。确定删除？"
        confirmText="删除"
        destructive
        loading={deleteUser.isPending}
      />
    </div>
  )
}
