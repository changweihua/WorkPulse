import { getSetting, setSetting } from './db';
import type { WidgetMode } from '../shared/touchbar';

/** 当前悬浮窗形态（设置项 widget_mode：'radial' | 'touchbar'） */
export function getWidgetMode(): WidgetMode {
  const v = getSetting('widget_mode');
  return v === 'touchbar' ? 'touchbar' : 'radial';
}

export function setWidgetMode(mode: WidgetMode): void {
  setSetting('widget_mode', mode);
}
