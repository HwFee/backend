import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type {
  ApiResponse,
  ChatEditResponse,
  LoginRequest,
  RegisterRequest,
  ReportGenerateResponse,
  ReportMode,
  User,
} from '@/types'

export function useCreateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { title: string; requirement: string; mode: ReportMode; files: File[] }) => {
      const formData = new FormData()
      formData.append('title', payload.title)
      formData.append('requirement', payload.requirement)
      formData.append('mode', payload.mode)
      payload.files.forEach((file) => formData.append('files', file))
      const { data } = await apiClient.post<ApiResponse<ReportGenerateResponse>>(
        '/api/reports/generate',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export function useDeleteReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/api/reports/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export function useStopReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await apiClient.post<ApiResponse<{ status: string }>>(`/api/reports/${id}/stop`)
      return data.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['report-status', id] })
    },
  })
}

/** 报告相关缓存统一失效（chat/rerun/restore 后调用） */
function invalidateReport(qc: ReturnType<typeof useQueryClient>, taskId: number) {
  qc.invalidateQueries({ queryKey: ['reports'] })
  qc.invalidateQueries({ queryKey: ['report-status', taskId] })
  qc.invalidateQueries({ queryKey: ['report-pipeline', taskId] })
  qc.invalidateQueries({ queryKey: ['report-artifacts', taskId] })
  qc.invalidateQueries({ queryKey: ['tool-events', taskId] })
}

export function useChatEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taskId,
      message,
      targetStepId,
      targetArtifactId,
    }: {
      taskId: number
      message: string
      targetStepId?: string
      targetArtifactId?: number
    }) => {
      const { data } = await apiClient.post<ApiResponse<ChatEditResponse>>(
        `/api/reports/${taskId}/chat`,
        { message, target_step_id: targetStepId, target_artifact_id: targetArtifactId }
      )
      return data.data
    },
    onSuccess: (_, vars) => invalidateReport(qc, vars.taskId),
  })
}

export function useRerunStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, stepId }: { taskId: number; stepId: string }) => {
      const { data } = await apiClient.post<ApiResponse<ChatEditResponse>>(
        `/api/reports/${taskId}/rerun/${stepId}`
      )
      return data.data
    },
    onSuccess: (_, vars) => invalidateReport(qc, vars.taskId),
  })
}

export function useRestoreVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taskId,
      artifactId,
      versionId,
    }: {
      taskId: number
      artifactId: number
      versionId: number
    }) => {
      const { data } = await apiClient.post<ApiResponse<unknown>>(
        `/api/reports/${taskId}/artifacts/${artifactId}/restore`,
        { version_id: versionId }
      )
      return data.data
    },
    onSuccess: (_, vars) => {
      invalidateReport(qc, vars.taskId)
      qc.invalidateQueries({ queryKey: ['artifact-versions', vars.taskId, vars.artifactId] })
    },
  })
}

// ---- 认证 ----

export function useLogin() {
  return useMutation({
    mutationFn: async (payload: LoginRequest) => {
      const { data } = await apiClient.post<ApiResponse<{ user: User; access_token: string }>>(
        '/api/user/login',
        payload
      )
      return data.data
    },
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: async (payload: RegisterRequest) => {
      const { data } = await apiClient.post<ApiResponse<{ id: number; username: string }>>(
        '/api/user/register',
        payload
      )
      return data.data
    },
  })
}

// ---- 设置 ----

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { username: string; email: string }) => {
      const { data } = await apiClient.put<ApiResponse<unknown>>('/api/user/profile', payload)
      return data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['userProfile'] }),
  })
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (payload: { old_password: string; new_password: string; confirm_password: string }) => {
      const { data } = await apiClient.put<ApiResponse<unknown>>('/api/user/password', payload)
      return data.data
    },
  })
}

// ---- 管理后台 ----

export function useAdminStopTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (taskId: number) => {
      const { data } = await apiClient.post<ApiResponse<null>>(`/api/admin/tasks/${taskId}/stop`)
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminTasks'] })
      qc.invalidateQueries({ queryKey: ['adminStats'] })
    },
  })
}

export function useAdminDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (taskId: number) => {
      const { data } = await apiClient.delete<ApiResponse<null>>(`/api/admin/tasks/${taskId}`)
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminTasks'] })
      qc.invalidateQueries({ queryKey: ['adminStats'] })
    },
  })
}

export function useAdminUpdateUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const { data } = await apiClient.put<ApiResponse<null>>(`/api/admin/users/${userId}/role?role=${role}`)
      return data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminUsers'] }),
  })
}

export function useAdminDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => {
      const { data } = await apiClient.delete<ApiResponse<null>>(`/api/admin/users/${userId}`)
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminUsers'] })
      qc.invalidateQueries({ queryKey: ['adminStats'] })
    },
  })
}
