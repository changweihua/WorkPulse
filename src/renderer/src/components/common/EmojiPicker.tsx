import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Smile } from 'lucide-react';
import { useI18n } from '../../stores/languageStore';
import type { TranslationKey } from '../../lib/i18n';

interface EmojiPickerProps {
  /** 选中表情后回调，由调用方插入到输入框光标处 */
  onSelect: (emoji: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}

type CategoryId = 'recent' | 'frequent' | 'people' | 'gestures' | 'work' | 'symbols';

const CATEGORIES: { id: CategoryId; label: TranslationKey }[] = [
  { id: 'frequent', label: 'emoji.frequent' },
  { id: 'people', label: 'emoji.people' },
  { id: 'gestures', label: 'emoji.gestures' },
  { id: 'work', label: 'emoji.work' },
  { id: 'symbols', label: 'emoji.symbols' },
];

const EMOJIS: Record<Exclude<CategoryId, 'recent'>, string[]> = {
  frequent: [
    '😀',
    '😂',
    '🥰',
    '😍',
    '🤔',
    '👍',
    '👏',
    '🙏',
    '💪',
    '✅',
    '🎉',
    '🔥',
    '❤️',
    '🚀',
    '💡',
    '📝',
  ],
  people: [
    '😀',
    '😃',
    '😄',
    '😁',
    '😆',
    '😅',
    '😂',
    '🤣',
    '😊',
    '😇',
    '🙂',
    '🙃',
    '😉',
    '😌',
    '😍',
    '🥰',
    '😘',
    '😋',
    '😛',
    '😜',
    '🤗',
    '🤭',
    '🤫',
    '🤔',
    '😐',
    '😑',
    '😶',
    '😏',
    '😒',
    '🙄',
    '😬',
    '😴',
    '🤯',
    '🤓',
    '🧐',
    '😎',
    '🥳',
    '😭',
    '😢',
    '😡',
    '😱',
    '🥺',
    '😳',
    '🤩',
    '🤝',
    '👋',
    '🤗',
    '😌',
  ],
  gestures: [
    '👍',
    '👎',
    '👌',
    '✌️',
    '🤞',
    '🤟',
    '🤘',
    '🤙',
    '👈',
    '👉',
    '👆',
    '👇',
    '☝️',
    '✋',
    '🤚',
    '🖐️',
    '🖖',
    '👏',
    '🙌',
    '🤝',
    '🙏',
    '💪',
    '🫶',
    '👊',
    '✊',
    '🤛',
    '🤜',
    '🫰',
  ],
  work: [
    '💼',
    '📅',
    '📌',
    '📎',
    '📝',
    '📋',
    '📊',
    '📈',
    '📉',
    '💻',
    '🖥️',
    '⌨️',
    '🖱️',
    '🔧',
    '⚙️',
    '🔍',
    '🔔',
    '📧',
    '📁',
    '📂',
    '🗂️',
    '📑',
    '🔖',
    '🏷️',
    '⏰',
    '⏳',
    '🎯',
    '🚀',
    '💡',
    '🔥',
    '✅',
    '❌',
    '⚠️',
    '🛠️',
    '🧩',
    '📦',
    '🔗',
    '💬',
  ],
  symbols: [
    '❤️',
    '🧡',
    '💛',
    '💚',
    '💙',
    '💜',
    '🖤',
    '🤍',
    '💔',
    '⭐',
    '🌟',
    '✨',
    '⚡',
    '☀️',
    '🌈',
    '🎉',
    '🎊',
    '🎁',
    '🌸',
    '🍀',
    '☕',
    '🍵',
    '🍕',
    '🐛',
    '🔒',
    '🔑',
    '⚠️',
    '❗',
    '❓',
    '💯',
    '🆗',
    '🆕',
  ],
};

const RECENT_STORAGE_KEY = 'workpulse.emoji.recent';
const RECENT_LIMIT = 16;
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 330;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/**
 * 应用内风格的表情选择器：图标按钮 + portal 弹层，分类切换并记住最近使用。
 * 弹层挂到 body，避免被工具栏的卡片层叠或滚动容器裁剪。
 */
export function EmojiPicker({
  onSelect,
  ariaLabel,
  disabled = false,
}: EmojiPickerProps): ReactNode {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryId>('frequent');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left - 120, window.innerWidth - POPOVER_WIDTH - 8));
    const below = rect.bottom + 6;
    const top =
      below + POPOVER_HEIGHT <= window.innerHeight - 8
        ? below
        : Math.max(8, rect.top - POPOVER_HEIGHT - 6);
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const handleSelect = useCallback(
    (emoji: string): void => {
      const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, RECENT_LIMIT);
      setRecent(next);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 隐私模式下 localStorage 可能不可用，忽略即可
      }
      onSelect(emoji);
      setOpen(false);
    },
    [onSelect, recent],
  );

  const list: string[] = category === 'recent' ? recent : EMOJIS[category];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        title={ariaLabel}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="p-1 text-zinc-400 hover:text-amber-500 transition-colors disabled:opacity-40"
      >
        <Smile className="w-4 h-4" />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={ariaLabel}
            className="fixed z-[70] surface-elevated border border-[var(--color-border)] rounded-xl shadow-xl p-2"
            style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
          >
            <div className="flex flex-wrap gap-1 pb-2 mb-2 border-b border-[var(--color-border)]">
              {recent.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCategory('recent')}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    category === 'recent'
                      ? 'bg-zinc-200/70 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100'
                      : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {t('emoji.recent')}
                </button>
              )}
              {CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    category === item.id
                      ? 'bg-zinc-200/70 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100'
                      : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
            <div
              className="grid grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain"
              style={{ maxHeight: 250 }}
            >
              {list.length === 0 ? (
                <p className="col-span-8 py-8 text-center text-xs text-zinc-400">
                  {t('emoji.empty')}
                </p>
              ) : (
                list.map((emoji, index) => (
                  <button
                    key={`${emoji}-${index}`}
                    type="button"
                    onClick={() => handleSelect(emoji)}
                    className="flex items-center justify-center h-9 rounded-md text-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {emoji}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default EmojiPicker;
