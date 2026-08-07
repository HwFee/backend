import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, LayoutTemplate, BookOpen, Edit3, Upload, X, FileText } from 'lucide-react'
import { useCreateReport } from '@/api/mutations'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { MODE_DESCRIPTIONS, MODE_LABELS, REPORT_MODES } from '@/lib/constants'
import { formatBytes } from '@/lib/utils'
import type { ReportMode } from '@/types'

const modeIcons: Record<ReportMode, typeof Sparkles> = {
  generate: Sparkles,
  template: LayoutTemplate,
  reference: BookOpen,
  edit: Edit3,
}

const MAX_FILES = 10
const ACCEPT = '.pdf,.docx,.txt,.xlsx'

export default function NewReportPage() {
  const [title, setTitle] = useState('')
  const [requirement, setRequirement] = useState('')
  const [mode, setMode] = useState<ReportMode>('generate')
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createReport = useCreateReport()
  const navigate = useNavigate()

  const addFiles = (newFiles: FileList | null) => {
    const incoming = Array.from(newFiles || [])
    if (incoming.length === 0) return
    if (files.length + incoming.length > MAX_FILES) {
      toast.error(`最多上传 ${MAX_FILES} 个文件`)
      return
    }
    setFiles((prev) => [...prev, ...incoming])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await createReport.mutateAsync({ title, requirement, mode, files })
      toast.success('任务已创建，开始生成')
      navigate(`/reports/${result.task_id}`)
    } catch {
      toast.error('创建失败，请检查输入后重试')
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">创建新报告</h1>
        <p className="mt-1 text-sm text-muted-foreground">输入报告需求，选择生成模式，AI 多 Agent 流水线将为您生成专业报告</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">报告标题</label>
          <input
            type="text"
            placeholder="输入报告标题"
            className="w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-ring"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">需求描述</label>
          <textarea
            placeholder="详细描述报告需求，如报告目的、目标受众、格式要求等。"
            className="h-32 w-full resize-none rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-ring"
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            required
            maxLength={5000}
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">{requirement.length}/5000</div>
        </div>

        <div>
          <label className="mb-3 block text-sm font-medium text-foreground">生成模式</label>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {REPORT_MODES.map((m) => {
              const Icon = modeIcons[m]
              const active = mode === m
              return (
                <button
                  type="button"
                  key={m}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:border-muted-foreground/40'
                  }`}
                  onClick={() => setMode(m)}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">{MODE_LABELS[m]}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{MODE_DESCRIPTIONS[m]}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            附件上传
            <span className="ml-2 text-xs font-normal text-muted-foreground">可选，最多 {MAX_FILES} 个</span>
          </label>
          <div
            className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card'
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              addFiles(e.dataTransfer.files)
            }}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm text-foreground">拖拽文件到此处，或点击选择</p>
            <p className="mt-1 text-xs text-muted-foreground">支持 PDF、DOCX、TXT、XLSX 格式</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
              accept={ACCEPT}
            />
          </div>

          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">({formatBytes(file.size)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="移除文件"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">已选择 {files.length}/{MAX_FILES} 个文件</p>
        </div>

        <div className="flex justify-end border-t border-border pt-6">
          <Button type="submit" disabled={createReport.isPending} className="h-10 px-8">
            {createReport.isPending ? '创建中...' : '开始生成'}
          </Button>
        </div>
      </form>
    </div>
  )
}
