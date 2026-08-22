import { Notification, net } from 'electron'

/** Bark 推送（iOS），BARK_KEY 通过环境变量提供；可选 BARK_SERVER 自建服务地址 */
async function pushBark(title: string, body: string): Promise<void> {
  const key = process.env.BARK_KEY
  if (!key) return
  const server = process.env.BARK_SERVER || 'https://api.day.app'
  try {
    await net.fetch(`${server}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ device_key: key, title, body })
    })
  } catch (err) {
    console.error('[notifier] bark push failed:', err)
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
    const notification = new Notification({
      title: opts.title,
      body: opts.body,
      silent: false,
    })
    if (opts.onClick) notification.on('click', opts.onClick)
    notification.show()
    void pushBark(opts.title, opts.body)
  } catch (err) {
    console.error('[notifier] sendNotification failed:', err)
  }
}
