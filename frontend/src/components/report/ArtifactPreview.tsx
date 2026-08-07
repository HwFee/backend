import ReactMarkdown from 'react-markdown'
import { CheckCircle2, Clipboard, Download, FileText, Loader2, RotateCcw } from 'lucide-react'
import type { Artifact, ArtifactVersion } from '@/types'
import { toast } from '@/lib/toast'
import { formatDateTime, staticUrl } from '@/lib/utils'

interface ArtifactPreviewProps {
  artifact: Artifact | null
  fallbackMarkdown?: string
  isRunning: boolean
  pdfPath?: string | null
  docxPath?: string | null
  versions: ArtifactVersion[]
  onRestoreVersion: (versionId: number) => void
  restoring: boolean
}

/** 详情页右栏：产物 Markdown 预览 + 下载/复制操作 + 版本列表 */
export function ArtifactPreview({
  artifact,
  fallbackMarkdown,
  isRunning,
  pdfPath,
  docxPath,
  versions,
  onRestoreVersion,
  restoring,
}: ArtifactPreviewProps) {
  const markdown = artifact?.current_version?.content || fallbackMarkdown || ''
  const downloadPdf = staticUrl(pdfPath)
  const downloadDocx = staticUrl(docxPath)

  const handleCopy = async () => {
    if (!markdown) return
    try {
      await navigator.clipboard.writeText(markdown)
      toast.success('已复制 Markdown 到剪贴板')
    } catch {
      toast.error('复制失败')
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card shadow-sm">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-base font-semibold text-card-foreground">
            {artifact ? artifact.filename : '报告预览'}
          </h2>
          {artifact?.current_version && (
            <span className="text-xs text-muted-foreground">v{artifact.current_version.version}</span>
          )}
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
          {markdown ? (
            <div className="prose prose-sm max-w-none text-card-foreground">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
          ) : isRunning ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
              <div className="font-semibold text-foreground">生成中</div>
              <div className="mt-1 text-xs">产物生成后可在此预览</div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <FileText className="mb-3 h-10 w-10" />
              <div>暂无内容</div>
            </div>
          )}
        </div>
      </section>

      <section className="shrink-0 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-card-foreground">操作</h2>
        <div className="mt-3 space-y-2.5">
          <a
            href={downloadPdf}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex h-10 items-center justify-center gap-2 rounded-md border border-border text-sm font-medium transition-colors ${
              downloadPdf ? 'text-foreground hover:bg-accent' : 'pointer-events-none text-muted-foreground/50'
            }`}
          >
            <Download className="h-4 w-4" />
            下载 PDF
          </a>
          <a
            href={downloadDocx}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex h-10 items-center justify-center gap-2 rounded-md border border-border text-sm font-medium transition-colors ${
              downloadDocx ? 'text-foreground hover:bg-accent' : 'pointer-events-none text-muted-foreground/50'
            }`}
          >
            <FileText className="h-4 w-4" />
            下载 DOCX
          </a>
          <button
            onClick={handleCopy}
            disabled={!markdown}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground/50"
          >
            <Clipboard className="h-4 w-4" />
            复制 Markdown
          </button>
        </div>
      </section>

      {artifact && versions.length > 1 && (
        <section className="max-h-56 shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold text-card-foreground">版本历史</h2>
          <div className="mt-3 space-y-2">
            {versions.map((version) => {
              const isCurrent = version.id === artifact.current_version_id
              return (
                <div
                  key={version.id}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <CheckCircle2 className={isCurrent ? 'h-4 w-4 text-success' : 'h-4 w-4 text-muted-foreground/40'} />
                  <span className="font-medium text-foreground">v{version.version}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {version.change_reason || formatDateTime(version.created_at)}
                  </span>
                  {!isCurrent && (
                    <button
                      onClick={() => onRestoreVersion(version.id)}
                      disabled={restoring}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      title="恢复到此版本"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
