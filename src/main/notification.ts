/**
 * Windows 系统通知（Toast Notifications）
 *
 * 使用 Electron 内置 Notification + toastXml 实现 Windows 原生 Toast 通知。
 * 通过自定义协议 workpulse:// 支持 Action Center 点击激活。
 *
 * API: Notification.show({ title, body, group?, tag?, urgency?, silent?, onClick? })
 */
import { Notification, app, nativeImage, BrowserWindow } from 'electron'
import path from 'path'
import log from 'electron-log/main'

const APP_PROTOCOL = 'workpulse'

/** 自定义协议激活处理器（由 main/index.ts 注入） */
let onProtocolAction: ((url: string) => void) | null = null

/**
 * 注册 workpulse:// 自定义协议
 * 必须在 app.ready 之前调用
 */
export function registerProtocol(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(
      APP_PROTOCOL,
      process.execPath,
      [path.resolve(process.argv[1])]
    )
  } else {
    app.setAsDefaultProtocolClient(APP_PROTOCOL)
  }
  log.info('[Notification] Protocol registered:', APP_PROTOCOL)
}

/**
 * 设置 Action Center 点击回调
 */
export function setProtocolHandler(handler: (url: string) => void): void {
  onProtocolAction = handler
}

/**
 * 处理协议激活 URL
 */
function handleProtocolUrl(url: string): void {
  try {
    const u = new URL(url)
    const action = u.searchParams.get('action')
    log.info('[Notification] Protocol activation:', { url, action })
    onProtocolAction?.(url)
  } catch (e) {
    log.warn('[Notification] Invalid protocol URL:', url, e)
  }
}

/**
 * 检查并处理协议激活
 * - Windows: 第二实例通过 second-instance 事件传递 URL
 * - 冷启动: URL 在 process.argv 中
 */
export function handleProtocolArgv(): void {
  // 冷启动检查
  const url = process.argv.find((a) =>
    a.toLowerCase().startsWith(`${APP_PROTOCOL}://`)
  )
  if (url) handleProtocolUrl(url)
}

/**
 * 设置 second-instance 事件处理（Windows 协议激活）
 */
export function setupSecondInstanceHandler(): void {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) =>
      a.toLowerCase().startsWith(`${APP_PROTOCOL}://`)
    )
    if (url) handleProtocolUrl(url)
  })
}

/**
 * 转义 XML 特殊字符
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 通知选项 */
export interface NotifyOptions {
  title: string
  body: string
  /** 通知分组（Action Center 中堆叠） */
  group?: string
  /** 通知标签（替换同 tag 的已有通知） */
  tag?: string
  /** 紧急程度: 'normal' | 'low' | 'critical' */
  urgency?: 'normal' | 'low' | 'critical'
  /** 静音通知 */
  silent?: boolean
  /** 点击通知回调 */
  onClick?: () => void
  /** 图标路径（Windows 限制 <1024×1024px, <200kb） */
  icon?: string
}

/**
 * 显示 Windows 系统通知
 */
export function showNotification(options: NotifyOptions): Notification | null {
  const {
    title,
    body,
    group = 'workpulse',
    tag,
    urgency = 'normal',
    silent = false,
    onClick,
    icon
  } = options

  // Windows: 使用 toastXml 获取完整控制
  if (process.platform === 'win32') {
    const tagAttr = tag ? ` tag="${escapeXml(tag)}"` : ''
    const groupAttr = group ? ` group="${escapeXml(group)}"` : ''
    const urgencyMap = { low: 'low', normal: 'default', critical: 'urgent' }
    const scenario = urgency === 'critical' ? ' scenario="alarm"' : ''

    const launchUrl = `${APP_PROTOCOL}://notify?action=click&tag=${encodeURIComponent(tag || '')}`

    // 构建 XML
    let iconXml = ''
    if (icon) {
      const iconPath = icon.startsWith('file://') ? icon : `file:///${icon.replace(/\\/g, '/')}`
      iconXml = `<image placement="appLogoOverride" hint-crop="circle" src="${iconPath}"/>`
    }

    const toastXml = `
<toast launch="${launchUrl}" activationType="protocol"${scenario}${groupAttr}${tagAttr}>
  <visual>
    <binding template="ToastGeneric">
      ${iconXml}
      <text id="1">${escapeXml(title)}</text>
      <text id="2">${escapeXml(body)}</text>
    </binding>
  </visual>
</toast>`.trim()

    const notification = new Notification({
      toastXml,
      silent
    })

    if (onClick) {
      notification.on('click', onClick)
    }

    notification.show()
    return notification
  }

  // macOS / Linux: 标准 API
  const notification = new Notification({
    title,
    body,
    silent,
    icon: icon ? nativeImage.createFromPath(icon) : undefined
  })

  if (onClick) {
    notification.on('click', onClick)
  }

  notification.show()
  return notification
}

/**
 * 静态初始化：设置 AppUserModelId + 协议注册 + second-instance
 * 在 app.ready 之前调用
 */
export function initNotifications(): void {
  // Windows AppUserModelId（必须匹配 electron-builder appId）
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.workpulse.app')
    log.info('[Notification] AppUserModelId set: com.workpulse.app')
  }

  registerProtocol()
  setupSecondInstanceHandler()
}
