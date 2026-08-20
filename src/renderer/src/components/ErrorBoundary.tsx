import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    this.setState({ errorInfo: errorInfo.componentStack || null })
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="h-full flex items-center justify-center p-8">
            <div className="w-full max-w-lg">
              <div className="surface-card rounded-2xl p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  页面出现错误
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1 leading-relaxed">
                  {this.state.error?.message || '未知错误'}
                </p>
                {this.state.errorInfo && (
                  <details className="mt-3 text-left">
                    <summary className="text-xs text-zinc-400 dark:text-zinc-500 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                      查看错误详情
                    </summary>
                    <pre className="mt-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 text-[11px] text-zinc-600 dark:text-zinc-400 overflow-x-auto leading-relaxed border border-zinc-100 dark:border-zinc-700/50">
                      {this.state.errorInfo}
                    </pre>
                  </details>
                )}
                <div className="flex items-center justify-center gap-3 mt-6">
                  <button
                    onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 surface-card rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
                  >
                    重试
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                  >
                    刷新页面
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
