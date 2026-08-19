import { useState, useEffect, useMemo } from 'react';
import { X, Minus, Expand, Shrink } from 'lucide-react';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [accentColor, setAccentColor] = useState<string>('rgba(24, 24, 27, 0.85)');

  const [hoverClose, setHoverClose] = useState(false);
  const [hoverMinimize, setHoverMinimize] = useState(false);
  const [hoverMaximize, setHoverMaximize] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('accentColor');
    if (saved) {
      setAccentColor(saved);
    }
    if (!window.sys?.onAccentColorUpdate) return;
    const unsubscribe = window.sys.onAccentColorUpdate((color: string) => {
      setAccentColor(color);
      sessionStorage.setItem('accentColor', color);
    });
    return () => unsubscribe?.();
  }, []);

  const toRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const accentColorBg = accentColor.startsWith('#') ? toRgba(accentColor, 0.7) : accentColor;

  function isLightColor(hex: string): boolean {
    const raw = hex.startsWith('#') ? hex.slice(1) : hex;
    if (raw.length < 6) return true;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
  }

  const textColor = useMemo(() => {
    if (accentColor.startsWith('#')) {
      return isLightColor(accentColor) ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
    }
    return 'rgba(255,255,255,0.9)';
  }, [accentColor]);

  const handleMinimize = () => (window.api as any).window.minimize();
  const handleMaximize = () => {
    (window.api as any).window.maximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => (window.api as any).window.close();

  const appTitle = import.meta.env.VITE_APP_TITLE || 'WorkPulseD';

  // 液态玻璃背景样式 (Fluent Design: acrylic + noise grain)
  const glassStyle = {
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    backgroundColor: accentColorBg,
    backdropFilter: 'blur(30px) saturate(1.5)',
    WebkitBackdropFilter: 'blur(30px) saturate(1.5)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 60%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.08)',
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    userSelect: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
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
    zIndex: 100,
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
            style={getButtonStyle('#ff5f57', '#ff7a7a', hoverClose)}
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
            style={getButtonStyle('#ffbd2e', '#ffd24d', hoverMinimize)}
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
            style={getButtonStyle('#28c840', '#4cd964', hoverMaximize)}
            aria-label="Maximize"
          >
            {hoverMaximize &&
              (isMaximized ? (
                <Shrink size={8} color="rgba(40,40,40,0.8)" strokeWidth={2.5} />
              ) : (
                <Expand size={8} color="rgba(40,40,40,0.8)" strokeWidth={2.5} />
              )}
          </button>
          <span style={tooltipStyle(hoverMaximize)}>{isMaximized ? '还原' : '最大化'}</span>
        </div>
      </div>

      <span
        style={{
          flex: 1,
          textAlign: 'center',
          fontSize: '13px',
          color: textColor,
          fontWeight: 500,
          letterSpacing: '0.3px',
          textShadow: '0 1px 2px rgba(0,0,0,0.1)',
        }}
      >
        {appTitle}
      </span>

      <div style={{ width: '56px' }} />
    </div>
  );
}