import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Search, CornerDownLeft } from 'lucide-react';
import { useI18n } from '../stores/languageStore';
import { Highlight } from './common/Highlight';
import { pinyinIncludes } from '../utils/pinyin';
import {
  flattenNavItems,
  renderNavIcon,
  resolveNavLabel,
  type NavItemConfig,
} from '../config/navigation';
import { MOD_KEY_HINT } from '../hooks/useCommandPalette';
import './CommandPalette.css';

/** 结果上限：避免超长列表拖慢渲染与键盘滚动 */
const RESULT_LIMIT = 20;
/** 输入防抖（毫秒）：IME 组词与快速敲键期间不反复重算匹配 */
const DEBOUNCE_MS = 200;

/** 面板中的一条可选项（导航项或动作项） */
interface PaletteEntry {
  /** 唯一 id，同时用作 listbox option 的 DOM id（aria-activedescendant 目标） */
  id: string;
  /** nav = 页面导航；action = 可执行动作（如「搜索日志」） */
  kind: 'nav' | 'action';
  /** 展示标题（已按 i18n 解析） */
  title: string;
  /** 副标题：路由 path，动作项为带参数的完整 path */
  path: string;
  /** 已注入 className 的图标节点 */
  icon: React.ReactNode;
  /** nav 项的原始配置（动作项为 null） */
  item?: NavItemConfig;
}

interface CommandPaletteProps {
  /** 打开状态（组件常驻挂载，由 AnimatePresence 负责进出动画） */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 三路匹配：标题 includes（大小写不敏感）→ 路径/id includes → 拼音匹配
 */
function matchEntry(entry: PaletteEntry, query: string): boolean {
  const lower = query.toLowerCase();
  if (entry.title.toLowerCase().includes(lower)) return true;
  if (entry.path.toLowerCase().includes(lower)) return true;
  return pinyinIncludes(entry.title, query);
}

/**
 * 全局命令面板（Ctrl/⌘ + K）。
 *
 * - 数据源：config/navigation.ts 拍平后的可跳转导航项
 * - 搜索日志：query 非空时追加动作项，执行后跳转 worklog 并带 `?q=<query>`
 * - 键盘：↑↓ 循环选中、Enter 执行、Esc 关闭（输入法组合中豁免）
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** 原始输入（驱动动作项文案与跳转参数） */
  const [query, setQuery] = useState('');
  /** 防抖后的输入（驱动列表匹配，避免输入过程中高频重算） */
  const [debouncedQuery, setDebouncedQuery] = useState('');
  /** 当前高亮项下标（循环切换） */
  const [activeIndex, setActiveIndex] = useState(0);

  // ---- 打开时重置输入与选中项（render 期同步，避免 effect 级联渲染） ----
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(0);
    }
  }

  // ---- 打开时聚焦输入框并锁定页面滚动 ----
  useEffect(() => {
    if (!open) return;
    // 等待进入动画首帧后再聚焦，避免慢机上输入法被意外唤起
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // ---- 输入防抖 200ms ----
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // ---- 导航项条目（i18n 文案变化时重建） ----
  const navEntries = useMemo<PaletteEntry[]>(
    () =>
      flattenNavItems().map((item) => ({
        id: `nav-${item.path}`,
        kind: 'nav' as const,
        title: resolveNavLabel(item, t),
        path: item.path,
        icon: renderNavIcon(item.icon, 'cp-icon'),
        item,
      })),
    [t],
  );

  // ---- 匹配 + 截断 ----
  const navResults = useMemo(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) return navEntries.slice(0, RESULT_LIMIT);
    return navEntries.filter((entry) => matchEntry(entry, trimmed)).slice(0, RESULT_LIMIT);
  }, [navEntries, debouncedQuery]);

  // ---- 动作项：query 非空时追加「搜索日志」 ----
  const trimmedQuery = debouncedQuery.trim();
  const entries = useMemo<PaletteEntry[]>(() => {
    if (!trimmedQuery) return navResults;
    return [
      ...navResults,
      {
        id: 'action-search-logs',
        kind: 'action',
        title: `${t('commandPalette.searchLogs')}: ${trimmedQuery}`,
        path: `worklog?q=${encodeURIComponent(trimmedQuery)}`,
        icon: <Search className="cp-icon" />,
      },
    ];
  }, [navResults, trimmedQuery, t]);

  // ---- 选中项滚动到可视区 ----
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, entries.length]);

  // ---- 执行选中项 ----
  const runEntry = useCallback(
    (entry: PaletteEntry) => {
      if (entry.kind === 'action') {
        // 动作项：把搜索词经路由参数 ?q= 交给工作日志页（Lane A 契约）
        navigate(`/worklog?q=${encodeURIComponent(trimmedQuery)}`);
      } else if (entry.item) {
        navigate(`/${entry.item.path}`);
      }
      onClose();
    },
    [navigate, onClose, trimmedQuery],
  );

  // ---- 键盘处理（输入法组合中一律豁免） ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return;
      const total = entries.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (total > 0) setActiveIndex((i) => (i + 1) % total);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (total > 0) setActiveIndex((i) => (i - 1 + total) % total);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const entry = entries[activeIndex];
        if (entry) runEntry(entry);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [entries, activeIndex, runEntry, onClose],
  );

  const activeId = entries[activeIndex]?.id;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cp-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          onClick={(e) => {
            // 点击遮罩关闭（点击面板内部不冒泡到此判断）
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="cp-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('commandPalette.placeholder')}
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* ---- 输入区 ---- */}
            <div className="cp-input-row">
              <Search className="cp-input-icon" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                className="cp-input"
                value={query}
                placeholder={t('commandPalette.placeholder')}
                aria-label={t('commandPalette.placeholder')}
                aria-activedescendant={activeId}
                aria-controls="cp-listbox"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0); // 新输入从第一条结果开始
                }}
                onKeyDown={handleKeyDown}
              />
              <kbd className="cp-kbd cp-kbd-escape">Esc</kbd>
            </div>

            {/* ---- 结果列表 ---- */}
            <div
              ref={listRef}
              id="cp-listbox"
              className="cp-list"
              role="listbox"
              aria-label={t('commandPalette.placeholder')}
            >
              {/* 有查询但导航无命中：给出空状态提示，动作项仍可执行 */}
              {trimmedQuery !== '' && navResults.length === 0 && (
                <div className="cp-empty" role="presentation">
                  {t('commandPalette.noResults')}
                </div>
              )}
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  id={entry.id}
                  data-index={index}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`cp-item${index === activeIndex ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runEntry(entry)}
                >
                  <span className="cp-item-icon" aria-hidden="true">
                    {entry.icon}
                  </span>
                  <span className="cp-item-main">
                    <span className="cp-item-title">
                      <Highlight text={entry.title} query={trimmedQuery} />
                    </span>
                    <span className="cp-item-path">/{entry.path}</span>
                  </span>
                  {index === activeIndex && (
                    <CornerDownLeft className="cp-item-enter" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>

            {/* ---- 底部快捷键提示 ---- */}
            <div className="cp-footer">
              <span className="cp-hint">
                <kbd className="cp-kbd">↑</kbd>
                <kbd className="cp-kbd">↓</kbd>
                {t('commandPalette.hintNavigate')}
              </span>
              <span className="cp-hint">
                <kbd className="cp-kbd">Enter</kbd>
                {t('commandPalette.hintSelect')}
              </span>
              <span className="cp-hint">
                <kbd className="cp-kbd">Esc</kbd>
                {t('commandPalette.hintClose')}
              </span>
              <span className="cp-hint cp-hint-mod">
                <kbd className="cp-kbd">{MOD_KEY_HINT}</kbd>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CommandPalette;
