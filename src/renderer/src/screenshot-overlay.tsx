import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { motion, AnimatePresence } from 'motion/react'
import { Copy, Save, Pen, Eye } from 'lucide-react'

// 每屏一窗：ready 载荷为本屏信息 + 全部屏联合 bounds
interface ReadyInfo {
  displayId: number
  displayBounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  unionBounds: { x: number; y: number; width: number; height: number }
}

// 绝对全局 DIP 选区矩形
interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface CommitInfo {
  rect: Rect
  /** 工具栏应显示的显示器 id（commit 时的光标所在屏） */
  displayId: number
}

interface Point {
  gx: number
  gy: number
}

type ToolAction = 'copy' | 'save' | 'both'

// 统一缓动曲线（与全局动效一致：快出缓停）
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

// 工具栏按钮定义（左 → 右）
interface ToolDef {
  key: string
  label: string
  hint?: string
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
  run: () => void
}

function ScreenshotOverlay(): React.ReactNode {
  const [info, setInfo] = useState<ReadyInfo | null>(null)
  // 本窗视口尺寸（clamp 用，resize 时更新）
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })
  // 光标（绝对全局 DIP，来自主进程轮询广播）
  const [cursor, setCursor] = useState<Point | null>(null)
  // 选区（绝对全局 DIP，完全跟随主进程广播，本地不维护真值）
  const [sel, setSel] = useState<Rect | null>(null)
  // 有效选区提交（工具栏定位锚点 + 显示屏归属）
  const [commit, setCommit] = useState<CommitInfo | null>(null)
  const [captured, setCaptured] = useState(false)
  const [toast, setToast] = useState(false)
  const [toastMsg, setToastMsg] = useState('Capturing...')
  const [tbSize, setTbSize] = useState({ w: 0, h: 0 })

  const infoRef = useRef<ReadyInfo | null>(null)
  const commitRef = useRef<CommitInfo | null>(null)
  const capturedRef = useRef(false)
  const toastTimerRef = useRef<number | null>(null)
  const tbRef = useRef<HTMLDivElement | null>(null)

  // 本窗 display 原点（绝对全局 → 本窗本地坐标换算基准）
  const origin = info ? { x: info.displayBounds.x, y: info.displayBounds.y } : { x: 0, y: 0 }

  useEffect(() => {
    const api = window.screenshotOverlayApi
    // 新会话开始：重置全部状态（窗口跨会话复用）
    api.onReady((data: ReadyInfo) => {
      infoRef.current = data
      setInfo(data)
      setSel(null)
      setCommit(null)
      commitRef.current = null
      setCaptured(false)
      capturedRef.current = false
      setToast(false)
      setToastMsg('')
      setCursor(null)
    })
    // 主进程 16ms 轮询广播的光标（绝对全局 DIP）
    api.onCursor((p: Point) => {
      setCursor(p)
    })
    // 选区广播：渲染层只做「全局 → 本窗本地」与本窗 bounds 求交
    api.onSelection((r: Rect | null) => {
      setSel(r)
    })
    // 有效选区提交：仅 displayId 与本窗一致时显示工具栏
    api.onCommit((c: CommitInfo | null) => {
      commitRef.current = c
      setCommit(c)
    })
    // 截图瞬间：所有窗口立即隐藏选区/十字线/工具栏（AGENTS.md 截图规范）
    api.onCapturing(() => {
      capturedRef.current = true
      setCaptured(true)
    })
    // 会话结束：清状态（保留 info，Loading 不再出现）
    api.onReset(() => {
      setSel(null)
      setCommit(null)
      commitRef.current = null
      setCaptured(false)
      capturedRef.current = false
      setToast(false)
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    })
    // 双击全屏等主进程直接执行的截图结果：只在目标屏窗口显示 toast
    api.onResult((r: { ok: boolean; message: string; displayId: number }) => {
      if (infoRef.current && r.displayId !== infoRef.current.displayId) return
      setToastMsg(r.message)
      setToast(true)
    })
  }, [])

  // 视口 resize 跟踪（工具栏/标签 clamp 用）
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 清理定时器，避免窗口关闭后误触
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const clearTimers = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
  }

  // 触发裁剪：立即本地置 captured（广播也会置，幂等），主进程此刻才真正截图并裁剪
  // rect 为绝对全局 DIP，主进程 crop 入口归一化为 union 本地坐标
  const triggerCrop = async (
    rect: { x: number; y: number; width: number; height: number },
    action: ToolAction = 'both',
    full = false
  ) => {
    if (capturedRef.current) return
    capturedRef.current = true
    setCaptured(true)

    let ok = false
    let errorMsg = ''
    try {
      const res = await window.screenshotOverlayApi.crop(rect, action, full)
      ok = !!res?.ok
      if (!ok && res?.error) errorMsg = res.error
    } catch (err) {
      ok = false
      errorMsg = err instanceof Error ? err.message : '截图裁剪失败'
    }

    if (!ok) {
      // 显示错误提示后自动关闭，而非静默消失
      setToastMsg(`✗ ${errorMsg || '截图失败'}`)
      setToast(true)
      clearTimers()
      toastTimerRef.current = window.setTimeout(() => {
        window.screenshotOverlayApi.cancel()
      }, 2000)
      return
    }

    // 裁剪完成：显示操作结果 toast 后自动关闭
    const msg =
      action === 'copy'
        ? '✓ 已复制到剪贴板'
        : action === 'save'
          ? '✓ 已保存到文件'
          : '✓ 已复制并保存'
    setToastMsg(msg)
    setToast(true)
    clearTimers()
    toastTimerRef.current = window.setTimeout(() => {
      window.screenshotOverlayApi.cancel()
    }, 700)
  }

  // 仅目标屏窗口可用的工具栏显示判定
  const showToolbar = !!commit && !captured && !!info && commit.displayId === info.displayId

  // 工具栏真实动作：Copy / Save / Copy+Save（rect 为绝对全局 DIP）
  const runAction = (action: ToolAction) => {
    const c = commitRef.current
    if (!c || capturedRef.current) return
    triggerCrop({ x: c.rect.x, y: c.rect.y, width: c.rect.w, height: c.rect.h }, action)
  }

  // 占位功能（开发中）
  const runPlaceholder = (msg: string) => {
    if (capturedRef.current) return
    setToastMsg(msg)
    setToast(true)
    clearTimers()
    toastTimerRef.current = window.setTimeout(() => setToast(false), 1600)
  }

  // 本窗 client → 绝对全局 DIP
  const toGlobal = (e: React.MouseEvent) => ({
    gx: e.clientX + origin.x,
    gy: e.clientY + origin.y,
    shiftKey: e.shiftKey,
  })

  // 鼠标事件只上报主进程，不在本地维护选区真值（跨屏拖拽由主进程统一计算）
  const onMouseDown = (e: React.MouseEvent) => {
    if (capturedRef.current) return
    const g = toGlobal(e)
    window.screenshotOverlayApi.down(g.gx, g.gy, g.shiftKey)
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (capturedRef.current) return
    const g = toGlobal(e)
    window.screenshotOverlayApi.move(g.gx, g.gy, g.shiftKey)
  }

  const onMouseUp = (e: React.MouseEvent) => {
    if (capturedRef.current) return
    const g = toGlobal(e)
    window.screenshotOverlayApi.up(g.gx, g.gy)
  }

  // 双击任意位置：上报主进程，直接截取光标所在显示器的全屏
  const onDoubleClick = (e: React.MouseEvent) => {
    if (capturedRef.current) return
    const g = toGlobal(e)
    window.screenshotOverlayApi.dblClick(g.gx, g.gy)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearTimers()
        window.screenshotOverlayApi.cancel()
        return
      }
      // 工具栏快捷键仅在本窗持有 commit（目标屏窗口）且未 capture 时生效
      // 焦点窗随光标轮询切换，故用 ref 比对 displayId
      const c = commitRef.current
      const myInfo = infoRef.current
      if (!c || !myInfo || c.displayId !== myInfo.displayId || capturedRef.current) return
      // 若焦点已在某个按钮上，交给按钮自身的激活处理，避免重复触发
      if (e.key === 'Enter' && (document.activeElement as HTMLElement | null)?.tagName === 'BUTTON') return

      if (e.key === 'Enter') {
        e.preventDefault()
        runAction('both')
      } else if (e.key === '1' || e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        runAction('copy')
      } else if (e.key === '2' || e.key === 's' || e.key === 'S') {
        e.preventDefault()
        runAction('save')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 测量工具栏尺寸，用于精确计算位置（避免溢出屏幕）
  useLayoutEffect(() => {
    if (showToolbar && tbRef.current) {
      const r = tbRef.current.getBoundingClientRect()
      setTbSize({ w: r.width, h: r.height })
    }
  }, [showToolbar, commit])

  // Loading state: 透明背景，几乎无感（不再需要等待截图）
  if (!info) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed', inset: 0, margin: 0, padding: 0,
          background: 'transparent', cursor: 'crosshair',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <div style={{ color: 'white', fontSize: 18, fontFamily: 'system-ui, sans-serif', opacity: 0.8 }}>
          Loading...
        </div>
      </motion.div>
    )
  }

  // 光标绝对坐标 → 本窗本地坐标；仅光标在本窗视口内才绘制十字线/标签
  const cursorLocal =
    cursor &&
    cursor.gx - origin.x >= 0 &&
    cursor.gx - origin.x <= viewport.w &&
    cursor.gy - origin.y >= 0 &&
    cursor.gy - origin.y <= viewport.h
      ? { x: cursor.gx - origin.x, y: cursor.gy - origin.y }
      : null

  // 拖拽中状态派生：有选区、未提交、未 capture（真值全部来自主进程广播）
  const dragging = !!sel && !commit && !captured

  // 选区矩形：全局 rect 与本窗 displayBounds 求交，转本地坐标；不相交则不渲染
  let selLocal: Rect | null = null
  if (sel && sel.w > 0 && sel.h > 0) {
    const db = info.displayBounds
    const ix = Math.max(sel.x, db.x)
    const iy = Math.max(sel.y, db.y)
    const ix2 = Math.min(sel.x + sel.w, db.x + db.width)
    const iy2 = Math.min(sel.y + sel.h, db.y + db.height)
    if (ix2 > ix && iy2 > iy) {
      selLocal = { x: ix - db.x, y: iy - db.y, w: ix2 - ix, h: iy2 - iy }
    }
  }

  // 尺寸标签位置（跟随光标，clamp 到本窗视口，不再用 union 宽高）
  const labelX = cursorLocal ? Math.min(cursorLocal.x + 14, viewport.w - 110) : 0
  const labelY = cursorLocal ? Math.min(cursorLocal.y + 14, viewport.h - 34) : 0

  // 工具栏定位：锚点 = commit.rect（全局 → 本窗本地），clamp 到本窗视口；
  // 默认在选区下方，靠近底部时翻转到上方；水平居中并夹紧在屏幕内
  const tbW = tbSize.w || 268
  const tbH = tbSize.h || 68
  const gap = 12
  let tbLeft = 0
  let tbTop = 0
  let placeAbove = false
  if (showToolbar && commit) {
    const lx = commit.rect.x - origin.x
    const ly = commit.rect.y - origin.y
    const anchorX = lx + commit.rect.w / 2
    tbTop = ly + commit.rect.h + gap
    if (tbTop + tbH > viewport.h - 8) {
      tbTop = ly - tbH - gap
      placeAbove = true
      if (tbTop < 8) tbTop = Math.max(8, viewport.h - tbH - 8)
    }
    tbLeft = anchorX - tbW / 2
    tbLeft = Math.max(8, Math.min(tbLeft, viewport.w - tbW - 8))
  }

  const TOOLS: ToolDef[] = [
    { key: 'copy', label: '复制', hint: '1', Icon: Copy, run: () => runAction('copy') },
    { key: 'save', label: '保存', hint: '2', Icon: Save, run: () => runAction('save') },
    { key: 'mark', label: '标记截图', Icon: Pen, run: () => runPlaceholder('标记功能开发中') },
    { key: 'search', label: '视觉搜索', Icon: Eye, run: () => runPlaceholder('视觉搜索开发中') },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      {/* 透明捕获层：用户透过它看到真实屏幕，同时接收所有鼠标事件 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: EASE }}
        style={{
          position: 'fixed', inset: 0,
          margin: 0, padding: 0,
          background: 'transparent',
          cursor: captured ? 'default' : dragging ? 'grabbing' : showToolbar ? 'default' : 'crosshair',
          userSelect: 'none',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
      >
        {/* Crosshair guide lines following cursor（光标在本窗内才画，线贴满本窗） */}
        {cursorLocal && !captured && !showToolbar && (
          <>
            <div style={{
              position: 'fixed', left: cursorLocal.x, top: 0, width: 1, height: '100vh',
              background: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'fixed', top: cursorLocal.y, left: 0, height: 1, width: '100vw',
              background: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
            }} />
          </>
        )}

        {/* Selection rect：仅渲染全局选区与本窗相交的部分 */}
        <AnimatePresence>
          {selLocal && !captured && (
            <motion.div
              key="selection"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.6 }}
              style={{
                position: 'absolute',
                left: selLocal.x, top: selLocal.y, width: selLocal.w, height: selLocal.h,
                background: 'transparent',
                border: '2px solid #00e5ff',
                boxSizing: 'border-box',
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>

        {/* Dimension label near cursor while dragging */}
        <AnimatePresence>
          {dragging && cursorLocal && sel && sel.w > 1 && sel.h > 1 && (
            <motion.div
              key="dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'absolute', left: labelX, top: labelY,
                padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(20,20,22,0.78)', color: '#fff',
                fontSize: 12, fontFamily: 'system-ui, sans-serif',
                letterSpacing: 0.4, pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              {Math.round(sel.w)} × {Math.round(sel.h)}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keyboard / interaction hints */}
        {!captured && (
          <div
            style={{
              position: 'absolute', bottom: 28, left: 0, right: 0,
              textAlign: 'center',
              color: 'rgba(255,255,255,0.85)',
              fontSize: 13, fontFamily: 'system-ui, sans-serif',
              letterSpacing: 0.3, pointerEvents: 'none',
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}
          >
            {showToolbar
              ? 'Enter 复制并保存 · 1/C 复制 · 2/S 保存 · ESC 取消'
              : '拖拽选择截图区域 · ESC 取消 · 按住 Shift 等比缩放 · 双击全屏'}
          </div>
        )}
      </motion.div>

      {/* Layer 3: Floating action toolbar — 仅 commit 指定的 displayId 窗口显示 */}
      <AnimatePresence>
        {showToolbar && (
          <motion.div
            ref={tbRef}
            key="toolbar"
            initial={{ opacity: 0, x: tbLeft, y: tbTop + (placeAbove ? 12 : -12), scale: 0.94 }}
            animate={{ opacity: 1, x: tbLeft, y: tbTop, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 480, damping: 30, mass: 0.7 }}
            style={{
              position: 'fixed', left: 0, top: 0,
              zIndex: 20, pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 10px', borderRadius: 'var(--radius-lg)',
              background: 'rgba(30,30,32,0.92)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            {TOOLS.map((t, i) => (
              <React.Fragment key={t.key}>
                <ToolButton def={t} />
                {i < TOOLS.length - 1 && (
                  <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.10)' }} />
                )}
              </React.Fragment>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast: 反馈提示（底部居中，上滑淡入） */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 16, x: '-50%' }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{
              position: 'fixed', bottom: 56, left: '50%',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 'var(--radius-pill)',
              background: 'rgba(20,20,22,0.82)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: '#fff', fontSize: 14, fontFamily: 'system-ui, sans-serif',
              boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.12)',
              pointerEvents: 'none', zIndex: 10,
            }}
          >
            <span style={{ color: toastMsg.startsWith('✗') ? '#f87171' : '#4ade80', fontSize: 15, lineHeight: 1 }}>
              {toastMsg.startsWith('✗') ? '✗' : '✓'}
            </span>
            <span>{toastMsg.replace(/^[✓✗]\s*/, '')}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// 工具栏单个按钮：图标 + 中文标签 + 可选快捷键提示
function ToolButton({ def }: { def: ToolDef }): React.ReactNode {
  const [hover, setHover] = useState(false)
  const [active, setActive] = useState(false)
  const { Icon, label, hint, run } = def

  return (
    <button
      onClick={(e) => {
        ;(e.currentTarget as HTMLElement).blur()
        run()
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false) }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, width: 60, padding: '8px 4px', borderRadius: 'var(--radius-md)',
        background: active ? 'rgba(255,255,255,0.16)' : hover ? 'rgba(255,255,255,0.10)' : 'transparent',
        border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.92)',
        transform: active ? 'scale(0.96)' : 'scale(1)',
        transition: 'background 0.15s ease, transform 0.1s ease',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <Icon size={20} strokeWidth={1.8} color="rgba(255,255,255,0.92)" />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', lineHeight: 1, letterSpacing: 0.3 }}>{label}</span>
      {/* hint removed — no number labels on buttons */}
    </button>
  )
}

// Guard against HMR re-execution creating a duplicate root
const overlayContainer = document.getElementById('overlay-root')!
if (!(overlayContainer as any).__reactRoot) {
  const root = ReactDOM.createRoot(overlayContainer);
  (overlayContainer as any).__reactRoot = root;
  root.render(<ScreenshotOverlay />);
}
