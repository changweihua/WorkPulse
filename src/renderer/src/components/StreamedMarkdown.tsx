import { useEffect, useRef, useState, useMemo } from 'react'
import { Streamdown } from 'streamdown'
import { Brain } from 'lucide-react'

interface StreamedMarkdownProps {
  content: string
  isStreaming?: boolean
  className?: string
}

function parseThinkTags(content: string): { think: string; rest: string } {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/)
  const think = thinkMatch ? thinkMatch[1].trim() : ''
  const rest = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return { think, rest }
}

export function StreamedMarkdown({ content, isStreaming = false, className }: StreamedMarkdownProps) {
  const [thinkOpen, setThinkOpen] = useState(false)
  const { think, rest } = useMemo(() => parseThinkTags(content), [content])

  // 跟随主题切换，让 Mermaid 图表用对应的深浅配色
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  return (
    <div className={className || 'prose prose-zinc dark:prose-invert prose-sm max-w-none'} role="article">
      {think && (
        <div className="mb-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden">
          <button
            onClick={() => setThinkOpen(!thinkOpen)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
          >
            <Brain className="w-3.5 h-3.5" />
            <span className="font-medium">Thinking</span>
            {isStreaming && !think && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
            <svg className={`w-3 h-3 ml-auto transition-transform ${thinkOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 4l4 4 4-4" />
            </svg>
          </button>
          {thinkOpen && (
            <div className="px-3 pb-3 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {think}
            </div>
          )}
        </div>
      )}
      {rest ? (
        <Streamdown
          mode={isStreaming ? 'streaming' : 'static'}
          isAnimating={isStreaming}
          mermaid={{
            // securityLevel strict：渲染层即净化，禁止图表内 HTML 注入
            config: {
              theme: isDark ? 'dark' : 'default',
              startOnLoad: false,
              securityLevel: 'strict'
            }
          }}
        >
          {rest}
        </Streamdown>
      ) : isStreaming && !think ? (
        <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          正在生成...
        </div>
      ) : null}
    </div>
  )
}

interface StreamChatState {
  content: string
  isStreaming: boolean
  error: string | null
}

export function useStreamChat(): StreamChatState & {
  startStream: (prompt: string) => Promise<void>
  reset: () => void
} {
  const [state, setState] = useState<StreamChatState>({
    content: '',
    isStreaming: false,
    error: null
  })
  const bufferRef = useRef('')
  const cleanupRef = useRef<(() => void) | null>(null)

  const startStream = async (prompt: string): Promise<void> => {
    bufferRef.current = ''
    setState({ content: '', isStreaming: true, error: null })

    try {
      const api = (window.api as any).ai.streamChat(prompt)

      const cleanupChunk = api.onChunk((text: string) => {
        bufferRef.current += text
        setState((prev) => ({ ...prev, content: bufferRef.current }))
      })
      const cleanupDone = api.onDone(() => {
        setState((prev) => ({ ...prev, isStreaming: false }))
      })
      const cleanupError = api.onError((error: string) => {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: error || 'Unknown error'
        }))
      })

      cleanupRef.current = () => { cleanupChunk(); cleanupDone(); cleanupError() }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: err instanceof Error ? err.message : String(err)
      }))
    }
  }

  const reset = (): void => {
    cleanupRef.current?.()
    bufferRef.current = ''
    setState({ content: '', isStreaming: false, error: null })
  }

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  return { ...state, startStream, reset }
}
