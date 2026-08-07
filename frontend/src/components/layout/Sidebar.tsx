import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Plus,
  Settings,
  ShieldCheck,
  ListChecks,
  Users,
  Workflow,
  LogOut,
  Moon,
  Sun,
  Bot,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { SYSTEM_NAME_SHORT } from '@/lib/constants'

const mainNavItems = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { path: '/reports', label: '报告列表', icon: FileText },
  { path: '/reports/new', label: '创建报告', icon: Plus },
  { path: '/settings', label: '设置', icon: Settings },
]

const adminNavItems = [
  { path: '/admin/dashboard', label: '管理仪表盘', icon: ShieldCheck },
  { path: '/admin/tasks', label: '任务管理', icon: ListChecks },
  { path: '/admin/users', label: '用户管理', icon: Users },
  { path: '/admin/agents', label: 'Skill Pipeline', icon: Workflow },
]

function NavLink({
  item,
  active,
}: {
  item: { path: string; label: string; icon: typeof LayoutDashboard }
  active: boolean
}) {
  return (
    <Link
      to={item.path}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
        active
          ? 'bg-sidebar-active font-medium text-sidebar-active-foreground'
          : 'text-sidebar-foreground hover:bg-white/10 hover:text-white'
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  )
}

export function Sidebar() {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useUIStore()

  const allItems = [...mainNavItems, ...adminNavItems]
  const activePath = allItems
    .filter((item) => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-sidebar">
      {/* 品牌 */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active text-sidebar-active-foreground">
          <Bot className="h-5 w-5" />
        </div>
        <Link to="/" className="text-base font-semibold tracking-tight text-white">
          {SYSTEM_NAME_SHORT}
        </Link>
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {mainNavItems.map((item) => (
          <NavLink key={item.path} item={item} active={item.path === activePath} />
        ))}

        {user?.is_admin && (
          <>
            <div className="px-3 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              管理
            </div>
            {adminNavItems.map((item) => (
              <NavLink key={item.path} item={item} active={item.path === activePath} />
            ))}
          </>
        )}
      </nav>

      {/* 底部：主题切换 + 用户 */}
      <div className="shrink-0 space-y-2 border-t border-sidebar-border p-3">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? '浅色模式' : '深色模式'}
        </button>

        {user && (
          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-sm font-medium text-sidebar-active-foreground">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user.username}</div>
              <div className="truncate text-xs text-sidebar-foreground">{user.email}</div>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
