/**
 * useStreamingReveal — 流式文字缓冲揭示 hook（v2 优化版）
 *
 * 解决 AI 流式输出时 markdown 渲染导致的布局抖动问题。
 *
 * v2 改进：
 * - 按行边界揭示：优先揭示完整行，避免 markdown 解析器在行中间反复重建 DOM
 * - 自适应速率：内容越长，每次揭示越多（追赶效应），防止 buffer 堆积
 * - 尾部延迟：接近 buffer 末尾时加速揭示，减少流式结束时的等待感
 *
 * 用法：
 *   const revealed = useStreamingReveal(fullContent, isStreaming);
 *   // revealed 是当前已揭示的完整文本，传给 <Message content={revealed} />
 */
import { useState, useEffect, useRef } from 'react';

interface UseStreamingRevealOptions {
  /** 基础揭示间隔 ms（默认 32，约 30fps） */
  intervalMs?: number;
  /** 最小每次揭示字符数（默认 4） */
  minCharsPerTick?: number;
  /** 最大每次揭示字符数（默认 32） */
  maxCharsPerTick?: number;
}

/**
 * 找到 content 中从 start 开始的最后一个完整行的结尾位置。
 * 优先在 \n 处断开，让 markdown 解析器看到完整行。
 * 如果 start 后没有换行，则按字符数截断（退化为字符模式）。
 */
function findSafeRevealEnd(content: string, start: number, maxLen: number): number {
  const searchEnd = Math.min(start + maxLen, content.length);
  // 在 [start, searchEnd) 范围内找最后一个换行
  const lastNewline = content.lastIndexOf('\n', searchEnd - 1);
  // 如果找到换行且在合理范围内（不超过一半 maxLen），优先在换行处断开
  if (lastNewline > start && lastNewline - start >= maxLen * 0.3) {
    return lastNewline + 1; // 包含换行符
  }
  // 没有合适的换行，按字符数截断
  return searchEnd;
}

export function useStreamingReveal(
  fullContent: string,
  isStreaming: boolean,
  options?: UseStreamingRevealOptions,
): string {
  const intervalMs = options?.intervalMs ?? 32;
  const minChars = options?.minCharsPerTick ?? 4;
  const maxChars = options?.maxCharsPerTick ?? 32;

  const [revealed, setRevealed] = useState('');
  const bufferRef = useRef('');
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef(0);

  // 外部内容变化时更新 buffer
  useEffect(() => {
    bufferRef.current = fullContent;
  }, [fullContent]);

  // 流式进行中：按固定节奏从 buffer 揭示文字
  useEffect(() => {
    if (!isStreaming) {
      setRevealed(fullContent);
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = (timestamp: number) => {
      if (timestamp - lastTickRef.current >= intervalMs) {
        lastTickRef.current = timestamp;
        setRevealed((prev) => {
          const target = bufferRef.current;
          if (prev.length >= target.length) return prev;

          const remaining = target.length - prev.length;
          // 自适应速率：内容越长，每次揭示越多（追赶效应）
          const progress = prev.length / Math.max(target.length, 1);
          const adaptiveChars = Math.round(minChars + (maxChars - minChars) * progress);
          // 接近尾尾时加速揭示
          const tailBonus = remaining < maxChars * 2 ? remaining * 0.3 : 0;
          const tickChars = Math.min(Math.round(adaptiveChars + tailBonus), remaining);

          // 按行边界揭示
          return target.slice(0, findSafeRevealEnd(target, prev.length, tickChars));
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isStreaming, fullContent, intervalMs, minChars, maxChars]);

  if (!isStreaming) return fullContent;
  return revealed;
}

export default useStreamingReveal;
