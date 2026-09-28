/**
 * 构建期常量：构建 ID。
 *
 * 由 `electron.vite.config.ts` 的 main 构建 `define.__BUILD_ID__` 在打包时
 * 替换为 `Date.now().toString(36)`（每次构建生成一次，仅 main 构建注入）。
 *
 * 用途：让 `src/main/integrityCheck.ts` 区分「重新构建/升级」与
 * 「同一次构建产物被篡改」——记录里的 buildId 与当前值不一致即刷新基准哈希，
 * 只有 buildId 与版本都一致时哈希不同才判定为篡改。
 *
 * 运行时若因异常未注入，代码内用 `typeof __BUILD_ID__ === 'string'` 兜底。
 */
declare const __BUILD_ID__: string;
