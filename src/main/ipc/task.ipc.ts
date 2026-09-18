/**
 * IPC 领域：任务 CRUD + 排序 + 完成
 * 迁移至 guardedHandle 模式
 */
import { guardedHandle, guardedQuery } from '../ipc-guard'
import { ok } from '../../shared/ipc-result'
import {
  addTask, getTasks, getTaskById, updateTask, deleteTask, reorderTasks,
  addWorkLog, type Task
} from '../db'
import {
  TaskAddSchema, TaskUpdateSchema, TaskDeleteSchema,
  TaskReorderSchema, TaskCompleteSchema, TaskCompleteOnlySchema,
} from '../ipc-schemas'
import { sendNotification } from '../notifier'
import { showNotification } from '../notification'

export function registerTaskIpc(): void {
  guardedHandle('task:add', TaskAddSchema, (data) => {
    return ok(addTask(data.title, data.description, data.status, data.createdAt))
  })

  guardedQuery('task:list', () => {
    return ok(getTasks())
  })

  guardedHandle('task:update', TaskUpdateSchema, (data) => {
    const prevStatus = getTaskById(data.id)?.status
    const task = updateTask(data.id, data.updates as Partial<Pick<Task, 'title' | 'description' | 'status' | 'position' | 'due_date'>>)
    if (task && data.updates.status === 'done' && prevStatus !== 'done') {
      sendNotification({ title: '任务完成', body: task.title })
    }
    return ok(task)
  })

  guardedHandle('task:delete', TaskDeleteSchema, (data) => {
    return ok(deleteTask(data.id))
  })

  guardedHandle('task:reorder', TaskReorderSchema, (data) => {
    reorderTasks(data.taskIds, data.status)
    return ok(undefined)
  })

  guardedHandle('task:complete', TaskCompleteSchema, (data) => {
    const task = updateTask(data.id, { status: 'done' })
    if (task) {
      if (data.logContent.trim()) {
        addWorkLog(data.logContent.trim(), '', data.id)
      }
      sendNotification({ title: '任务完成', body: task.title })
    }
    return ok(task)
  })

  guardedHandle('task:completeOnly', TaskCompleteOnlySchema, async (data) => {
    const task = await updateTask(data.id, { status: 'done' })
    if (task) {
      showNotification({
        title: '任务已完成',
        body: task.title || '任务',
        tag: 'task-complete',
        group: 'workpulse',
      })
    }
    return ok(task)
  })
}
