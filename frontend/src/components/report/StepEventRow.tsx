import { useState } from 'react'
import { ChevronRight, Download, File, FileSpreadsheet, FileText, Globe2, Search, Wrench } from 'lucide-react'
import type { Artifact, ToolEvent } from '@/types'
import { TOOL_EVENT_LABELS } from '@/lib/constants'
import { cn, formatDuration, parseTime, prettyJson } from '@/lib/utils'

function getEventIcon(type: string) {
  if (type === 'search') return <Search className="h-4 w-4" />
  if (type === 'read_url') return <Globe2 className="h-4 w-4" />
  if (type.includes('file') || type === 'create_file' || type === 'edit_file')
    return <FileText className="h-4 w-4" />
  if (type === 'export_pdf' || type === 'export_docx') return <Download className="h-4 w-4" />
  return <Wrench className="h-4 w-4" />
}

function getArtifactIcon(type?: string) {
  if (type === 'json') return <FileSpreadsheet className="h-4 w-4" />
  if (type === 'markdown') return <FileText className="h-4 w-4" />
  return <File className="h-4 w-4" />
}

const FILE_EVENTS = ['read_file', 'create_file', 'edit_file', 'export_pdf', 'export_docx']

interface StepEventRowProps {
  event: ToolEvent
  artifact?: Artifact
  onSelectArtifact: (event: ToolEvent, artifact?: Artifact) => void
}

/** 单个工具事件行：可展开查看输入/输出，文件类事件可定位到右侧预览 */
export function StepEventRow({ event, artifact, onSelectArtifact }: StepEventRowProps) {
  const [expanded, setExpanded] = useState(false)
  const isFailed = event.status === 'failed'
  const isSearch = event.event_type === 'search'
  const isFileEvent = FILE_EVENTS.includes(event.event_type)
  const query = isSearch ? String(event.input_data?.query || event.title) : ''
  const searchResults = ((event.output_data?.results || event.output_data?.sources || []) as Array<{
    title?: string
    link?: string
    url?: string
    snippet?: string
  }>)
  const filename =
    artifact?.filename ||
    String(event.output_data?.filename || event.title || TOOL_EVENT_LABELS[event.event_type] || '工具调用')
  const startMs = parseTime(event.started_at)
  const endMs = parseTime(event.completed_at)
  const duration = isFinite(startMs) && isFinite(endMs) ? formatDuration(endMs - startMs) : ''

  return (
    <div className={cn(isFailed && 'bg-destructive/5')}>
      <div className="flex items-center gap-3 py-2.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          title="展开详情"
        >
          <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
        </button>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {getEventIcon(event.event_type)}
        </span>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {TOOL_EVENT_LABELS[event.event_type] || event.title}
            </span>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-xs',
                isFailed ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
              )}
            >
              {event.status}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {isSearch ? (
              <span className="font-medium text-foreground/80">{query}</span>
            ) : isFileEvent ? (
              <button
                onClick={() => onSelectArtifact(event, artifact)}
                className="font-semibold text-primary hover:underline"
              >
                {filename}
              </button>
            ) : (
              event.description || event.title
            )}
          </div>
        </div>
        {artifact && (
          <button
            onClick={() => onSelectArtifact(event, artifact)}
            className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            {getArtifactIcon(artifact.artifact_type)}
            v{artifact.current_version?.version || 1}
          </button>
        )}
        {duration && <span className="shrink-0 text-xs text-muted-foreground">{duration}</span>}
      </div>

      {expanded && (
        <div className="border-t border-border py-3 pl-10">
          {isSearch && searchResults.length > 0 ? (
            <div className="space-y-2">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">搜索 query</div>
                <div className="rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground">{query}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  搜索结果 ({searchResults.length})
                </div>
                <ul className="space-y-1.5">
                  {searchResults.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <Globe2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <a
                          href={r.link || r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-1 text-primary hover:underline"
                        >
                          {r.title || r.link || r.url}
                        </a>
                        {r.snippet && <p className="mt-0.5 line-clamp-2 text-muted-foreground">{r.snippet}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">输入</div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs text-foreground/80">
                  {prettyJson(event.input_data || {})}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">输出</div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs text-foreground/80">
                  {prettyJson(event.output_data || {})}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
