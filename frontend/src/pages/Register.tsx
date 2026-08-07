import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Bot, User, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useRegister } from '@/api/mutations'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { SYSTEM_NAME } from '@/lib/constants'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const register = useRegister()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await register.mutateAsync({ username, email, password })
      toast.success('注册成功，请登录')
      navigate('/login')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || '注册失败')
      } else {
        setError('注册失败，请稍后重试')
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Bot className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-foreground">创建新账号</h1>
          <p className="mt-2 text-sm text-muted-foreground">加入{SYSTEM_NAME}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="用户名"
                className="w-full rounded-md border border-input bg-transparent py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-ring"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                placeholder="邮箱"
                className="w-full rounded-md border border-input bg-transparent py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-ring"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="密码"
                className="w-full rounded-md border border-input bg-transparent py-2.5 pl-10 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-ring"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button type="submit" className="h-10 w-full" disabled={register.isPending}>
              {register.isPending ? '注册中...' : '注册'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            已有账号？
            <Link to="/login" className="text-primary hover:underline">
              返回登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
