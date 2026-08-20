import { useEffect, useState, useRef, ReactNode } from 'react'
import { Flame, FileText, CheckCircle2, ListTodo } from 'lucide-react'
import * as echarts from 'echarts'
import { useI18n } from '../stores/languageStore'
import ContributionGrid3D from '../components/ContributionGrid3D'

interface DailyStats {
  date: string
  log_count: number
  task_completed: number
}

interface Stats {
  daily: DailyStats[]
  totalLogs: number
  totalTasksDone: number
  totalTasksActive: number
  streak: number
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0)
  const startTime = useRef<number | null>(null)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (target === 0) { setValue(0); return }
    startTime.current = null

    const animate = (time: number): void => {
      if (!startTime.current) startTime.current = time
      const progress = Math.min((time - startTime.current) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [target, duration])

  return value
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  color,
  gradient,
  delay = 0
}: {
  icon: typeof Flame
  label: string
  value: number
  suffix?: string
  color: string
  gradient: string
  delay?: number
}): ReactNode {
  const displayValue = useCountUp(value)

  return (
    <div
      className="flex items-center gap-4 p-5 surface-card rounded-xl card-hover animate-slide-up"
      style={{ animationDelay: `${delay}ms`, backgroundImage: gradient }}
    >
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-none">
          {displayValue}{suffix ? ` ${suffix}` : ''}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">{label}</p>
      </div>
    </div>
  )
}

function DonutChart({ logs, tasks }: { logs: number; tasks: number }): ReactNode {
  const { t } = useI18n()
  const total = logs + tasks
  const r = 54
  const c = 2 * Math.PI * r
  const logFrac = total > 0 ? logs / total : 0
  const logLen = logFrac * c
  const taskLen = c - logLen

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(0 0 0 / 6%)" strokeWidth="16" />
          <circle
            cx="70" cy="70" r={r} fill="none" stroke="#2dd4bf" strokeWidth="16"
            strokeDasharray={`${logLen} ${c - logLen}`} strokeLinecap="round"
          />
          <circle
            cx="70" cy="70" r={r} fill="none" stroke="#facc15" strokeWidth="16"
            strokeDasharray={`${taskLen} ${c - taskLen}`} strokeDashoffset={-logLen}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {total}
          </span>
          <span className="text-[11px] text-zinc-400">{t('stats.total')}</span>
        </div>
      </div>
      <div className="flex items-center gap-5 mt-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#2dd4bf]" />
          <span className="text-zinc-600 dark:text-zinc-300">{t('stats.logLegend')}</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{logs}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#facc15]" />
          <span className="text-zinc-600 dark:text-zinc-300">{t('stats.doneTasks')}</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{tasks}</span>
        </span>
      </div>
    </div>
  )
}

function WeeklySummary({ data }: { data: DailyStats[] }): ReactNode {
  const { t } = useI18n()
  const last7 = data.filter((d) => {
    const diff = (Date.now() - new Date(d.date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
    return diff < 7
  })
  const weekLogs = last7.reduce((s, d) => s + d.log_count, 0)
  const weekTasks = last7.reduce((s, d) => s + d.task_completed, 0)
  const activeDays = last7.filter((d) => d.log_count + d.task_completed > 0).length

  const rows = [
    { label: t('stats.activeDays'), value: `${activeDays} / 7` },
    { label: t('stats.logLegend'), value: String(weekLogs) },
    { label: t('stats.doneTasks'), value: String(weekTasks) }
  ]

  return (
    <div className="surface-card rounded-xl p-5 animate-slide-up" style={{ animationDelay: '120ms' }}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
        {t('stats.weeklySummary')}
      </h3>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{row.label}</span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const FONT_FAMILY = '"JetBrains Maple Mono", "Maple Mono NF CN", "Source Han Serif SC", "思源宋体", sans-serif'

function BarChart({ data }: { data: DailyStats[] }): ReactNode {
  const { t } = useI18n()
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!chartRef.current) return

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current)
    }
    const chart = chartInstance.current

    const dates = data.map((d) => {
      const day = new Date(d.date + 'T00:00:00')
      return `${day.getMonth() + 1}/${day.getDate()}`
    })
    const logs = data.map((d) => d.log_count || 0)
    const tasks = data.map((d) => d.task_completed || 0)

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(24,24,27,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        textStyle: { color: isDark ? '#e5e7eb' : '#111827', fontSize: 12, fontFamily: FONT_FAMILY },
        axisPointer: { type: 'shadow', shadowStyle: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' } }
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: isDark ? '#a1a1aa' : '#71717a', fontSize: 11, fontFamily: FONT_FAMILY },
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 16
      },
      grid: { left: 40, right: 12, top: 32, bottom: 28 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: isDark ? '#71717a' : '#a1a1aa', fontSize: 10, fontFamily: FONT_FAMILY }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' } },
        axisLabel: { color: isDark ? '#71717a' : '#a1a1aa', fontSize: 10, fontFamily: FONT_FAMILY }
      },
      series: [
        {
          name: t('stats.logLegend'),
          type: 'bar',
          stack: 'total',
          barWidth: '50%',
          barMaxWidth: 20,
          data: logs,
          itemStyle: {
            borderRadius: [0, 0, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: isDark ? '#60a5fa' : '#3b82f6' },
              { offset: 1, color: isDark ? '#3b82f6' : '#2563eb' }
            ])
          }
        },
        {
          name: t('stats.doneLegend'),
          type: 'bar',
          stack: 'total',
          barWidth: '50%',
          barMaxWidth: 20,
          data: tasks,
          itemStyle: {
            borderRadius: [3, 3, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: isDark ? '#4ade80' : '#22c55e' },
              { offset: 1, color: isDark ? '#22c55e' : '#16a34a' }
            ])
          }
        }
      ],
      animationDuration: 800,
      animationEasing: 'cubicOut'
    })

    return () => {}
  }, [data, isDark, t])

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chartInstance.current?.dispose()
      chartInstance.current = null
    }
  }, [])

  return (
    <div className="surface-card rounded-xl p-5 animate-slide-up" style={{ animationDelay: '200ms' }}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
        {t('stats.dailyActivity')}
      </h3>
      <div ref={chartRef} className="h-52 w-full" />
    </div>
  )
}

function StatsPage(): ReactNode {
  const [stats, setStats] = useState<Stats | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    window.api.stats.get(90).then(setStats)
  }, [])

  if (!stats) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <div className="text-center">
          <div className="w-6 h-6 mx-auto mb-2 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
          {t('common.loading')}
        </div>
      </div>
    )
  }

  const last14 = stats.daily.filter((d) => {
    const diff = (Date.now() - new Date(d.date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
    return diff <= 14
  })

  const filled: DailyStats[] = []
  const today = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = formatLocalDate(d)
    const existing = last14.find((s) => s.date === dateStr)
    filled.push(existing || { date: dateStr, log_count: 0, task_completed: 0 })
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full overflow-y-auto px-6 py-6">
        <div className="space-y-5">
          <div className="animate-slide-up">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {t('stats.title')}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t('stats.subtitle')}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Flame}
              label={t('stats.streak')}
              value={stats.streak}
              suffix={t('stats.days')}
              color={`bg-orange-100 dark:bg-orange-900/30 text-orange-600 ${stats.streak >= 7 ? 'streak-glow' : ''}`}
              gradient="linear-gradient(135deg, rgba(249,115,22,0.12), rgba(249,115,22,0))"
              delay={0}
            />
            <StatCard
              icon={FileText}
              label={t('stats.totalLogs')}
              value={stats.totalLogs}
              color="bg-blue-100 dark:bg-blue-900/30 text-blue-600"
              gradient="linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0))"
              delay={60}
            />
            <StatCard
              icon={CheckCircle2}
              label={t('stats.doneTasks')}
              value={stats.totalTasksDone}
              color="bg-green-100 dark:bg-green-900/30 text-green-600"
              gradient="linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0))"
              delay={120}
            />
            <StatCard
              icon={ListTodo}
              label={t('stats.activeTasks')}
              value={stats.totalTasksActive}
              color="bg-purple-100 dark:bg-purple-900/30 text-purple-600"
              gradient="linear-gradient(135deg, rgba(168,85,247,0.12), rgba(168,85,247,0))"
              delay={180}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 surface-card rounded-xl p-5 animate-slide-up" style={{ animationDelay: '100ms' }}>
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                {t('stats.contributionGraph')}
              </h3>
              <ContributionGrid3D data={stats.daily} />
            </div>

            <div className="space-y-5">
              <div className="surface-card rounded-xl p-5 animate-slide-up" style={{ animationDelay: '160ms' }}>
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
                  {t('stats.logsVsTasks')}
                </h3>
                <DonutChart logs={stats.totalLogs} tasks={stats.totalTasksDone} />
              </div>
              <WeeklySummary data={stats.daily} />
            </div>
          </div>

          <BarChart data={filled} />
        </div>
      </div>
    </div>
  )
}

export default StatsPage
