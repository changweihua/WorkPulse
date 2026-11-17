/**
 * 托盘模块：系统托盘图标 + 菜单
 */
import { app, Tray, Menu, nativeImage } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { tMain } from './i18n';
import { appBus, SHOW_MAIN } from './event-bus';
import { setTray } from './notification';

type SendFn = (channel: string) => void;

let tray: Tray | null = null;
let cachedMenuIcons: {
  newLog: Electron.NativeImage;
  newTask: Electron.NativeImage;
  show: Electron.NativeImage;
  quit: Electron.NativeImage;
} | null = null;

function getMenuIcons() {
  if (cachedMenuIcons) return cachedMenuIcons;
  const iconDir = is.dev ? join(__dirname, '../../resources') : join(process.resourcesPath);
  // 同样不要 resize：createFromPath 会自动带上同名 @2x 变体作为高分屏 representation，
  // 一旦 resize 到固定 16x16，@2x representation 会被一起重采样掉，菜单图标在高分屏发虚。
  cachedMenuIcons = {
    newLog: nativeImage.createFromPath(join(iconDir, 'menu-new-log.png')),
    newTask: nativeImage.createFromPath(join(iconDir, 'menu-new-task.png')),
    show: nativeImage.createFromPath(join(iconDir, 'menu-show.png')),
    quit: nativeImage.createFromPath(join(iconDir, 'menu-quit.png')),
  };
  return cachedMenuIcons;
}

function buildTrayMenu(sendToRenderer: SendFn, onQuit: () => void): Electron.Menu {
  const {
    newLog: newLogIcon,
    newTask: newTaskIcon,
    show: showIcon,
    quit: quitIcon,
  } = getMenuIcons();

  return Menu.buildFromTemplate([
    { label: tMain('newLog'), icon: newLogIcon, click: () => sendToRenderer('quick-create:log') },
    {
      label: tMain('newTask'),
      icon: newTaskIcon,
      click: () => sendToRenderer('quick-create:task'),
    },
    { type: 'separator' },
    {
      label: tMain('showApp'),
      icon: showIcon,
      click: () => {
        appBus.emit(SHOW_MAIN);
      },
    },
    { type: 'separator' },
    { label: tMain('quit'), icon: quitIcon, click: onQuit },
  ]);
}

export function createTray(sendToRenderer: SendFn, onQuit: () => void): void {
  const iconPath = is.dev
    ? join(__dirname, '../../resources/tray-icon.png')
    : join(process.resourcesPath, 'tray-icon.png');

  // 关键：不要用 resize() 强行指定托盘尺寸。
  // 旧代码 resize 到 18x18：既把非正方形源图压扁变形，又生成固定小位图，
  // 在 150%/200% DPI 的托盘上被系统放大而发虚。
  // 正确做法是提供 base(16x16) + @Nx 变体，让 nativeImage.createFromPath
  // 按每块屏幕的实际 DPI 自动选原生像素 representation，全程不重采样。
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABdJREFUeNpj/P//PwMlgHHUgFEDAAIMAAABBgABsp3F1QAAAABJRU5ErkJggg==',
    );
  }
  // 模板图标只在 macOS 有意义（跟随浅色/深色菜单栏自动染色）；Windows/Linux 保持彩色。
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }
  tray = new Tray(icon);
  tray.setToolTip('WorkPulse');
  tray.setContextMenu(buildTrayMenu(sendToRenderer, onQuit));
  setTray(tray);

  tray.on('click', () => {
    appBus.emit(SHOW_MAIN);
  });
}

export function rebuildTrayMenu(sendToRenderer: SendFn, onQuit: () => void): void {
  if (tray) tray.setContextMenu(buildTrayMenu(sendToRenderer, onQuit));
}

export function getTray(): Tray | null {
  return tray;
}
