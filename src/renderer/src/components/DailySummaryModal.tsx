/**
 * 每日工作摘要弹窗 — 应用内 Modal
 * 风格参考 QQ 音乐年度报告：深色渐变背景、大号动画数字、玻璃拟态卡片
 */
import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'

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

/** 数字滚动动画 */
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

function StatBlock({ emoji, label, value, color, delay }: {
  emoji: string
  label: string
  value: number
  color: string
  delay: number
}): ReactNode {
  const display = useCountUp(value, 1400)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-4 p-[18px_20px] rounded-2xl"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div
        className="shrink-0 w-12 h-12 flex items-center justify-center rounded-[14px] text-2xl"
        style={{ background: `${color}20` }}
      >
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs tracking-wide" style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>
          {label}
        </p>
        <p className="text-[36px] font-extrabold leading-none tabular-nums" style={{ color: '#fff', margin: 0 }}>
          {display}
        </p>
      </div>
    </motion.div>
  )
}

/** 迷你周活动条形图 */
function MiniBarChart({ data }: { data: DailyStats['daily'] }): ReactNode {
  if (!data || data.length === 0) return null
  const maxVal = Math.max(...data.map(d => d.log_count + d.task_completed), 1)
  const weekDayNames = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="p-[18px_20px] rounded-2xl"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <p className="text-xs tracking-wide mb-3" style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 12px' }}>
        本周活动
      </p>
      <div className="flex items-end gap-1.5" style={{ height: 60 }}>
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
                transition={{ delay: 0.8 + i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  width: '100%',
                  maxWidth: 32,
                  height,
                  borderRadius: 4,
                  transformOrigin: 'bottom',
                  background: isToday
                    ? 'linear-gradient(180deg, #a78bfa, #60a5fa)'
                    : total > 0
                      ? 'linear-gradient(180deg, rgba(167,139,250,0.6), rgba(96,165,250,0.4))'
                      : 'rgba(255,255,255,0.08)',
                }}
              />
              <span
                className="text-[10px]"
                style={{
                  color: isToday ? '#a78bfa' : 'rgba(255,255,255,0.3)',
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {weekDayNames[dayOfWeek]}
              </span>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

// ── 鼓励语 ──

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
    // 记录今日已展示
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem('daily_summary_last_shown', today)
    onClose()
  }, [onClose])

  // ESC 关闭
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
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1145 30%, #302b63 60%, #1a2980 100%)', cursor: 'pointer' }}
        onClick={handleClose}
      >
        {/* 背景装饰光效 */}
        <div className="absolute pointer-events-none" style={{ top: '-20%', right: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.15) 0%, transparent 70%)', animation: 'pulse 4s ease-in-out infinite' }} />
        <div className="absolute pointer-events-none" style={{ bottom: '-15%', left: '-5%', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(96,165,250,0.12) 0%, transparent 70%)', animation: 'pulse 5s ease-in-out infinite 1s' }} />

        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        `}</style>

        {/* 主卡片 */}
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-[380px] max-h-[90vh] overflow-hidden rounded-3xl p-8 pb-7"
          style={{
            background: 'rgba(20, 16, 50, 0.85)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
          }}
        >
          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full flex items-center justify-center text-sm z-10 transition-all hover:bg-white/15 hover:text-white/90"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', border: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>

          {/* 顶部品牌 */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-6"
          >
            <p className="text-[11px] font-semibold tracking-[3px] uppercase" style={{ color: 'rgba(167,139,250,0.7)', margin: 0 }}>
              Daily Report
            </p>
            <h1
              className="text-[22px] font-extrabold tracking-wide mt-1.5"
              style={{
                background: 'linear-gradient(135deg, #e0e7ff, #c4b5fd, #93c5fd)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                margin: '6px 0 0',
              }}
            >
              你的今日工作摘要
            </h1>
            <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.35)', margin: '6px 0 0' }}>
              {today}
            </p>
          </motion.div>

          {/* 统计卡片 */}
          <div className="flex flex-col gap-2.5">
            <StatBlock emoji="🔥" label="连续打卡" value={stats.streak} color="#f97316" delay={0.2} />
            <div className="flex gap-2.5">
              <div className="flex-1">
                <StatBlock emoji="📝" label="今日日志" value={todayLogs} color="#60a5fa" delay={0.35} />
              </div>
              <div className="flex-1">
                <StatBlock emoji="✅" label="完成任务" value={todayTasks} color="#34d399" delay={0.45} />
              </div>
            </div>
            <StatBlock emoji="📋" label="待处理任务" value={stats.totalTasksActive} color="#a78bfa" delay={0.55} />
          </div>

          {/* 周活动图 */}
          <div className="mt-2.5">
            <MiniBarChart data={stats.daily.slice(-7)} />
          </div>

          {/* 鼓励语 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mt-4 px-4 py-3 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(96,165,250,0.08))',
              border: '1px solid rgba(167,139,250,0.1)',
            }}
          >
            <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)', margin: 0 }}>
              {encouragement}
            </p>
          </motion.div>

          {/* 底部关闭提示 */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.4 }}
            className="text-center text-[11px] mt-4 tracking-wide"
            style={{ color: 'rgba(255,255,255,0.25)', margin: '16px 0 0' }}
          >
            点击任意处或按 ESC 关闭
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
