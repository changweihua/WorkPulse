import { useState, useEffect, ReactNode } from 'react'
import { CalendarRange, Sparkles, BarChart3, Calendar, CheckCircle2, ListTodo, Users, Flame } from 'lucide-react'
import { getDateRange, type DatePreset } from '../lib/dateUtils'
import { useI18n } from '../stores/languageStore'
import { FadeIn } from '../components/Motion'

interface WeeklyReport {
  period: { start: string; end: string }
  summary: {
    totalLogs: number
    totalTasksDone: number
    totalTasksActive: number
    meetingsAttended: number
    activeDays: number
  }
  dailyBreakdown: Array<{
    date: string
    logs: number
    tasksDone: number
    meetings: number
    topCategories: Array<{ category: string; count: number }>
  }>
  highlights: string[]
}

function SummaryCard({
  icon,
  label,
  value,
  iconBg
}: {
  icon: ReactNode
  label: string
  value: number
  iconBg: string
}): ReactNode {
  return (
    <div className="surface-card rounded-xl p-4 flex items-center gap-3">
      <div
        className="w-11 h-11 flex items-center justify-center rounded-xl text-xl shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="text-2xl font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100 leading-none mt-0.5">
          {value}
        </p>
      </div>
    </div>
  )
}

function ReportsPage(): ReactNode {
  const [preset, setPreset] = useState<DatePreset>('this_week')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    applyPreset('this_week')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyPreset = (p: DatePreset): void => {
    setPreset(p)
    const range = getDateRange(p)
    setStart(range.from)
    setEnd(range.to)
  }

  const handleGenerate = async (): Promise<void> => {
    if (!start || !end) return
    setLoading(true)
    try {
      const data = await window.api.report.weekly(start, end)
      setReport(data)
    } catch (err) {
      console.error('Failed to generate weekly report:', err)
    } finally {
      setLoading(false)
    }
  }

  const presets: { value: DatePreset; label: string }[] = [
    { value: 'this_week', label: t('report.thisWeek') },
    { value: 'last_week', label: t('report.lastWeek') }
  ]

  return (
    <div className="h-full overflow-hidden">
      <div className="hide-scrollbar h-full overflow-y-auto px-6 py-6 space-y-5">
        <FadeIn>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {t('reports.weeklyTitle')}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t('reports.weeklySubtitle')}</p>
          </div>
        </FadeIn>

        {/* 控制区 */}
        <FadeIn className="surface-card rounded-xl p-5" delay={0.08}>
          <div className="flex flex-wrap gap-2 mb-4">
            {presets.map((p) => (
              <button
                key={p.value}
                onClick={() => applyPreset(p.value)}
                className={`px-4 py-2 text-sm rounded-lg transition-all btn-bounce ${
                  preset === p.value
                    ? 'bg-blue-600 text-white shadow-fluent'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm outline-none focus:border-zinc-500 surface-input dark:text-zinc-100"
            />
            <span>{t('common.to')}</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm outline-none focus:border-zinc-500 surface-input dark:text-zinc-100"
            />
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="ml-auto px-6 py-2.5 text-sm font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 shadow-fluent transition-all btn-bounce disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {t('report.generate')}
            </button>
          </div>
        </FadeIn>

        {loading && (
          <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
            <div className="w-6 h-6 mr-2 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
            {t('common.loading')}
          </div>
        )}

        {!loading && report && (
          <div className="space-y-5">
            {/* 概览 */}
            <FadeIn className="surface-card rounded-xl p-5" delay={0.1}>
              <div className="flex items-center gap-2 mb-4">
                <CalendarRange className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {t('reports.period')}: {report.period.start} {t('common.to')} {report.period.end}
                </h3>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <SummaryCard
                  icon={<BarChart3 className="w-5 h-5 text-blue-500" />}
                  label={t('stats.totalLogs')}
                  value={report.summary.totalLogs}
                  iconBg="linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))"
                />
                <SummaryCard
                  icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  label={t('stats.doneTasks')}
                  value={report.summary.totalTasksDone}
                  iconBg="linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))"
                />
                <SummaryCard
                  icon={<ListTodo className="w-5 h-5 text-violet-500" />}
                  label={t('stats.activeTasks')}
                  value={report.summary.totalTasksActive}
                  iconBg="linear-gradient(135deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05))"
                />
                <SummaryCard
                  icon={<Users className="w-5 h-5 text-amber-500" />}
                  label={t('reports.meetings')}
                  value={report.summary.meetingsAttended}
                  iconBg="linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))"
                />
                <SummaryCard
                  icon={<Flame className="w-5 h-5 text-orange-500" />}
                  label={t('stats.activeDays')}
                  value={report.summary.activeDays}
                  iconBg="linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.05))"
                />
              </div>
            </FadeIn>

            {/* 高光时刻 */}
            {report.highlights.length > 0 && (
              <FadeIn className="surface-card rounded-xl p-5" delay={0.14}>
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  {t('reports.highlights')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {report.highlights.map((date, idx) => (
                    <span
                      key={date}
                      className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm font-medium"
                    >
                      #{idx + 1} {date}
                    </span>
                  ))}
                </div>
              </FadeIn>
            )}

            {/* 每日明细 */}
            <FadeIn className="surface-card rounded-xl p-5" delay={0.18}>
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-violet-500" />
                {t('reports.dailyBreakdown')}
              </h3>
              <div className="space-y-2">
                {report.dailyBreakdown.map((day) => (
                  <div
                    key={day.date}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-zinc-50 dark:bg-white/5 px-3 py-2.5"
                  >
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums w-24 shrink-0">
                      {day.date.slice(5)}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {t('stats.logLegend')} <b className="text-zinc-700 dark:text-zinc-200">{day.logs}</b>
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {t('stats.doneLegend')} <b className="text-zinc-700 dark:text-zinc-200">{day.tasksDone}</b>
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {t('reports.meetings')} <b className="text-zinc-700 dark:text-zinc-200">{day.meetings}</b>
                    </span>
                    {day.topCategories.length > 0 && (
                      <span className="flex flex-wrap gap-1.5 ml-auto">
                        {day.topCategories.map((c) => (
                          <span
                            key={c.category}
                            className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-300"
                          >
                            {c.category} · {c.count}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        )}

        {!loading && !report && (
          <FadeIn className="surface-card rounded-xl p-10 text-center" delay={0.1}>
            <CalendarRange className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">{t('reports.noData')}</p>
          </FadeIn>
        )}
      </div>
    </div>
  )
}

export default ReportsPage
