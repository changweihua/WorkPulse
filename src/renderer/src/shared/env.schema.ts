import { z } from 'zod';

// 定义各环境变量及其校验规则
export const envSchema = z.object({
    // ---------- 公共变量 ----------
    VITE_APP_TITLE: z
        .string()
        .default('My Electron App')
        .describe('应用标题，显示在窗口标题栏'),

    // ---------- 主进程专用 (MAIN_VITE_) ----------
    MAIN_VITE_PORT: z
        .string()
        .transform((val) => parseInt(val, 10))
        .pipe(
            z.number()
                .int()
                .positive({ message: '端口号必须为正整数' })
                .max(65535, { message: '端口号不能超过 65535' })
                .default(3000)
        )
        .describe('主进程 HTTP 服务端口'),

    MAIN_VITE_API_URL: z
        .string()
        .url({ message: 'API URL 格式不正确，需包含协议' })
        .default('https://api.example.com')
        .describe('后端 API 基础地址'),

    MAIN_VITE_LOG_LEVEL: z
        .enum(['debug', 'info', 'warn', 'error'])
        .default('info')
        .describe('日志输出级别'),

    // ---------- 渲染进程专用 (RENDERER_VITE_) ----------
    RENDERER_VITE_GA_ID: z
        .string()
        .optional()
        .describe('Google Analytics 追踪 ID（可选）'),

    RENDERER_VITE_FEATURE_FLAG: z
        .string()
        .transform((val) => val === 'true' || val === '1')
        .pipe(z.boolean().default(false))
        .describe('特性开关示例，如启用新UI'),

    // 复杂校验示例：若 API_URL 是 localhost，则强制使用特定端口
}).superRefine((data, ctx) => {
    if (data.MAIN_VITE_API_URL.includes('localhost')) {
        // 可选：额外校验，但这里仅做演示
    }
});

// 导出类型
export type Env = z.infer<typeof envSchema>;