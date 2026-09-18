/**
 * 每日工作摘要弹窗 — 独立 React 入口
 * 风格参考 QQ 音乐年度报告：深色渐变背景、大号动画数字、玻璃拟态卡片
 */
import React, { useEffect, useState, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom/client'

// ── 类型声明 ──

interface SummaryData {
  todayLogs: number
  todayTasks: number
  streak: number
  totalLogs: number
  totalTasksDone: number
  activeTasks: number
  weekData: Array<{ date: string; log_count: number; task_completed: number }>
  date: string
}

interface DailySummaryApi {
  dismiss: () => void
  onData: (cb: (data: SummaryData) => void) => () => void
}

declare global {
  interface Window {
    dailySummaryApi: DailySummaryApi
  }
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

/** 核心数字卡片 */
function StatBlock({ emoji, label, value, color, delay }: {
  emoji: string
  label: string
  value: number
  color: string
  delay: number
}): React.ReactNode {
  const display = useCountUp(value, 1400)

  return (
    <div style={{
      opacity: 0,
      transform: 'translateY(20px)',
      animation: `fadeSlideUp 0.6s ease-out ${delay}s forwards`,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '18px 20px',
      borderRadius: 16,
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        background: `${color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        flexShrink: 0,
      }}>
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>
          {label}
        </p>
        <p style={{
          margin: 0,
          fontSize: 36,
          fontWeight: 800,
          color: '#fff',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {display}
        </p>
      </div>
    </div>
  )
}

/** 迷你周活动条形图 */
function MiniBarChart({ data }: { data: SummaryData['weekData'] }): React.ReactNode {
  if (!data || data.length === 0) return null

  const maxVal = Math.max(...data.map(d => d.log_count + d.task_completed), 1)

  return (
    <div style={{
      opacity: 0,
      animation: 'fadeSlideUp 0.6s ease-out 0.8s forwards',
      padding: '18px 20px',
      borderRadius: 16,
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
    }}>
      <p style={{
        margin: '0 0 12px 0',
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 0.5,
      }}>
        本周活动
      </p>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        height: 60,
      }}>
        {data.map((day, i) => {
          const total = day.log_count + day.task_completed
          const height = total > 0 ? Math.max((total / maxVal) * 52, 4) : 2
          const isToday = day.date === new Date().toISOString().slice(0, 10)
          return (
            <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: '100%',
                maxWidth: 32,
                height,
                borderRadius: 4,
                background: isToday
                  ? 'linear-gradient(180deg, #a78bfa, #60a5fa)'
                  : total > 0
                    ? 'linear-gradient(180deg, rgba(167,139,250,0.6), rgba(96,165,250,0.4))'
                    : 'rgba(255,255,255,0.08)',
                transition: 'height 0.6s ease-out',
                animation: `growUp 0.5s ease-out ${0.9 + i * 0.05}s both`,
              }} />
              <span style={{
                fontSize: 10,
                color: isToday ? '#a78bfa' : 'rgba(255,255,255,0.3)',
                fontWeight: isToday ? 600 : 400,
              }}>
                {new Date(day.date + 'T00:00:00').getDay() === 0 ? '日' :
                 new Date(day.date + 'T00:00:00').getDay() === 1 ? '一' :
                 new Date(day.date + 'T00:00:00').getDay() === 2 ? '二' :
                 new Date(day.date + 'T00:00:00').getDay() === 3 ? '三' :
                 new Date(day.date + 'T00:00:00').getDay() === 4 ? '四' :
                 new Date(day.date + 'T00:00:00').getDay() === 5 ? '五' : '六'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
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

// ── 默认空数据 ──

const EMPTY_DATA: SummaryData = {
  todayLogs: 0,
  todayTasks: 0,
  streak: 0,
  totalLogs: 0,
  totalTasksDone: 0,
  activeTasks: 0,
  weekData: [],
  date: '',
}

// ── 主组件 ──

function DailySummary(): React.ReactNode {
  const [data, setData] = useState<SummaryData>(EMPTY_DATA)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 立即显示 UI（即使数据还没到）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true))
    })

    const unsub = window.dailySummaryApi.onData((d) => {
      setData(d)
    })
    return unsub
  }, [])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(() => window.dailySummaryApi.dismiss(), 350)
  }, [])

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  const encouragement = getEncouragement(data.streak, data.todayLogs, data.todayTasks)

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes growUp {
          from { transform: scaleY(0); transform-origin: bottom; }
          to { transform: scaleY(1); transform-origin: bottom; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      {/* 全屏背景 */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f0c29 0%, #1a1145 30%, #302b63 60%, #1a2980 100%)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.35s ease',
          cursor: 'pointer',
        }}
      >
        {/* 背景装饰光效 */}
        <div style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(167,139,250,0.15) 0%, transparent 70%)',
          animation: 'pulse 4s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-15%',
          left: '-5%',
          width: 350,
          height: 350,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(96,165,250,0.12) 0%, transparent 70%)',
          animation: 'pulse 5s ease-in-out infinite 1s',
          pointerEvents: 'none',
        }} />

        {/* 主卡片 */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            width: 380,
            maxHeight: '90vh',
            overflow: 'hidden',
            borderRadius: 24,
            background: 'rgba(20, 16, 50, 0.85)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
            cursor: 'default',
            padding: '32px 24px 28px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(20px)',
            transition: 'opacity 0.4s ease, transform 0.4s ease',
          }}
        >
          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 28,
              height: 28,
              borderRadius: 14,
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              zIndex: 10,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
            }}
          >
            ✕
          </button>

          {/* 顶部品牌 */}
          <div style={{
            opacity: 0,
            animation: 'fadeSlideDown 0.5s ease-out 0.1s forwards',
            textAlign: 'center',
            marginBottom: 24,
          }}>
            <p style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(167,139,250,0.7)',
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}>
              Daily Report
            </p>
            <h1 style={{
              margin: '6px 0 0',
              fontSize: 22,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #e0e7ff, #c4b5fd, #93c5fd)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: 1,
            }}>
              你的今日工作摘要
            </h1>
            <p style={{
              margin: '6px 0 0',
              fontSize: 12,
              color: 'rgba(255,255,255,0.35)',
            }}>
              {data.date}
            </p>
          </div>

          {/* 统计卡片 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <StatBlock
              emoji="🔥"
              label="连续打卡"
              value={data.streak}
              color="#f97316"
              delay={0.2}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <StatBlock
                  emoji="📝"
                  label="今日日志"
                  value={data.todayLogs}
                  color="#60a5fa"
                  delay={0.35}
                />
              </div>
              <div style={{ flex: 1 }}>
                <StatBlock
                  emoji="✅"
                  label="完成任务"
                  value={data.todayTasks}
                  color="#34d399"
                  delay={0.45}
                />
              </div>
            </div>
            <StatBlock
              emoji="📋"
              label="待处理任务"
              value={data.activeTasks}
              color="#a78bfa"
              delay={0.55}
            />
          </div>

          {/* 周活动图 */}
          <div style={{ marginTop: 10 }}>
            <MiniBarChart data={data.weekData} />
          </div>

          {/* 鼓励语 */}
          <div style={{
            opacity: 0,
            animation: 'fadeSlideUp 0.6s ease-out 1s forwards',
            textAlign: 'center',
            marginTop: 18,
            padding: '12px 16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(96,165,250,0.08))',
            border: '1px solid rgba(167,139,250,0.1)',
          }}>
            <p style={{
              margin: 0,
              fontSize: 13,
              color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.5,
            }}>
              {encouragement}
            </p>
          </div>

          {/* 底部关闭提示 */}
          <div style={{
            opacity: 0,
            animation: 'fadeSlideUp 0.5s ease-out 1.2s forwards',
            textAlign: 'center',
            marginTop: 16,
          }}>
            <p style={{
              margin: 0,
              fontSize: 11,
              color: 'rgba(255,255,255,0.25)',
              letterSpacing: 0.5,
            }}>
              点击任意处或按 ESC 关闭
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

// ── 挂载 ──

const container = document.getElementById('summary-root')!
if (!(container as any).__reactRoot) {
  const root = ReactDOM.createRoot(container);
  (container as any).__reactRoot = root
  root.render(<DailySummary />)
}
