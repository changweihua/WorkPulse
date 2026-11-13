/**
 * 全局字体偏好注入。
 *
 * 为什么用 webContents.insertCSS 而不是各窗口各自读 settings：
 * - 项目有 5 个渲染入口（主窗口 / radial / touchbar / daily-summary / screenshot-overlay），
 *   每个入口的 preload 暴露的 API 都不同，逐个订阅容易漏；
 * - app.on('web-contents-created') 能覆盖**所有**新建窗口，无需修改任一窗口文件；
 * - 注入的样式不在任何 @layer 内，按 CSS cascade layers 规则天然高于 Tailwind v4
 *   的 theme/base/components/utilities 层，配 !important 可稳定覆盖 preflight 的
 *   --default-font-family 默认值。
 *
 * 每次注入前先 removeInsertedCSS 旧 key：设置页切换字体、Vite HMR 重载页面时
 * 都不会叠加多份互相冲突的规则。
 */
import { app, BrowserWindow, type WebContents } from 'electron';
import log from 'electron-log/main';
import { getSetting } from './db';
import { appBus, FONT_CHANGED } from './event-bus';
import {
  FONT_FAMILY_SETTING_KEY,
  FONT_SIZE_SETTING_KEY,
  normalizeFontSize,
  resolveFontStack,
} from '../shared/typography';

/** 每个 webContents 上一次注入返回的 CSS key，用于替换而非叠加 */
const insertedCssKeys = new WeakMap<WebContents, string>();

function buildFontCss(): string {
  // 读到的永远是预设 id，resolveFontStack 会把它映射到白名单字体链；
  // 非法值回退默认，因此这里拼进 CSS 的内容不可能来自渲染层的任意字符串。
  const stack = resolveFontStack(getSetting(FONT_FAMILY_SETTING_KEY));
  const size = normalizeFontSize(getSetting(FONT_SIZE_SETTING_KEY));
  return `
:root {
  --app-font-family: ${stack};
  --app-font-size: ${size}px;
  --font-sans: ${stack};
  --font-serif: ${stack};
  --font-mono: ${stack};
}
html, body {
  font-family: ${stack} !important;
}
/* 只改 body 的字号：html 保持 16px 的 rem 基准，避免 Tailwind 的 rem 间距
   与 text-* 工具类被整体缩放 25% 导致布局变形 */
body {
  font-size: ${size}px !important;
}
`.trim();
}

/** 对单个 webContents 应用（或重新应用）当前字体偏好 */
export async function applyFontToWebContents(webContents: WebContents): Promise<void> {
  if (webContents.isDestroyed()) return;
  const previous = insertedCssKeys.get(webContents);
  if (previous) {
    try {
      await webContents.removeInsertedCSS(previous);
    } catch {
      // 页面已导航 / 窗口已销毁，旧 key 自然失效，忽略即可
    }
    insertedCssKeys.delete(webContents);
  }
  if (webContents.isDestroyed()) return;
  try {
    const key = await webContents.insertCSS(buildFontCss());
    insertedCssKeys.set(webContents, key);
  } catch (err) {
    log.warn('[Font] insertCSS 失败:', err);
  }
}

/**
 * 注册全局钩子。必须在任何 BrowserWindow 创建之前调用（app.whenReady 内、
 * createWindow 之前），否则先创建的窗口会漏掉 web-contents-created 事件。
 */
export function registerFontPreferences(): void {
  app.on('web-contents-created', (_event, webContents) => {
    // 跳过 devtools / webview 等非页面窗口
    if (webContents.getType() !== 'window') return;
    webContents.on('did-finish-load', () => {
      void applyFontToWebContents(webContents);
    });
  });

  appBus.on(FONT_CHANGED, () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) void applyFontToWebContents(win.webContents);
    }
  });
}
