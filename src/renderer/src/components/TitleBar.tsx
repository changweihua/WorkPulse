import { useState } from 'react';
import { X, Minus, Expand, Shrink } from 'lucide-react';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  const [hoverClose, setHoverClose] = useState(false);
  const [hoverMinimize, setHoverMinimize] = useState(false);
  const [hoverMaximize, setHoverMaximize] = useState(false);

  const handleMinimize = () => (window.api as any).window.minimize();
  const handleMaximize = () => {
    (window.api as any).window.maximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => (window.api as any).window.close();

  const appTitle = import.meta.env.VITE_APP_TITLE || 'WorkPulseD';

  // Mica 透明标题栏 — Mica 由 DWM 渲染，TitleBar 只需透明拖拽区域
  const glassStyle = {
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    backgroundColor: 'transparent',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 60%)',
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    userSelect: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    position: 'relative' as const,
    zIndex: 50,
  } as React.CSSProperties;

  // 红绿灯按钮样式工厂（尺寸调整为 14px）
  const getButtonStyle = (baseColor: string, hoverColor: string, isHover: boolean) => ({
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: isHover ? hoverColor : baseColor,
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    boxShadow: isHover
      ? 'inset 0 0 8px rgba(255,255,255,0.5), 0 0 4px rgba(0,0,0,0.1)'
      : 'inset 0 1px 2px rgba(0,0,0,0.1)',
    position: 'relative' as const,
  } as React.CSSProperties);

  // Tooltip 样式
  const tooltipStyle = (visible: boolean) => ({
    position: 'absolute' as const,
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: '6px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500 as const,
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
    opacity: visible ? 1 : 0,
    transition: 'opacity 0.15s ease',
    backgroundColor: 'rgba(0,0,0,0.75)',
    color: '#fff',
    zIndex: 9999,
    lineHeight: '18px',
  } as React.CSSProperties);

  // 按钮外层容器（提供 tooltip 定位上下文）
  const btnWrapStyle = {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    WebkitAppRegion: 'no-drag' as const,
  } as React.CSSProperties;

  return (
    <div style={glassStyle}>
      <div
        style={{
          display: 'flex',
          gap: '4px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        {/* 关闭 */}
        <div style={btnWrapStyle}>
          <button
            onClick={handleClose}
            onMouseEnter={() => setHoverClose(true)}
            onMouseLeave={() => setHoverClose(false)}
            style={getButtonStyle('#f87171', '#fca5a5', hoverClose)}
            aria-label="Close"
          >
            {hoverClose && <X size={8} color="rgba(40,40,40,0.8)" strokeWidth={2.5} />}
          </button>
          <span style={tooltipStyle(hoverClose)}>关闭</span>
        </div>

        {/* 最小化 */}
        <div style={btnWrapStyle}>
          <button
            onClick={handleMinimize}
            onMouseEnter={() => setHoverMinimize(true)}
            onMouseLeave={() => setHoverMinimize(false)}
            style={getButtonStyle('#fbbf24', '#fcd34d', hoverMinimize)}
            aria-label="Minimize"
          >
            {hoverMinimize && <Minus size={8} color="rgba(40,40,40,0.8)" strokeWidth={2.5} />}
          </button>
          <span style={tooltipStyle(hoverMinimize)}>最小化</span>
        </div>

        {/* 最大化 / 还原（动态） */}
        <div style={btnWrapStyle}>
          <button
            onClick={handleMaximize}
            onMouseEnter={() => setHoverMaximize(true)}
            onMouseLeave={() => setHoverMaximize(false)}
            style={getButtonStyle('#4ade80', '#86efac', hoverMaximize)}
            aria-label="Maximize"
          >
            {hoverMaximize &&
              (isMaximized ? (
                <Shrink size={8} color="rgba(40,40,40,0.8)" strokeWidth={2.5} />
              ) : (
                <Expand size={8} color="rgba(40,40,40,0.8)" strokeWidth={2.5} />
              ))}
          </button>
          <span style={tooltipStyle(hoverMaximize)}>{isMaximized ? '还原' : '最大化'}</span>
        </div>
      </div>

      <span
        className="text-zinc-800 dark:text-white/90"
        style={{
          flex: 1,
          textAlign: 'center',
          fontSize: '13px',
          fontWeight: 500,
          letterSpacing: '0.3px',
        }}
      >
        {appTitle}
      </span>

      <div style={{ width: '56px' }} />
    </div>
  );
}