import { EventEmitter } from 'events';

export const appBus = new EventEmitter();

// Event names
export const SHOW_MAIN = 'app:show-main';
export const SHOW_RADIAL = 'app:show-radial';
export const RADIAL_SCREENSHOT = 'app:radial-screenshot';
export const TOGGLE_WINDOWS = 'app:toggle-windows';
export const WIDGET_VISIBILITY_CHANGED = 'app:widget-visibility-changed';
export const WIDGET_MODE_CHANGED = 'app:widget-mode-changed';
/** 窗口材质变更（预览与「应用」保存都会触发），Touch Bar 据此同步背景 */
export const WINDOW_MATERIAL_CHANGED = 'app:window-material-changed';
/** 全局排版偏好变更（字体族 / 基础字号），通知所有窗口重新注入字体 CSS */
export const FONT_CHANGED = 'app:font-changed';
