import { Notification, net } from 'electron'
import log from 'electron-log/main'
import { execFile } from 'child_process'

/** 从 Windows 注册表读取当前环境变量（用户级 → 系统级），不受进程继承时机影响 */
const regCache = new Map<string, string | null>()
function readRegistryEnv(name: string): Promise<string | null> {
  const cached = regCache.get(name)
  if (cached !== undefined) return Promise.resolve(cached)
  return new Promise((resolve) => {
    const parse = (stdout: string): string | null => {
      const m = stdout.match(new RegExp(`${name}\\s+REG_(SZ|EXPAND_SZ)\\s+(.*)`))
      return m ? m[2].trim() : null
    }
    execFile('reg', ['query', 'HKCU\\Environment', '/v', name], (err, stdout) => {
      const userVal = err ? null : parse(String(stdout))
      if (userVal) {
        regCache.set(name, userVal)
        return resolve(userVal)
      }
      execFile(
        'reg',
        ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', '/v', name],
        (err2, stdout2) => {
          const sysVal = err2 ? null : parse(String(stdout2))
          regCache.set(name, sysVal)
          resolve(sysVal)
        }
      )
    })
  })
}

/** 解析配置值：进程环境变量 → 本机注册表（用户/系统级） */
async function resolveEnv(name: string): Promise<string | null> {
  return process.env[name] || (await readRegistryEnv(name)) || null
}

/** Bark 推送（iOS），BARK_KEY 支持进程环境变量、本机环境变量或 .env；可选 BARK_SERVER 自建服务地址 */
async function pushBark(title: string, body: string): Promise<void> {
  const key = await resolveEnv('BARK_KEY')
  if (!key) {
    log.info('[notifier] BARK_KEY 未配置，跳过 Bark 推送')
    return
  }
  const server = (await resolveEnv('BARK_SERVER')) || 'https://api.day.app'
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
