import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Bot, User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useLogin } from '@/api/mutations'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { SYSTEM_NAME } from '@/lib/constants'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const login = useLogin()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const result = await login.mutateAsync({ username, password })
      setAuth(result.user, result.access_token)
      navigate('/dashboard')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || '登录失败，请检查用户名和密码')
      } else {
        setError('登录失败，请稍后重试')
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
          <h1 className="text-xl font-bold text-foreground">{SYSTEM_NAME}</h1>
          <p className="mt-2 text-sm text-muted-foreground">多 Agent 协作 · 流水线生成 · 可迭代修改</p>
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
            <Button type="submit" className="h-10 w-full" disabled={login.isPending}>
              {login.isPending ? '登录中...' : '登录'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            还没有账号？
            <Link to="/register" className="text-primary hover:underline">
              立即注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
