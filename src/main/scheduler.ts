import type { BrowserWindow } from 'electron'
import { getSetting, getDueMeetings, markEventNotified } from './db'
import { sendNotification } from './notifier'
import log from 'electron-log/main'

let timer: ReturnType<typeof setInterval> | null = null

/** 鍚姩瀹氭椂浠诲姟杞锛堟瘡 30 绉掓鏌ヤ竴娆″嵆灏嗗紑濮嬬殑浼氳锛?*/
export function startScheduler(getMainWindow: () => BrowserWindow | null): void {
  if (timer) return
  setTimeout(() => checkMeetings(getMainWindow), 5_000)
  timer = setInterval(() => checkMeetings(getMainWindow), 30_000)
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function checkMeetings(getMainWindow: () => BrowserWindow | null): void {
  try {
    if (getSetting('reminder_enabled') === '0') return
    const lead = Number(getSetting('reminder_lead') ?? '10') || 10
    const due = getDueMeetings(lead)
    const now = Date.now()

    for (const ev of due) {
      if (!markEventNotified(ev.id)) continue

      const startMs = new Date(`${ev.event_date}T${ev.start_time}`).getTime()
      const mins = Math.round((startMs - now) / 60_000)
      const body = mins > 0 ? `${mins} 鍒嗛挓鍚庡紑濮嬶紙${ev.start_time}锛塦 : '宸插埌寮€濮嬫椂闂?

      sendNotification({
        title: '浼氳鎻愰啋',
        body: `${ev.title} 路 ${body}`,
        onClick: () => {
          const win = getMainWindow()
          if (win) {
            if (win.isMinimized()) win.restore()
            win.show()
            win.focus()
          }
        },
      })
    }
  } catch (err) {
    log.error('[scheduler] checkMeetings failed:', err)
  }
}
