import { BrowserView, BrowserWindow, Rectangle } from 'electron';
import log from 'electron-log/main';

let dshView: BrowserView | null = null;
let parentWindow: BrowserWindow | null = null;
let currentBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

export function createDSHView(parent: BrowserWindow, url: string): number {
    if (dshView) destroyDSHView();
    parentWindow = parent;

    dshView = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            allowRunningInsecureContent: true,
            javascript: true,
        },
    });

    dshView.setBackgroundColor('#f0f0f0');

    // 设置初始尺寸为窗口大小（避免 0x0）
    const size = parent.getSize();
    const initBounds = {
        x: 0,
        y: 0,
        width: Math.max(100, size[0]),
        height: Math.max(100, size[1]),
    };
    dshView.setBounds(initBounds);
    parent.addBrowserView(dshView);

    dshView.webContents.loadURL(url).catch(err => {
        log.error('DSH 加载失败', err);
    });

    dshView.webContents.on('did-finish-load', () => {
        log.info('DSH BrowserView 加载完成');
    });

    dshView.webContents.on('did-fail-load', (_, code, desc) => {
        log.error('DSH 加载失败', { code, desc });
    });

    // 延迟调整，等待窗口布局完成
    setTimeout(() => {
        resizeDSHView(30);
    }, 100);

    log.info('DSH BrowserView 创建成功', { id: dshView.webContents.id });
    return dshView.webContents.id;
}

export function resizeDSHView(offsetTop = 0): void {
    if (!dshView || !parentWindow || parentWindow.isDestroyed()) {
        log.warn('无法调整 BrowserView：窗口或视图不存在');
        return;
    }

    let contentBounds = parentWindow.getContentBounds();
    let width = contentBounds.width;
    let height = contentBounds.height - offsetTop;

    // 如果尺寸异常，使用窗口整体尺寸
    if (width < 100 || height < 100) {
        const size = parentWindow.getSize();
        width = Math.max(size[0], 800);
        height = Math.max(size[1] - offsetTop, 600);
        log.warn('getContentBounds 异常，使用 getSize', { original: contentBounds, used: { width, height } });
    }

    const bounds = {
        x: 0,
        y: offsetTop,
        width: Math.max(10, width),
        height: Math.max(10, height),
    };

    log.debug('调整 BrowserView 到', bounds);
    dshView.setBounds(bounds);
    currentBounds = bounds;
}

export function destroyDSHView(): void {
    if (dshView) {
        if (parentWindow && !parentWindow.isDestroyed()) {
            parentWindow.removeBrowserView(dshView);
        }
        try { (dshView as any).destroy?.(); } catch (e) { }
        dshView = null;
        parentWindow = null;
        log.info('DSH BrowserView 已销毁');
    }
}

export function getDSHViewId(): number | null {
    return dshView?.webContents.id ?? null;
}