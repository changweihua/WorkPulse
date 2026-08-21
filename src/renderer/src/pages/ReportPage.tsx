import { useState, useEffect, ReactNode } from 'react'
import {
  Copy,
  RefreshCw,
  AlertCircle,
  FileText,
  Check,
  Pencil,
  Eye,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Save,
  Sparkles
} from 'lucide-react'
import { getDateRange, type DatePreset } from '../lib/dateUtils'
import { useToast } from '../components/Toast'
import { useI18n } from '../stores/languageStore'
import { StreamedMarkdown, useStreamChat } from '../components/StreamedMarkdown'

interface Report {
  id: number
  type: string
  date_from: string
  date_to: string
  content: string
  generated_at: string
}

type Status = 'idle' | 'no_key' | 'generating' | 'streaming' | 'success' | 'error' | 'no_data'

function ReportPage(): ReactNode {
  const [preset, setPreset] = useState<DatePreset>('this_week')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [reportContent, setReportContent] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [history, setHistory] = useState<Report[]>([])
  const [viewingReport, setViewingReport] = useState<Report | null>(null)
  const [activeReport, setActiveReport] = useState<Report | null>(null)
  const [historyOpen, setHistoryOpen] = useState(true)
  const toast = useToast()
  const { t } = useI18n()
  const { content: streamedContent, isStreaming, error: streamError, startStream, reset: resetStream } = useStreamChat()

  useEffect(() => {
    checkApiKey()
    applyPreset('this_week')
    loadHistory()
  }, [])

  useEffect(() => {
    if (status === 'streaming' && streamedContent) {
      setReportContent(streamedContent)
    }
  }, [streamedContent, status])

  useEffect(() => {
    if (status === 'streaming' && !isStreaming && streamedContent) {
      setReportContent(streamedContent)
      setStatus('success')
      saveNewReport(streamedContent)
      loadHistory()
    }
  }, [isStreaming, status, streamedContent])

  useEffect(() => {
    if (status === 'streaming' && streamError) {
      setErrorMsg(streamError)
      setStatus('error')
    }
  }, [streamError, status])

  const checkApiKey = async (): Promise<void> => {
    const key = await window.api.settings.get('api_key')
    if (!key) {
      setStatus('no_key')
    }
  }

  const loadHistory = async (): Promise<void> => {
    const reports = await window.api.report.list(50)
    setHistory(reports)
  }

  const applyPreset = (p: DatePreset): void => {
    setPreset(p)
    const range = getDateRange(p)
    setDateFrom(range.from)
    setDateTo(range.to)
  }

  const handleGenerate = async (): Promise<void> => {
    if (!dateFrom || !dateTo) return

    setStatus('generating')
    setReportContent('')
    setErrorMsg('')
    setViewingReport(null)
    setActiveReport(null)
    resetStream()

    const logs = await window.api.worklog.byDateRange(dateFrom, dateTo)
    if (!logs || logs.length === 0) {
      setStatus('no_data')
      return
    }

    const tasks = await window.api.task.list()
    const filteredTasks = tasks.filter((task) => {
      if (task.status !== 'done') return true
      const completedDate = task.completed_at?.slice(0, 10)
      return Boolean(completedDate && completedDate >= dateFrom && completedDate <= dateTo)
    })

    const logsText = logs.map((log: { created_at: string; content: string }) => `[${log.created_at}] ${log.content}`).join('\n')
    const taskText = filteredTasks.length > 0
      ? `\n\nTasks:\n${filteredTasks.map((t) => `- [${t.status}] ${t.title}${t.description ? `: ${t.description}` : ''}`).join('\n')}`
      : ''
    const prompt = `Generate a work summary report for ${dateFrom} to ${dateTo}.\n\nWork logs:\n${logsText}${taskText}`

    try {
      await startStream(prompt)
      setStatus('streaming')
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('report.generatedFallback')
      if (msg.includes('没有工作记录') || msg.includes('No work logs')) {
        setStatus('no_data')
      } else {
        setErrorMsg(msg)
        setStatus('error')
      }
    }
  }

  const getReportType = (): string => {
    if (preset === 'this_week' || preset === 'last_week') return 'weekly'
    if (preset === 'this_month' || preset === 'last_month') return 'monthly'
    if (preset === 'this_quarter') return 'quarterly'
    return 'custom'
  }

  const saveNewReport = async (content: string): Promise<void> => {
    try {
      const type = getReportType()
      await window.api.report.create(type, dateFrom, dateTo, content)
    } catch (err) {
      console.error('Failed to save report:', err)
    }
  }

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(reportContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success(t('report.copied'))
    } catch {
      toast.error(t('report.copyFailed'))
    }
  }

  const handleViewReport = (report: Report): void => {
    setViewingReport(report)
    setActiveReport(report)
    setReportContent(report.content)
    setStatus('success')
    setEditing(false)
  }

  const handleBackToNew = (): void => {
    setViewingReport(null)
    setActiveReport(null)
    setReportContent('')
    setStatus('idle')
    setEditing(false)
  }

  const handleSaveReport = async (): Promise<void> => {
    if (!activeReport) return

    try {
      const updated = await window.api.report.update(activeReport.id, reportContent)
      if (!updated) {
        toast.error(t('report.saveFailed'))
        return
      }

      setActiveReport(updated)
      if (viewingReport?.id === updated.id) {
        setViewingReport(updated)
      }
      setReportContent(updated.content)
      await loadHistory()
      toast.success(t('report.saved'))
    } catch {
      toast.error(t('report.saveFailed'))
    }
  }

  const formatReportDate = (dateStr: string): string => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const presets: { value: DatePreset; label: string }[] = [
    { value: 'this_week', label: t('report.thisWeek') },
    { value: 'last_week', label: t('report.lastWeek') },
    { value: 'this_month', label: t('report.thisMonth') },
    { value: 'last_month', label: t('report.lastMonth') },
    { value: 'this_quarter', label: t('report.thisQuarter') }
  ]

  const isViewingHistory = viewingReport !== null
  const activeId = viewingReport?.id ?? activeReport?.id

  return (
    <div className="h-full overflow-hidden px-6 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5" style={{ height: '100%' }}>
        <div className="lg:col-span-3 min-w-0 flex flex-col gap-3 overflow-hidden">
          {isViewingHistory && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 surface-card shrink-0">
              <button onClick={handleBackToNew} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                &larr; {t('report.backToGenerate')}
              </button>
              <span className="text-sm text-zinc-300 dark:text-zinc-600">|</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {viewingReport.date_from} {t('common.to')} {viewingReport.date_to}
              </span>
              <span className="text-xs text-zinc-400">
                {t('report.generatedAt', { time: formatReportDate(viewingReport.generated_at) })}
              </span>
            </div>
          )}

          {!isViewingHistory && (
            <div className="surface-card p-4 shrink-0">
              <div className="flex flex-wrap gap-2 mb-3">
                {presets.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => applyPreset(p.value)}
                    className={`px-4 py-2 text-sm rounded-lg transition-all btn-bounce ${
                      preset === p.value
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-fluent'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm outline-none focus:border-zinc-500 surface-input dark:text-zinc-100" />
                <span>{t('common.to')}</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm outline-none focus:border-zinc-500 surface-input dark:text-zinc-100" />
              </div>
            </div>
          )}

          {!isViewingHistory && (
            <button
              onClick={handleGenerate}
              disabled={status === 'no_key' || status === 'generating' || status === 'streaming'}
              className="shrink-0 px-8 py-3 text-sm font-semibold rounded-xl text-white dark:text-zinc-900 bg-gradient-to-r from-zinc-800 via-zinc-900 to-zinc-800 dark:from-zinc-100 dark:via-zinc-200 dark:to-zinc-100 shadow-fluent hover:shadow-fluent-lg transition-all btn-bounce disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'generating' || status === 'streaming' ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {status === 'streaming' ? t('report.streaming') : t('report.generating')}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  {t('report.generate')}
                </span>
              )}
            </button>
          )}

          {status === 'no_key' && !isViewingHistory && (
            <div className="flex items-start gap-3 p-4 surface-card border-l-4 border-l-amber-400 shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('report.noKeyTitle')}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-1">{t('report.noKeySubtitle')}</p>
              </div>
            </div>
          )}

          {status === 'no_data' && !isViewingHistory && (
            <div className="text-center py-10 surface-card shrink-0">
              <FileText className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
              <p className="text-zinc-600 dark:text-zinc-400 font-medium mb-1">{t('report.noDataTitle')}</p>
              <p className="text-zinc-400 dark:text-zinc-500 text-sm">{t('report.noDataSubtitle')}</p>
            </div>
          )}

          {status === 'error' && !isViewingHistory && (
            <div className="flex items-start gap-3 p-4 surface-card border-l-4 border-l-red-400 shrink-0">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">{errorMsg}</p>
                <div className="flex gap-3 mt-2">
                  <button onClick={handleGenerate} className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 underline">
                    {t('common.retry')}
                  </button>
                  <button onClick={() => setStatus('idle')} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline">
                    {t('report.checkSettings')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {(status === 'success' || status === 'streaming' || status === 'generating') && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2 gap-3 flex-wrap shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                  {isStreaming && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
                      {t('report.streaming')}
                    </span>
                  )}
                </div>
                <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                  <button onClick={() => setEditing(false)}
                    className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors ${!editing ? 'surface-card text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                    <Eye className="w-3.5 h-3.5" />{t('report.preview')}
                  </button>
                  <button onClick={() => setEditing(true)}
                    className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors ${editing ? 'surface-card text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                    <Pencil className="w-3.5 h-3.5" />{t('report.edit')}
                  </button>
                </div>
              </div>

              {editing ? (
                <textarea value={reportContent} onChange={(e) => setReportContent(e.target.value)}
                  className="flex-1 min-h-0 w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl surface-input dark:text-zinc-100 text-sm font-mono leading-relaxed outline-none focus:border-zinc-400 resize-none" />
              ) : (
                <div className={`flex-1 min-h-0 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-xl p-5 surface-card ${isStreaming ? 'streaming-border' : ''}`}>
                  <StreamedMarkdown content={reportContent} isStreaming={isStreaming} />
                </div>
              )}

              <div className="surface-elevated rounded-xl p-2 flex flex-wrap gap-2 mt-3 shrink-0">
                <button onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors btn-bounce">
                  {copied ? <><Check className="w-4 h-4" />{t('report.copiedState')}</> : <><Copy className="w-4 h-4" />{t('report.copy')}</>}
                </button>
                <button
                  onClick={async () => {
                    const range = viewingReport ? `${viewingReport.date_from}-${viewingReport.date_to}` : `${dateFrom}-${dateTo}`
                    const path = await window.api.export.report(reportContent, range)
                    if (path) toast.success(t('report.exported'))
                  }}
                  className="flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  <Download className="w-4 h-4" />{t('common.export')}
                </button>
                {editing && activeReport && (
                  <button onClick={handleSaveReport}
                    className="flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    <Save className="w-4 h-4" />{t('report.saveChanges')}
                  </button>
                )}
                {!isViewingHistory && (
                  <button onClick={handleGenerate}
                    className="flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    <RefreshCw className="w-4 h-4" />{t('report.regenerate')}
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'idle' && !isViewingHistory && !reportContent && (
            <div className="hidden lg:flex flex-1 flex-col items-center justify-center surface-card p-8">
              <div className="w-16 h-16 mb-5 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 dark:from-zinc-100 dark:to-zinc-200 flex items-center justify-center shadow-fluent">
                <Sparkles className="w-8 h-8 text-white dark:text-zinc-900" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">{t('report.emptyTitle')}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed text-center max-w-md">{t('report.emptyDesc')}</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  {t('report.emptyFeat1')}
                </div>
                <div className="flex items-start gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                  <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  {t('report.emptyFeat2')}
                </div>
                <div className="flex items-start gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                  <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  </div>
                  {t('report.emptyFeat3')}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 min-w-0 overflow-hidden flex flex-col" style={{ height: '100%' }}>
          <div className="surface-card p-4 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <Clock className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t('report.history')}</h3>
              <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">{history.length}</span>
              {history.length > 0 && (
                <button onClick={() => setHistoryOpen(!historyOpen)} className="ml-auto text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                  {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 py-4 text-center">{t('report.noHistory')}</p>
            ) : historyOpen ? (
              <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-zinc-200/60 dark:divide-zinc-700/60 pr-1 -mr-1">
                {history.map((report) => {
                  const isActive = report.id === activeId
                  return (
                    <button key={report.id} onClick={() => handleViewReport(report)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${isActive ? 'bg-zinc-900/[0.06] dark:bg-zinc-100/[0.08] ring-1 ring-zinc-900/10 dark:ring-zinc-100/20' : 'hover:bg-zinc-500/[0.06] dark:hover:bg-zinc-100/[0.04]'}`}>
                      <div className="flex items-center gap-2">
                        <FileText className={`w-4 h-4 shrink-0 ${isActive ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400'}`} />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{report.date_from} {t('common.to')} {report.date_to}</span>
                      </div>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5 ml-6 line-clamp-2">
                        {report.content.slice(0, 80).replace(/[#*\n]/g, ' ').trim()}...
                      </p>
                      <div className="flex items-center justify-end mt-1.5">
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{formatReportDate(report.generated_at)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReportPage
