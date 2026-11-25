import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * 渲染层单元测试配置。
 * 只扫描 tests/unit， Electron 主进程 / E2E 脚本不进 Vitest，
 * 避免把 electron、better-sqlite3 这类原生模块拉进 jsdom。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    // Electron 主进程相关的纯逻辑测试在文件头加 `// @vitest-environment node`
  },
});
