import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGuard, AdminGuard, GuestGuard } from '@/components/layout/AuthGuard'
import { Toaster } from '@/components/ui/toast'
import { Skeleton } from '@/components/ui/skeleton'
import LoginPage from '@/pages/Login'
import RegisterPage from '@/pages/Register'
import DashboardPage from '@/pages/Dashboard'
import ReportsPage from '@/pages/Reports'
import NewReportPage from '@/pages/NewReport'
import SettingsPage from '@/pages/Settings'

const ReportDetailPage = lazy(() => import('@/pages/ReportDetail'))

const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminTasksPage = lazy(() => import('@/pages/admin/AdminTasks'))
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminAgentsPage = lazy(() => import('@/pages/admin/AdminAgents'))

function AdminFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function App() {
  return (
    <>
      <Routes>
        <Route element={<GuestGuard><LoginPage /></GuestGuard>} path="/login" />
        <Route element={<GuestGuard><RegisterPage /></GuestGuard>} path="/register" />
        <Route element={<AuthGuard><AppShell /></AuthGuard>} path="/">
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route element={<DashboardPage />} path="dashboard" />
          <Route element={<ReportsPage />} path="reports" />
          <Route element={<NewReportPage />} path="reports/new" />
          <Route element={<Suspense fallback={<AdminFallback />}><ReportDetailPage /></Suspense>} path="reports/:id" />
          <Route element={<SettingsPage />} path="settings" />
          <Route element={<AdminGuard><Suspense fallback={<AdminFallback />}><Outlet /></Suspense></AdminGuard>} path="admin">
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route element={<AdminDashboardPage />} path="dashboard" />
            <Route element={<AdminTasksPage />} path="tasks" />
            <Route element={<AdminUsersPage />} path="users" />
            <Route element={<AdminAgentsPage />} path="agents" />
          </Route>
        </Route>
        <Route element={<Navigate to="/dashboard" />} path="*" />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
