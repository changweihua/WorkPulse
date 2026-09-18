import { app, protocol, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { showNotification } from './notification'
import { guardedHandle, guardedQuery } from './ipc-guard'
import { ok } from '../shared/ipc-result'
import { AttachmentAddSchema, AttachmentListSchema, AttachmentDeleteSchema } from './ipc-schemas'

const ATTACHMENTS_DIR = join(app.getPath('userData'), 'attachments')

// Ensure base directory exists
if (!existsSync(ATTACHMENTS_DIR)) {
  mkdirSync(ATTACHMENTS_DIR, { recursive: true })
}

export interface Attachment {
  id: number
  work_log_id: number
  type: 'file' | 'screenshot' | 'link'
  original_name: string
  stored_path: string | null
  mime_type: string | null
  url: string | null
  file_size: number | null
  thumbnail_path: string | null
  created_at: string
}

// Initialize DB table (call from db.ts createTables or here)
export function createAttachmentTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_log_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('file', 'screenshot', 'link')),
      original_name TEXT NOT NULL,
      stored_path TEXT,
      mime_type TEXT,
      url TEXT,
      file_size INTEGER,
      thumbnail_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (work_log_id) REFERENCES work_logs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_work_log ON attachments(work_log_id);
  `)
}

// CRUD functions
export function addAttachment(db: Database.Database, params: {
  workLogId: number
  type: 'file' | 'screenshot' | 'link'
  originalName: string
  storedPath?: string
  mimeType?: string
  url?: string
  fileSize?: number
  thumbnailPath?: string
}): Attachment {
  const stmt = db.prepare(`
    INSERT INTO attachments (work_log_id, type, original_name, stored_path, mime_type, url, file_size, thumbnail_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    params.workLogId, params.type, params.originalName,
    params.storedPath ?? null, params.mimeType ?? null,
    params.url ?? null, params.fileSize ?? null, params.thumbnailPath ?? null
  )
  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.lastInsertRowid) as Attachment
}

export function getAttachmentsByLogId(db: Database.Database, workLogId: number): Attachment[] {
  return db.prepare('SELECT * FROM attachments WHERE work_log_id = ? ORDER BY created_at ASC').all(workLogId) as Attachment[]
}

export function deleteAttachment(db: Database.Database, id: number): boolean {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Attachment | undefined
  if (!attachment) return false

  // Delete file from disk if exists
  if (attachment.stored_path) {
    const fullPath = join(ATTACHMENTS_DIR, attachment.stored_path)
    if (existsSync(fullPath)) {
      unlinkSync(fullPath)
    }
  }

  db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
  return true
}

export function deleteAttachmentsByLogId(db: Database.Database, workLogId: number): void {
  const attachments = getAttachmentsByLogId(db, workLogId)
  for (const att of attachments) {
    if (att.stored_path) {
      const fullPath = join(ATTACHMENTS_DIR, att.stored_path)
      if (existsSync(fullPath)) {
        unlinkSync(fullPath)
      }
    }
  }
  db.prepare('DELETE FROM attachments WHERE work_log_id = ?').run(workLogId)
}

// Register custom protocol for serving attachment files
export function registerAttachmentProtocol(): void {
  protocol.registerFileProtocol('appattachment', (request, callback) => {
    const filePath = join(ATTACHMENTS_DIR, decodeURIComponent(request.url.replace('appattachment://', '')))
    const normalized = filePath.replace(/\\/g, '/').normalize()
    if (!normalized.startsWith(ATTACHMENTS_DIR.replace(/\\/g, '/').normalize())) {
      callback({ statusCode: 403 })
      return
    }
    callback({ path: filePath })
  })
}

// Register IPC handlers (call from main init)
export function registerAttachmentIPC(db: Database.Database): void {
  guardedHandle('attachment:add', AttachmentAddSchema, async (data) => {
    let storedPath: string | undefined
    let fileSize: number | undefined

    if (data.type === 'file' && data.filePath) {
      const ext = data.originalName.split('.').pop() || 'bin'
      const uuid = randomUUID()
      const relativePath = `${data.workLogId}/${uuid}.${ext}`
      const dirPath = join(ATTACHMENTS_DIR, String(data.workLogId))
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
      copyFileSync(data.filePath, join(ATTACHMENTS_DIR, relativePath))
      storedPath = relativePath
      try {
        fileSize = readFileSync(join(ATTACHMENTS_DIR, relativePath)).length
      } catch {
        fileSize = undefined
      }
    } else if (data.type === 'screenshot' && data.base64Data) {
      const ext = data.mimeType?.split('/')[1] || 'png'
      const uuid = randomUUID()
      const relativePath = `${data.workLogId}/${uuid}.${ext}`
      const dirPath = join(ATTACHMENTS_DIR, String(data.workLogId))
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
      const buffer = Buffer.from(data.base64Data, 'base64')
      writeFileSync(join(ATTACHMENTS_DIR, relativePath), buffer)
      storedPath = relativePath
      fileSize = buffer.length
    }

    const result = addAttachment(db, {
      workLogId: data.workLogId,
      type: data.type,
      originalName: data.originalName,
      storedPath,
      mimeType: data.mimeType,
      url: data.url,
      fileSize,
    })
    showNotification({
      title: '附件已添加',
      body: data.originalName,
      tag: 'attachment-add',
      group: 'workpulse',
    })
    return ok(result)
  })

  guardedHandle('attachment:list', AttachmentListSchema, (data) => {
    return ok(getAttachmentsByLogId(db, data.workLogId))
  })

  guardedHandle('attachment:delete', AttachmentDeleteSchema, (data) => {
    return ok(deleteAttachment(db, data.id))
  })

  guardedQuery('attachment:pickFile', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: '选择附件',
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return ok(null)
    return ok(result.filePaths.map(fp => ({
      path: fp,
      name: fp.split(/[/\\]/).pop() || 'unknown',
    })))
  })
}
