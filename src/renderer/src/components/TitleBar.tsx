import { useState, useEffect, useMemo } from 'react'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  const [accentColor, setAccentColor] = useState<string>('rgba(24, 24, 27, 0.85)');

  useEffect(() => {
    // 1. 尝试从 sessionStorage 恢复颜色
    const saved = sessionStorage.getItem('accentColor');
    if (saved) {
      setAccentColor(saved);
    }

    // 2. 监听主进程的实时推送
    if (!window.sys?.onAccentColorUpdate) return;

    const unsubscribe = window.sys.onAccentColorUpdate((color: string) => {
      setAccentColor(color);
      // 每次收到新颜色，写入 sessionStorage
      sessionStorage.setItem('accentColor', color);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  // 转换函数
  const toRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // 渲染时
  const accentColorBg = accentColor.startsWith('#') ? toRgba(accentColor, 0.7) : accentColor;

  // 判断 hex 颜色是否为亮色
  // 判断亮色
  function isLightColor(hex: string): boolean {
    const raw = hex.startsWith('#') ? hex.slice(1) : hex;
    if (raw.length < 6) return true;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
  }

  // 计算文字颜色
  // 文字颜色
  const textColor = useMemo(() => {
    if (accentColor.startsWith('#')) {
      return isLightColor(accentColor) ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
    }
    return 'rgba(255,255,255,0.9)'; // fallback
  }, [accentColor]);

  const handleMinimize = () => {
    ; (window.api as any).window.minimize()
  }

  const handleMaximize = () => {
    ; (window.api as any).window.maximize()
    setIsMaximized(!isMaximized)
  }

  const handleClose = () => {
    ; (window.api as any).window.close()
  }
  console.log('所有环境变量:', import.meta.env)
  // 从环境变量读取应用标题，如果未定义则使用 'WorkPulse' 作为后备
  const appTitle = import.meta.env.VITE_APP_TITLE || 'WorkPulseD'

  return (
    <div
      style={
        {
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          backgroundColor: accentColorBg,
          backdropFilter: 'blur(10px)',
          WebkitAppRegion: 'drag',
          flexShrink: 0,
          userSelect: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        } as React.CSSProperties
      }
    >
      <div
        style={{
          display: 'flex',
          gap: '8px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <button
          onClick={handleClose}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#ff5f57',
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label="Close"
        />
        <button
          onClick={handleMinimize}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#ffbd2e',
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label="Minimize"
        />
        <button
          onClick={handleMaximize}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#28c840',
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label="Maximize"
        />
      </div>

      <span
        style={{
          flex: 1,
          textAlign: 'center',
          fontSize: '13px', color: textColor,
          fontWeight: 500,
          letterSpacing: '0.3px',
        }}
      >
        {appTitle}
      </span>

      <div style={{ width: '56px' }} />
    </div>
  )
}