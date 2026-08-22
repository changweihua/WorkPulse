import { Notification, net } from 'electron'
import log from 'electron-log/main'

/** Bark 推送（iOS），BARK_KEY 通过环境变量提供；可选 BARK_SERVER 自建服务地址 */
async function pushBark(title: string, body: string): Promise<void> {
  const key = process.env.BARK_KEY
  if (!key) {
    log.info('[notifier] BARK_KEY 未配置，跳过 Bark 推送')
    return
  }
  const server = process.env.BARK_SERVER || 'https://api.day.app'
  try {
    log.info(`[notifier] Bark 推送 → ${server}: ${title} / ${body}`)
    const res = await net.fetch(`${server}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ device_key: key, title, body })
    })
    const text = await res.text()
    if (res.ok) {
      log.info(`[notifier] Bark 响应 ${res.status}: ${text}`)
    } else {
      log.warn(`[notifier] Bark 推送失败 ${res.status}: ${text}`)
    }
  } catch (err) {
    log.error('[notifier] Bark 请求异常:', err)
  }
}

export interface NotifyOptions {
  title: string
  body: string
  onClick?: () => void
}

/** 发送系统通知，同时推送 Bark（已配置时） */
export function sendNotification(opts: NotifyOptions): void {
  try {
    log.info(`[notifier] 发送通知: ${opts.title} / ${opts.body}`)
    const notification = new Notification({
      title: opts.title,
      body: opts.body,
      silent: false,
    })
    if (opts.onClick) notification.on('click', opts.onClick)
    notification.show()
    void pushBark(opts.title, opts.body)
  } catch (err) {
    log.error('[notifier] sendNotification failed:', err)
  }
}
