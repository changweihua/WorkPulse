/**
 * IPC 领域：日历事件（会议 / 待办）
 */
import { ipcMain } from 'electron'
import { addEvent, getEventsByDate, getEventsByRange, updateEvent, deleteEvent, type CalendarEventInput } from '../db'
import { validate, EventAddSchema, EventDeleteSchema } from '../ipc-schemas'

export function registerEventIpc(): void {
  ipcMain.handle('event:add', (_event, input: CalendarEventInput) => {
    const v = validate(EventAddSchema, input as unknown as Record<string, unknown>)
    return addEvent(v as unknown as CalendarEventInput)
  })

  ipcMain.handle('event:byDate', (_event, date: string) => {
    return getEventsByDate(date)
  })

  ipcMain.handle('event:byRange', (_event, from: string, to: string) => {
    return getEventsByRange(from, to)
  })

  ipcMain.handle(
    'event:update',
    (_event, id: number, updates: Partial<CalendarEventInput> & { completed?: boolean }) => {
      return updateEvent(id, updates)
    }
  )

  ipcMain.handle('event:delete', (_event, id: number) => {
    const v = validate(EventDeleteSchema, { id })
    return deleteEvent(v.id)
  })
}
