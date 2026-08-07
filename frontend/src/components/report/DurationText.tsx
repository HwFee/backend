import { useEffect, useState } from 'react'
import { formatDuration, parseTime } from '@/lib/utils'

/**
 * 运行时长：仅在运行中（无 completedAt）时每秒自增，
 * 把 useNow 的每秒重渲染隔离在这个小组件内，避免整页刷新。
 */
export function DurationText({
  startedAt,
  completedAt,
}: {
  startedAt?: string | null
  completedAt?: string | null
}) {
  const running = !!startedAt && !completedAt
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  const startMs = parseTime(startedAt)
  if (!isFinite(startMs)) return <span>-</span>
  const endMs = completedAt ? parseTime(completedAt) : now
  return <span>{formatDuration(endMs - startMs)}</span>
}
