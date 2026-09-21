/**
 * Drizzle ORM Schema — WorkPulse 数据库表定义
 *
 * 所有表结构从现有 CREATE TABLE 语句迁移而来，保持字段名、类型、约束完全一致。
 * 使用 snake_case 列名（与 SQLite 原始列名匹配），TypeScript 属性用 camelCase。
 */
import { int, integer, real, text, sqliteTable, index } from 'drizzle-orm/sqlite-core';

// ==================== 工作日志 ====================

export const workLogs = sqliteTable(
  'work_logs',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    content: text('content').notNull(),
    category: text('category').default(''),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    taskId: int('task_id'),
    vectorSyncedAt: text('vector_synced_at'),
  },
  (t) => [index('idx_work_logs_created_at').on(t.createdAt)],
);

// ==================== 任务 ====================

export const tasks = sqliteTable(
  'tasks',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description').default(''),
    status: text('status', {
      enum: ['todo', 'in_progress', 'done', 'draft'],
    })
      .notNull()
      .default('todo'),
    boardColumn: text('board_column').notNull().default('todo'),
    position: int('position').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    completedAt: text('completed_at'),
    dueDate: text('due_date'),
  },
  (t) => [index('idx_tasks_status').on(t.status)],
);

// ==================== 报告 ====================

export const reports = sqliteTable(
  'reports',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    dateFrom: text('date_from').notNull(),
    dateTo: text('date_to').notNull(),
    content: text('content').notNull(),
    generatedAt: text('generated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('idx_reports_dates').on(t.dateFrom, t.dateTo)],
);

// ==================== 设置（KV） ====================

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ==================== 日历事件 ====================

export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['todo', 'meeting'] }).notNull(),
    title: text('title').notNull(),
    description: text('description').default(''),
    eventDate: text('event_date').notNull(),
    startTime: text('start_time'),
    endTime: text('end_time'),
    location: text('location').default(''),
    completed: int('completed').notNull().default(0),
    notified: int('notified').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('idx_calendar_events_date').on(t.eventDate)],
);

// ==================== RSS 分类 ====================

export const feedCategories = sqliteTable('feed_categories', {
  id: int('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ==================== RSS 源 ====================

export const feeds = sqliteTable(
  'feeds',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    url: text('url').notNull().unique(),
    title: text('title'),
    description: text('description'),
    siteUrl: text('site_url'),
    faviconUrl: text('favicon_url'),
    categoryId: int('category_id').references(() => feedCategories.id, {
      onDelete: 'set null',
    }),
    refreshInterval: int('refresh_interval').notNull().default(3600),
    lastFetchedAt: text('last_fetched_at'),
    isMuted: int('is_muted').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('idx_feeds_category').on(t.categoryId)],
);

// ==================== RSS 文章 ====================

export const articles = sqliteTable(
  'articles',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    feedId: int('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    guid: text('guid'),
    title: text('title').notNull(),
    url: text('url'),
    author: text('author'),
    content: text('content'),
    summary: text('summary'),
    publishedAt: text('published_at'),
    isRead: int('is_read').notNull().default(0),
    isStarred: int('is_starred').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('idx_articles_feed').on(t.feedId),
    index('idx_articles_published').on(t.publishedAt),
    index('idx_articles_read').on(t.isRead),
    index('idx_articles_starred').on(t.isStarred),
  ],
);

// ==================== AI 模型配置 ====================

export const modelConfigs = sqliteTable(
  'model_configs',
  {
    id: text('id').primaryKey(),
    configType: text('config_type', { enum: ['chat', 'embedding'] }).notNull(),
    name: text('name').notNull().default(''),
    baseUrl: text('base_url').notNull().default(''),
    modelName: text('model_name').notNull().default(''),
    temperature: real('temperature').default(0.7),
    maxTokens: int('max_tokens').default(4096),
    topP: real('top_p').default(0.9),
    topK: int('top_k').default(50),
    prompt: text('prompt').default(''),
    stream: int('stream').default(1),
    dimension: int('dimension').default(1536),
    headers: text('headers').default(''),
    isActive: int('is_active').default(0),
    sortOrder: int('sort_order').notNull().default(0),
    dailyLimit: int('daily_limit').notNull().default(0),
    quotaGroup: text('quota_group').notNull().default(''),
    provider: text('provider').notNull().default(''),
    billingType: text('billing_type').notNull().default('calls'),
    tokenQuota: int('token_quota').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index('idx_model_configs_type').on(t.configType),
    index('idx_model_configs_active').on(t.isActive, t.configType),
  ],
);

// ==================== AI 用量日志 ====================

export const aiUsageLogs = sqliteTable(
  'ai_usage_logs',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    modelId: text('model_id').notNull(),
    modelName: text('model_name').notNull(),
    provider: text('provider').notNull().default(''),
    usageType: text('usage_type').notNull().default('chat'),
    inputTokens: int('input_tokens').default(0),
    outputTokens: int('output_tokens').default(0),
    totalTokens: int('total_tokens').default(0),
    costUsd: real('cost_usd').default(0),
    latencyMs: int('latency_ms').default(0),
    success: int('success').default(1),
    errorMsg: text('error_msg'),
    createdAt: text('created_at').default(
      // drizzle 不支持 SQL 函数作为 default，使用应用层注入
      '',
    ),
  },
  (t) => [
    index('idx_ai_usage_date').on(t.createdAt),
    index('idx_ai_usage_model').on(t.modelId),
    index('idx_ai_usage_type').on(t.usageType),
  ],
);

// ==================== 附件 ====================

export const attachments = sqliteTable(
  'attachments',
  {
    id: int('id').primaryKey({ autoIncrement: true }),
    workLogId: int('work_log_id')
      .notNull()
      .references(() => workLogs.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['file', 'screenshot', 'link'] }).notNull(),
    originalName: text('original_name').notNull(),
    storedPath: text('stored_path'),
    mimeType: text('mime_type'),
    url: text('url'),
    fileSize: int('file_size'),
    thumbnailPath: text('thumbnail_path'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('idx_attachments_work_log').on(t.workLogId)],
);

// ==================== 向量索引（保留原始结构，Drizzle 不做查询） ====================

export const worklogVectors = sqliteTable('worklog_vectors', {
  worklogId: int('worklog_id').primaryKey(),
  embedding: text('embedding').notNull(),
  contentHash: text('content_hash').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const queryVectors = sqliteTable('query_vectors', {
  queryText: text('query_text').primaryKey(),
  embedding: text('embedding').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
