/**
 * dsh-view.ts
 * 使用 WebContentsView 在 BrowserWindow 中嵌入 DSH。
 * WebContentsView 是 Electron 43 的推荐方案，替代已弃用的 BrowserView。
 */

import { WebContentsView, BrowserWindow } from 'electron';
import log from 'electron-log/main';

let dshView: WebContentsView | null = null;
let parentWindow: BrowserWindow | null = null;

/**
 * 创建 DSH WebContentsView
 */
export function createDSHView(parent: BrowserWindow, url: string): number {
    if (dshView) destroyDSHView();
    parentWindow = parent;

    dshView = new WebContentsView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            allowRunningInsecureContent: true,
            javascript: true,
        },
    });

    dshView.setBackgroundColor('#f0f0f0');
    parent.contentView.addChildView(dshView);

    const initBounds = { x: 0, y: 0, width: 100, height: 100 };
    dshView.setBounds(initBounds);

    dshView.webContents.loadURL(url).catch(err => {
        log.error('DSH 加载失败', err);
    });

    dshView.webContents.on('did-finish-load', () => {
        log.info('DSH WebContentsView 加载完成');
    });

    dshView.webContents.on('did-fail-load', (_, code, desc) => {
        log.error('DSH 加载失败', { code, desc });
    });

    dshView.webContents.on('console-message', (event, level, message, line, sourceId) => {
        log.debug(`DSH console: ${message} (${sourceId}:${line})`);
    });

    log.info('DSH WebContentsView 创建成功', { id: dshView.webContents.id });
    return dshView.webContents.id;
}

/**
 * 调整 WebContentsView 的大小和位置
 */
export function resizeDSHView(offsetTop: number): void {
    if (!dshView || !parentWindow || parentWindow.isDestroyed()) {
        log.warn('resizeDSHView: 窗口或视图无效');
        return;
    }

    const contentBounds = parentWindow.getContentBounds();
    let width = contentBounds.width;
    let height = contentBounds.height;
    if (width < 100 || height < 100) {
        const winBounds = parentWindow.getBounds();
        width = Math.max(100, winBounds.width);
        height = Math.max(100, winBounds.height);
    }

    const bounds = {
        x: 0,
        y: offsetTop,
        width: width,
        height: Math.max(0, height - offsetTop),
    };

    log.debug('调整 WebContentsView 到', bounds);
    dshView.setBounds(bounds);
}

/**
 * 销毁 WebContentsView
 */
export function destroyDSHView(): void {
    if (dshView) {
        if (parentWindow && !parentWindow.isDestroyed()) {
            parentWindow.contentView.removeChildView(dshView);
        }
        // 关闭 WebContents（触发清理），但不会立即销毁
        try {
            dshView.webContents.close();
        } catch (e) {
            log.warn('关闭 DSH WebContents 时出错', e);
        }
        // 置空以便垃圾回收
        dshView = null;
        parentWindow = null;
        log.info('DSH WebContentsView 已销毁');
    }
}

/**
 * 获取当前 WebContentsView 的 ID
 */
export function getDSHViewId(): number | null {
    return dshView?.webContents.id ?? null;
}