import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../stores/languageStore';

interface DatePickerProps {
  /** 当前日期，格式 YYYY-MM-DD；空串表示未选择 */
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}

const POPOVER_WIDTH = 252;
const POPOVER_HEIGHT = 298;

function parseISO(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 应用内风格的日期选择器。
 *
 * 不再使用原生 input[type=date]（其系统弹窗在 Electron 中与界面风格割裂），
 * 改为 lucide 图标按钮 + 自绘月历弹层。弹层经 portal 挂到 body，
 * 避免被瀑布流卡片的 content-visibility 裁剪或受层叠上下文影响。
 */
export function DatePicker({
  value,
  onChange,
  ariaLabel,
  className = '',
}: DatePickerProps): ReactNode {
  const { t, resolvedLanguage } = useI18n();
  const locale = resolvedLanguage === 'zh' ? 'zh-CN' : 'en-US';
  // “今天”只在挂载时取一次，避免渲染期调用 Date 造成不纯渲染
  const [today] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const initial = parseISO(value) ?? new Date();
    return { year: initial.getFullYear(), month: initial.getMonth() };
  });
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 打开或外部改值（例如切换编辑的日志）时跳到对应月份。
  // 渲染期派生同步：在 effect 里 setView 会多一次渲染，且与打开弹层的同一帧错位
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevValue, setPrevValue] = useState(value);
  if (open !== prevOpen || value !== prevValue) {
    setPrevOpen(open);
    setPrevValue(value);
    if (open) {
      const date = parseISO(value) ?? today;
      setView({ year: date.getFullYear(), month: date.getMonth() });
    }
  }

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
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
    // 捕获阶段监听滚动，日志列表滚动时弹层跟随触发按钮
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
      // 抢在编辑框的 Esc 取消逻辑之前关闭弹层
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const selected = parseISO(value);
  const displayDate = selected
    ? new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(selected)
    : t('datePicker.chooseDate');

  const monthTitle = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
  }).format(new Date(view.year, view.month, 1));

  // 2024-01-07 是周日，按周日开头与项目日历页保持一致
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 7 + i)),
  );

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: firstWeekday + daysInMonth }, (_, i) =>
    i < firstWeekday ? null : i - firstWeekday + 1,
  );
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number): void => {
    setView((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const selectDate = (day: number): void => {
    onChange(formatISO(new Date(view.year, view.month, day)));
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel ?? t('datePicker.chooseDate')}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border border-[var(--color-border)] outline-none transition-colors surface-input dark:text-zinc-100 hover:border-[var(--color-border-strong)] focus:border-zinc-400 ${className}`}
      >
        <CalendarDays className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className="whitespace-nowrap">{displayDate}</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={t('datePicker.chooseDate')}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: POPOVER_WIDTH,
              opacity: position ? 1 : 0,
            }}
            className="fixed z-100 p-2 rounded-xl surface-elevated border border-[var(--color-border)] shadow-xl transition-opacity select-none"
          >
            <div className="flex items-center justify-between px-1 pb-2 border-b border-[var(--color-border)]">
              <button
                type="button"
                aria-label={t('datePicker.prevMonth')}
                title={t('datePicker.prevMonth')}
                onClick={() => shiftMonth(-1)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {monthTitle}
              </span>
              <button
                type="button"
                aria-label={t('datePicker.nextMonth')}
                title={t('datePicker.nextMonth')}
                onClick={() => shiftMonth(1)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mt-2">
              {weekdays.map((weekday, i) => (
                <div
                  key={weekday + i}
                  className={`h-7 flex items-center justify-center text-[10px] font-medium ${
                    i === 0 || i === 6
                      ? 'text-zinc-400 dark:text-zinc-500'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, i) => {
                if (day === null) return <div key={`blank-${i}`} className="h-8" />;
                const iso = formatISO(new Date(view.year, view.month, day));
                const isSelected = iso === value;
                const isToday = iso === formatISO(today);
                const isWeekend = new Date(view.year, view.month, day).getDay() % 6 === 0;
                return (
                  <button
                    key={iso}
                    type="button"
                    title={iso}
                    aria-label={iso}
                    aria-pressed={isSelected}
                    onClick={() => selectDate(day)}
                    className={`h-8 flex items-center justify-center rounded-md text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-500 text-white font-medium hover:bg-blue-600'
                        : `hover:bg-zinc-100 dark:hover:bg-white/10 ${
                            isToday
                              ? 'text-blue-600 ring-1 ring-blue-400/60 dark:text-blue-400'
                              : isWeekend
                                ? 'text-zinc-400 dark:text-zinc-500'
                                : 'text-zinc-700 dark:text-zinc-200'
                          }`
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--color-border)]">
              <span className="text-[10px] text-zinc-400 truncate">{displayDate}</span>
              <button
                type="button"
                onClick={() => {
                  onChange(formatISO(today));
                  setOpen(false);
                }}
                className="px-2 py-1 text-xs text-blue-500 hover:text-blue-600 rounded-md hover:bg-blue-50/60 dark:hover:bg-blue-500/10 transition-colors"
              >
                {t('common.today')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default DatePicker;
