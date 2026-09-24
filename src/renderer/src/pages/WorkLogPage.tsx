import { useEffect, useRef, useState, useCallback, useMemo, memo, ReactNode } from 'react';
import { runWhenIdle } from '../hooks/useIdleCallback';
import {
  Trash2,
  ClipboardEdit,
  Search,
  X,
  Download,
  Undo2,
  Pencil,
  Check,
  Upload,
  Paperclip,
  FileText,
  Link as LinkIcon,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import { motion, AnimatePresence } from 'motion/react';
import { Fade } from '../components/Motion';
import { SkeletonLine, SkeletonRect } from '../components/Skeleton';
import { DailySummaryModal } from '../components/DailySummaryModal';
import { useWorkLogStore } from '../stores/worklogStore';
import { useShallow } from 'zustand/react/shallow';
import { formatDate, formatTime, groupLogsByDate } from '../lib/dateUtils';
import { useI18n } from '../stores/languageStore';
import type { TranslationKey } from '../lib/i18n';

type Attachment = Awaited<ReturnType<typeof window.api.attachment.list>>[number];

interface PendingAttachment {
  type: 'file' | 'screenshot' | 'link';
  originalName: string;
  filePath?: string;
  base64Data?: string;
  mimeType?: string;
  url?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImageAttachment(att: Attachment): boolean {
  if (att.type === 'screenshot') return true;
  if (att.type === 'file') return (att.mime_type ?? '').startsWith('image/');
  return false;
}

function AttachmentItem({
  att,
  onDelete,
  t,
}: {
  att: Attachment;
  onDelete: () => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}): ReactNode {
  return (
    <div className="group/att relative surface-card rounded-lg border border-[var(--color-border)] p-2 flex flex-col items-center gap-1 w-24 shrink-0">
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 p-0.5 rounded-full bg-zinc-900/70 text-white opacity-0 group-hover/att:opacity-100 transition-opacity z-10"
        title={t('worklog.deleteAttachment')}
        aria-label={t('worklog.deleteAttachment')}
      >
        <X className="w-3 h-3" />
      </button>
      {att.type === 'link' ? (
        <a
          href={att.url || '#'}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center gap-1 w-full"
        >
          <LinkIcon className="w-6 h-6 text-blue-500" />
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 text-center line-clamp-2 w-full break-all">
            {att.original_name}
          </span>
        </a>
      ) : isImageAttachment(att) ? (
        <img
          src={`appattachment://${att.stored_path}`}
          alt={att.original_name}
          className="w-20 h-20 object-cover rounded"
          loading="lazy"
        />
      ) : (
        <div className="flex flex-col items-center gap-1">
          <FileText className="w-6 h-6 text-zinc-500" />
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 text-center line-clamp-2 w-full break-all">
            {att.original_name}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * 瀑布流布局 Hook
 *
 * 使用 JavaScript 将卡片分配到最短列，实现真正的 Pinterest 风格瀑布流。
 * - 响应式：通过 ResizeObserver 检测容器宽度，自动切换列数
 * - 高度感知：通过测量实际渲染高度来分配卡片，而非估算
 * - 平滑过渡：列数变化时通过 key 过渡保持视觉连贯
 */

/** 日期组条目的类型 */
type DateEntry = [string, { id: number; created_at: string; content: string; category: string }[]];

/**
 * 卡片估算高度：表头 + 每条日志行的高度 + padding
 * 用于首次渲染和未测量时的 fallback
 */
function estimateCardHeight(logCount: number): number {
  // 表头(20px) + mb-2(8px) + 每条日志(36px含gap) + p-4(32px) + mb-4(16px)
  return 40 + logCount * 36 + 32 + 16;
}

/** 用贪婪算法将条目分配到最短列 */
function distributeToColumns(
  entries: DateEntry[],
  columnCount: number,
  heightMap: Map<string, number>,
): DateEntry[][] {
  const cols: DateEntry[][] = Array.from({ length: columnCount }, () => []);
  const colHeights = Array(columnCount).fill(0);

  for (const entry of entries) {
    const [dateKey, logs] = entry;
    const h = heightMap.get(dateKey) ?? estimateCardHeight(logs.length);
    // 找到最短的列
    let shortestIdx = 0;
    let shortestH = colHeights[0];
    for (let i = 1; i < columnCount; i++) {
      if (colHeights[i] < shortestH) {
        shortestH = colHeights[i];
        shortestIdx = i;
      }
    }
    cols[shortestIdx].push(entry);
    colHeights[shortestIdx] += h;
  }

  return cols;
}

function MasonryLayout({
  entries,
  renderCard,
  /** 当外部状态变化导致卡片高度变化时（如展开附件），传入此值触发重新测量 */
  heightTrigger,
}: {
  entries: DateEntry[];
  renderCard: (dateKey: string, logs: DateEntry[1], index: number) => ReactNode;
  heightTrigger?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
  // 记录每个日期组的实际渲染高度
  const [heightMap, setHeightMap] = useState<Map<string, number>>(new Map());
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 通过 ResizeObserver 检测容器宽度，决定列数
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateColumnCount = (): void => {
      const width = container.getBoundingClientRect().width;
      // >= 768px 双列，>= 1280px 三列
      if (width >= 1280) {
        setColumnCount(3);
      } else if (width >= 768) {
        setColumnCount(2);
      } else {
        setColumnCount(1);
      }
    };

    updateColumnCount();
    const observer = new ResizeObserver(updateColumnCount);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 测量每个卡片的实际高度并更新 heightMap
  const measureAll = useCallback((): void => {
    const newMap = new Map<string, number>();
    cardRefs.current.forEach((el, dateKey) => {
      if (el) {
        newMap.set(dateKey, el.getBoundingClientRect().height);
      }
    });
    if (newMap.size > 0) {
      setHeightMap((prev) => {
        // 仅在有变化时更新，避免不必要的重渲染
        let changed = false;
        if (prev.size !== newMap.size) {
          changed = true;
        } else {
          for (const [k, v] of newMap) {
            if (prev.get(k) !== v) {
              changed = true;
              break;
            }
          }
        }
        return changed ? newMap : prev;
      });
    }
  }, []);

  // 首次渲染后测量一次，然后在动画结束后再测量
  useEffect(() => {
    // 初始测量（短延迟确保 DOM 已渲染）
    const timer = setTimeout(measureAll, 50);
    // 第二次测量：等待可能的动画完成
    const timer2 = setTimeout(measureAll, 600);
    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [entries, heightTrigger, measureAll]);

  // 监听卡片内容变化（如附件展开/收起动画），触发重新测量
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      requestAnimationFrame(measureAll);
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    return () => observer.disconnect();
  }, [measureAll]);

  // 分配卡片到各列
  const columns = useMemo(
    () => distributeToColumns(entries, columnCount, heightMap),
    [entries, columnCount, heightMap],
  );

  const registerRef = useCallback(
    (dateKey: string) => (el: HTMLDivElement | null) => {
      if (el) {
        cardRefs.current.set(dateKey, el);
      } else {
        cardRefs.current.delete(dateKey);
      }
    },
    [],
  );

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="flex gap-4 items-start"
        style={{ flexDirection: columnCount === 1 ? 'column' : 'row' }}
      >
        {columns.map((colEntries, colIdx) => (
          <div
            key={`col-${colIdx}`}
            className="flex flex-col gap-4 min-w-0"
            style={{ flex: columnCount === 1 ? 'none' : '1 1 0%' }}
          >
            {colEntries.map(([dateKey, dateLogs], cardIdx) => (
              <div
                key={dateKey}
                ref={registerRef(dateKey)}
                className="surface-card p-4 break-inside-avoid"
                style={{
                  // 屏外日期卡片跳过渲染/布局，contain-intrinsic-size 提供占位高度
                  // （auto 关键字会记住已渲染的真实尺寸，滚动回时无闪烁）
                  contentVisibility: 'auto',
                  containIntrinsicSize: `auto ${estimateCardHeight(dateLogs.length)}px`,
                }}
              >
                {renderCard(dateKey, dateLogs, cardIdx)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 附件列表未加载时的共享空数组，避免每次渲染新建引用导致 memo 失效 */
const EMPTY_ATTS: Attachment[] = [];

interface LogEntryProps {
  log: DateEntry[1][number];
  atts: Attachment[];
  expanded: boolean;
  editing: boolean;
  deleting: boolean;
  editContent: string;
  editCategory: string;
  editDate: string;
  setEditContent: (v: string) => void;
  setEditCategory: (v: string) => void;
  setEditDate: (v: string) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  onToggleExpand: (id: number) => void;
  onStartEdit: (log: DateEntry[1][number]) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  onSetDeleting: (id: number | null) => void;
  onDeleteAttachment: (logId: number, attId: number) => void;
}

/**
 * 单条日志条目（React.memo 化）：
 * 输入、搜索等页面级状态变化时，属性未变的条目跳过重渲染。
 */
const LogEntry = memo(function LogEntry({
  log,
  atts,
  expanded,
  editing,
  deleting,
  editContent,
  editCategory,
  editDate,
  setEditContent,
  setEditCategory,
  setEditDate,
  t,
  onToggleExpand,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onSetDeleting,
  onDeleteAttachment,
}: LogEntryProps): ReactNode {
  const attCount = atts.length;
  return (
    <>
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 8 },
          show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
        }}
        className="group flex items-center justify-between py-2 px-3 rounded-lg surface-card transition-all hover:shadow-md"
      >
        {editing ? (
          <>
            <div className="flex-1 mr-2 flex items-center gap-2">
              <input
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEdit();
                  if (e.key === 'Escape') onCancelEdit();
                }}
                className="flex-1 px-2 py-1 text-sm border border-[var(--color-border)] rounded outline-none focus:border-blue-400 surface-input dark:text-zinc-100"
                autoFocus
              />
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEdit();
                  if (e.key === 'Escape') onCancelEdit();
                }}
                placeholder="#tag"
                className="w-24 px-2 py-1 text-sm border border-[var(--color-border)] rounded outline-none focus:border-blue-400 surface-input dark:text-zinc-100"
              />
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-32 px-2 py-1 text-sm border border-[var(--color-border)] rounded outline-none focus:border-blue-400 surface-input dark:text-zinc-100"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onSaveEdit}
                className="p-1 text-green-500 hover:text-green-600"
                title={t('worklog.editSave')}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-1 text-zinc-400 hover:text-zinc-600"
                title={t('worklog.editCancel')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 mr-4 flex items-start gap-2 min-w-0">
              <span className="text-zinc-800 dark:text-zinc-200 break-all leading-relaxed">
                {log.content}
              </span>
              {log.category && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 woitespace-nowrap shrink-0">
                  {log.category}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {attCount > 0 && (
                <button
                  onClick={() => onToggleExpand(log.id)}
                  className={`flex items-center gap-0.5 text-xs transition-colors ${
                    expanded ? 'text-blue-500' : 'text-zinc-400 hover:text-blue-500'
                  }`}
                  title={t('worklog.viewAttachments')}
                  aria-label={t('worklog.viewAttachments')}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>{attCount}</span>
                </button>
              )}
              <span className="text-xs text-zinc-400">
                {formatTime(log.created_at)}
              </span>
              {deleting ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onDelete(log.id)}
                    className="text-xs text-red-500 hover:text-red-700 px-1"
                  >
                    {t('common.confirm')}
                  </button>
                  <button
                    onClick={() => onSetDeleting(null)}
                    className="text-xs text-zinc-400 hover:text-zinc-600 px-1"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onStartEdit(log)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-blue-500 transition-all"
                    aria-label={t('worklog.editAria')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onSetDeleting(log.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-all"
                    aria-label={t('worklog.deleteAria')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </motion.div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-3 mt-1 mb-2 pl-3 border-l-2 border-[var(--color-border)]">
              {atts.length === 0 ? (
                <p className="text-xs text-zinc-400 py-1">
                  {t('worklog.noAttachments')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 py-1">
                  {atts.map((att) => (
                    <AttachmentItem
                      key={att.id}
                      att={att}
                      t={t}
                      onDelete={() => onDeleteAttachment(log.id, att.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

function WorkLogPage(): ReactNode {
  const {
    logs,
    fetchLogs,
    loadMore,
    hasMore,
    addLog,
    deleteLog,
    undoDelete,
    dismissUndo,
    lastDeleted,
    searchLogs,
    clearSearch,
    searchKeyword,
    loading,
    updateLog,
  } = useWorkLogStore(
    useShallow((s) => ({
      logs: s.logs,
      fetchLogs: s.fetchLogs,
      loadMore: s.loadMore,
      hasMore: s.hasMore,
      addLog: s.addLog,
      deleteLog: s.deleteLog,
      undoDelete: s.undoDelete,
      dismissUndo: s.dismissUndo,
      lastDeleted: s.lastDeleted,
      searchLogs: s.searchLogs,
      clearSearch: s.clearSearch,
      searchKeyword: s.searchKeyword,
      loading: s.loading,
      updateLog: s.updateLog,
    })),
  );
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [shaking, setShaking] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [attachmentsByLog, setAttachmentsByLog] = useState<Record<number, Attachment[]>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<number>(0);
  const fetchedIdsRef = useRef<Set<number>>(new Set());
  const toast = useToast();
  const { resolvedLanguage, t } = useI18n();
  // useI18n 的 t 每次渲染返回新函数；包装为引用稳定的版本，
  // 供 memo 化的日志条目与 useCallback 依赖使用，避免每次渲染失效所有条目
  const tRef = useRef(t);
  tRef.current = t;
  const stableT = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) => tRef.current(key, values),
    [],
  );
  // 编辑/展开相关状态的最新值引用：让 handleEditSave、toggleExpand 保持引用稳定
  const latestRef = useRef({ editingId, editContent, editCategory, editDate, expandedLogId, attachmentsByLog });
  latestRef.current = { editingId, editContent, editCategory, editDate, expandedLogId, attachmentsByLog };

  // 每日摘要弹窗状态
  const [showDailySummary, setShowDailySummary] = useState(false);

  useEffect(() => {
    fetchLogs();
    inputRef.current?.focus();

    // 检查今天是否已展示过每日摘要（开发模式每次都弹）
    const today = new Date().toISOString().slice(0, 10);
    const lastShown = localStorage.getItem('daily_summary_last_shown');
    const isDev = import.meta.env.DEV;
    if (isDev || lastShown !== today) {
      // 延迟弹出，等页面加载完成
      const timer = setTimeout(() => setShowDailySummary(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Prefetch next page during browser idle time
  useEffect(() => {
    if (!hasMore || searchKeyword || loading || logs.length === 0) return;
    const cancel = runWhenIdle(
      [{ fn: () => useWorkLogStore.getState().prefetchNext(), priority: 1 }],
      { timeout: 3000 },
    );
    return cancel;
  }, [logs.length, hasMore, searchKeyword, loading]);

  // Load attachment lists for all visible logs so counts/indicators are available.
  useEffect(() => {
    const ids = logs.map((l) => l.id);
    const toFetch = ids.filter((id) => !fetchedIdsRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => fetchedIdsRef.current.add(id));
    let cancelled = false;
    Promise.all(toFetch.map((id) => window.api.attachment.list(id)))
      .then((results) => {
        if (cancelled) return;
        setAttachmentsByLog((prev) => {
          const next = { ...prev };
          toFetch.forEach((id, i) => {
            next[id] = results[i];
          });
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [logs]);

  const parseCategory = (text: string): { content: string; category: string } => {
    const match = text.match(/#(\S+)\s*/);
    if (match) {
      return { content: text.replace(match[0], '').trim(), category: match[1] };
    }
    return { content: text, category: '' };
  };

  const handleSubmit = async (): Promise<void> => {
    const trimmed = input.trim();
    if (!trimmed) {
      setShaking(true);
      setError(t('worklog.emptyError'));
      setTimeout(() => {
        setShaking(false);
        setError('');
      }, 1500);
      return;
    }

    try {
      const { content, category } = parseCategory(trimmed);
      const log = await addLog(content, category);
      if (pendingAttachments.length > 0) {
        for (const a of pendingAttachments) {
          await window.api.attachment.add(log.id, a);
        }
        const atts = await window.api.attachment.list(log.id);
        setAttachmentsByLog((prev) => ({ ...prev, [log.id]: atts }));
        fetchedIdsRef.current.add(log.id);
      }
      setPendingAttachments([]);
      setInput('');
    } catch {
      setError(t('worklog.saveError'));
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>): Promise<void> => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter((it) => it.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    let added = false;
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      try {
        const base64 = await fileToBase64(file);
        setPendingAttachments((prev) => [
          ...prev,
          {
            type: 'screenshot',
            originalName: file.name || `screenshot-${Date.now()}.png`,
            base64Data: base64,
            mimeType: file.type || 'image/png',
          },
        ]);
        added = true;
      } catch {
        // ignore unreadable clipboard image
      }
    }
    if (added) toast.success(t('worklog.attachmentAdded'));
  };

  const handlePickFile = async (): Promise<void> => {
    try {
      const picked = await window.api.attachment.pickFile();
      if (!picked || picked.length === 0) return;
      setPendingAttachments((prev) => [
        ...prev,
        ...picked.map((p) => ({ type: 'file' as const, originalName: p.name, filePath: p.path })),
      ]);
      toast.success(t('worklog.attachmentAdded'));
    } catch {
      toast.error(t('worklog.attachmentPickError'));
    }
  };

  const toggleExpand = useCallback(async (id: number): Promise<void> => {
    // 通过 latestRef 读取最新状态，保持回调引用稳定（memo 条目依赖）
    const { expandedLogId: currentExpanded, attachmentsByLog: attsMap } = latestRef.current;
    if (currentExpanded === id) {
      setExpandedLogId(null);
      return;
    }
    setExpandedLogId(id);
    if (!attsMap[id]) {
      try {
        const atts = await window.api.attachment.list(id);
        setAttachmentsByLog((prev) => ({ ...prev, [id]: atts }));
        fetchedIdsRef.current.add(id);
      } catch {
        // ignore
      }
    }
  }, []);

  const handleDeleteAttachment = useCallback(
    async (logId: number, attId: number): Promise<void> => {
      try {
        await window.api.attachment.delete(attId);
        setAttachmentsByLog((prev) => ({
          ...prev,
          [logId]: (prev[logId] || []).filter((a) => a.id !== attId),
        }));
      } catch {
        toast.error(stableT('worklog.attachmentDeleteError'));
      }
    },
    [stableT, toast],
  );

  const handleSearchChange = (value: string): void => {
    setSearch(value);
    clearTimeout(searchTimerRef.current);
    if (!value.trim()) {
      clearSearch();
      return;
    }
    searchTimerRef.current = window.setTimeout(() => {
      searchLogs(value.trim());
    }, 300);
  };

  const handleClearSearch = (): void => {
    setSearch('');
    clearSearch();
  };

  const handleDelete = useCallback(
    async (id: number): Promise<void> => {
      await deleteLog(id);
      setDeletingId(null);
      toast.success(stableT('worklog.deleted'));
    },
    [deleteLog, stableT, toast],
  );

  const handleUndo = async (): Promise<void> => {
    await undoDelete();
    toast.success(t('worklog.restored'));
  };

  const handleEditSave = useCallback(async (): Promise<void> => {
    // 编辑状态从 latestRef 读取最新值，保持回调引用稳定
    const {
      editingId: id,
      editContent: content,
      editCategory: category,
      editDate: date,
    } = latestRef.current;
    if (!id) return;
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    const log = useWorkLogStore.getState().logs.find((l) => l.id === id);
    const timePart = log ? log.created_at.slice(10) : '';
    const newCreatedAt = date ? date + timePart : undefined;
    await updateLog(id, trimmedContent, category.trim(), newCreatedAt);
    setEditingId(null);
    toast.success(stableT('worklog.editSave'));
  }, [updateLog, stableT, toast]);

  const handleEditCancel = useCallback((): void => {
    setEditingId(null);
  }, []);

  // 开始编辑：初始化编辑表单状态（引用稳定，供 memo 条目使用）
  const handleStartEdit = useCallback((log: DateEntry[1][number]): void => {
    setEditingId(log.id);
    setEditContent(log.content);
    setEditCategory(log.category);
    setEditDate(log.created_at.slice(0, 10));
  }, []);

  const grouped = groupLogsByDate(logs);

  return (
    <div className="px-6 py-4">
      {/* Toolbar: Input + Search + Actions */}
      <div className="mb-4 surface-card p-3 flex flex-wrap items-center gap-3">
        {/* Row 1: Input — full width on small screen */}
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={t('worklog.inputPlaceholder')}
            aria-label={t('worklog.inputAria')}
            className={`w-full pl-4 pr-10 py-2 text-sm border rounded-lg outline-none transition-all surface-input dark:text-zinc-100 ${
              loading
                ? 'animate-soake border-red-400 ring-2 ring-red-200'
                : 'border-[var(--color-border)] focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700'
            }`}
          />
          <button
            type="button"
            onClick={handlePickFile}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-blue-500 transition-colors"
            title={t('worklog.addAttachment')}
            aria-label={t('worklog.addAttachment')}
          >
            <Paperclip className="w-4 h-4" />
          </button>
        </div>

        {/* Row 2: Search — full width on small screen */}
        <div className="relative w-full sm:w-56 sm:flex-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t('worklog.searchPlaceholder')}
            className="w-full pl-9 pr-8 py-2 text-sm border border-[var(--color-border)] rounded-lg outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 dark:focus:ring-zinc-700 surface-input dark:text-zinc-100"
          />
          {search && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Row 3: Import + Export — equal width on small screen */}
        <div className="flex w-full sm:w-auto gap-3">
          <button
            onClick={async () => {
              const result = await window.api.import.logs();
              if (result) {
                const msg =
                  result.skipped > 0
                    ? t('worklog.importedSkipped', {
                        imported: result.imported,
                        skipped: result.skipped,
                      })
                    : t('worklog.imported', { count: result.imported });
                toast.success(msg);
                fetchLogs();
              }
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 text-sm surface-card rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all btn-bounce"
            title={t('worklog.import')}
          >
            <Upload className="w-4 o-4" />
            {t('common.import')}
          </button>
          <div className="relative group flex-1 sm:flex-none">
            <button className="flex items-center justify-center gap-1 w-full px-3 py-2 text-sm surface-card rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all btn-bounce">
              <Download className="w-4 o-4" />
              {t('common.export')}
            </button>
            <div className="absolute right-0 top-full mt-1 surface-elevated border border-[var(--color-border)] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={async () => {
                  const pato = await window.api.export.logs('csv');
                  if (pato) toast.success(t('worklog.exportedCsv'));
                }}
                className="block w-full px-4 py-2 text-sm text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-t-lg whitespace-nowrap"
              >
                {t('worklog.exportCsv')}
              </button>
              <button
                onClick={async () => {
                  const pato = await window.api.export.logs('markdown');
                  if (pato) toast.success(t('worklog.exportedMarkdown'));
                }}
                className="block w-full px-4 py-2 text-sm text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-b-lg whitespace-nowrap"
              >
                {t('worklog.exportMarkdown')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <p className="mb-2 text-sm text-red-500">{error}</p>}

      {/* Pending Attachments */}
      {pendingAttachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {pendingAttachments.map((a, i) => (
            <div
              key={i}
              className="relative surface-card rounded-lg border border-[var(--color-border)] p-1.5 flex items-center gap-1.5 w-32"
            >
              <button
                type="button"
                onClick={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-zinc-900/70 text-white hover:bg-zinc-900 transition-colors z-10"
                title={t('worklog.deleteAttachment')}
                aria-label={t('worklog.deleteAttachment')}
              >
                <X className="w-2.5 h-2.5" />
              </button>
              {a.type === 'screenshot' ? (
                <img
                  src={`data:${a.mimeType || 'image/png'};base64,${a.base64Data}`}
                  alt={a.originalName}
                  className="w-9 h-9 object-cover rounded shrink-0"
                />
              ) : (
                <FileText className="w-5 h-5 text-zinc-500 shrink-0" />
              )}
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate flex-1">
                {a.originalName}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Search info */}
      {searchKeyword && (
        <div className="mb-3 mx-auto max-w-3xl text-sm text-zinc-500">
          {t('worklog.searchInfo', { keyword: searchKeyword, count: logs.length })}
          <button onClick={handleClearSearch} className="ml-2 text-blue-500 hover:underline">
            {t('common.clear')}
          </button>
        </div>
      )}

      {/* Log list */}
      {loading && logs.length === 0 ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, gi) => (
            <div key={gi} className="surface-card p-4">
              <SkeletonLine width="5rem" height="0.75rem" className="mb-3" />
              <div className="space-y-2">
                {Array.from({ length: 2 + gi }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-50 dark:bg-white/5"
                  >
                    <div className="flex-1 flex items-center gap-2">
                      <SkeletonLine width={`${60 + i * 8}%`} height="0.875rem" />
                      {i === 0 && <SkeletonLine width="3rem" height="1.25rem" rounded="9999px" />}
                    </div>
                    <SkeletonLine width="3rem" height="0.625rem" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Fade className="text-center py-16">
          <ClipboardEdit className="w-12 h-12 mx-auto text-zinc-300 mb-4 animate-float" />
          {searchKeyword ? (
            <>
              <p className="text-zinc-500 text-lg mb-1">{t('worklog.noResults')}</p>
              <p className="text-zinc-400 text-sm">{t('worklog.tryOtherKeywords')}</p>
            </>
          ) : (
            <>
              <p className="text-zinc-500 text-lg mb-1">{t('worklog.emptyTitle')}</p>
              <p className="text-zinc-400 text-sm">{t('worklog.emptySubtitle')}</p>
            </>
          )}
        </Fade>
      ) : (
        <>
          <MasonryLayout
            heightTrigger={expandedLogId ?? undefined}
            entries={Array.from(grouped.entries())}
            renderCard={(dateKey, dateLogs, cardIdx) => (
              <>
                <h3 className="text-sm font-medium text-zinc-400 dark:text-zinc-500 mb-2">
                  {formatDate(dateKey + 'T00:00:00', resolvedLanguage)}
                </h3>
                <motion.div
                  className="space-y-1"
                  initial="hidden"
                  animate="show"
                  variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: 0.04, delayChildren: cardIdx * 0.06 } },
                  }}
                >
                  {dateLogs.map((log) => (
                    <LogEntry
                      key={`${log.id}-${resolvedLanguage}`}
                      log={log}
                      atts={attachmentsByLog[log.id] ?? EMPTY_ATTS}
                      expanded={expandedLogId === log.id}
                      editing={editingId === log.id}
                      deleting={deletingId === log.id}
                      // 仅编辑中的行传真值，其余传空串，避免每次按键使所有行 memo 失效
                      editContent={editingId === log.id ? editContent : ''}
                      editCategory={editingId === log.id ? editCategory : ''}
                      editDate={editingId === log.id ? editDate : ''}
                      setEditContent={setEditContent}
                      setEditCategory={setEditCategory}
                      setEditDate={setEditDate}
                      t={stableT}
                      onToggleExpand={toggleExpand}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleEditSave}
                      onCancelEdit={handleEditCancel}
                      onDelete={handleDelete}
                      onSetDeleting={setDeletingId}
                      onDeleteAttachment={handleDeleteAttachment}
                    />
                  ))}
                </motion.div>
              </>
            )}
          />
          {hasMore && !searchKeyword && (
            <div className="text-center py-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 disabled:opacity-50"
              >
                {loading ? t('common.loading') : t('worklog.loadMore')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Undo bar */}
      {lastDeleted && (
        <div className="fixed bottom-4 left-1/2 z-40 flex items-center gap-3 px-4 py-2.5 bg-blue-600 dark:bg-blue-500 text-white rounded-lg shadow-lg text-sm animate-undo-slide-up">
          <span>{t('worklog.deletedOne')}</span>
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 font-medium text-blue-300 dark:text-blue-600 hover:text-blue-200 dark:hover:text-blue-500"
          >
            <Undo2 className="w-3.5 h-3.5" />
            {t('worklog.undo')}
          </button>
          <button
            onClick={dismissUndo}
            className="ml-1 p-0.5 text-zinc-400 dark:text-zinc-500 hover:text-woite dark:hover:text-zinc-900"
            title={t('common.confirm')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 每日工作摘要弹窗 */}
      {showDailySummary && <DailySummaryModal onClose={() => setShowDailySummary(false)} />}
    </div>
  );
}

export default WorkLogPage;
