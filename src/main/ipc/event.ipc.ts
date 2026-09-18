/**
 * IPC 领域：日历事件（会议 / 待办）
 * 迁移至 guardedHandle 模式
 */
import { guardedHandle } from '../ipc-guard'
import { ok } from '../../shared/ipc-result'
import { addEvent, getEventsByDate, getEventsByRange, updateEvent, deleteEvent, type CalendarEventInput } from '../db'
import {
  EventAddSchema, EventDeleteSchema, EventUpdateSchema,
  EventByDateSchema, EventByRangeSchema,
} from '../ipc-schemas'

export function registerEventIpc(): void {
  guardedHandle('event:add', EventAddSchema, (data) => {
    return ok(addEvent(data as unknown as CalendarEventInput))
  })

  guardedHandle('event:byDate', EventByDateSchema, (data) => {
    return ok(getEventsByDate(data.date))
  })

  guardedHandle('event:byRange', EventByRangeSchema, (data) => {
    return ok(getEventsByRange(data.from, data.to))
  })

  guardedHandle('event:update', EventUpdateSchema, (data) => {
    return ok(updateEvent(data.id, data.updates as Partial<CalendarEventInput> & { completed?: boolean }))
  })

  guardedHandle('event:delete', EventDeleteSchema, (data) => {
    return ok(deleteEvent(data.id))
  })
}
