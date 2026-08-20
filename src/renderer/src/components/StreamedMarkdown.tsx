import { useEffect, useRef, useState } from 'react'
import { Streamdown } from 'streamdown'

interface StreamedMarkdownProps {
  content: string
  isStreaming?: boolean
  className?: string
}

export function StreamedMarkdown({ content, isStreaming = false, className }: StreamedMarkdownProps) {
  return (
    <div className={className || 'prose prose-zinc dark:prose-invert prose-sm max-w-none'} role="article">
      <Streamdown mode={isStreaming ? 'streaming' : 'static'} isAnimating={isStreaming}>
        {content}
      </Streamdown>
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
      const { onPort } = await (window.api as any).ai.streamChat(prompt)

      const removeListener = onPort((port: MessagePort) => {
        port.onmessage = (e: MessageEvent) => {
          const { type, text, error } = e.data

          if (type === 'chunk') {
            bufferRef.current += text
            setState((prev) => ({ ...prev, content: bufferRef.current }))
          } else if (type === 'done') {
            setState((prev) => ({ ...prev, isStreaming: false }))
          } else if (type === 'error') {
            setState((prev) => ({
              ...prev,
              isStreaming: false,
              error: error || 'Unknown error'
            }))
          }
        }
        port.start()
      })

      cleanupRef.current = removeListener
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
