import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'
import type {
  AdminFailedTask,
  AdminStats,
  AdminTask,
  AdminUser,
  ApiResponse,
  Artifact,
  ArtifactVersion,
  PaginatedResponse,
  PipelineView,
  ReportStats,
  ReportStatus,
  ReportTask,
  SkillInfo,
  TokenTrendPoint,
  ToolEvent,
  UserProfile,
} from '@/types'

/** 任务是否为活跃态（决定轮询与否） */
export function isActiveStatus(status?: string): boolean {
  return status === 'pending' || status === 'planning' || status === 'running'
}

export function useReports(page = 1, pageSize = 10, search?: string, status?: string) {
  return useQuery({
    queryKey: ['reports', 'list', page, pageSize, search, status],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (search) params.append('search', search)
      if (status) params.append('status', status)
      const { data } = await apiClient.get<ApiResponse<PaginatedResponse<ReportTask>>>(
        `/api/reports?${params}`
      )
      return data.data
    },
    refetchInterval: (query) => {
      const items = query.state.data?.items
      return items?.some((r) => isActiveStatus(r.status)) ? 5000 : false
    },
  })
}

export function useReport(id: number | string | undefined) {
  return useQuery({
    queryKey: ['reports', 'detail', id],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ReportTask>>(`/api/reports/${id}`)
      return data.data
    },
    enabled: !!id,
    refetchInterval: (query) => (isActiveStatus(query.state.data?.status) ? 3000 : false),
  })
}

export function useReportStatus(taskId: number | string | undefined) {
  return useQuery({
    queryKey: ['report-status', taskId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ReportStatus>>(`/api/reports/${taskId}/status`)
      return data.data
    },
    enabled: !!taskId,
    refetchInterval: (query) => (isActiveStatus(query.state.data?.status) ? 3000 : false),
  })
}

export function useReportPipeline(taskId: number | string | undefined) {
  return useQuery({
    queryKey: ['report-pipeline', taskId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<PipelineView>>(`/api/reports/${taskId}/pipeline`)
      return data.data
    },
    enabled: !!taskId,
    refetchInterval: (query) => (isActiveStatus(query.state.data?.status) ? 3000 : false),
  })
}

export function useReportArtifacts(taskId: number | string | undefined, active = false) {
  return useQuery({
    queryKey: ['report-artifacts', taskId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Artifact[]>>(`/api/reports/${taskId}/artifacts`)
      return data.data
    },
    enabled: !!taskId,
    refetchInterval: active ? 3000 : false,
  })
}

export function useArtifactVersions(taskId: number | string | undefined, artifactId: number | undefined) {
  return useQuery({
    queryKey: ['artifact-versions', taskId, artifactId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ArtifactVersion[]>>(
        `/api/reports/${taskId}/artifacts/${artifactId}/versions`
      )
      return data.data
    },
    enabled: !!taskId && !!artifactId,
  })
}

export function useToolEvents(taskId: number | string | undefined, stepId?: string, active = false) {
  return useQuery({
    queryKey: ['tool-events', taskId, stepId || 'all'],
    queryFn: async () => {
      const params = stepId ? `?step_id=${stepId}` : ''
      const { data } = await apiClient.get<ApiResponse<ToolEvent[]>>(
        `/api/reports/${taskId}/tool-events${params}`
      )
      return data.data
    },
    enabled: !!taskId,
    refetchInterval: active ? 3000 : false,
  })
}

export function useReportStats() {
  return useQuery({
    queryKey: ['reportStats'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ReportStats>>('/api/reports/stats')
      return data.data
    },
  })
}

export function useUserProfile() {
  return useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<UserProfile>>('/api/user/profile')
      return data.data
    },
  })
}

export function useSkills() {
  return useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<SkillInfo[]>>('/api/skills')
      return data.data
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ---- 管理后台 ----

export function useAdminStats() {
  return useQuery({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<AdminStats>>('/api/admin/stats')
      return data.data
    },
  })
}

export function useAdminTokenTrend(days = 7) {
  return useQuery({
    queryKey: ['adminTokenTrend', days],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<{ data: TokenTrendPoint[] }>>(
        `/api/admin/token-trend?days=${days}`
      )
      return data.data.data
    },
  })
}

export function useAdminFailedTasks(limit = 5) {
  return useQuery({
    queryKey: ['adminFailedTasks', limit],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<AdminFailedTask[]>>(
        `/api/admin/failed-tasks?limit=${limit}`
      )
      return data.data
    },
  })
}

export function useAdminTasks(page = 1, pageSize = 10, filters?: Record<string, string>) {
  return useQuery({
    queryKey: ['adminTasks', page, pageSize, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (v) params.append(k, v)
        })
      }
      const { data } = await apiClient.get<ApiResponse<PaginatedResponse<AdminTask>>>(
        `/api/admin/tasks?${params}`
      )
      return data.data
    },
  })
}

export function useAdminUsers(page = 1, pageSize = 10) {
  return useQuery({
    queryKey: ['adminUsers', page, pageSize],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<PaginatedResponse<AdminUser>>>(
        `/api/admin/users?page=${page}&page_size=${pageSize}`
      )
      return data.data
    },
  })
}
