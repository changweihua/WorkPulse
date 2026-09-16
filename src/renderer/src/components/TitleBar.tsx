import { useLocation } from 'react-router-dom';
import { useI18n } from '../stores/languageStore';

export function TitleBar() {
  const location = useLocation();
  const { t } = useI18n();

  // 动态页面标题
  const routeTitleMap: Record<string, string> = {
    '/worklog': t('nav.worklog'),
    '/kanban': t('nav.kanban'),
    '/report': t('nav.report'),
    '/reports': t('nav.weekly'),
    '/stats': t('nav.stats'),
    '/calendar': t('nav.calendar'),
    '/chat': t('nav.chat'),
    '/ocr': t('nav.ocr'),
    '/pp': t('nav.pp'),
    '/xray': t('nav.xray'),
    '/onnx': t('nav.onnx'),
    '/settings': t('nav.settings'),
  };
  const pageTitle = routeTitleMap[location.pathname] || 'WorkPulse';

  return (
    <div
      style={{
        height: 'env(titlebar-area-height, 44px)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 'env(titlebar-area-x, 14px)',
        paddingRight: 'calc(100vw - env(titlebar-area-width, 100vw))',
        WebkitAppRegion: 'drag',
        flexShrink: 0,
        userSelect: 'none',
        position: 'relative',
        zIndex: 50,
      } as React.CSSProperties}
    >
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
        {pageTitle}
      </span>
    </div>
  );
}
