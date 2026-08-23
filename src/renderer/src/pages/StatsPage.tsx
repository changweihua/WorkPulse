import { useEffect, useState, useRef, useCallback, ReactNode } from 'react'
import { motion } from 'motion/react'
import { FadeIn } from '../components/Motion'
import { Tag, TrendingUp, Calendar } from 'lucide-react'
import * as echarts from 'echarts'
import { useI18n } from '../stores/languageStore'
import type { TranslationKey } from '../lib/i18n'
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

const RANGE_OPTIONS = [30, 90, 180, 365] as const

const RANGE_LABELS: Record<number, TranslationKey> = {
  30: 'stats.range1M',
  90: 'stats.range3M',
  180: 'stats.range6M',
  365: 'stats.range1Y'
}

const CATEGORY_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#ef4444',
]

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function useCountUp(target: number, duration = 1200): number {
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

const STATS_GRID_VARIANTS = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } }
}

const STATS_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } }
}

function StatCard({
  emoji,
  label,
  value,
  suffix,
  delta,
  deltaLabel,
  gradient,
  iconBg,
  valueColor
}: {
  emoji: string
  label: string
  value: number
  suffix?: string
  delta?: string
  deltaLabel?: string
  gradient: string
  iconBg: string
  valueColor: string
}): ReactNode {
  const displayValue = useCountUp(value)

  return (
    <motion.div
      variants={STATS_ITEM_VARIANTS}
      className="stat-card group relative flex items-center justify-between p-4 pr-5 surface-card rounded-2xl overflow-hidden"
      style={{ backgroundImage: gradient }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mb-1">{label}</p>
        <p className="text-[32px] font-extrabold tabular-nums leading-none tracking-tight" style={{ color: valueColor }}>
          {displayValue}{suffix && <span className="text-sm font-semibold text-zinc-400 dark:text-zinc-500 ml-0.5">{suffix}</span>}
        </p>
        {delta && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">
            {deltaLabel && <span className="mr-1">{deltaLabel}</span>}
            <span className={`font-medium ${delta.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>
              {delta.startsWith('+') ? '↑' : '↓'} {delta}
            </span>
          </p>
        )}
      </div>
      <div
        className="stat-card-icon shrink-0 w-14 h-14 flex items-center justify-center rounded-2xl text-3xl"
        style={{ background: iconBg }}
      >
        {emoji}
      </div>
    </motion.div>
  )
}

function DonutChart({ logs, tasks }: { logs: number; tasks: number }): ReactNode {
  const { t } = useI18n()
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const tRef = useRef(t)
  tRef.current = t
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
    chartInstance.current = echarts.init(chartRef.current)
    return () => { chartInstance.current?.dispose(); chartInstance.current = null }
  }, [])

  useEffect(() => {
    const chart = chartInstance.current
    if (!chart) return
    const total = logs + tasks
    chart.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: isDark ? 'rgba(24,24,27,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        textStyle: { color: isDark ? '#e5e7eb' : '#111827', fontSize: 12, fontFamily: FONT_FAMILY },
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${p.name}: ${p.value} (${p.percent}%)`
      },
      legend: { show: false },
      series: [{
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 6,
          borderColor: isDark ? '#18181b' : '#ffffff',
          borderWidth: 3
        },
        label: {
          show: true,
          position: 'center',
          formatter: [
            `{total|${total}}`,
            `{label|${tRef.current('stats.total')}}`
          ].join('\n'),
          rich: {
            total: { fontSize: 24, fontWeight: 'bold', color: isDark ? '#e5e7eb' : '#111827', lineHeight: 34 },
            label: { fontSize: 11, color: isDark ? '#71717a' : '#a1a1aa', lineHeight: 18 }
          }
        },
        emphasis: {
          scaleSize: 6,
          label: { fontSize: 14 }
        },
        data: [
          { value: logs, name: tRef.current('stats.logLegend'), itemStyle: { color: '#2dd4bf' } },
          { value: tasks, name: tRef.current('stats.doneTasks'), itemStyle: { color: '#facc15' } }
        ],
        animationType: 'scale',
        animationEasing: 'elasticOut',
        animationDuration: 800,
        animationDelay: (idx: number) => idx * 200
      }]
    }, true)
  }, [logs, tasks, isDark])

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="flex flex-col items-center">
      <div ref={chartRef} className="w-40 h-40" />
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
  const periodData = data
  const periodLogs = periodData.reduce((s, d) => s + d.log_count, 0)
  const periodTasks = periodData.reduce((s, d) => s + d.task_completed, 0)
  const activeDays = periodData.filter((d) => d.log_count + d.task_completed > 0).length
  const bestDay = periodData.reduce(
    (best, d) => (d.log_count + d.task_completed > best.count ? { date: d.date, count: d.log_count + d.task_completed } : best),
    { date: '', count: 0 }
  )
  const avgPerActiveDay = activeDays > 0 ? ((periodLogs + periodTasks) / activeDays).toFixed(1) : '0'

  const rows = [
    { label: t('stats.activeDays'), value: `${activeDays} / ${data.length}` },
    { label: t('stats.logLegend'), value: String(periodLogs) },
    { label: t('stats.doneTasks'), value: String(periodTasks) },
    { label: t('stats.bestDay'), value: bestDay.count > 0 ? `${bestDay.date.slice(5)} · ${bestDay.count}` : '-' },
    { label: t('stats.avgPerDay'), value: avgPerActiveDay }
  ]

  return (
    <FadeIn className="surface-card rounded-xl p-5" delay={0.12}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
        {t('stats.weeklySummary')}
      </h3>
      <div className="grid grid-cols-2 gap-2.5">
        {rows.map((row, idx) => (
          <div
            key={row.label}
            className={`rounded-lg bg-zinc-50 dark:bg-white/5 px-3 py-2.5 ${
              idx === 3 ? 'col-span-2 flex items-center justify-between' : ''
            }`}
          >
            <p
              className={`text-[11px] text-zinc-500 dark:text-zinc-400 ${
                idx === 3 ? '' : 'mb-1'
              }`}
            >
              {row.label}
            </p>
            <p
              className={`font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums ${
                idx === 3 ? 'text-sm ml-2 truncate' : 'text-base'
              }`}
            >
              {row.value}
            </p>
          </div>
        ))}
      </div>
    </FadeIn>
  )
}

function CategoryBreakdown({ range }: { range: number }): ReactNode {
  const { t } = useI18n()
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const tRef = useRef(t)
  tRef.current = t
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)

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
    chartInstance.current = echarts.init(chartRef.current)
    return () => { chartInstance.current?.dispose(); chartInstance.current = null }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - range)
    const fmt = (d: Date): string => formatLocalDate(d)
    window.api.worklog
      .byDateRange(fmt(from), fmt(to))
      .then((logs) => {
        if (cancelled) return
        const counts = new Map<string, number>()
        for (const log of logs) {
          const key = log.category?.trim() || tRef.current('stats.uncategorized')
          counts.set(key, (counts.get(key) || 0) + 1)
        }
        const cats = [...counts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)

        setHasData(cats.length > 0)
        const chart = chartInstance.current
        if (!chart || cats.length === 0) return

        const reversed = [...cats].reverse()
        chart.setOption({
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: isDark ? 'rgba(24,24,27,0.95)' : 'rgba(255,255,255,0.95)',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            borderWidth: 1,
            textStyle: { color: isDark ? '#e5e7eb' : '#111827', fontSize: 12, fontFamily: FONT_FAMILY }
          },
          grid: { left: 0, right: 45, top: 4, bottom: 0, containLabel: true },
          xAxis: { type: 'value', show: false },
          yAxis: {
            type: 'category',
            data: reversed.map((c) => c.name),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              color: isDark ? '#a1a1aa' : '#71717a',
              fontSize: 11,
              fontFamily: FONT_FAMILY,
              width: 80,
              overflow: 'truncate'
            }
          },
          series: [{
            type: 'bar',
            data: reversed.map((c, i) => ({
              value: c.count,
              itemStyle: {
                color: CATEGORY_COLORS[(cats.length - 1 - i) % CATEGORY_COLORS.length],
                borderRadius: [0, 4, 4, 0]
              }
            })),
            barWidth: '60%',
            label: {
              show: true,
              position: 'right',
              fontSize: 11,
              color: isDark ? '#a1a1aa' : '#71717a',
              fontFamily: FONT_FAMILY,
              formatter: '{c}'
            }
          }],
          animationDuration: 800,
          animationEasing: 'elasticOut',
          animationDelay: (idx: number) => idx * 100
        }, true)
      })
      .catch(() => !cancelled && setHasData(false))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [range, isDark])

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <FadeIn className="surface-card rounded-xl p-5" delay={0.24}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4 flex items-center gap-1.5">
        <Tag size={14} className="text-blue-500" />
        {t('stats.categoryDist')}
      </h3>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-zinc-400 text-xs">{t('common.loading')}</div>
      ) : !hasData ? (
        <div className="flex items-center justify-center py-8 text-zinc-400 text-xs">{t('stats.noData')}</div>
      ) : (
        <div ref={chartRef} className="h-52 w-full" />
      )}
    </FadeIn>
  )
}

const FONT_FAMILY = '"JetBrains Maple Mono", "Maple Mono NF CN", "Source Han Serif SC", "思源宋体", sans-serif'

function BarChart({ data }: { data: DailyStats[] }): ReactNode {
  const { t } = useI18n()
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const tRef = useRef(t)
  tRef.current = t
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )

  // Theme observer
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Init chart ONCE
  useEffect(() => {
    if (!chartRef.current) return
    chartInstance.current = echarts.init(chartRef.current)
    return () => {
      chartInstance.current?.dispose()
      chartInstance.current = null
    }
  }, [])

  // Update options only on data/theme change (NOT t)
  useEffect(() => {
    const chart = chartInstance.current
    if (!chart) return

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
          name: tRef.current('stats.logLegend'),
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
          name: tRef.current('stats.doneLegend'),
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
      animationEasing: 'elasticOut',
      animationDelay: (idx: number) => idx * 40,
      animationDurationUpdate: 500,
      animationEasingUpdate: 'cubicInOut',
      animationDelayUpdate: (idx: number) => idx * 30
    })
  }, [data, isDark])

  // Resize
  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <FadeIn className="surface-card rounded-xl p-5" delay={0.2}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
        {t('stats.dailyActivity')}
      </h3>
      <div ref={chartRef} className="h-52 w-full" />
    </FadeIn>
  )
}

/** Compare current period vs previous period of the same length for delta */
function computeDeltas(daily: DailyStats[]): { logsDelta: string | undefined; tasksDelta: string | undefined } {
  if (daily.length < 2) return { logsDelta: undefined, tasksDelta: undefined }

  const half = Math.floor(daily.length / 2)
  const recent = daily.slice(-half)
  const prev = daily.slice(0, half)

  const recentLogs = recent.reduce((s, d) => s + d.log_count, 0)
  const prevLogs = prev.reduce((s, d) => s + d.log_count, 0)
  const recentTasks = recent.reduce((s, d) => s + d.task_completed, 0)
  const prevTasks = prev.reduce((s, d) => s + d.task_completed, 0)

  const fmt = (curr: number, prevVal: number): string | undefined => {
    if (prevVal === 0 && curr === 0) return undefined
    if (prevVal === 0) return '+∞'
    const pct = ((curr - prevVal) / prevVal) * 100
    if (pct === 0) return undefined
    return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
  }

  return { logsDelta: fmt(recentLogs, prevLogs), tasksDelta: fmt(recentTasks, prevTasks) }
}

function StatsPage(): ReactNode {
  const [stats, setStats] = useState<Stats | null>(null)
  const [range, setRange] = useState<number>(90)
  const { t } = useI18n()

  const loadStats = useCallback(async (days: number): Promise<void> => {
    try {
      const data = await window.api.stats.get(days)
      setStats(data)
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }, [])

  useEffect(() => {
    loadStats(range)
  }, [range, loadStats])

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

  // Windowed totals from daily data (linked to range selector)
  const windowedLogs = stats.daily.reduce((s, d) => s + d.log_count, 0)
  const windowedTasksDone = stats.daily.reduce((s, d) => s + d.task_completed, 0)
  const { logsDelta, tasksDelta } = computeDeltas(stats.daily)

  const barDays = Math.min(range, 30)

  const filled: DailyStats[] = []
  const today = new Date()
  for (let i = barDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = formatLocalDate(d)
    const existing = stats.daily.find((s) => s.date === dateStr)
    filled.push(existing || { date: dateStr, log_count: 0, task_completed: 0 })
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="hide-scrollbar h-full overflow-y-auto px-6 py-6 space-y-5">
        {/* 标题 */}
        <FadeIn>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {t('stats.title')}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t('stats.subtitle')}</p>
            </div>
        </FadeIn>

        {/* 范围按钮 — fixed 固定顶部，无背景 */}
        <div className="fixed top-30 right-0 z-10">
            <div className="flex items-center rounded-lg border border-[var(--color-border)] surface-input overflow-hidden">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-4 py-2 text-sm font-semibold rounded-md transition ${
                    range === r
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {t(RANGE_LABELS[r])}
                </button>
              ))}
            </div>
        </div>

          <motion.div
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
            variants={STATS_GRID_VARIANTS}
            initial="hidden"
            animate="show"
          >
            <StatCard
              emoji="🔥"
              label={t('stats.streak')}
              value={stats.streak}
              suffix={t('stats.days')}
              valueColor="#f97316"
              gradient="linear-gradient(135deg, rgba(249,115,22,0.06), rgba(249,115,22,0.01))"
              iconBg="linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.05))"
            />
            <StatCard
              emoji="📝"
              label={t('stats.totalLogs')}
              value={windowedLogs}
              delta={logsDelta}
              deltaLabel={t('stats.vsPrevHalf')}
              valueColor="#3b82f6"
              gradient="linear-gradient(135deg, rgba(59,130,246,0.06), rgba(59,130,246,0.01))"
              iconBg="linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))"
            />
            <StatCard
              emoji="✅"
              label={t('stats.doneTasks')}
              value={windowedTasksDone}
              delta={tasksDelta}
              deltaLabel={t('stats.vsPrevHalf')}
              valueColor="#22c55e"
              gradient="linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.01))"
              iconBg="linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))"
            />
            <StatCard
              emoji="📋"
              label={t('stats.activeTasks')}
              value={stats.totalTasksActive}
              valueColor="#a855f7"
              gradient="linear-gradient(135deg, rgba(168,85,247,0.06), rgba(168,85,247,0.01))"
              iconBg="linear-gradient(135deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05))"
            />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <FadeIn className="lg:col-span-3 surface-card rounded-xl p-5" delay={0.1}>
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-1.5">
                <Calendar size={14} className="text-violet-500" />
                {t('stats.contributionGraph')}
              </h3>
              <ContributionGrid3D data={stats.daily} />
            </FadeIn>

            <div className="lg:col-span-2 space-y-5">
              <FadeIn className="surface-card rounded-xl p-5 flex flex-col" delay={0.16}>
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4 flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-teal-500" />
                  {t('stats.logsVsTasks')}
                </h3>
                <div className="flex-1 flex items-center justify-center">
                  <DonutChart logs={windowedLogs} tasks={windowedTasksDone} />
                </div>
              </FadeIn>
              <WeeklySummary data={stats.daily} />
            </div>
          </div>

          <BarChart data={filled} />

          <CategoryBreakdown range={range} />
      </div>
    </div>
  )
}

export default StatsPage
