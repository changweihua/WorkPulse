/**
 * dsh-view.ts
 *
 * Embeds DSH in a WebContentsView (Electron 43+ recommended API, replaces BrowserView).
 *
 * Key design decisions (based on craft-agents-oss / hermes-agent patterns):
 *  - Main process owns view geometry; setAutoResize handles window resize
 *  - Security: sandbox, contextIsolation, webSecurity enabled (loopback needs none of the overrides)
 *  - Crash / fail-load events surfaced to renderer via dsh:status-changed
 *  - stop() called before destroy to avoid Chromium compositor assertion
 */

import { WebContentsView, BrowserWindow } from 'electron';
import log from 'electron-log/main';

// ---------- constants ----------
const TOOLBAR_HEIGHT = 30; // debug bar height in renderer (must match DSHPage)
const BG_COLOR = '#f9fafb'; // tailwind gray-50, matches light theme

// ---------- state ----------
let dshView: WebContentsView | null = null;
let parentWindow: BrowserWindow | null = null;
let viewOffset = TOOLBAR_HEIGHT;
let windowResizeHandler: (() => void) | null = null;

// ---------- helpers ----------

function sendToRenderer(channel: string, ...args: unknown[]) {
    if (parentWindow && !parentWindow.isDestroyed()) {
        parentWindow.webContents.send(channel, ...args);
    }
}

function layoutView() {
    if (!dshView || !parentWindow || parentWindow.isDestroyed()) return;
    const { width, height } = parentWindow.getContentBounds();
    if (width < 100 || height < 100) return; // minimised – skip
    dshView.setBounds({
        x: 0,
        y: viewOffset,
        width,
        height: Math.max(100, height - viewOffset),
    });
}

function attachResizeListener() {
    if (!parentWindow || windowResizeHandler) return;
    windowResizeHandler = () => layoutView();
    parentWindow.on('resize', windowResizeHandler);
}

function detachResizeListener() {
    if (parentWindow && windowResizeHandler) {
        parentWindow.removeListener('resize', windowResizeHandler);
        windowResizeHandler = null;
    }
}

// ---------- public API ----------

/**
 * Create and attach a DSH WebContentsView to the parent window.
 * @param parent  The BrowserWindow to attach to
 * @param url     The DSH service URL (http://127.0.0.1:PORT)
 * @param offset  Y-offset from top of content area (default: TOOLBAR_HEIGHT)
 */
export function createDSHView(parent: BrowserWindow, url: string, offset: number = TOOLBAR_HEIGHT): number {
    if (dshView) destroyDSHView();

    parentWindow = parent;
    viewOffset = offset;

    dshView = new WebContentsView({
        webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            javascript: true,
        },
    });

    dshView.setBackgroundColor(BG_COLOR);

    // Auto-resize with parent window – no renderer IPC needed for resize
    dshView.setAutoResize({ width: true, height: true });

    parent.contentView.addChildView(dshView);
    layoutView();
    attachResizeListener();

    const wc = dshView.webContents;

    // --- event wiring (push state to renderer) ---

    wc.on('did-start-loading', () => {
        sendToRenderer('dsh:status-changed', { type: 'loading' });
    });

    wc.on('did-stop-loading', () => {
        sendToRenderer('dsh:status-changed', { type: 'loaded' });
    });

    wc.on('did-finish-load', () => {
        log.info('DSH view loaded');
        sendToRenderer('dsh:status-changed', { type: 'loaded' });
    });

    wc.on('did-fail-load', (_e, code, desc, urlStr, isMainFrame) => {
        // Ignore expected errors
        if (!isMainFrame) return;                           // sub-frame failures
        if (code === -3) return;                            // ERR_ABORTED (navigation/redirect)
        if (code === -102) {                                // ERR_CONNECTION_REFUSED – service not up yet
            log.warn('DSH connection refused (service may be starting)', { urlStr });
            return;
        }
        log.error('DSH view failed to load', { code, desc, url: urlStr });
        sendToRenderer('dsh:status-changed', { type: 'error', code, desc });
    });

    wc.on('render-process-gone', (_e, details) => {
        log.error('DSH render process gone', { reason: details.reason });
        sendToRenderer('dsh:status-changed', { type: 'crashed', reason: details.reason });
    });

    wc.on('page-title-updated', (_e, title) => {
        sendToRenderer('dsh:status-changed', { type: 'title', title });
    });

    // Load URL (catch immediate failures)
    wc.loadURL(url).catch((err) => {
        log.error('DSH loadURL failed', err);
        sendToRenderer('dsh:status-changed', { type: 'error', code: -1, desc: err.message });
    });

    log.info('DSH view created', { id: wc.id, url, offset });
    return wc.id;
}

/**
 * Manually resize the view (called from renderer when toolbar height changes).
 * With setAutoResize, this is rarely needed.
 */
export function resizeDSHView(offsetTop: number): void {
    viewOffset = offsetTop;
    layoutView();
}

/**
 * Destroy the view. Calls stop() on webContents first to avoid compositor crash.
 */
export function destroyDSHView(): void {
    if (!dshView) return;

    detachResizeListener();

    try {
        dshView.webContents.stop(); // stop in-flight load first
    } catch { /* already destroyed */ }

    if (parentWindow && !parentWindow.isDestroyed()) {
        parentWindow.contentView.removeChildView(dshView);
    }

    try {
        dshView.webContents.close();
        dshView.webContents.removeAllListeners();
    } catch { /* already closed */ }

    dshView = null;
    parentWindow = null;
    log.info('DSH view destroyed');
}

/**
 * Get the WebContentsView ID (for IPC correlation).
 */
export function getDSHViewId(): number | null {
    return dshView?.webContents.id ?? null;
}
