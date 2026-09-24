/**
 * Drizzle ORM 数据库初始化与导出
 *
 * 保留 better-sqlite3 底层实例以支持：
 * - WAL 模式设置
 * - PRAGMA 操作
 * - 完整性检查
 * - 备份
 * - vector-search.ts 的原始 SQL 查询
 *
 * Drizzle 实例用于类型安全的查询操作。
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, promises as fsp } from 'fs';
import log from 'electron-log/main';
import * as schema from './schema';

// ==================== 类型重导出 ====================

export type { schema };
export {
  workLogs,
  tasks,
  reports,
  settings,
  calendarEvents,
  feedCategories,
  feeds,
  articles,
  modelConfigs,
  aiUsageLogs,
  attachments as attachmentTable,
  worklogVectors,
  queryVectors,
} from './schema';

// ==================== 实例 ====================

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle>;

const DB_NAME = 'workpulse.db';

// ==================== 工具函数 ====================

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return join(userDataPath, DB_NAME);
}

function getBackupPath(): string {
  const userDataPath = app.getPath('userData');
  const backupDir = join(userDataPath, 'backups');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
  const date = formatLocalDate(new Date());
  return join(backupDir, `workpulse-${date}.db`);
}

function runIntegrityCheck(): boolean {
  try {
    const result = sqlite.pragma('integrity_check') as { integrity_check: string }[];
    return result[0]?.integrity_check === 'ok';
  } catch {
    return false;
  }
}

async function createBackup(): Promise<void> {
  const backupPath = getBackupPath();
  if (!existsSync(backupPath)) {
    try {
      sqlite.pragma('wal_checkpoint(TRUNCATE)');
      await fsp.copyFile(getDbPath(), backupPath);
    } catch {
      // 备份失败不阻塞启动
    }
  }
}

// ==================== 表创建（使用 Drizzle SQL 模板） ====================

import { sql } from 'drizzle-orm';

function createTables(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS work_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      task_id INTEGER,
      vector_synced_at TEXT DEFAULT NULL,
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
      notified INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS model_configs (
      id TEXT PRIMARY KEY,
      config_type TEXT NOT NULL CHECK(config_type IN ('chat', 'embedding')),
      name TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      model_name TEXT NOT NULL DEFAULT '',
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 4096,
      top_p REAL DEFAULT 0.9,
      top_k INTEGER DEFAULT 50,
      prompt TEXT DEFAULT '',
      stream INTEGER DEFAULT 1,
      dimension INTEGER DEFAULT 1536,
      headers TEXT DEFAULT '',
      is_active INTEGER DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      daily_limit INTEGER NOT NULL DEFAULT 0,
      quota_group TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      billing_type TEXT NOT NULL DEFAULT 'calls',
      token_quota INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_model_configs_type ON model_configs(config_type);
    CREATE INDEX IF NOT EXISTS idx_model_configs_active ON model_configs(is_active, config_type);

    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id      TEXT NOT NULL,
      model_name    TEXT NOT NULL,
      provider      TEXT NOT NULL DEFAULT '',
      usage_type    TEXT NOT NULL DEFAULT 'chat',
      input_tokens  INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens  INTEGER DEFAULT 0,
      cost_usd      REAL DEFAULT 0,
      latency_ms    INTEGER DEFAULT 0,
      success       INTEGER DEFAULT 1,
      error_msg     TEXT,
      created_at    TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_ai_usage_date  ON ai_usage_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage_logs(model_id);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_type  ON ai_usage_logs(usage_type);

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

    CREATE TABLE IF NOT EXISTS worklog_vectors (
      worklog_id INTEGER PRIMARY KEY,
      embedding TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS query_vectors (
      query_text TEXT PRIMARY KEY,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
}

// ==================== 迁移（保留原有逻辑，渐进替换） ====================

function runMigrations(): void {
  const colInfo = sqlite.prepare("PRAGMA table_info('tasks')").all() as { name: string }[];
  const hasDueDate = colInfo.some((c) => c.name === 'due_date');

  const tableInfo = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")
    .get() as { sql: string } | undefined;
  if (tableInfo?.sql && !tableInfo.sql.includes("'draft'")) {
    const dueDateSelect = hasDueDate ? 'due_date' : 'NULL as due_date';
    sqlite.exec(`
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
        id, title, description, status, board_column, position,
        created_at, updated_at, completed_at, due_date
      )
      SELECT
        id, title, description, status, board_column, position,
        created_at, updated_at, completed_at,
        ${dueDateSelect}
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);
    return;
  }

  if (!hasDueDate) {
    sqlite.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT DEFAULT NULL');
  }

  const evInfo = sqlite.prepare("PRAGMA table_info('calendar_events')").all() as { name: string }[];
  if (!evInfo.some((c) => c.name === 'notified')) {
    sqlite.exec('ALTER TABLE calendar_events ADD COLUMN notified INTEGER NOT NULL DEFAULT 0');
  }

  const wlInfo = sqlite.prepare("PRAGMA table_info('work_logs')").all() as { name: string }[];
  if (!wlInfo.some((c) => c.name === 'vector_synced_at')) {
    sqlite.exec('ALTER TABLE work_logs ADD COLUMN vector_synced_at TEXT DEFAULT NULL');
  }

  const mcInfo = sqlite.prepare("PRAGMA table_info('model_configs')").all() as { name: string }[];
  if (!mcInfo.some((c) => c.name === 'daily_limit')) {
    sqlite.exec('ALTER TABLE model_configs ADD COLUMN daily_limit INTEGER NOT NULL DEFAULT 0');
  }
  if (!mcInfo.some((c) => c.name === 'quota_group')) {
    sqlite.exec("ALTER TABLE model_configs ADD COLUMN quota_group TEXT NOT NULL DEFAULT ''");
  }
  if (!mcInfo.some((c) => c.name === 'provider')) {
    sqlite.exec("ALTER TABLE model_configs ADD COLUMN provider TEXT NOT NULL DEFAULT ''");
  }
  if (!mcInfo.some((c) => c.name === 'billing_type')) {
    sqlite.exec("ALTER TABLE model_configs ADD COLUMN billing_type TEXT NOT NULL DEFAULT 'calls'");
  }
  if (!mcInfo.some((c) => c.name === 'token_quota')) {
    sqlite.exec('ALTER TABLE model_configs ADD COLUMN token_quota INTEGER NOT NULL DEFAULT 0');
  }
}

// ==================== 初始化 ====================

/**
 * 启动延迟窗口（毫秒）：app ready 后延迟该时长再执行
 * 完整性校验 / 每日备份 / 自动向量索引等重任务，避免阻塞启动
 */
export const STARTUP_DEFER_MS = 15_000;

/** 读取 settings KV（复用现有 settings 表，不新建表） */
function readSettingValue(key: string): string | null {
  const row = sqlite
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/** 写入 settings KV（upsert） */
function writeSettingValue(key: string, value: string): void {
  sqlite
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value);
}

/**
 * 延迟窗口内执行的启动检查：
 * 1. 全库 PRAGMA integrity_check（settings KV 做 24h 门控，electron-log 记录结果与耗时）
 * 2. 每日备份（文件名按日期天然门控）
 */
function runDeferredStartupChecks(): void {
  // 完整性校验 24h 门控：未到间隔则跳过，校验本身与失败语义不变
  const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const lastRun = Number(readSettingValue('integrity_check_last_run') ?? 0);
  const now = Date.now();
  if (!Number.isFinite(lastRun) || now - lastRun >= CHECK_INTERVAL_MS) {
    const start = Date.now();
    const ok = runIntegrityCheck();
    const elapsed = Date.now() - start;
    if (ok) {
      log.info(`Database integrity check ok in ${elapsed}ms`);
      // 仅成功才记录门控时间：失败时下次启动重跑，保持与原“每次启动都校验”一致的失败语义
      writeSettingValue('integrity_check_last_run', String(now));
    } else {
      // 保持原有失败语义
      log.error('Database integrity check failed!');
    }
  }

  // 每日备份（异步拷贝，失败不阻塞）
  void createBackup();
}

export function initDatabase(): void {
  const dbPath = getDbPath();
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });

  createTables();
  runMigrations();

  // 完整性校验 + 每日备份移到 app ready 后约 15s 的延迟窗口执行，不阻塞启动
  setTimeout(() => {
    runDeferredStartupChecks();
  }, STARTUP_DEFER_MS);
}

/** 获取底层 better-sqlite3 实例（用于 PRAGMA、备份、原始 SQL） */
export function getDatabase(): Database.Database {
  return sqlite;
}

/** 获取 Drizzle 实例（用于类型安全查询） */
export function getDrizzleDb() {
  return db;
}

export { sql };
