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
      })
    )
    .max(200),
  config: z.object({
    id: z.string().optional(),
    baseURL: z.string().optional(),
    model: z.string().min(1).optional(),
    token: z.string().optional(),
    headers: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().min(1).max(128000).optional(),
    top_p: z.number().min(0).max(1).optional(),
  }).optional(),
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
