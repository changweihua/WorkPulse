import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SPRING_SPRING } from './Motion';
import { HardwareStatusRing } from './HardwareStatusRing';
// 径向 overlay 专用 token 层：本组件跑在独立透明窗口（radial.html → radial-entry.tsx），
// 该窗口只加载 radial-only.css、不加载 index.css，也没有 .dark / data-accent，
// 因此由 RadialTheme.css 提供同名语义 token；HardwareStatusRing 也在首帧 getComputedStyle 读取它。
// 必须在首次渲染前完成注入 → 放在组件模块顶层 import。
import './RadialTheme.css';

/* ── 尺寸参数（所有派生值均从这里计算，无硬编码） ── */
const OUTER_R = 94;
const INNER_R = 38;
const GAP_PX = 3;
const CENTER_R = 24;
const WIDGET_SIZE = 206;
const CX = WIDGET_SIZE / 2;
const CY = WIDGET_SIZE / 2;
const ICON_R = (INNER_R + OUTER_R) / 2; // 图标中心半径 = 66
const TOOLTIP_R = CENTER_R + 12; // tooltip 半径，在中心和环之间
const EXPANDED_CLIP_R = OUTER_R + GAP_PX + 2; // clip-path 展开半径 = 99
const ICON_SIZE = 24; // 图标渲染尺寸
const ICON_CONTAINER = 40; // 图标容器尺寸

// WorkPulse program icon (base64 encoded SVG)
const ICON_SVG = `data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/PjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+PHN2ZyB0PSIxNzg0MDg1MDIzMjc1IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjI0Mzk3IiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgd2lkdGg9IjI1NiIgaGVpZ2h0PSIyNTYiPjxwYXRoIGQ9Ik02NTEuNjEwOTA5IDEwMjMuOTkySDI3OS4yNzc4MThsOS4yNTU5MjgtNC42Mzk5NjRhMTg2LjE1ODU0NiAxODYuMTU4NTQ2IDAgMCAwIDEwMC4wOTUyMTgtMTM0LjIwNjk1MWwxOC44NzE4NTItMTA3LjAzOTE2NGE5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAxIDkyLjE1OTI4LTc5LjkzNTM3NUg2MTcuNDM1MTc2YzQ2LjMxOTYzOCAwIDg1LjU5OTMzMSAzNC4wNzk3MzQgOTIuMTU5MjggNzkuOTM1Mzc1bDM0LjE1OTczMyAxMzkuNjMwOTA5YzcuMjc5OTQzIDUwLjg5NTYwMi0yOC4wODc3ODEgOTguMDQ3MjM0LTc4Ljk4MzM4MyAxMDUuMzE5MTc3LTQuMzU5OTY2IDAuNjIzOTk1LTguNzU5OTMyIDAuOTM1OTkzLTEzLjE2Nzg5NyAwLjkzNTk5M3oiIGZpbGw9IiM5OTlBQUMiIHAtaWQ9IjI0Mzk4Ij48L3BhdGg+PHBhdGggZD0iTTc0Mi4yOTgyMDEgOTExLjczNjg3N2wtMy44NjM5Ny0xNS44MTU4NzYtNS40Nzk5NTctMjIuMzY3ODI2LTYuMjcxOTUxLTI1LjYzMTc5OS02LjI3MTk1MS0yNS42Mzk4LTUuNDc5OTU3LTIyLjM2NzgyNS0zLjg2Mzk3LTE1LjgwNzg3Ny0xLjQ3MTk4OS01Ljk5OTk1M2E5My4wOTUyNzMgOTMuMDk1MjczIDAgMCAwLTkyLjE1OTI4LTc5LjkzNTM3NWgtMi41NTk5OGEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAwIDAgNDYuNTUxNjM2aDIuNTU5OThhNDYuNzY3NjM1IDQ2Ljc2NzYzNSAwIDAgMSA0Ni4wNzk2NCAzOS45NTk2ODhjMC4yMTU5OTggMS41MDM5ODggMC41MDM5OTYgMi45OTk5NzcgMC44NzE5OTMgNC40Nzk5NjVsMzMuNTM1NzM4IDEzNy4wNDY5MjlhNDYuNTU5NjM2IDQ2LjU1OTYzNiAwIDAgMS00Ni4zMTE2MzggNTEuMjM5NkgyNTUuOTk4QTIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDAgMjU1Ljk5OCAxMDIzLjk5MmgzOTUuNjEyOTA5YzUxLjM4MzU5OSAwLjAzMiA5My4wNzEyNzMtNDEuNTk5Njc1IDkzLjEwMzI3My05Mi45NzUyNzQgMC00LjQ0Nzk2NS0wLjMxOTk5OC04Ljg3OTkzMS0wLjk0Mzk5My0xMy4yNzk4OTZsLTEuNDcxOTg4LTUuOTk5OTUzeiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQzOTkiPjwvcGF0aD48cGF0aCBkPSJNNDg4LjcxNjE4MiA3NDQuNzE0MTgyaDkzLjEwMzI3M2E2OS44MjM0NTUgNjkuODIzNDU1IDAgMCAxIDAgMTM5LjYzODkwOUg0ODguNzE2MTgyYTY5LjgyMzQ1NSA2OS44MjM0NTUgMCAwIDEgMC0xMzkuNjMwOTA5eiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQ0MDAiPjwvcGF0aD48cGF0aCBkPSJNOTMuMDk1MjczIDBoODM3LjgwMTQ1NEM5ODIuMzEyMzI2IDAgMTAyMy45OTIgNDEuNjc5Njc0IDEwMjMuOTkyIDkzLjA5NTI3M3Y2MDUuMDc1MjczYzAgNTEuNDE1NTk4LTQxLjY3OTY3NCA5My4wOTUyNzMtOTMuMDk1MjczIDkzLjA5NTI3Mkg5My4wOTUyNzNDNDEuNjc5Njc0IDc5MS4yNzM4MTggMCA3NDkuNTk0MTQ0IDAgNjk4LjE3MDU0NlY5My4wOTUyNzNDMCA0MS42Nzk2NzQgNDEuNjc5Njc0IDAgOTMuMDk1MjczIDB6IiBmaWxsPSIjOTk5QUFDIiBwLWlkPSIyNDQwMSI+PC9wYXRoPjxwYXRoIGQ9Ik05My4wOTUyNzMgMGg2OTguMTcwNTQ1YzUxLjQxNTU5OCAwIDkzLjA4NzI3MyA0MS42Nzk2NzQgOTMuMDg3MjczIDkzLjA5NTI3M3Y2MDUuMDc1MjczYzAgNTEuNDE1NTk4LTQxLjY3OTY3NCA5My4wOTUyNzMtOTMuMDg3MjczIDkzLjA5NTI3Mkg5My4wOTUyNzNDNDEuNjc5Njc0IDc5MS4yNzM4MTggMCA3NDkuNTk0MTQ0IDAgNjk4LjE3MDU0NlY5My4wOTUyNzNDMCA0MS42Nzk2NzQgNDEuNjc5Njc0IDAgOTMuMDk1MjczIDB6IiBmaWxsPSIjQ0FDQUQ0IiBwLWlkPSIyNDQwMiI+PC9wYXRoPjxwYXRoIGQ9Ik05MjkuNTkyNzM4IDIyLjkxOTgyMWE0Ny43NTk2MjcgNDcuNzU5NjI3IDAgMCAwLTcuODM5OTM5IDAuNjYzOTk1IDQ3LjMzNTYzIDQ3LjMzNTYzIDAgMCAwLTM4LjYyMzY5OCA1NC4zMTk1NzV2MC4wMzJsMC4wMTU5OTkgMC4wOCAwLjI4Nzk5OCAxLjg5NTk4NSAwLjE3NTk5OSAxLjA3OTk5MWMwLjA0IDAuNDYzOTk2IDAuMDc5OTk5IDAuOTI3OTkzIDAuMTQzOTk5IDEuMzk5OTg5IDAuMjU1OTk4IDIuMzExOTgyIDAuNDMxOTk3IDQuNjM5OTY0IDAuNTI3OTk2IDcuMDA3OTQ2bDAuMDA3OTk5IDAuMTU5OTk4djAuMDA4bDAuMDA4IDAuMTUxOTk5djAuMDI0bDAuMDA4IDAuMTQzOTk5djAuMDE2bDAuMDE2IDAuNjU1OTk1djAuMDE1OTk5bDAuMDA4IDAuMTUxOTk5djAuMTk5OTk5bDAuMDA4IDAuMTE5OTk5djAuNjk1OTk0bDAuMDE2IDAuMDMydjYwNy42MjcyNTNsLTAuMDA4IDAuMTAzOTk5djAuMzM1OTk3bC0wLjAwOCAwLjEyNzk5OVY3MDAuMjkwNTI5bC0wLjAwOCAwLjEzNTk5OXYwLjE2Nzk5OWwtMC4wMDggMC4yNzE5OTd2MC4wMjRsLTAuMDA4IDAuMTM1OTk5VjcwMS4zMzA1MjFsLTAuMDI0IDAuMjg3OTk4djAuMzExOTk3bC0wLjAxNTk5OSAwLjE0Mzk5OXYwLjI5NTk5OGEzLjU4Mzk3MiAzLjU4Mzk3MiAwIDAgMC0wLjAyNCAwLjI5NTk5N3YwLjAwOGMtMC4zNDM5OTcgNy4zNTk5NDMtMS41Njc5ODggMTQuNjQ3ODg2LTMuNjM5OTcyIDIxLjcxOTgzMWE0Ni41NTE2MzYgNDYuNTUxNjM2IDAgMCAwIDg5LjMzNTMwMiAyNi4xNjc3OTVjNC45ODM5NjEtMTcuMDE1ODY3IDcuNTExOTQxLTM0LjY1NTcyOSA3LjUwMzk0Mi01Mi4zOTE1OVY5My4wOTUyNzNjMC03LjA3OTk0NS0wLjM5OTk5Ny0xNC4xNTE4ODktMS4xOTk5OTEtMjEuMTc1ODM1YTU0LjQ3OTU3NCA1NC40Nzk1NzQgMCAwIDAtMC4yNzE5OTgtMi4wMTU5ODQgNTEuOTU5NTk0IDUxLjk1OTU5NCAwIDAgMC0wLjM3NTk5Ny0zLjA2Mzk3NmwtMC43ODM5OTQtNS4wNTU5NjFhNDUuNzc1NjQyIDQ1Ljc3NTY0MiAwIDAgMC00NS4yMzE2NDYtMzguODYzNjk2eiIgZmlsbD0iIzdDN0Y5NSIgcC1pZD0iMjQ0MDMiPjwvcGF0aD48cGF0aCBkPSJNNzkxLjI3MzgxOCAwSDkzLjA4NzI3M0M0MS42Nzk2NzQgMCAwIDQxLjY3OTY3NCAwIDkzLjA4NzI3M3Y1MTEuOTk2aDg4NC4zNjEwOTF2LTUxMS45OTZDODg0LjM2MTA5MSA0MS42Nzk2NzQgODQyLjY4MTQxNyAwIDc5MS4yNjU4MTggMHoiIGZpbGw9IiMyQzJGNTMiIHAtaWQ9IjI0NDA0Ij48L3BhdGg+PHBhdGggZD0iTTQ2NS40NTIzNjQgNjk4LjE3MDU0NmE0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMSAxLTkzLjA4NzI3MyAwIDQ2LjU0MzYzNiA0Ni41NDM2MzYgMCAxIDEgOTMuMDg3MjczIDB6IiBmaWxsPSIjNEM0RjZFIiBwLWlkPSIyNDQwNSI+PC9wYXRoPjxwYXRoIGQ9Ik05NTQuMTY4NTQ2IDEzOS42MzA5MDlhMjMuMjc5ODE4IDIzLjI3OTgxOCAwIDAgMSAyMy4yNzk4MTggMjMuMjc5ODE4djIzMi43MTgxODJhMjMuMjcxODE4IDIzLjI3MTgxOCAwIDEgMS00Ni41NTE2MzcgMHYtMjMyLjcxODE4MmEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAxIDIzLjI3OTgxOC0yMy4yNzk4MTh6IiBmaWxsPSIjMkMyRjUzIiBwLWlkPSIyNDQwNiI+PC9wYXRoPjxwYXRoIGQ9Ik02OS44MjM0NTUgNjA1LjA5MTI3M2g3NDQuNzE0MTgxYTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMCA0Ni41MzU2MzZINjkuODIzNDU1YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMC00Ni41MzU2MzZ6IiBmaWxsPSIjRUFFQUVFIiBwLWlkPSIyNDQwNyI+PC9wYXRoPjxwYXRoIGQ9Ik05My4wOTUyNzMgNDY1LjQ1MjM2NGg2OTguMTcwNTQ1YTQ2LjU1MTYzNiA0Ni41NTE2MzYgMCAwIDEgMCA5My4wODcyNzJIOTMuMDk1MjczYTQ2LjU0MzYzNiA0Ni41NDM2MzYgMCAwIDEgMC05My4wODcyNzJ6IiBmaWxsPSIjNEM0RjZFIiBwLWlkPSIyNDQwOCI+PC9wYXRoPjxwYXRoIGQ9Ik0xMzkuNjMwOTA5IDQxOC45MDA3MjdhNDYuNTQzNjM2IDQ2LjU0MzYzNiAwIDEgMSAwIDkzLjA5NTI3MyA0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMCAxIDAtOTMuMDk1MjczeiIgZmlsbD0iIzExQ0JFNSIgcC1pZD0iMjQ0MDkiPjwvcGF0aD48cGF0aCBkPSJNMTE2LjM2NzA5MSA0MTguOTAwNzI3YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEtMC4wMDggNDYuNTQzNjM3IDIzLjI3MTgxOCAyMy4yNzE4MTggMCAwIDEgMC00Ni41NDM2Mzd6IiBmaWxsPSIjQkNGNEY1IiBwLWlkPSIyNDQxMCI+PC9wYXRoPjxwYXRoIGQ9Ik0zMjUuODIxNDU1IDQxOC45MDA3MjdhNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDEgMS0wLjAxNiA5My4xMDMyNzMgNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDAgMSAwLjAxNi05My4xMDMyNzN6IiBmaWxsPSIjOTFFREY4IiBwLWlkPSIyNDQxMSI+PC9wYXRoPjxwYXRoIGQ9Ik01MTEuOTk2IDQxOC45MDA3MjdhNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDEgMS0wLjAwOCA5My4xMDMyNzNBNDYuNTUxNjM2IDQ2LjU1MTYzNiAwIDAgMSA1MTEuOTk2IDQxOC45MDA3Mjd6IiBmaWxsPSIjRkRCOEJGIiBwLWlkPSIyNDQxMiI+PC9wYXRoPjxwYXRoIGQ9Ik02OTguMTcwNTQ2IDQxOC45MDA3MjdhNDYuNTQzNjM2IDQ2LjU0MzYzNiAwIDEgMSAwIDkzLjA5NTI3MyA0Ni41NDM2MzYgNDYuNTQzNjM2IDAgMCAxIDAtOTMuMDk1MjczeiIgZmlsbD0iI0ZBNDY1OSIgcC1pZD0iMjQ0MTMiPjwvcGF0aD48cGF0aCBkPSJNNDg4LjcxNjE4MiA0MTguOTAwNzI3YTIzLjI3OTgxOCAyMy4yNzk4MTggMCAxIDEgMCA0Ni41NTk2MzcgMjMuMjc5ODE4IDIzLjI3OTgxOCAwIDAgMSAwLTQ2LjU1OTYzN3pNNjc0Ljg5ODcyNyA0MTguOTAwNzI3YTIzLjI3MTgxOCAyMy4yNzE4MTggMCAxIDEgMCA0Ni41NDM2MzcgMjMuMjcxODE4IDIzLjI3MTgxOCAwIDAgMSAwLTQ2LjU0MzYzN3oiIGZpbGw9IiNGRURFRTEiIHAtaWQ9IjI0NDE0Ij48L3BhdGg+PHBhdGggZD0iTTMwMi41NDE2MzYgNDE4LjkwMDcyN2EyMy4yNzk4MTggMjMuMjc5ODE4IDAgMSAxIDAgNDYuNTU5NjM3IDIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDEgMC00Ni41NTk2Mzd6IiBmaWxsPSIjRTlGRkY1IiBwLWlkPSIyNDQxNSI+PC9wYXRoPjxwYXRoIGQ9Ik0yMDkuNDU0MzY0IDk3Ny40NDgzNjRoMjMyLjcxODE4MmEyMy4yNzk4MTggMjMuMjc5ODE4IDAgMCAxIDAgNDYuNTQzNjM2aC0yMzIuNzE4MTgyYTIzLjI3OTgxOCAyMy4yNzk4MTggMCAwIDEgMC00Ni41NDM2MzZ6IiBmaWxsPSIjQ0FDQUQ0IiBwLWlkPSIyNDQxNiI+PC9wYXRoPjwvc3ZnPg==`;

const TOOLTIP_LABELS: Record<string, { zh: string; en: string }> = {
  log: { zh: '日志', en: 'Work Log' },
  task: { zh: '任务', en: 'Task' },
  ai: { zh: 'AI 生成', en: 'AI Generate' },
  screenshot: { zh: '截图', en: 'Screenshot' },
  settings: { zh: '设置', en: 'Settings' },
};

const CENTER_SIZE = CENTER_R * 2;

/**
 * 中心按钮字形开关（临时隐藏）：false = 不渲染中心按钮内部的图标。
 * 隐藏对象有两枚，代码全部原样保留在下方 <AnimatePresence> 里，日后想恢复改回 true 即可：
 *   ① 收起态 logo（ICON_SVG 的 motion.img）—— 会与状态环新加的中部图标叠在一起；
 *   ② 展开态 ✕ 关闭字形（motion.svg，stroke 走 var(--color-radial-icon)）。
 * 只控制字形显隐：玻璃底（backdropFilter / border / 渐变）、点击、拖拽、光标判定全部不受影响。
 */
const SHOW_CENTER_GLYPH: boolean = false;

interface RadialItem {
  key: string;
  label: string;
  emoji?: string;
  icon?: string; // base64 data URL for program icons
  angle: number;
  route?: string; // for builtin navigation items
  type?: 'builtin' | 'program';
  programPath?: string; // for program items
}

// Default builtin items — angles evenly distributed
const BUILTIN_ITEMS: RadialItem[] = [
  { key: 'log', label: 'Work Log', emoji: '📝', angle: -90, route: 'worklog', type: 'builtin' },
  { key: 'task', label: 'Task', emoji: '📋', angle: -18, route: 'kanban', type: 'builtin' },
  { key: 'ai', label: 'AI Generate', emoji: '🤖', angle: 90, route: 'chat', type: 'builtin' },
  { key: 'screenshot', label: 'Screenshot', emoji: '📸', angle: 162, route: '', type: 'builtin' },
  {
    key: 'settings',
    label: 'Settings',
    emoji: '⚙️',
    angle: 234,
    route: 'settings',
    type: 'builtin',
  },
];

/**
 * 混合方案：Meel 原则 + DOM 交互
 *
 * - 窗口创建一次复用（Meel 原则）
 * - focusable:false + alwaysOnTop re-assert（Meel 原则）
 * - 光标轮询做 hover 高亮（Meel 原则）
 * - DOM 事件处理点击/拖拽（与 Meel 的全局 hook 不同）
 * - clip-path 圆形揭示动画（视觉效果）
 */
export function RadialMenu(): ReactNode {
  const [hovered, setHovered] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState<Record<string, boolean> | null>(null);
  const expandedRef = useRef(false);

  // ─── 主题标记：硬件状态推送里带 theme → 挂 .hw-dark 到根元素 ───
  //（RadialTheme.css 的暗色变体靠这个类落位：玻璃底 / 扇区染色的暗色 token 全部挂在 .hw-dark 下，
  //  不挂类则一律走亮色默认值。仅做标记，硬件数据本体由 HardwareStatusRing 自行订阅。）
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const cleanup = window.radialApi.onHwStats((s) => setDark(s.theme === 'dark'));
    return cleanup;
  }, []);

  const gapOuterDeg = (GAP_PX / OUTER_R) * (180 / Math.PI);
  const gapInnerDeg = (GAP_PX / INNER_R) * (180 / Math.PI);

  // Dynamic items: builtin defaults + custom programs loaded from config
  const [allItems, setAllItems] = useState<RadialItem[]>(BUILTIN_ITEMS);

  // Ref: 让 hover/click 回调始终读到最新的可见项列表（避免 useEffect([]) 闭包陈旧）
  const visibleItemsRef = useRef<RadialItem[]>(allItems);

  // ─── 可见项：过滤 + 重新均匀分布角度（核心修复：角度基于 visibleItems 而非 allItems） ───
  const visibleItems = useMemo(() => {
    const filtered = config ? allItems.filter((item) => config[item.key] !== false) : allItems;
    // 重新均匀分配角度，确保关掉几个后剩余项仍然均匀分布
    return filtered.map((item, i) => ({
      ...item,
      angle: filtered.length > 0 ? (360 / filtered.length) * i - 90 : item.angle,
    }));
  }, [config, allItems]);

  const visibleCount = visibleItems.length;
  const segAngle = visibleCount > 0 ? 360 / visibleCount : 72;

  // 保持 ref 同步（渲染期间禁止写 ref，改为在提交后的 effect 中同步）
  useEffect(() => {
    visibleItemsRef.current = visibleItems;
  }, [visibleItems]);

  // ─── 加载配置（控制扇区可见性 + 合并自定义程序项目） ───
  useEffect(() => {
    window.radialApi.getConfig().then((cfg) => {
      if (!cfg) return;

      const c = cfg as any;
      const BUILTIN_KEYS = new Set(BUILTIN_ITEMS.map((b) => b.key));

      // Format 1: Array of RadialMenuItem objects (from Settings page)
      if (Array.isArray(c)) {
        const vis: Record<string, boolean> = {};
        const programs: RadialItem[] = [];
        const builtinOverrides: Partial<Record<string, { label?: string; emoji?: string }>> = {};

        for (const entry of c) {
          if (entry.key && typeof entry.enabled === 'boolean') {
            vis[entry.key] = entry.enabled;
            if (BUILTIN_KEYS.has(entry.key) && entry.label) {
              builtinOverrides[entry.key] = { label: entry.label, emoji: entry.emoji };
            }
          }
          if (entry.type === 'program' && entry.programPath) {
            programs.push({
              key: entry.key,
              label: entry.label ?? entry.key,
              emoji: entry.emoji,
              icon: entry.icon,
              angle: 0,
              type: 'program',
              programPath: entry.programPath,
            });
          }
        }

        const merged = BUILTIN_ITEMS.map((b) => ({
          ...b,
          ...builtinOverrides[b.key],
        })).concat(programs);

        merged.forEach((item, i) => {
          item.angle = (360 / merged.length) * i - 90;
        });

        setAllItems(merged);
        setConfig(vis);
        return;
      }

      // Format 2: Plain boolean map (legacy { key: boolean })
      if (typeof c === 'object') {
        setAllItems(BUILTIN_ITEMS);
        setConfig(c as Record<string, boolean>);
      }
    });
  }, []);

  // ─── 监听配置变更（设置页保存后实时刷新菜单） ───
  useEffect(() => {
    const cleanup = window.radialApi.onConfigChanged?.((inlineData?: unknown) => {
      // 优先使用事件携带的内联数据，避免重新 fetch 的竞态
      const processConfig = (cfg: unknown): void => {
        if (!cfg) return;
        const c = cfg as any;
        const BUILTIN_KEYS = new Set(BUILTIN_ITEMS.map((b) => b.key));

        if (Array.isArray(c)) {
          const vis: Record<string, boolean> = {};
          const programs: RadialItem[] = [];
          const builtinOverrides: Partial<Record<string, { label?: string; emoji?: string }>> = {};

          for (const entry of c) {
            if (entry.key && typeof entry.enabled === 'boolean') {
              vis[entry.key] = entry.enabled;
              if (BUILTIN_KEYS.has(entry.key) && entry.label) {
                builtinOverrides[entry.key] = { label: entry.label, emoji: entry.emoji };
              }
            }
            if (entry.type === 'program' && entry.programPath) {
              programs.push({
                key: entry.key,
                label: entry.label ?? entry.key,
                emoji: entry.emoji,
                icon: entry.icon,
                angle: 0,
                type: 'program',
                programPath: entry.programPath,
              });
            }
          }

          const merged = BUILTIN_ITEMS.map((b) => ({
            ...b,
            ...builtinOverrides[b.key],
          })).concat(programs);

          merged.forEach((item, i) => {
            item.angle = (360 / merged.length) * i - 90;
          });

          setAllItems(merged);
          setConfig(vis);
        }
      };

      if (inlineData !== undefined) {
        processConfig(inlineData);
      } else {
        // 兜底：如果没有内联数据，重新 fetch
        window.radialApi.getConfig().then(processConfig);
      }
    });
    return () => cleanup?.();
  }, []);

  // ─── 监听主进程状态（展开/收起） ───
  useEffect(() => {
    const handler = (info: any) => {
      expandedRef.current = info.expanded;
      setExpanded(info.expanded);
      if (!info.expanded) setHovered(null);
    };
    const cleanup = window.radialApi.onState(handler);
    return cleanup;
  }, []);

  // ─── 光标轮询 hover 高亮（Meel 原则） ───
  // 使用 visibleItemsRef 避免 useEffect([]) 闭包陈旧，始终检测当前可见项
  useEffect(() => {
    const handler = (info: any) => {
      if (!expandedRef.current) {
        setHovered(null);
        return;
      }
      const dx = info.x - CX;
      const dy = info.y - CY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < INNER_R || dist > OUTER_R) {
        setHovered(null);
        return;
      }
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      const items = visibleItemsRef.current;
      const curSegAngle = items.length > 0 ? 360 / items.length : 72;
      let bestKey: string | null = null;
      let bestDist = Infinity;
      for (const item of items) {
        // 将 itemAngle 归一化到 [0, 360)，防止负角度与接近 360° 的光标角度
        // 计算 Math.abs 后产生 >360 的值，导致 360 - diff 出现负数
        const itemAngle = ((item.angle % 360) + 360) % 360;
        let diff = Math.abs(angle - itemAngle);
        if (diff > 180) diff = 360 - diff;
        if (diff < curSegAngle / 2 && diff < bestDist) {
          bestDist = diff;
          bestKey = item.key;
        }
      }
      setHovered(bestKey);
    };
    const cleanup = window.radialApi.onCursor(handler);
    return cleanup;
  }, []);

  // ─── 中心按钮：mousedown/mouseup 交互，5px 阈值区分点击与拖拽 ───
  // 收起态：移动 >5px 拖拽窗口，≤5px 展开；展开态 ✕：≤5px 收起，>5px 无操作 ───
  const isDraggingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleCenterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    let totalDist = 0;
    const isExpanded = expandedRef.current;

    // 收起态：开始拖拽跟踪；展开态：✕ 按钮不可拖动
    if (!isExpanded) {
      isDraggingRef.current = false;
      window.radialApi.dragStart();
    }

    const onMouseMove = (me: MouseEvent) => {
      if (!isExpanded) {
        if (Math.abs(me.movementX) > 2 || Math.abs(me.movementY) > 2) {
          if (!isDraggingRef.current) {
            isDraggingRef.current = true;
            // 设在根元素 + document.documentElement 上，确保透明窗口也生效
            if (rootRef.current) rootRef.current.style.cursor = 'move';
            document.documentElement.style.cursor = 'move';
            document.body.style.cursor = 'move';
            document.body.style.userSelect = 'none';
          }
        }
        // 位移由主进程用 screen.getCursorScreenPoint() 绝对差分计算（渲染层 movementX/Y 会因窗口移动反向），
        // 渲染层仅需在移动时触发通知
        window.radialApi.dragMove();
      }
      totalDist += Math.sqrt(me.movementX * me.movementX + me.movementY * me.movementY);
    };
    const onMouseUp = () => {
      if (rootRef.current) rootRef.current.style.cursor = '';
      document.documentElement.style.cursor = '';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (!isExpanded) {
        window.radialApi.dragEnd();
        // 收起态：移动超过阈值视为拖拽，否则视为单击展开
        if (totalDist <= 5) {
          window.radialApi.centerClick();
        }
      } else {
        // 展开态：✕ 按钮不可拖动，仅单击（未拖动）时收起
        if (totalDist <= 5) {
          window.radialApi.centerClick();
        }
      }

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // ─── 扇区点击 ───
  const handleSegmentClick = useCallback(
    (key: string) => {
      const item = allItems.find((it) => it.key === key);
      window.radialApi.segmentClick(key, item ?? undefined);
    },
    [allItems],
  );

  // clip-path 动画参数（从尺寸参数动态计算，无硬编码）
  const collapsedClip = `circle(${CENTER_R}px at 50% 50%)`;
  const expandedClip = `circle(${EXPANDED_CLIP_R}px at 50% 50%)`;

  return (
    <div
      ref={rootRef}
      className={`select-none${dark ? ' hw-dark' : ''}`}
      style={{
        position: 'fixed',
        width: WIDGET_SIZE,
        height: WIDGET_SIZE,
        left: 0,
        top: 0,
      }}
    >
      {/* ═══ 展开态共享玻璃底（整个组件唯一一处「表面级」blur 声明）═══
          磨砂 backdrop-filter 只落在这层 198×198 圆盘上：扇区半透明染色、扇区间隙、
          中心~扇区之间的环带都透过它读到底下的壁纸 —— 每个扇区 path 不能再各挂 blur
          （玻璃审计按声明计数，5 个扇区会成倍翻倍导致超预算）。
          圆盘放在 clip 容器之外、zIndex 0（低于中心按钮 / 环带 / 扇区层）→
          中心按钮自己的玻璃与描边不被这层染色盖住。
          进出场：opacity 随展开动画 0→1，blur 本身不做动画（性能约束）。 ═══ */}
      <motion.div
        key="radial-glass"
        aria-hidden
        className="absolute rounded-full"
        style={{
          left: CX - EXPANDED_CLIP_R,
          top: CY - EXPANDED_CLIP_R,
          width: EXPANDED_CLIP_R * 2,
          height: EXPANDED_CLIP_R * 2,
          zIndex: 0,
          pointerEvents: 'none',
          background: 'var(--color-radial-glass-base)',
          border: '1px solid var(--color-radial-glass-rim)',
          // 玻璃预算硬约束：单声明仅 1 处 blur、radius ≤24px、≤2 个滤镜函数（同中心圆规格）
          backdropFilter: 'blur(12px) saturate(150%)',
          WebkitBackdropFilter: 'blur(12px) saturate(150%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      />

      {/* ═══ 环形扇区 + 图标（clip-path 圆形揭示动画） ═══ */}
      <motion.div
        key="radial-content"
        className="absolute inset-0"
        style={{ width: WIDGET_SIZE, height: WIDGET_SIZE, zIndex: 3, pointerEvents: 'none' }}
        initial={{ clipPath: collapsedClip }}
        animate={{ clipPath: expanded ? expandedClip : collapsedClip }}
        transition={SPRING_SPRING}
      >
        {/* SVG 环形扇区 */}
        <svg
          key="ring"
          width={WIDGET_SIZE}
          height={WIDGET_SIZE}
          className="absolute inset-0"
          style={{ zIndex: 1 }}
        >
          <defs>
            <linearGradient id="segGlass" x1="0" y1="0" x2="0" y2="1">
              {/* stop-color 用 style 声明而非 stopColor 属性：SVG 表现属性不保证支持 var()，
                  CSS 声明里的 var() 一定生效 */}
              <stop offset="0%" style={{ stopColor: 'var(--color-radial-seg-top)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-radial-seg-bottom)' }} />
            </linearGradient>
          </defs>
          {visibleItems.map((item) => {
            const segStart = item.angle - segAngle / 2;
            const segEnd = item.angle + segAngle / 2;
            const path = describeArc(
              CX,
              CY,
              INNER_R,
              OUTER_R,
              segStart + gapOuterDeg / 2,
              segEnd - gapOuterDeg / 2,
              segStart + gapInnerDeg / 2,
              segEnd - gapInnerDeg / 2,
            );
            const isHover = hovered === item.key;
            return (
              <path
                key={item.key}
                d={path}
                style={{
                  // 悬停实色 / 常态玻璃渐变都走 CSS 变量（fill 表现属性同样不保证支持 var()）
                  fill: isHover ? 'var(--color-radial-seg-hover)' : 'url(#segGlass)',
                  cursor: 'pointer',
                  transition: 'fill 0.2s ease',
                  pointerEvents: 'auto',
                }}
                onClick={() => handleSegmentClick(item.key)}
              />
            );
          })}
        </svg>

        {/* 扇区图标 — 错峰弹簧入场 */}
        {visibleItems.map((item, idx) => {
          const pos = angleToXY(item.angle, ICON_R, CX, CY);
          return (
            <motion.div
              key={`icon-${item.key}`}
              className="absolute flex items-center justify-center pointer-events-none"
              style={{
                left: pos.x - ICON_CONTAINER / 2,
                top: pos.y - ICON_CONTAINER / 2,
                zIndex: 3,
                width: ICON_CONTAINER,
                height: ICON_CONTAINER,
              }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                // 弹簧做 scale 位移，opacity 独立过渡
                scale: { type: 'spring', stiffness: 180, damping: 28, delay: idx * 0.04 },
                opacity: { duration: 0.15, ease: 'easeOut', delay: idx * 0.04 },
              }}
            >
              {item.icon ? (
                <img
                  src={item.icon}
                  alt={item.label}
                  style={{ width: ICON_SIZE, height: ICON_SIZE, objectFit: 'contain' }}
                  /* 不加 drop-shadow：透明悬浮窗禁阴影（截图规范），玻璃底的透亮感也足够衬托图标 */
                />
              ) : (
                <span className="text-2xl">{item.emoji ?? '📦'}</span>
              )}
            </motion.div>
          );
        })}

        {/* Hover tooltip — 在 clip 容器内，使用 EXPANDED_CLIP_R 以内的半径 */}
        {(() => {
          const item = visibleItems.find((it) => it.key === hovered);
          if (!item) return null;
          const tipPos = angleToXY(item.angle, TOOLTIP_R, CX, CY);
          return (
            <div
              key="tooltip"
              className="absolute pointer-events-none whitespace-nowrap rounded-lg px-3 py-1.5
                         text-sm font-medium"
              style={{
                left: tipPos.x,
                top: tipPos.y,
                zIndex: 10,
                transform: 'translate(-50%, -50%)',
                // 文字色改走 token：overlay 恒为浅玻璃，若留 dark:text-zinc-100，
                // 系统暗色（prefers-color-scheme）会让浅底配浅字 → 不可读
                color: 'var(--color-radial-tooltip-text)',
                background: 'var(--color-radial-tooltip-bg)',
                boxShadow: 'var(--shadow-radial-tooltip)',
                border: '1px solid var(--color-radial-tooltip-border)',
              }}
            >
              {TOOLTIP_LABELS[item.key]?.[
                document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en'
              ] ?? item.label}
            </div>
          );
        })()}
      </motion.div>

      {/* ═══ 中心圆形：玻璃底 + 拖拽（内部字形已按 SHOW_CENTER_GLYPH 暂时隐藏） ═══ */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ zIndex: 1 }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={
            {
              width: CENTER_SIZE,
              height: CENTER_SIZE,
              // 展开 = 实色玻璃 / 收起 = 斜向淡玻璃渐变（RadialTheme.css 的 --gradient-radial-center-glass）
              background: expanded
                ? 'var(--color-radial-center-solid)'
                : 'var(--gradient-radial-center-glass)',
              // 玻璃预算硬约束：单声明仅 1 处 blur、radius ≤24px、≤2 个滤镜函数（统一 blur(12px) saturate(150%)）
              backdropFilter: 'blur(12px) saturate(150%)',
              WebkitBackdropFilter: 'blur(12px) saturate(150%)',
              boxShadow: expanded
                ? 'inset 0 1px 3px rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.05), 0 8px 32px rgba(0,0,0,0.08)'
                : 'inset 0 2px 4px rgba(255,255,255,0.7), inset 0 -2px 3px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.08)',
              border: '1px solid var(--color-radial-center-border)',
              cursor: expanded ? 'pointer' : 'grab',
              transition: 'transform 0.15s ease, background 0.2s ease',
            } as React.CSSProperties
          }
          onMouseDown={handleCenterMouseDown}
        >
          <AnimatePresence mode="wait" initial={false}>
            {/* 字形显隐由 SHOW_CENTER_GLYPH 控制（当前为 false = 空心玻璃圆）。
                组件保留在此，动画与 key 都不动，恢复时无需改结构。 */}
            {SHOW_CENTER_GLYPH &&
              (expanded ? (
                <motion.svg
                  key="close"
                  width={CENTER_R}
                  height={CENTER_R}
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  // stroke 走 style 声明读 token（stroke 是继承属性，子 <line> 自动继承）
                  style={{ stroke: 'var(--color-radial-icon)' }}
                  initial={{ rotate: -90, scale: 0, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  exit={{ rotate: 90, scale: 0, opacity: 0 }}
                  transition={SPRING_SPRING}
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </motion.svg>
              ) : (
                <motion.img
                  key="logo"
                  src={ICON_SVG}
                  alt="WorkPulse"
                  style={{ width: CENTER_R, height: CENTER_R, objectFit: 'contain' }}
                  initial={{ rotate: 90, scale: 0, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  exit={{ rotate: -90, scale: 0, opacity: 0 }}
                  transition={SPRING_SPRING}
                />
              ))}
          </AnimatePresence>
        </div>
      </div>

      {/* ═══ 硬件状态环（内环：CPU/内存弧 + 电量圆点，围绕中心圆圈）：纯展示层，pointer-events 不拦截点击；
          菜单展开时隐藏、收起时显示（expanded 由 RadialMenu 的 radial:state 订阅状态透传） ═══ */}
      <HardwareStatusRing expanded={expanded} />
    </div>
  );
}

/**
 * 生成环形扇区 SVG path（平行切口版本）
 */
function describeArc(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  outerStart: number,
  outerEnd: number,
  innerStart: number,
  innerEnd: number,
): string {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const oS = toRad(outerStart),
    oE = toRad(outerEnd);
  const iS = toRad(innerStart),
    iE = toRad(innerEnd);

  const ox1 = cx + outerR * Math.cos(oS),
    oy1 = cy + outerR * Math.sin(oS);
  const ox2 = cx + outerR * Math.cos(oE),
    oy2 = cy + outerR * Math.sin(oE);
  const ix1 = cx + innerR * Math.cos(iE),
    iy1 = cy + innerR * Math.sin(iE);
  const ix2 = cx + innerR * Math.cos(iS),
    iy2 = cy + innerR * Math.sin(iS);

  const largeO = outerEnd - outerStart > 180 ? 1 : 0;
  const largeI = innerEnd - innerStart > 180 ? 1 : 0;

  return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${largeO} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeI} 0 ${ix2} ${iy2} Z`;
}

/** 角度转坐标（0=上方，顺时针） */
function angleToXY(deg: number, radius: number, cx: number, cy: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
}
