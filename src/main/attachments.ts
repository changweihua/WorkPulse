import { app, protocol, dialog, BrowserWindow } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, copyFileSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { getDatabase } from './db';
import { showNotification } from './notification';
import { guardedHandle, guardedQuery } from './ipc-guard';
import { ok } from '../shared/ipc-result';
import { AttachmentAddSchema, AttachmentListSchema, AttachmentDeleteSchema } from './ipc-schemas';

const ATTACHMENTS_DIR = join(app.getPath('userData'), 'attachments');

// Ensure base directory exists
if (!existsSync(ATTACHMENTS_DIR)) {
  mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

export interface Attachment {
  id: number;
  work_log_id: number;
  type: 'file' | 'screenshot' | 'link';
  original_name: string;
  stored_path: string | null;
  mime_type: string | null;
  url: string | null;
  file_size: number | null;
  thumbnail_path: string | null;
  created_at: string;
}

// CRUD functions — 使用 getDatabase() 获取底层 better-sqlite3 实例执行原始 SQL

export function addAttachment(params: {
  workLogId: number;
  type: 'file' | 'screenshot' | 'link';
  originalName: string;
  storedPath?: string;
  mimeType?: string;
  url?: string;
  fileSize?: number;
  thumbnailPath?: string;
}): Attachment {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO attachments (work_log_id, type, original_name, stored_path, mime_type, url, file_size, thumbnail_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    params.workLogId,
    params.type,
    params.originalName,
    params.storedPath ?? null,
    params.mimeType ?? null,
    params.url ?? null,
    params.fileSize ?? null,
    params.thumbnailPath ?? null,
  );
  return db
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(result.lastInsertRowid) as Attachment;
}

export function getAttachmentsByLogId(workLogId: number): Attachment[] {
  const db = getDatabase();
  return db
    .prepare('SELECT * FROM attachments WHERE work_log_id = ? ORDER BY created_at ASC')
    .all(workLogId) as Attachment[];
}

export function deleteAttachment(id: number): boolean {
  const db = getDatabase();
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
    | Attachment
    | undefined;
  if (!attachment) return false;

  // Delete file from disk if exists
  if (attachment.stored_path) {
    const fullPath = join(ATTACHMENTS_DIR, attachment.stored_path);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  return true;
}

export function deleteAttachmentsByLogId(workLogId: number): void {
  const attachments = getAttachmentsByLogId(workLogId);
  for (const att of attachments) {
    if (att.stored_path) {
      const fullPath = join(ATTACHMENTS_DIR, att.stored_path);
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }
    }
  }
  const db = getDatabase();
  db.prepare('DELETE FROM attachments WHERE work_log_id = ?').run(workLogId);
}

// Register custom protocol for serving attachment files
export function registerAttachmentProtocol(): void {
  protocol.registerFileProtocol('appattachment', (request, callback) => {
    const filePath = join(
      ATTACHMENTS_DIR,
      decodeURIComponent(request.url.replace('appattachment://', '')),
    );
    const normalized = filePath.replace(/\\/g, '/').normalize();
    if (!normalized.startsWith(ATTACHMENTS_DIR.replace(/\\/g, '/').normalize())) {
      callback({ statusCode: 403 });
      return;
    }
    callback({ path: filePath });
  });
}

// Register IPC handlers (call from main init)
export function registerAttachmentIPC(): void {
  guardedHandle('attachment:add', AttachmentAddSchema, async (data) => {
    let storedPath: string | undefined;
    let fileSize: number | undefined;

    if (data.type === 'file' && data.filePath) {
      const ext = data.originalName.split('.').pop() || 'bin';
      const uuid = randomUUID();
      const relativePath = `${data.workLogId}/${uuid}.${ext}`;
      const dirPath = join(ATTACHMENTS_DIR, String(data.workLogId));
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
      copyFileSync(data.filePath, join(ATTACHMENTS_DIR, relativePath));
      storedPath = relativePath;
      try {
        fileSize = readFileSync(join(ATTACHMENTS_DIR, relativePath)).length;
      } catch {
        fileSize = undefined;
      }
    } else if (data.type === 'screenshot' && data.base64Data) {
      const ext = data.mimeType?.split('/')[1] || 'png';
      const uuid = randomUUID();
      const relativePath = `${data.workLogId}/${uuid}.${ext}`;
      const dirPath = join(ATTACHMENTS_DIR, String(data.workLogId));
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
      const buffer = Buffer.from(data.base64Data, 'base64');
      writeFileSync(join(ATTACHMENTS_DIR, relativePath), buffer);
      storedPath = relativePath;
      fileSize = buffer.length;
    }

    const result = addAttachment({
      workLogId: data.workLogId,
      type: data.type,
      originalName: data.originalName,
      storedPath,
      mimeType: data.mimeType,
      url: data.url,
      fileSize,
    });
    showNotification({
      title: '附件已添加',
      body: data.originalName,
      tag: 'attachment-add',
      group: 'workpulse',
    });
    return ok(result);
  });

  guardedHandle('attachment:list', AttachmentListSchema, (data) => {
    return ok(getAttachmentsByLogId(data.workLogId));
  });

  guardedHandle('attachment:delete', AttachmentDeleteSchema, (data) => {
    return ok(deleteAttachment(data.id));
  });

  guardedQuery('attachment:pickFile', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: '选择附件',
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled) return ok(null);
    return ok(
      result.filePaths.map((fp) => ({
        path: fp,
        name: fp.split(/[/\\]/).pop() || 'unknown',
      })),
    );
  });
}
