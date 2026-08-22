import type { BrowserWindow } from 'electron'
import { getSetting, getDueMeetings, markEventNotified } from './db'
import { sendNotification } from './notifier'

let timer: ReturnType<typeof setInterval> | null = null

/** 启动定时任务轮询（每 30 秒检查一次即将开始的会议） */
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
      const body = mins > 0 ? `${mins} 分钟后开始（${ev.start_time}）` : '已到开始时间'

      sendNotification({
        title: '会议提醒',
        body: `${ev.title} · ${body}`,
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
    console.error('[scheduler] checkMeetings failed:', err)
  }
}
