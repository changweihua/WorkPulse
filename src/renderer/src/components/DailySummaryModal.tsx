/**
 * 每日工作摘要弹窗 — 融合应用主题
 * 使用 surface-card / 毛玻璃 / 语义色，支持 light + dark
 */
import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { FadeIn, MOTION_EASE } from './Motion'
import { X } from 'lucide-react'

// ── 类型 ──

interface DailyStats {
  daily: Array<{ date: string; log_count: number; task_completed: number }>
  totalLogs: number
  totalTasksDone: number
  totalTasksActive: number
  streak: number
}

interface Props {
  onClose: () => void
}

// ── Hooks ──

function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (target === 0) { setValue(0); return }
    startTimeRef.current = null
    const animate = (time: number): void => {
      if (!startTimeRef.current) startTimeRef.current = time
      const progress = Math.min((time - startTimeRef.current) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [target, duration])

  return value
}

// ── 子组件 ──

function StatBlock({ emoji, label, value, accentClass, delay }: {
  emoji: string
  label: string
  value: number
  accentClass: string
  delay: number
}): ReactNode {
  const display = useCountUp(value, 1400)

  return (
    <FadeIn delay={delay}>
      <div className="surface-card rounded-2xl p-4 flex items-center gap-4">
        <div className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-2xl text-2xl ${accentClass}`}>
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mb-0.5">{label}</p>
          <p className="text-[32px] font-extrabold leading-none tabular-nums text-zinc-900 dark:text-zinc-100">
            {display}
          </p>
        </div>
      </div>
    </FadeIn>
  )
}

function MiniBarChart({ data }: { data: DailyStats['daily'] }): ReactNode {
  if (!data || data.length === 0) return null
  const maxVal = Math.max(...data.map(d => d.log_count + d.task_completed), 1)
  const weekDayNames = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <FadeIn delay={0.5}>
      <div className="surface-card rounded-2xl p-5">
        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-3">本周活动</p>
        <div className="flex items-end gap-1.5 h-[60px]">
          {data.map((day, i) => {
            const total = day.log_count + day.task_completed
            const height = total > 0 ? Math.max((total / maxVal) * 52, 4) : 2
            const isToday = day.date === new Date().toISOString().slice(0, 10)
            const dayOfWeek = new Date(day.date + 'T00:00:00').getDay()
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.6 + i * 0.05, duration: 0.4, ease: MOTION_EASE }}
                  className="w-full max-w-8 rounded-sm origin-bottom"
                  style={{
                    height,
                    background: isToday
                      ? 'linear-gradient(180deg, var(--color-blue-400), var(--color-blue-500))'
                      : total > 0
                        ? 'var(--color-blue-400)'
                        : 'var(--color-surface-inset)',
                    opacity: total > 0 ? 1 : 0.4,
                  }}
                />
                <span
                  className={`text-[10px] ${isToday ? 'font-semibold text-blue-500 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'}`}
                >
                  {weekDayNames[dayOfWeek]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </FadeIn>
  )
}

function getEncouragement(streak: number, todayLogs: number, todayTasks: number): string {
  const total = todayLogs + todayTasks
  if (streak >= 30) return '🏆 连续记录超过一个月，你是真正的坚持者！'
  if (streak >= 7) return '🔥 连续打卡一周以上，习惯正在养成！'
  if (total >= 5) return '💪 今天效率很高，继续保持！'
  if (total >= 1) return '✨ 今天有记录就是进步，继续加油！'
  return '📝 还没有今天的记录，开始记录你的工作吧！'
}

// ── 主组件 ──

export function DailySummaryModal({ onClose }: Props): ReactNode {
  const [stats, setStats] = useState<DailyStats | null>(null)

  useEffect(() => {
    window.api.stats.get(7).then((data) => {
      setStats(data as DailyStats)
    }).catch(() => {})
  }, [])

  const handleClose = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem('daily_summary_last_shown', today)
    onClose()
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  if (!stats) return null

  const today = new Date().toISOString().slice(0, 10)
  const todayEntry = stats.daily.find(d => d.date === today)
  const todayLogs = todayEntry?.log_count ?? 0
  const todayTasks = todayEntry?.task_completed ?? 0
  const encouragement = getEncouragement(stats.streak, todayLogs, todayTasks)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: MOTION_EASE }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.3, ease: MOTION_EASE }}
          onClick={(e) => e.stopPropagation()}
          className="surface-card w-[480px] max-h-[90vh] overflow-y-auto rounded-3xl p-8 pb-7 shadow-fluent-xl relative"
        >
          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <X size={14} />
          </button>

          {/* 顶部标题 */}
          <FadeIn delay={0.05}>
            <div className="text-center mb-6">
              <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 tracking-[3px] uppercase">
                Daily Report
              </p>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1.5">
                你的今日工作摘要
              </h1>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{today}</p>
            </div>
          </FadeIn>

          {/* 统计卡片 */}
          <div className="flex flex-col gap-2.5">
            <StatBlock emoji="🔥" label="连续打卡" value={stats.streak} accentClass="bg-orange-100 dark:bg-orange-900/30" delay={0.15} />
            <div className="flex gap-2.5">
              <div className="flex-1">
                <StatBlock emoji="📝" label="今日日志" value={todayLogs} accentClass="bg-blue-100 dark:bg-blue-900/30" delay={0.25} />
              </div>
              <div className="flex-1">
                <StatBlock emoji="✅" label="完成任务" value={todayTasks} accentClass="bg-emerald-100 dark:bg-emerald-900/30" delay={0.35} />
              </div>
            </div>
            <StatBlock emoji="📋" label="待处理任务" value={stats.totalTasksActive} accentClass="bg-violet-100 dark:bg-violet-900/30" delay={0.45} />
          </div>

          {/* 周活动图 */}
          <div className="mt-2.5">
            <MiniBarChart data={stats.daily.slice(-7)} />
          </div>

          {/* 鼓励语 */}
          <FadeIn delay={0.6}>
            <div className="text-center mt-4 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
              <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed">{encouragement}</p>
            </div>
          </FadeIn>

          {/* 底部提示 */}
          <FadeIn delay={0.7}>
            <p className="text-center text-[11px] text-zinc-300 dark:text-zinc-600 mt-4">
              点击任意处或按 ESC 关闭
            </p>
          </FadeIn>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
