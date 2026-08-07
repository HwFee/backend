import { useState } from 'react'
import { useUserProfile } from '@/api/queries'
import { useUpdatePassword, useUpdateProfile } from '@/api/mutations'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/toast'
import { cn, formatDateTime } from '@/lib/utils'
import type { UserProfile } from '@/types'

const inputClass =
  'w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-ring'

function ProfileForm({ profile }: { profile: UserProfile }) {
  const { user, setAuth, token } = useAuthStore()
  const updateProfile = useUpdateProfile()
  const [username, setUsername] = useState(profile.username)
  const [email, setEmail] = useState(profile.email)

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({ username, email })
      if (user && token) setAuth({ ...user, username, email }, token)
      toast.success('个人信息已更新')
    } catch {
      toast.error('保存失败，请稍后重试')
    }
  }

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">用户名</label>
        <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">邮箱</label>
        <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">角色</label>
        <span
          className={cn(
            'inline-flex rounded-full px-3 py-1 text-xs font-medium',
            profile.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          {profile.role === 'admin' ? '管理员' : '普通用户'}
        </span>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">注册时间</label>
        <input readOnly className={cn(inputClass, 'text-muted-foreground')} value={formatDateTime(profile.created_at)} />
      </div>
      <div className="flex justify-end border-t border-border pt-5">
        <Button onClick={handleSave} disabled={updateProfile.isPending} className="h-10 px-6">
          {updateProfile.isPending ? '保存中...' : '保存信息'}
        </Button>
      </div>
    </div>
  )
}

function PasswordForm() {
  const updatePassword = useUpdatePassword()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSubmit = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }
    try {
      await updatePassword.mutateAsync({
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      toast.success('密码修改成功')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('密码修改失败，请检查当前密码是否正确')
    }
  }

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">当前密码</label>
        <input
          type="password"
          className={inputClass}
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          placeholder="请输入当前密码"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">新密码</label>
        <input
          type="password"
          className={inputClass}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="请输入新密码"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">确认新密码</label>
        <input
          type="password"
          className={inputClass}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="请再次输入新密码"
        />
      </div>
      <div className="flex justify-end border-t border-border pt-5">
        <Button
          onClick={handleSubmit}
          disabled={updatePassword.isPending || !oldPassword || !newPassword}
          className="h-10 px-6"
        >
          {updatePassword.isPending ? '修改中...' : '修改密码'}
        </Button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile')
  const { data: profile, isLoading } = useUserProfile()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理你的账号信息</p>
      </div>

      <div className="mb-6 border-b border-border">
        <div className="flex gap-8">
          {(
            [
              { key: 'profile', label: '个人信息' },
              { key: 'password', label: '修改密码' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              className={cn(
                'border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'profile' && profile && <ProfileForm key={profile.id} profile={profile} />}
      {activeTab === 'password' && <PasswordForm />}
    </div>
  )
}
