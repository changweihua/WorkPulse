import { type ReactNode } from 'react';
import { pinyinMatchIndexes } from '../../utils/pinyin';
import './Highlight.css';

/** 高亮区间，end 为开区间（即 [start, end)） */
export interface HighlightRange {
  start: number;
  end: number;
}

interface HighlightProps {
  /** 原始文本 */
  text: string;
  /** 查询关键词（中文或拼音） */
  query: string;
  /** 额外类名 */
  className?: string;
}

/**
 * 计算 text 中被 query 命中的高亮区间。
 *
 * 匹配优先级：
 * 1. 直接子串匹配（大小写不敏感）——命中即返回单个区间；
 * 2. 拼音匹配（utils/pinyin.ts）——命中的离散下标合并为连续区间。
 *
 * @param text 原始文本
 * @param query 查询关键词（中文或拼音）
 * @returns 升序的区间数组，end 为开区间；无命中返回空数组
 *
 * @example
 * getHighlightRanges('WorkLog', 'log') // [{ start: 4, end: 7 }]
 * getHighlightRanges('工作日志', 'rz') // [{ start: 2, end: 4 }]
 */
export function getHighlightRanges(text: string, query: string): HighlightRange[] {
  if (!text || !query.trim()) return [];

  // 1. 直接子串匹配（大小写不敏感）
  const lowerText = text.toLowerCase();
  const lowerQuery = query.trim().toLowerCase();
  const directIndex = lowerText.indexOf(lowerQuery);
  if (directIndex >= 0) {
    return [{ start: directIndex, end: directIndex + lowerQuery.length }];
  }

  // 2. 拼音匹配：离散下标 → 连续区间
  const indexes = pinyinMatchIndexes(text, query);
  if (!indexes || indexes.length === 0) return [];

  const ranges: HighlightRange[] = [];
  let start = indexes[0];
  let prev = indexes[0];
  for (let i = 1; i < indexes.length; i++) {
    const cur = indexes[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push({ start, end: prev + 1 });
    start = cur;
    prev = cur;
  }
  ranges.push({ start, end: prev + 1 });
  return ranges;
}

/**
 * 搜索关键词高亮组件。
 *
 * 把 text 按命中区间拆成 React 节点数组，命中部分包裹 `<mark class="highlight">`，
 * 其余为普通文本节点。全程纯 React 渲染，不使用 v-html / dangerouslySetInnerHTML。
 * query 为空或无命中时原样渲染。
 */
export function Highlight({ text, query, className }: HighlightProps): ReactNode {
  const ranges = getHighlightRanges(text, query);
  if (ranges.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, i) => {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }
    nodes.push(
      <mark key={`hl-${i}`} className="highlight">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return <span className={className}>{nodes}</span>;
}

export default Highlight;
