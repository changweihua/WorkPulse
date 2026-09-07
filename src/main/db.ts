import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, copyFileSync, mkdirSync } from 'fs'
import { createAttachmentTable, type Attachment } from './attachments'
import log from 'electron-log/main'

export type { Attachment }

export interface FeedCategory {
  id: number
  name: string
  sort_order: number
  created_at: string
}

export interface Feed {
  id: number
  url: string
  title: string | null
  description: string | null
  site_url: string | null
  favicon_url: string | null
  category_id: number | null
  refresh_interval: number
  last_fetched_at: string | null
  is_muted: number
  created_at: string
  unread_count?: number
}

export interface Article {
  id: number
  feed_id: number
  guid: string | null
  title: string
  url: string | null
  author: string | null
  content: string | null
  summary: string | null
  published_at: string | null
  is_read: number
  is_starred: number
  created_at: string
  feed_title?: string
  feed_favicon_url?: string | null
}

let db: Database.Database

const DB_NAME = 'workpulse.db'

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, DB_NAME)
}

function getBackupPath(): string {
  const userDataPath = app.getPath('userData')
  const backupDir = join(userDataPath, 'backups')
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true })
  }
  const date = formatLocalDate(new Date())
  return join(backupDir, `workpulse-${date}.db`)
}

function runIntegrityCheck(): boolean {
  try {
    const result = db.pragma('integrity_check') as { integrity_check: string }[]
    return result[0]?.integrity_check === 'ok'
  } catch {
    return false
  }
}

function createBackup(): void {
  const backupPath = getBackupPath()
  if (!existsSync(backupPath)) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
      copyFileSync(getDbPath(), backupPath)
    } catch {
      // backup failure is non-critical
    }
  }
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      task_id INTEGER,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done', 'draft')),
      board_column TEXT NOT NULL DEFAULT 'todo',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      completed_at TEXT,
      due_date TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('weekly', 'monthly', 'quarterly', 'custom')),
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      content TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('todo', 'meeting')),
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      event_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      location TEXT DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_work_logs_created_at ON work_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_reports_dates ON reports(date_from, date_to);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);

    CREATE TABLE IF NOT EXISTS feed_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      description TEXT,
      site_url TEXT,
      favicon_url TEXT,
      category_id INTEGER REFERENCES feed_categories(id) ON DELETE SET NULL,
      refresh_interval INTEGER NOT NULL DEFAULT 3600,
      last_fetched_at TEXT,
      is_muted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      guid TEXT,
      title TEXT NOT NULL,
      url TEXT,
      author TEXT,
      content TEXT,
      summary TEXT,
      published_at TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(feed_id, guid)
    );

    CREATE INDEX IF NOT EXISTS idx_feeds_category ON feeds(category_id);
    CREATE INDEX IF NOT EXISTS idx_articles_feed ON articles(feed_id);
    CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
    CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(is_read);
    CREATE INDEX IF NOT EXISTS idx_articles_starred ON articles(is_starred);
  `)

  createAttachmentTable(db)
}

function runMigrations(): void {
  const colInfo = db.prepare("PRAGMA table_info('tasks')").all() as { name: string }[]
  const hasDueDate = colInfo.some((c) => c.name === 'due_date')

  // SQLite can't ALTER CHECK constraints, so recreate table if needed
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined
  if (tableInfo?.sql && !tableInfo.sql.includes("'draft'")) {
    const dueDateSelect = hasDueDate ? 'due_date' : 'NULL as due_date'
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done', 'draft')),
        board_column TEXT NOT NULL DEFAULT 'todo',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        completed_at TEXT,
        due_date TEXT DEFAULT NULL
      );
      INSERT INTO tasks_new (
        id,
        title,
        description,
        status,
        board_column,
        position,
        created_at,
        updated_at,
        completed_at,
        due_date
      )
      SELECT
        id,
        title,
        description,
        status,
        board_column,
        position,
        created_at,
        updated_at,
        completed_at,
        ${dueDateSelect}
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `)
    return
  }

  if (!hasDueDate) {
    db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT DEFAULT NULL")
  }

  // 日程提醒：notified 标记会议是否已推送通知
  const evInfo = db.prepare("PRAGMA table_info('calendar_events')").all() as { name: string }[]
  if (!evInfo.some((c) => c.name === 'notified')) {
    db.exec('ALTER TABLE calendar_events ADD COLUMN notified INTEGER NOT NULL DEFAULT 0')
  }
}

export function initDatabase(): void {
  const dbPath = getDbPath()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
  runMigrations()

  if (!runIntegrityCheck()) {
    log.error('Database integrity check failed!')
  }

  createBackup()
}

export function getDatabase(): Database.Database {
  return db
}

// --- Work Logs CRUD ---

export interface WorkLog {
  id: number
  content: string
  category: string
  created_at: string
  task_id: number | null
}

function resolveWorkLogTaskId(taskId: number | null): number | null {
  if (taskId === null) return null
  const exists = db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId)
  return exists ? taskId : null
}

export function addWorkLog(
  content: string,
  category = '',
  taskId: number | null = null,
  createdAt?: string
): WorkLog {
  const resolvedTaskId = resolveWorkLogTaskId(taskId)
  if (createdAt) {
    const stmt = db.prepare(
      'INSERT INTO work_logs (content, category, task_id, created_at) VALUES (?, ?, ?, ?) RETURNING *'
    )
    return stmt.get(content, category, resolvedTaskId, createdAt) as WorkLog
  }

  const stmt = db.prepare(
    'INSERT INTO work_logs (content, category, task_id) VALUES (?, ?, ?) RETURNING *'
  )
  return stmt.get(content, category, resolvedTaskId) as WorkLog
}

export function getWorkLogs(limit = 200, offset = 0): WorkLog[] {
  const stmt = db.prepare(
    'SELECT * FROM work_logs ORDER BY created_at DESC LIMIT ? OFFSET ?'
  )
  return stmt.all(limit, offset) as WorkLog[]
}

export function getWorkLogsByDateRange(from: string, to: string): WorkLog[] {
  const stmt = db.prepare(
    'SELECT * FROM work_logs WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) ORDER BY created_at ASC'
  )
  return stmt.all(from, to) as WorkLog[]
}

export function searchWorkLogs(keyword: string, limit = 200): WorkLog[] {
  const stmt = db.prepare(
    'SELECT * FROM work_logs WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?'
  )
  return stmt.all(`%${keyword}%`, limit) as WorkLog[]
}

export function workLogExists(content: string, category: string, dateStr?: string): boolean {
  if (dateStr) {
    const stmt = db.prepare(
      'SELECT 1 FROM work_logs WHERE content = ? AND category = ? AND date(created_at) = date(?) LIMIT 1'
    )
    return !!stmt.get(content, category, dateStr)
  }
  const stmt = db.prepare(
    'SELECT 1 FROM work_logs WHERE content = ? AND category = ? LIMIT 1'
  )
  return !!stmt.get(content, category)
}

export function deleteWorkLog(id: number): boolean {
  const stmt = db.prepare('DELETE FROM work_logs WHERE id = ?')
  const result = stmt.run(id)
  return result.changes > 0
}

export function updateWorkLog(id: number, content: string, category: string, created_at?: string): WorkLog | null {
  if (created_at) {
    const stmt = db.prepare('UPDATE work_logs SET content = ?, category = ?, created_at = ? WHERE id = ? RETURNING *')
    return stmt.get(content, category, created_at, id) as WorkLog | null
  }
  const stmt = db.prepare('UPDATE work_logs SET content = ?, category = ? WHERE id = ? RETURNING *')
  return stmt.get(content, category, id) as WorkLog | null
}

export function restoreWorkLog(log: Pick<WorkLog, 'content' | 'category' | 'created_at' | 'task_id'>): WorkLog {
  return addWorkLog(log.content, log.category, log.task_id, log.created_at)
}

// --- Reports CRUD ---

export interface Report {
  id: number
  type: string
  date_from: string
  date_to: string
  content: string
  generated_at: string
}

export function saveReport(
  type: string,
  dateFrom: string,
  dateTo: string,
  content: string
): Report {
  const stmt = db.prepare(
    'INSERT INTO reports (type, date_from, date_to, content) VALUES (?, ?, ?, ?) RETURNING *'
  )
  return stmt.get(type, dateFrom, dateTo, content) as Report
}

export function getReports(limit = 50): Report[] {
  const stmt = db.prepare('SELECT * FROM reports ORDER BY generated_at DESC LIMIT ?')
  return stmt.all(limit) as Report[]
}

export function updateReportContent(id: number, content: string): Report | null {
  const stmt = db.prepare('UPDATE reports SET content = ? WHERE id = ? RETURNING *')
  return stmt.get(content, id) as Report | null
}

// --- Tasks CRUD ---

export interface Task {
  id: number
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'done' | 'draft'
  board_column: string
  position: number
  created_at: string
  updated_at: string
  completed_at: string | null
  due_date: string | null
}

export function addTask(title: string, description = '', status: 'todo' | 'draft' = 'todo', createdAt?: string): Task {
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 as next FROM tasks WHERE status = ?'
  ).get(status) as { next: number }

  if (createdAt) {
    const stmt = db.prepare(
      'INSERT INTO tasks (title, description, status, board_column, position, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
    )
    return stmt.get(title, description, status, status, maxPos.next, createdAt) as Task
  }

  const stmt = db.prepare(
    'INSERT INTO tasks (title, description, status, board_column, position) VALUES (?, ?, ?, ?, ?) RETURNING *'
  )
  return stmt.get(title, description, status, status, maxPos.next) as Task
}

export function getTasks(): Task[] {
  const stmt = db.prepare('SELECT * FROM tasks ORDER BY position ASC LIMIT 50000')
  return stmt.all() as Task[]
}

export function getTaskById(id: number): Task | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  return row ?? null
}

export function updateTask(
  id: number,
  updates: Partial<Pick<Task, 'title' | 'description' | 'status' | 'position' | 'due_date'>>
): Task | null {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.title !== undefined) {
    fields.push('title = ?')
    values.push(updates.title)
  }
  if (updates.description !== undefined) {
    fields.push('description = ?')
    values.push(updates.description)
  }
  if (updates.status !== undefined) {
    fields.push('status = ?', 'board_column = ?')
    values.push(updates.status, updates.status)
    if (updates.status === 'done') {
      fields.push("completed_at = datetime('now', 'localtime')")
    } else {
      fields.push('completed_at = NULL')
    }
  }
  if (updates.position !== undefined) {
    fields.push('position = ?')
    values.push(updates.position)
  }
  if (updates.due_date !== undefined) {
    fields.push('due_date = ?')
    values.push(updates.due_date)
  }

  fields.push("updated_at = datetime('now', 'localtime')")
  values.push(id)

  const stmt = db.prepare(
    `UPDATE tasks SET ${fields.join(', ')} WHERE id = ? RETURNING *`
  )
  return stmt.get(...values) as Task | null
}

export function deleteTask(id: number): boolean {
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?')
  return stmt.run(id).changes > 0
}

export function reorderTasks(taskIds: number[], status: string): void {
  const stmt = db.prepare(`
    UPDATE tasks
    SET
      position = ?,
      board_column = ?,
      status = ?,
      updated_at = datetime('now', 'localtime'),
      completed_at = CASE
        WHEN ? = 'done' AND completed_at IS NULL THEN datetime('now', 'localtime')
        WHEN ? != 'done' THEN NULL
        ELSE completed_at
      END
    WHERE id = ?
  `)
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, index) => {
      stmt.run(index, status, status, status, status, id)
    })
  })
  tx(taskIds)
}

// --- Settings CRUD ---

export interface DailyStats {
  date: string
  log_count: number
  task_completed: number
}

export function getStats(days = 30): {
  daily: DailyStats[]
  totalLogs: number
  totalTasksDone: number
  totalTasksActive: number
  streak: number
} {
  const daily = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as log_count, 0 as task_completed
    FROM work_logs
    WHERE created_at >= datetime('now', '-${days} days', 'localtime')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all() as DailyStats[]

  // Merge completed tasks per day
  const taskDone = db.prepare(`
    SELECT date(completed_at) as date, COUNT(*) as cnt
    FROM tasks
    WHERE completed_at IS NOT NULL AND completed_at >= datetime('now', '-${days} days', 'localtime')
    GROUP BY date(completed_at)
  `).all() as { date: string; cnt: number }[]

  const doneMap = new Map(taskDone.map((r) => [r.date, r.cnt]))
  for (const d of daily) {
    d.task_completed = doneMap.get(d.date) || 0
  }
  // Add days that only have completed tasks but no logs
  doneMap.forEach((cnt, date) => {
    if (!daily.find((d) => d.date === date)) {
      daily.push({ date, log_count: 0, task_completed: cnt })
    }
  })
  daily.sort((a, b) => a.date.localeCompare(b.date))

  const totalLogs = (db.prepare('SELECT COUNT(*) as c FROM work_logs').get() as { c: number }).c
  const totalTasksDone = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done'").get() as { c: number }).c
  const totalTasksActive = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('todo', 'in_progress')").get() as { c: number }).c

  // Calculate streak (consecutive days with logs ending today or yesterday)
  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const logDates = new Set(daily.map((d) => d.date))
  for (let i = 0; i <= days; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = formatLocalDate(d)
    if (logDates.has(dateStr)) {
      streak++
    } else if (i === 0) {
      // Today has no logs yet, that's ok, check from yesterday
      continue
    } else {
      break
    }
  }

  return { daily, totalLogs, totalTasksDone, totalTasksActive, streak }
}

export interface WeeklyReport {
  period: { start: string; end: string }
  summary: {
    totalLogs: number
    totalTasksDone: number
    totalTasksActive: number
    meetingsAttended: number
    activeDays: number
  }
  dailyBreakdown: Array<{
    date: string
    logs: number
    tasksDone: number
    meetings: number
    topCategories: Array<{ category: string; count: number }>
  }>
  highlights: string[] // top 3 most productive days
}

export function generateWeeklyReport(startDate: string, endDate: string): WeeklyReport {
  const logs = getWorkLogsByDateRange(startDate, endDate)
  const allTasks = getTasks()
  const events = getEventsByRange(startDate, endDate)
  const meetings = events.filter((e) => e.type === 'meeting')

  // Group logs by date
  const logsByDate = new Map<string, WorkLog[]>()
  for (const log of logs) {
    const date = log.created_at.slice(0, 10)
    const arr = logsByDate.get(date) || []
    arr.push(log)
    logsByDate.set(date, arr)
  }

  // Group completed tasks by date (within range)
  const tasksDoneByDate = new Map<string, number>()
  for (const task of allTasks) {
    if (task.status === 'done' && task.completed_at) {
      const date = task.completed_at.slice(0, 10)
      if (date >= startDate && date <= endDate) {
        tasksDoneByDate.set(date, (tasksDoneByDate.get(date) || 0) + 1)
      }
    }
  }

  // Group meetings by date
  const meetingsByDate = new Map<string, number>()
  for (const m of meetings) {
    meetingsByDate.set(m.event_date, (meetingsByDate.get(m.event_date) || 0) + 1)
  }

  // Build daily breakdown across the full date range
  const dailyBreakdown: WeeklyReport['dailyBreakdown'] = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = formatLocalDate(d)
    const dayLogs = logsByDate.get(dateStr) || []
    const logsCount = dayLogs.length
    const tasksDone = tasksDoneByDate.get(dateStr) || 0
    const meetingsCount = meetingsByDate.get(dateStr) || 0

    const catCounts = new Map<string, number>()
    for (const log of dayLogs) {
      const cat = log.category?.trim() || '未分类'
      catCounts.set(cat, (catCounts.get(cat) || 0) + 1)
    }
    const topCategories = [...catCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    dailyBreakdown.push({ date: dateStr, logs: logsCount, tasksDone, meetings: meetingsCount, topCategories })
  }

  const totalLogs = logs.length
  const totalTasksDone = [...tasksDoneByDate.values()].reduce((s, n) => s + n, 0)
  const totalTasksActive = allTasks.filter(
    (t) => t.status === 'todo' || t.status === 'in_progress'
  ).length
  const meetingsAttended = meetings.length
  const activeDays = dailyBreakdown.filter((d) => d.logs + d.tasksDone + d.meetings > 0).length

  // Highlights: top 3 most productive days by total activities
  const highlights = [...dailyBreakdown]
    .map((d) => ({ date: d.date, count: d.logs + d.tasksDone + d.meetings }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((d) => d.date)

  return {
    period: { start: startDate, end: endDate },
    summary: { totalLogs, totalTasksDone, totalTasksActive, meetingsAttended, activeDays },
    dailyBreakdown,
    highlights
  }
}

export function getAllWorkLogs(): WorkLog[] {
  return db.prepare('SELECT * FROM work_logs ORDER BY created_at DESC LIMIT 50000').all() as WorkLog[]
}

export function getCategories(): string[] {
  const rows = db.prepare(
    "SELECT DISTINCT category FROM work_logs WHERE category != '' ORDER BY category"
  ).all() as { category: string }[]
  return rows.map((r) => r.category)
}

export function updateWorkLogCategory(id: number, category: string): void {
  db.prepare('UPDATE work_logs SET category = ? WHERE id = ?').run(category, id)
}

export function getSetting(key: string): string | null {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  const row = stmt.get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  )
  stmt.run(key, value, value)
}

export function deleteSetting(key: string): void {
  const stmt = db.prepare('DELETE FROM settings WHERE key = ?')
  stmt.run(key)
}

// --- Calendar Events (todos & meetings) ---

export interface CalendarEvent {
  id: number
  type: 'todo' | 'meeting'
  title: string
  description: string
  event_date: string
  start_time: string | null
  end_time: string | null
  location: string
  completed: number
  created_at: string
}

export interface CalendarEventInput {
  type: 'todo' | 'meeting'
  title: string
  description?: string
  event_date: string
  start_time?: string | null
  end_time?: string | null
  location?: string
}

export function addEvent(input: CalendarEventInput): CalendarEvent {
  const stmt = db.prepare(
    `INSERT INTO calendar_events (type, title, description, event_date, start_time, end_time, location)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
  return stmt.get(
    input.type,
    input.title,
    input.description ?? '',
    input.event_date,
    input.start_time ?? null,
    input.end_time ?? null,
    input.location ?? ''
  ) as CalendarEvent
}

export function getEventsByDate(date: string): CalendarEvent[] {
  const stmt = db.prepare(
    `SELECT * FROM calendar_events WHERE event_date = ?
     ORDER BY completed ASC, type DESC, start_time IS NULL, start_time, id`
  )
  return stmt.all(date) as CalendarEvent[]
}

export function getEventsByRange(from: string, to: string): CalendarEvent[] {
  const stmt = db.prepare(
    `SELECT * FROM calendar_events WHERE event_date >= ? AND event_date <= ?
     ORDER BY event_date, start_time IS NULL, start_time, id`
  )
  return stmt.all(from, to) as CalendarEvent[]
}

export function updateEvent(id: number, updates: Partial<CalendarEventInput> & { completed?: boolean }): CalendarEvent | null {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
  if (updates.event_date !== undefined) { fields.push('event_date = ?'); values.push(updates.event_date) }
  if (updates.start_time !== undefined) { fields.push('start_time = ?'); values.push(updates.start_time) }
  if (updates.end_time !== undefined) { fields.push('end_time = ?'); values.push(updates.end_time) }
  if (updates.location !== undefined) { fields.push('location = ?'); values.push(updates.location) }
  if (updates.completed !== undefined) { fields.push('completed = ?'); values.push(updates.completed ? 1 : 0) }

  if (fields.length === 0) return getEventById(id)

  values.push(id)
  const stmt = db.prepare(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ? RETURNING *`)
  return stmt.get(...values) as CalendarEvent | null
}

export function getEventById(id: number): CalendarEvent | null {
  const stmt = db.prepare('SELECT * FROM calendar_events WHERE id = ?')
  return (stmt.get(id) as CalendarEvent | undefined) ?? null
}

export function deleteEvent(id: number): boolean {
  const stmt = db.prepare('DELETE FROM calendar_events WHERE id = ?')
  return stmt.run(id).changes > 0
}

/** 查询未来 leadMinutes 分钟内开始、尚未通知的会议 */
export function getDueMeetings(leadMinutes: number): CalendarEvent[] {
  const stmt = db.prepare(
    `SELECT * FROM calendar_events
     WHERE type = 'meeting' AND completed = 0 AND notified = 0 AND start_time IS NOT NULL
       AND datetime(event_date || ' ' || start_time) BETWEEN datetime('now', 'localtime')
           AND datetime('now', 'localtime', '+' || ? || ' minutes')
     ORDER BY event_date, start_time`
  )
  return stmt.all(String(leadMinutes)) as CalendarEvent[]
}

/** 标记已通知，返回 false 表示已被处理过（防重复推送） */
export function markEventNotified(id: number): boolean {
  const stmt = db.prepare('UPDATE calendar_events SET notified = 1 WHERE id = ? AND notified = 0')
  return stmt.run(id).changes > 0
}

// --- RSS Feed Categories CRUD ---

export function addFeedCategory(name: string): FeedCategory {
  const stmt = db.prepare(
    'INSERT INTO feed_categories (name) VALUES (?) RETURNING *'
  )
  return stmt.get(name) as FeedCategory
}

export function getFeedCategories(): FeedCategory[] {
  return db.prepare('SELECT * FROM feed_categories ORDER BY sort_order, name').all() as FeedCategory[]
}

export function updateFeedCategory(id: number, name: string): FeedCategory | null {
  const stmt = db.prepare('UPDATE feed_categories SET name = ? WHERE id = ? RETURNING *')
  return stmt.get(name, id) as FeedCategory | null
}

export function deleteFeedCategory(id: number): boolean {
  return db.prepare('DELETE FROM feed_categories WHERE id = ?').run(id).changes > 0
}

// --- RSS Feeds CRUD ---

export function addFeed(
  url: string,
  title: string | null,
  description: string | null,
  siteUrl: string | null,
  faviconUrl: string | null,
  categoryId: number | null
): Feed {
  const stmt = db.prepare(
    `INSERT INTO feeds (url, title, description, site_url, favicon_url, category_id)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  )
  return stmt.get(url, title, description, siteUrl, faviconUrl, categoryId) as Feed
}

export function getFeeds(): Feed[] {
  return db.prepare(
    `SELECT f.*, 
       (SELECT COUNT(*) FROM articles a WHERE a.feed_id = f.id AND a.is_read = 0) as unread_count
     FROM feeds f ORDER BY f.title`
  ).all() as Feed[]
}

export function getFeedById(id: number): Feed | null {
  const stmt = db.prepare('SELECT * FROM feeds WHERE id = ?')
  return (stmt.get(id) as Feed | undefined) ?? null
}

export function updateFeed(id: number, updates: Partial<Pick<Feed, 'title' | 'description' | 'site_url' | 'favicon_url' | 'category_id' | 'refresh_interval' | 'is_muted' | 'last_fetched_at'>>): Feed | null {
  const fields: string[] = []
  const values: unknown[] = []
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`)
    values.push(value)
  }
  if (fields.length === 0) return getFeedById(id)
  values.push(id)
  const stmt = db.prepare(`UPDATE feeds SET ${fields.join(', ')} WHERE id = ? RETURNING *`)
  return stmt.get(...values) as Feed | null
}

export function deleteFeed(id: number): boolean {
  return db.prepare('DELETE FROM feeds WHERE id = ?').run(id).changes > 0
}

export function getFeedByUrl(url: string): Feed | null {
  const stmt = db.prepare('SELECT * FROM feeds WHERE url = ?')
  return (stmt.get(url) as Feed | undefined) ?? null
}

// --- RSS Articles CRUD ---

export function addArticle(
  feedId: number,
  guid: string | null,
  title: string,
  url: string | null,
  author: string | null,
  content: string | null,
  summary: string | null,
  publishedAt: string | null
): Article | null {
  const stmt = db.prepare(
    `INSERT INTO articles (feed_id, guid, title, url, author, content, summary, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(feed_id, guid) DO UPDATE SET
       title = excluded.title, url = excluded.url, author = excluded.author,
       content = excluded.content, summary = excluded.summary, published_at = excluded.published_at
     RETURNING *`
  )
  return stmt.get(feedId, guid, title, url, author, content, summary, publishedAt) as Article | null
}

export function getArticles(
  feedId?: number,
  filter: 'all' | 'unread' | 'starred' = 'all',
  limit = 100,
  offset = 0
): Article[] {
  let where = 'WHERE 1=1'
  const params: unknown[] = []
  if (feedId) { where += ' AND a.feed_id = ?'; params.push(feedId) }
  if (filter === 'unread') { where += ' AND a.is_read = 0' }
  if (filter === 'starred') { where += ' AND a.is_starred = 1' }
  params.push(limit, offset)

  return db.prepare(
    `SELECT a.*, f.title as feed_title, f.favicon_url as feed_favicon_url
     FROM articles a
     JOIN feeds f ON f.id = a.feed_id
     ${where}
     ORDER BY a.published_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params) as Article[]
}

export function getArticleById(id: number): Article | null {
  const stmt = db.prepare(
    `SELECT a.*, f.title as feed_title, f.favicon_url as feed_favicon_url
     FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE a.id = ?`
  )
  return (stmt.get(id) as Article | undefined) ?? null
}

export function markArticleRead(id: number): Article | null {
  const stmt = db.prepare('UPDATE articles SET is_read = 1 WHERE id = ? RETURNING *')
  return stmt.get(id) as Article | null
}

export function markArticleUnread(id: number): Article | null {
  const stmt = db.prepare('UPDATE articles SET is_read = 0 WHERE id = ? RETURNING *')
  return stmt.get(id) as Article | null
}

export function toggleArticleStar(id: number): Article | null {
  const stmt = db.prepare('UPDATE articles SET is_starred = 1 - is_starred WHERE id = ? RETURNING *')
  return stmt.get(id) as Article | null
}

export function markAllRead(feedId?: number): void {
  if (feedId) {
    db.prepare('UPDATE articles SET is_read = 1 WHERE feed_id = ? AND is_read = 0').run(feedId)
  } else {
    db.prepare('UPDATE articles SET is_read = 1 WHERE is_read = 0').run()
  }
}
