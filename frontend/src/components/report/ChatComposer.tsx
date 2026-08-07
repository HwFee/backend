import { useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import type { ChatEditResponse } from '@/types'
import { PIPELINE_STEP_LABELS } from '@/lib/constants'

export interface ChatEntry {
  id: number
  message: string
  response?: ChatEditResponse
  failed?: boolean
}

function describeResponse(resp: ChatEditResponse): string {
  if (resp.error) return `失败：${resp.error}`
  switch (resp.action) {
    case 'rerun': {
      const steps = (resp.affected_steps || []).map((s) => PIPELINE_STEP_LABELS[s] || s).join('、')
      return resp.status === 'completed' ? `已重跑步骤：${steps}` : `重跑未完成（${resp.status || '未知状态'}）`
    }
    case 'edit_artifact':
      return `已更新产物内容（新版本 v${resp.new_version ?? '?'}）`
    case 'edit_final_report':
      return '已按指令改写最终报告'
    default:
      return resp.message || '已处理'
  }
}

interface ChatComposerProps {
  disabled: boolean
  disabledHint?: string
  pending: boolean
  onSend: (message: string) => Promise<ChatEditResponse>
}

/** 对话编辑输入区 + 本次会话的指令历史（本地态，刷新即清） */
export function ChatComposer({ disabled, disabledHint, pending, onSend }: ChatComposerProps) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<ChatEntry[]>([])

  const handleSend = async () => {
    const message = input.trim()
    if (!message || pending || disabled) return
    const id = Date.now()
    setHistory((prev) => [...prev, { id, message }])
    setInput('')
    try {
      const response = await onSend(message)
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, response, failed: !!response.error } : entry
        )
      )
    } catch {
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? { ...entry, failed: true, response: { action: 'none', error: '请求失败，请稍后重试' } }
            : entry
        )
      )
    }
  }

  return (
    <div className="shrink-0 border-t border-border">
      {history.length > 0 && (
        <div className="scrollbar-thin max-h-44 space-y-2 overflow-y-auto px-4 py-3">
          {history.map((entry) => (
            <div key={entry.id} className="space-y-1">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">
                  {entry.message}
                </div>
              </div>
              <div className="flex">
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs ${
                    entry.failed
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {entry.response ? (
                    describeResponse(entry.response)
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      正在处理（可能耗时数分钟）...
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 pt-2">
        {disabled && disabledHint && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {disabledHint}
          </p>
        )}
        <div className="flex items-end gap-2 rounded-lg border border-input bg-card px-3 py-2 shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={disabled ? '报告完成后可发送修改指令' : '输入修改指令，支持 @步骤名 指定重跑步骤...'}
            rows={1}
            disabled={disabled}
            className="max-h-24 min-h-8 flex-1 resize-none border-0 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={disabled || !input.trim() || pending}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/40"
            aria-label="发送"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
