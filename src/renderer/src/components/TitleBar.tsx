import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { useI18n } from '../stores/languageStore';

export function TitleBar() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [isMaximized, setIsMaximized] = useState(false);

  const [hoverClose, setHoverClose] = useState(false);
  const [hoverMinimize, setHoverMinimize] = useState(false);
  const [hoverMaximize, setHoverMaximize] = useState(false);
  const [hoverSettings, setHoverSettings] = useState(false);
  const [hoverScreenshot, setHoverScreenshot] = useState(false);
  const [hoverAI, setHoverAI] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleMinimize = () => window.api.window.minimize();
  const handleMaximize = () => {
    window.api.window.maximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => window.api.window.close();
  const handleSettings = () => navigate('/settings');
  const handleScreenshot = () => window.api.send('screenshot:ready');
  const handleAI = () => navigate('/chat');

  const appTitle = import.meta.env.VITE_APP_TITLE || 'WorkPulse';

  // Mica 透明标题栏 — Mica 由 DWM 渲染，TitleBar 只需透明拖拽区域
  const glassStyle = {
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 14px',
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    userSelect: 'none',
    position: 'relative' as const,
    zIndex: 50,
  } as React.CSSProperties;

  // 红绿灯按钮样式工厂（14px 更舒适）
  const getTrafficLightStyle = (baseColor: string, hoverColor: string, isHover: boolean) => ({
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
      ? 'inset 0 0 6px rgba(255,255,255,0.5), 0 0 3px rgba(0,0,0,0.1)'
      : 'inset 0 1px 2px rgba(0,0,0,0.1)',
    position: 'relative' as const,
  } as React.CSSProperties);

  // 工具栏按钮样式（通用）
  const toolbarBtnStyle = (isHover: boolean) => ({
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: isHover ? 'rgba(128,128,128,0.15)' : 'transparent',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    color: isHover ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.45)',
    WebkitAppRegion: 'no-drag' as const,
  } as React.CSSProperties);

  // Tooltip 样式
  const tooltipStyle = (visible: boolean) => ({
    position: 'absolute' as const,
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: '4px',
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
  } as React.CSSProperties;

  // 搜索框外层固定宽度容器（防止动态宽度影响标题居中）
  const searchContainerStyle = {
    WebkitAppRegion: 'no-drag' as const,
    flexShrink: 0,
    width: '200px',
    display: 'flex',
    justifyContent: 'flex-end',
  } as React.CSSProperties;

  // 搜索框样式
  const searchBoxStyle = (isFocused: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    height: '30px',
    padding: '0 10px',
    borderRadius: '8px',
    border: '1px solid',
    borderColor: isFocused ? 'rgba(0,122,255,0.5)' : 'rgba(0,0,0,0.1)',
    backgroundColor: isFocused ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.02)',
    transition: 'all 0.15s ease',
    width: isFocused ? '200px' : '160px',
  } as React.CSSProperties);

  return (
    <div style={glassStyle}>
      {/* 左侧：红绿灯按钮 */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          WebkitAppRegion: 'no-drag',
          marginRight: '16px',
        } as React.CSSProperties}
      >
        {/* 关闭 */}
        <div style={btnWrapStyle}>
          <button
            onClick={handleClose}
            onMouseEnter={() => setHoverClose(true)}
            onMouseLeave={() => setHoverClose(false)}
            style={getTrafficLightStyle('#f87171', '#fca5a5', hoverClose)}
            aria-label="Close"
          >
            {hoverClose && (
              <Icon icon="line-md:close" width={8} height={8} style={{ color: 'rgba(40,40,40,0.8)' }} />
            )}
          </button>
          <span style={tooltipStyle(hoverClose)}>{t('titlebar.close')}</span>
        </div>

        {/* 最小化 */}
        <div style={btnWrapStyle}>
          <button
            onClick={handleMinimize}
            onMouseEnter={() => setHoverMinimize(true)}
            onMouseLeave={() => setHoverMinimize(false)}
            style={getTrafficLightStyle('#fbbf24', '#fcd34d', hoverMinimize)}
            aria-label="Minimize"
          >
            {hoverMinimize && (
              <Icon icon="line-md:arrow-close-down" width={6} height={6} style={{ color: 'rgba(40,40,40,0.8)' }} />
            )}
          </button>
          <span style={tooltipStyle(hoverMinimize)}>{t('titlebar.minimize')}</span>
        </div>

        {/* 最大化 / 还原（动态） */}
        <div style={btnWrapStyle}>
          <button
            onClick={handleMaximize}
            onMouseEnter={() => setHoverMaximize(true)}
            onMouseLeave={() => setHoverMaximize(false)}
            style={getTrafficLightStyle('#4ade80', '#86efac', hoverMaximize)}
            aria-label="Maximize"
          >
            {hoverMaximize && (
              <Icon
                icon={isMaximized ? 'line-md:arrow-close-left' : 'line-md:arrow-close-right'}
                width={6}
                height={6}
                style={{ color: 'rgba(40,40,40,0.8)' }}
              />
            )}
          </button>
          <span style={tooltipStyle(hoverMaximize)}>{isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}</span>
        </div>
      </div>

      {/* 中间偏左：操作按钮组 */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
        } as React.CSSProperties}
      >
        {/* 设置按钮 - 齿轮旋转动画 */}
        <div style={btnWrapStyle}>
          <button
            onClick={handleSettings}
            onMouseEnter={() => setHoverSettings(true)}
            onMouseLeave={() => setHoverSettings(false)}
            style={toolbarBtnStyle(hoverSettings)}
            aria-label="Settings"
          >
            <Icon icon="line-md:cog-loop" width={16} height={16} />
          </button>
          <span style={tooltipStyle(hoverSettings)}>{t('titlebar.settings')}</span>
        </div>

        {/* 截图按钮 */}
        <div style={btnWrapStyle}>
          <button
            onClick={handleScreenshot}
            onMouseEnter={() => setHoverScreenshot(true)}
            onMouseLeave={() => setHoverScreenshot(false)}
            style={toolbarBtnStyle(hoverScreenshot)}
            aria-label="Screenshot"
          >
            <Icon icon="line-md:image-twotone" width={16} height={16} />
          </button>
          <span style={tooltipStyle(hoverScreenshot)}>{t('titlebar.screenshot')}</span>
        </div>

        {/* AI 按钮 */}
        <div style={btnWrapStyle}>
          <button
            onClick={handleAI}
            onMouseEnter={() => setHoverAI(true)}
            onMouseLeave={() => setHoverAI(false)}
            style={toolbarBtnStyle(hoverAI)}
            aria-label="AI Chat"
          >
            <Icon icon="line-md:chat-twotone" width={16} height={16} />
          </button>
          <span style={tooltipStyle(hoverAI)}>{t('titlebar.aiAssistant')}</span>
        </div>
      </div>

      {/* 标题 */}
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

      {/* 右侧：搜索框（外层固定宽度容器，防止动态宽度影响标题居中） */}
      <div style={searchContainerStyle}>
        <div style={searchBoxStyle(searchFocused)}>
          <Icon icon="line-md:search" width={14} height={14} style={{ color: 'rgba(0,0,0,0.35)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '13px',
              color: 'inherit',
              width: '100%',
              lineHeight: '22px',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                // TODO: 实现全局搜索逻辑
                console.log('Search:', searchQuery);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
