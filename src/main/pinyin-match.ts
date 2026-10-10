/**
 * 主进程拼音匹配工具
 *
 * 与渲染层 src/renderer/src/utils/pinyin.ts 的 pinyinIncludes 语义保持一致：
 * 支持全拼、首字母缩写、带/不带音调，大小写不敏感，ü 可用 v 替代。
 *
 * 这里不直接引用渲染层文件，是为了避免主进程（node 环境）与渲染层（浏览器环境）
 * 的构建边界互相纠缠，仅保留一个薄封装。
 */
import { match } from 'pinyin-pro';

/**
 * 判断 text 是否存在与 query 的拼音匹配。
 *
 * @param text 原始文本（可中英混排）
 * @param query 查询关键词（中文或拼音，如「日志」「rz」「ri zhi」）
 * @returns 存在命中返回 true，否则 false
 *
 * @example
 * pinyinIncludes('今日完成日志', 'rizhi') // true
 * pinyinIncludes('今日完成日志', 'xyz') // false
 */
export function pinyinIncludes(text: string, query: string): boolean {
  if (!text || !query.trim()) return false;
  const indexes = match(text, query.trim(), {
    // 大小写不敏感，兼顾英文子串与拼音输入
    insensitive: true,
    // 「lü」写作「lv」也能命中
    v: true,
  });
  return !!indexes && indexes.length > 0;
}
