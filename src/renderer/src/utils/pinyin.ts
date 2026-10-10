import { match, pinyin } from 'pinyin-pro';

/**
 * 计算 query 在 text 中的拼音命中下标。
 *
 * 封装 pinyin-pro 的 `match()`：支持全拼、首字母缩写、带/不带音调，
 * 且大小写不敏感（`insensitive`）、ü 可用 v 替代（`v`）。
 *
 * @param text 原始文本（可中英混排）
 * @param query 查询关键词（中文或拼音，如「日志」「rz」「ri zhi」）
 * @returns 命中的字符下标数组（升序、去重）；未命中或 query 为空返回 null
 *
 * @example
 * pinyinMatchIndexes('工作日志', 'rz') // [2, 3]
 * pinyinMatchIndexes('工作日志', 'abc') // null
 */
export function pinyinMatchIndexes(text: string, query: string): number[] | null {
  if (!text || !query.trim()) return null;
  const indexes = match(text, query.trim(), {
    // 大小写不敏感，兼顾英文子串与拼音输入
    insensitive: true,
    // 「lü」写作「lv」也能命中
    v: true,
  });
  if (!indexes || indexes.length === 0) return null;
  // match 返回的下标已按 text 顺序排列，这里再做一次升序去重兜底
  return Array.from(new Set(indexes)).sort((a, b) => a - b);
}

/**
 * 判断 text 是否存在与 query 的拼音匹配。
 *
 * @param text 原始文本
 * @param query 查询关键词（中文或拼音）
 * @returns 存在命中返回 true，否则 false
 *
 * @example
 * pinyinIncludes('工作日志', 'gongzuo') // true
 * pinyinIncludes('工作日志', 'xyz') // false
 */
export function pinyinIncludes(text: string, query: string): boolean {
  return pinyinMatchIndexes(text, query) !== null;
}

/**
 * 获取无音调的全拼，拼音之间以空格分隔（非汉字字符原样保留）。
 *
 * 供 LIKE 查询、拼音倒排索引等只需要「纯拼音串」的场景使用。
 *
 * @param text 原始文本
 * @returns 空格分隔的无音调全拼字符串
 *
 * @example
 * toPinyin('工作日志') // 'gong zuo ri zhi'
 */
export function toPinyin(text: string): string {
  if (!text) return '';
  return pinyin(text, {
    toneType: 'none',
    type: 'string',
    separator: ' ',
  });
}
