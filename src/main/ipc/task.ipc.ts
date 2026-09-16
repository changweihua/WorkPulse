/**
 * IPC 领域：任务 CRUD + 排序 + 完成
 */
import { ipcMain } from 'electron'
import {
  addTask, getTasks, getTaskById, updateTask, deleteTask, reorderTasks,
  addWorkLog, type Task
} from '../db'
import { validate, TaskAddSchema, TaskUpdateSchema, TaskDeleteSchema } from '../ipc-schemas'
import { sendNotification } from '../notifier'
import { showNotification } from '../notification'

export function registerTaskIpc(): void {
  ipcMain.handle('task:add', (_event, title: string, description?: string, status?: 'todo' | 'draft', createdAt?: string) => {
    const v = validate(TaskAddSchema, { title, description, status, createdAt })
    return addTask(v.title, v.description, v.status, v.createdAt)
  })

  ipcMain.handle('task:list', () => {
    return getTasks()
  })

  ipcMain.handle(
    'task:update',
    (_event, id: number, updates: Partial<Pick<Task, 'title' | 'description' | 'status' | 'position' | 'due_date'>>) => {
      const v = validate(TaskUpdateSchema, { id, updates })
      const prevStatus = getTaskById(v.id)?.status
      const task = updateTask(v.id, v.updates as Partial<Pick<Task, 'title' | 'description' | 'status' | 'position' | 'due_date'>>)
      if (task && v.updates.status === 'done' && prevStatus !== 'done') {
        sendNotification({ title: '任务完成', body: task.title })
      }
      return task
    }
  )

  ipcMain.handle('task:delete', (_event, id: number) => {
    const v = validate(TaskDeleteSchema, { id })
    return deleteTask(v.id)
  })

  ipcMain.handle('task:reorder', (_event, taskIds: number[], status: string) => {
    reorderTasks(taskIds, status)
  })

  ipcMain.handle('task:complete', (_event, id: number, logContent: string) => {
    const task = updateTask(id, { status: 'done' })
    if (task) {
      if (logContent.trim()) {
        addWorkLog(logContent.trim(), '', id)
      }
      sendNotification({ title: '任务完成', body: task.title })
    }
    return task
  })

  ipcMain.handle('task:completeOnly', async (_event, id: number) => {
    const task = await updateTask(id, { status: 'done' })
    if (task) {
      showNotification({
        title: '任务已完成',
        body: task.title || '任务',
        tag: 'task-complete',
        group: 'workpulse',
      })
    }
    return task
  })
}
