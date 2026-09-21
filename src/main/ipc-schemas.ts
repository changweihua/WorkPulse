/**
 * IPC Input Validation Schemas
 * Validates all renderer→main IPC parameters at the boundary.
 */
import { z } from 'zod';

// ─── Helper ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validate(schema: z.ZodTypeAny, data: unknown): any {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`参数验证失败: ${issues}`);
  }
  return result.data;
}

// ─── Error Extraction ──────────────────────────────────────────────────────

export function extractAiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = error as any;
    if (anyErr?.error?.message) return String(anyErr.error.message);
    if (anyErr?.response?.data?.error?.message) return String(anyErr.response.data.error.message);
    if (typeof anyErr.message === 'string') return anyErr.message;
  }
  if (typeof error === 'string') return error;
  return '未知错误';
}

// ─── AI Chat Schemas ───────────────────────────────────────────────────────

export const AiChatStreamSchema = z.object({
  userMessage: z.string().min(1).max(32000),
  history: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      }),
    )
    .max(200),
  config: z
    .object({
      id: z.string().optional(),
      baseURL: z.string().optional(),
      model: z.string().min(1).optional(),
      token: z.string().optional(),
      headers: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().min(1).max(128000).optional(),
      top_p: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export const AiStreamChatSchema = z.object({
  prompt: z.string().min(1).max(32000),
});

// ─── Worklog Schemas ───────────────────────────────────────────────────────

export const WorklogAddSchema = z.object({
  content: z.string().min(1).max(10000),
  category: z.string().max(100).optional(),
});

export const WorklogUpdateSchema = z.object({
  id: z.number().int().positive(),
  content: z.string().min(1).max(10000),
  category: z.string().max(100),
  created_at: z.string().optional(),
});

export const WorklogDeleteSchema = z.object({
  id: z.number().int().positive(),
});

// ─── Task Schemas ──────────────────────────────────────────────────────────

export const TaskAddSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: z.enum(['todo', 'draft']).optional(),
  createdAt: z.string().optional(),
});

export const TaskUpdateSchema = z.object({
  id: z.number().int().positive(),
  updates: z.record(z.string(), z.unknown()),
});

export const TaskDeleteSchema = z.object({
  id: z.number().int().positive(),
});

// ─── Settings Schemas ──────────────────────────────────────────────────────

export const SettingsSetSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string(),
});

export const SettingsGetSchema = z.object({
  key: z.string().min(1).max(200),
});

// ─── Event Schemas ─────────────────────────────────────────────────────────

export const EventAddSchema = z.record(z.string(), z.unknown());

export const EventDeleteSchema = z.object({
  id: z.number().int().positive(),
});

export const EventUpdateSchema = z.object({
  id: z.number().int().positive(),
  updates: z.record(z.string(), z.unknown()),
});

export const EventByDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const EventByRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ─── Worklog Extended Schemas ────────────────────────────────────────────────

export const WorklogListSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

export const WorklogByDateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const WorklogSearchSchema = z.object({
  keyword: z.string().min(1).max(500),
});

export const WorklogSetCategorySchema = z.object({
  id: z.number().int().positive(),
  category: z.string().max(100),
});

export const WorklogRestoreSchema = z.object({
  content: z.string().min(1).max(10000),
  category: z.string().max(100),
  created_at: z.string(),
  task_id: z.number().int().positive().nullable(),
});

// ─── Task Extended Schemas ───────────────────────────────────────────────────

export const TaskReorderSchema = z.object({
  taskIds: z.array(z.number().int().positive()),
  status: z.string().min(1),
});

export const TaskCompleteSchema = z.object({
  id: z.number().int().positive(),
  logContent: z.string().max(10000),
});

export const TaskCompleteOnlySchema = z.object({
  id: z.number().int().positive(),
});

// ─── Stats ───────────────────────────────────────────────────────────────────

export const StatsGetSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
});

// ─── Settings Extended Schemas ───────────────────────────────────────────────

export const SettingsDeleteSchema = z.object({
  key: z.string().min(1).max(200),
});

// ─── Report Schemas ──────────────────────────────────────────────────────────

export const ReportListSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});

export const ReportCreateSchema = z.object({
  type: z.string().min(1).max(50),
  dateFrom: z.string(),
  dateTo: z.string(),
  content: z.string().max(100000),
});

export const ReportUpdateSchema = z.object({
  id: z.number().int().positive(),
  content: z.string().max(100000),
});

export const ReportWeeklySchema = z.object({
  start: z.string(),
  end: z.string(),
});

// ─── Export Schemas ──────────────────────────────────────────────────────────

export const ExportLogsSchema = z.object({
  format: z.enum(['csv', 'markdown']),
});

export const ExportReportSchema = z.object({
  content: z.string().max(100000),
  dateRange: z.string().max(100),
});

// ─── LLM Token Schemas ──────────────────────────────────────────────────────

export const LlmTokenSchema = z.object({
  modelId: z.string().min(1),
});

export const LlmTokenSaveSchema = z.object({
  modelId: z.string().min(1),
  token: z.string().min(1),
});

// ─── Model Config Schemas ────────────────────────────────────────────────────

export const ModelSetActiveChatSchema = z.object({
  configId: z.string().min(1),
});

export const ModelDeleteChatConfigSchema = z.object({
  configId: z.string().min(1),
});

// ─── AI Extended Schemas ─────────────────────────────────────────────────────

export const AiChatCancelSchema = z.object({
  requestId: z.string().min(1),
});

// ─── Vector Schemas ──────────────────────────────────────────────────────────

export const VectorSearchSchema = z.object({
  query: z.string().min(1).max(1000),
  options: z
    .object({
      type: z.string().optional(),
      topK: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
});

export const VectorIndexWorklogSchema = z.object({
  id: z.number().int().positive(),
  content: z.string().min(1).max(10000),
});

export const VectorRemoveSchema = z.object({
  uri: z.string().min(1),
});

// ─── Feed Schemas ────────────────────────────────────────────────────────────

export const FeedAddSchema = z.object({
  url: z.string().url(),
  categoryId: z.number().int().positive().nullable().optional(),
});

export const FeedUpdateSchema = z.object({
  id: z.number().int().positive(),
  updates: z.record(z.string(), z.unknown()),
});

export const FeedDeleteSchema = z.object({
  id: z.number().int().positive(),
});

export const FeedRefreshSchema = z.object({
  id: z.number().int().positive(),
});

export const FeedImportOpmlSchema = z.object({
  xml: z.string().min(1),
});

export const FeedCategoryAddSchema = z.object({
  name: z.string().min(1).max(200),
});

export const FeedCategoryUpdateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

export const FeedCategoryDeleteSchema = z.object({
  id: z.number().int().positive(),
});

export const FeedArticlesListSchema = z.object({
  feedId: z.number().int().positive().optional(),
  filter: z.enum(['all', 'unread', 'starred']).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

export const FeedArticleActionSchema = z.object({
  id: z.number().int().positive(),
});

export const FeedArticlesReadAllSchema = z.object({
  feedId: z.number().int().positive().optional(),
});

export const FeedExportPdfSchema = z.object({
  html: z.string().max(1000000),
  title: z.string().min(1).max(500),
  metadata: z
    .object({
      feedTitle: z.string().optional(),
      author: z.string().optional(),
      publishedAt: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
});

// ─── Attachment Schemas ──────────────────────────────────────────────────────

export const AttachmentAddSchema = z.object({
  workLogId: z.number().int().positive(),
  type: z.enum(['file', 'screenshot', 'link']),
  originalName: z.string().min(1).max(500),
  filePath: z.string().optional(),
  base64Data: z.string().optional(),
  mimeType: z.string().max(100).optional(),
  url: z.string().optional(),
});

export const AttachmentListSchema = z.object({
  workLogId: z.number().int().positive(),
});

export const AttachmentDeleteSchema = z.object({
  id: z.number().int().positive(),
});

// ─── AutoLaunch / Window Schemas ─────────────────────────────────────────────

export const AutoLaunchSchema = z.object({
  enable: z.boolean(),
});

export const CloseActionSchema = z.object({
  action: z.enum(['minimize', 'quit', 'hide']),
});

export const WindowMaterialSchema = z.object({
  material: z.string().max(50),
});

// ─── Daily Summary ───────────────────────────────────────────────────────────

export const DailySummarySchema = z.object({
  days: z.number().int().min(1).max(30).optional(),
});

// ─── Notification ────────────────────────────────────────────────────────────

export const NotificationShowSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(1000),
  group: z.string().optional(),
  tag: z.string().optional(),
  urgency: z.enum(['normal', 'low', 'critical']).optional(),
  silent: z.boolean().optional(),
});

// ─── Radial ──────────────────────────────────────────────────────────────────

export const RadialSetEnabledSchema = z.object({
  enabled: z.boolean(),
});

export const RadialSetConfigSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
});

export const RadialGetFileIconSchema = z.object({
  filePath: z.string().min(1),
});

export const RadialLaunchProgramSchema = z.object({
  programPath: z.string().min(1),
});

// ─── Model Files ─────────────────────────────────────────────────────────────

export const ModelEnsureSchema = z.object({
  modelId: z.string().min(1),
  required: z.array(z.string()),
  optional: z.array(z.string()),
});

// ─── Shortcut ────────────────────────────────────────────────────────────────

export const ShortcutUpdateSchema = z.object({
  key: z.enum(['shortcut_quick_log', 'shortcut_quick_task']),
  value: z.string().min(1),
});

export const AppLanguageUpdateSchema = z.object({
  language: z.enum(['system', 'zh', 'en']),
});

export const DotnetInvokeSchema = z.object({
  method: z.string().min(1),
  args: z.array(z.unknown()).optional(),
});

export const ReadModelFileSchema = z.object({
  fileName: z.string().min(1),
});

export const RadialNavigateToSchema = z.object({
  page: z.string().min(1),
});

// ─── AI Usage Schemas ────────────────────────────────────────────────────────

export const AiUsageLogSchema = z.object({
  model_id: z.string().min(1),
  model_name: z.string().min(1),
  provider: z.string().optional(),
  usage_type: z.enum(['chat', 'report', 'ocr', 'onnx']),
  input_tokens: z.number().int().min(0).optional(),
  output_tokens: z.number().int().min(0).optional(),
  total_tokens: z.number().int().min(0).optional(),
  cost_usd: z.number().min(0).optional(),
  latency_ms: z.number().int().min(0).optional(),
  success: z.boolean().optional(),
  error_msg: z.string().optional(),
});

export const AiUsageDateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const AiUsageRecentSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
});

export const AiUsageCleanupSchema = z.object({
  daysToKeep: z.number().int().min(1).max(3650),
});

// ─── Screenshot Schemas ──────────────────────────────────────────────────────

export const ScreenshotCropSchema = z.object({
  rect: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  action: z.enum(['save', 'copy', 'both']).optional(),
  full: z.boolean().optional(),
});
