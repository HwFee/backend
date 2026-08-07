import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseTime(value?: string | null): number {
  if (!value) return NaN
  return new Date(value).getTime()
}

export function formatDateTime(value?: string | null): string {
  const time = parseTime(value)
  if (!isFinite(time)) return '-'
  const date = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDateTimeFull(value?: string | null): string {
  const time = parseTime(value)
  if (!isFinite(time)) return '-'
  const date = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${formatDateTime(value)}:${pad(date.getSeconds())}`
}

export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '-'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return `${min}m ${rem}s`
  const hr = Math.floor(min / 60)
  return `${hr}h ${min % 60}m`
}

export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '{}'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/** 后端静态文件（导出的 PDF/DOCX 等）完整 URL */
export function staticUrl(path?: string | null): string | undefined {
  return path ? `${API_BASE_URL}/static/${path}` : undefined
}
