import React, { useState, useEffect, useMemo } from 'react';
import { Lunar } from 'lunar-typescript';
import { useHolidays, isHolidayDate, isWorkdaySwap, getHolidayName, type HolidayMap } from '../lib/holiday';

interface DayInfo {
    date: Date;
    dateStr?: string;
    isCurrent: boolean;
    lunarDay: string;
    lunarMonth: string;      // "正""二"…
    lunarFull: string;       // "正月""二月"…（新增）
    festivals: string[];
}

interface ClickInfo {
    isHoliday: boolean;
    isWorkday: boolean;
}

export interface CalendarEvent {
    id: number
    type: 'todo' | 'meeting'
    title: string
    start_time: string | null
    end_time: string | null
    completed: number
}

export interface EventMark {
    todo: number;
    done: number;
    meeting: number;
    /** 完整事件数据：提供时以 iOS 日历风格横条渲染，未提供时回退为圆点 */
    events?: CalendarEvent[];
}

interface ChineseLunarCalendarProps {
    onDateClick?: (date: Date, dateStr: string, info: ClickInfo) => void;
    /** 每月事件标记：dateStr -> {待办数/已完成数/会议数} */
    eventMarks?: Record<string, EventMark>;
    /** 当前选中日期（YYYY-MM-DD），用于高亮 */
    selectedDateStr?: string;
    /** 可见月份变化回调 */
    onMonthChange?: (year: number, month: number) => void;
}

const ChineseLunarCalendar: React.FC<ChineseLunarCalendarProps> = ({
    onDateClick,
    eventMarks,
    selectedDateStr,
    onMonthChange,
}) => {
    const today = new Date();
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
    const holidays = useHolidays(currentYear);

    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();

    const goPrev = () => {
        if (currentMonth === 1) { setCurrentYear(y => y - 1); setCurrentMonth(12); }
        else setCurrentMonth(m => m - 1);
    };
    const goNext = () => {
        if (currentMonth === 12) { setCurrentYear(y => y + 1); setCurrentMonth(1); }
        else setCurrentMonth(m => m + 1);
    };
    const goToday = () => { setCurrentYear(today.getFullYear()); setCurrentMonth(today.getMonth() + 1); };

    // 可见月份变化 -> 通知父级加载该月事件
    useEffect(() => {
        onMonthChange?.(currentYear, currentMonth);
    }, [currentYear, currentMonth, onMonthChange]);

    const days: DayInfo[] = useMemo(() => {
        const result: DayInfo[] = [];
        for (let i = 0; i < firstDayOfMonth; i++) {
            const d = new Date(currentYear, currentMonth - 1, -i);
            const lunar = Lunar.fromDate(d);
            const lm = lunar.getMonthInChinese();
            result.unshift({ date: d, isCurrent: false, lunarDay: lunar.getDayInChinese(), lunarMonth: lm, lunarFull: lm + '月', festivals: lunar.getFestivals() });
        }
        for (let dd = 1; dd <= daysInMonth; dd++) {
            const dateObj = new Date(currentYear, currentMonth - 1, dd);
            const y = dateObj.getFullYear(), m = String(dateObj.getMonth() + 1).padStart(2, '0'), day = String(dateObj.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${day}`;
            const lunar = Lunar.fromDate(dateObj);
            const lm = lunar.getMonthInChinese();
            result.push({ date: dateObj, dateStr, isCurrent: true, lunarDay: lunar.getDayInChinese(), lunarMonth: lm, lunarFull: lm + '月', festivals: lunar.getFestivals() });
        }
        const total = Math.ceil(result.length / 7) * 7;
        for (let dd = 1; dd <= total - result.length; dd++) {
            const dateObj = new Date(currentYear, currentMonth, dd);
            const lunar = Lunar.fromDate(dateObj);
            const lm = lunar.getMonthInChinese();
            result.push({ date: dateObj, isCurrent: false, lunarDay: lunar.getDayInChinese(), lunarMonth: lm, lunarFull: lm + '月', festivals: lunar.getFestivals() });
        }
        return result;
    }, [currentYear, currentMonth, firstDayOfMonth, daysInMonth]);

    const handleClick = (day: DayInfo) => {
        if (!day.isCurrent || !day.dateStr) return;
        onDateClick?.(day.date, day.dateStr, {
            isHoliday: isHolidayDate(holidays, day.dateStr),
            isWorkday: isWorkdaySwap(holidays, day.dateStr),
        });
    };

    // iOS 日历风格横条：最多显示 3 条，超出折叠为 "+N"
    const renderEventBars = (events: CalendarEvent[]) => {
        const MAX_BARS = 3;
        const visible = events.slice(0, MAX_BARS);
        const overflow = events.length - visible.length;

        return (
            <div className="flex flex-col gap-[2px] w-full min-w-0 mt-1">
                {visible.map((ev) => {
                    const isDoneTodo = ev.type === 'todo' && ev.completed === 1;
                    return (
                        <div key={ev.id} className="relative group">
                            <div
                                className={[
                                    'h-[18px] rounded-sm text-[9px] leading-[18px] px-1 truncate text-white font-medium',
                                    ev.type === 'meeting' && 'bg-blue-500',
                                    ev.type === 'todo' && !isDoneTodo && 'bg-orange-400',
                                    isDoneTodo && 'bg-zinc-300 dark:bg-zinc-600',
                                ].filter(Boolean).join(' ')}
                            >
                                {ev.title}
                            </div>
                            {/* 自定义悬浮提示：标题 + 时间段 */}
                            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md bg-zinc-800 dark:bg-zinc-700 text-white text-[10px] leading-tight whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-50">
                                <span className="font-medium">{ev.title}</span>
                                {ev.start_time && (
                                    <span className="ml-1.5 text-zinc-300 dark:text-zinc-400">
                                        {ev.start_time}{ev.end_time ? ` - ${ev.end_time}` : ''}
                                    </span>
                                )}
                                {/* 小箭头指向下方 */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-800 dark:border-t-zinc-700" />
                            </div>
                        </div>
                    );
                })}
                {overflow > 0 && (
                    <div className="relative group">
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-tight px-0.5 cursor-default">
                            +{overflow} more
                        </span>
                        {/* 自定义悬浮提示：列出被折叠的事件 */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md bg-zinc-800 dark:bg-zinc-700 text-white text-[10px] leading-relaxed whitespace-pre opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-50">
                            {events.slice(MAX_BARS).map((ev) => {
                                const time = ev.start_time ? ` ${ev.start_time}` : '';
                                return `${ev.type === 'meeting' ? '📅' : ev.completed ? '✅' : '⬜'} ${ev.title}${time}`;
                            }).join('\n')}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-800 dark:border-t-zinc-700" />
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderDay = (day: DayInfo, idx: number) => {
        const { date, dateStr, isCurrent, lunarDay, lunarFull, festivals } = day;
        const dow = date.getDay();
        const isToday = date.toDateString() === today.toDateString();
        const holidayName = dateStr ? getHolidayName(holidays, dateStr) : '';
        const isHolidayDay = dateStr ? isHolidayDate(holidays, dateStr) : false;
        const isWorkdayDay = dateStr ? isWorkdaySwap(holidays, dateStr) : false;
        const isWeekend = (dow === 0 || dow === 6) && isCurrent;
        const marks = dateStr ? eventMarks?.[dateStr] : undefined;
        const pendingTodo = marks ? marks.todo - marks.done : 0;
        const isSelected = !!dateStr && dateStr === selectedDateStr;

        // 底部文字：节日名 > 农历节日 > "正月 初一"
        const subText = holidayName || (festivals.length > 0 ? festivals[0] : `${lunarFull}${lunarDay}`);

        return (
            <div
                key={idx}
                onClick={() => handleClick(day)}
                className={[
                    // 基础：bg-gray-50 底色 + flex 上下分区 + 相对定位（给休/班 absolute 用）
                    'relative h-full flex flex-col justify-between p-2 rounded-lg transition-all duration-150 cursor-pointer',
                    'bg-gray-50/80 hover:bg-gray-100/90 border border-transparent dark:bg-zinc-800/40 dark:hover:bg-zinc-700/50',
                    !isCurrent && 'opacity-35 pointer-events-none bg-gray-50/30 dark:bg-zinc-800/20',
                    isToday && 'bg-blue-50/70 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/30 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.75 before:rounded-full before:bg-blue-500',
                    isSelected && 'ring-2 ring-blue-400/70 border-blue-200 bg-blue-50/80 dark:border-blue-500/40 dark:bg-blue-500/10',
                    isHolidayDay && 'bg-red-50/50 dark:bg-red-500/10',
                    isWorkdayDay && 'bg-emerald-50/50 dark:bg-emerald-500/10',
                ].filter(Boolean).join(' ')}
            >
                {/* 上半区：公历日期（水平居中）+ 休/班 badge（absolute 右上，不干扰居中） */}
                <div className="relative flex justify-center">
                    <span className={[
                        'text-lg md:text-xl font-semibold leading-none text-center',
                        isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-zinc-100',
                        isWeekend && !isWorkdayDay && !isHolidayDay && 'text-gray-400 dark:text-zinc-600',
                        isHolidayDay && 'text-red-500 dark:text-red-400',
                        isWorkdayDay && 'text-emerald-600 dark:text-emerald-400',
                    ].filter(Boolean).join(' ')}>
                        {date.getDate()}
                    </span>
                    {/* 休/班 badge 挂右上，不参与居中布局 */}
                    <div className="absolute -top-0.5 -right-0.5 flex gap-0.5">
                        {isHolidayDay && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500 text-white shadow-sm">
                                休
                            </span>
                        )}
                        {isWorkdayDay && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-500 text-white shadow-sm">
                                班
                            </span>
                        )}
                    </div>
                </div>

                {/* 下半区：事件横条（iOS 风格）或 农历/节日 + 圆点回退 */}
                {isCurrent && (
                    marks?.events && marks.events.length > 0 ? (
                        <>
                            {/* 农历信息保持可见：小号弱化文字，位于事件条上方 */}
                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-tight truncate block text-center">
                                {subText}
                            </span>
                            {renderEventBars(marks.events)}
                        </>
                    ) : (
                        <div className="text-center">
                            <span className={[
                                'text-[11px] md:text-xs truncate block',
                                isHolidayDay ? 'text-red-400 font-medium dark:text-red-400/90' : 'text-gray-400 dark:text-zinc-500',
                                isWorkdayDay && 'text-emerald-600/70 dark:text-emerald-400/70',
                            ].filter(Boolean).join(' ')} title={subText}>
                                {subText}
                            </span>
                            {/* 事件标记：琥珀点=未完成待办 / 绿点=待办全部完成 / 紫点=会议 */}
                            {marks && (marks.todo > 0 || marks.meeting > 0) && (
                                <div className="flex items-center justify-center gap-1 mt-0.5">
                                    {marks.todo > 0 && (
                                        <span
                                            className={`w-1.5 h-1.5 rounded-full ${pendingTodo > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                            title={pendingTodo > 0 ? `${pendingTodo} 项待办` : '待办已全部完成'}
                                        />
                                    )}
                                    {marks.meeting > 0 && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500" title={`${marks.meeting} 个会议`} />
                                    )}
                                </div>
                            )}
                        </div>
                    )
                )}
            </div>
        );
    };

    return (
        <div className="w-full flex-1 flex flex-col bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm rounded-xl shadow-sm border border-gray-100/80 dark:border-zinc-800/50 overflow-hidden select-none">
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                <button onClick={goPrev} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/10 transition text-xl">
                    ‹
                </button>
                <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold tracking-tight text-gray-800 dark:text-zinc-100">
                        {currentYear} 年 {currentMonth} 月
                    </span>
                    <button onClick={goToday} className="text-sm font-medium text-blue-500 hover:text-blue-600 hover:bg-blue-50/60 dark:hover:bg-blue-500/10 px-3 py-1 rounded-md transition">
                        今天
                    </button>
                </div>
                <button onClick={goNext} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/10 transition text-xl">
                    ›
                </button>
            </div>

            {/* 周几栏 */}
            <div className="grid grid-cols-7 text-center border-b border-gray-50 dark:border-zinc-800/60 shrink-0">
                {['日', '一', '二', '三', '四', '五', '六'].map((w, i) => (
                    <div key={w} className={`py-2.5 text-sm font-medium ${i === 0 || i === 6 ? 'text-gray-400 dark:text-zinc-600' : 'text-gray-500 dark:text-zinc-500'}`}>
                        {w}
                    </div>
                ))}
            </div>

            {/* 网格 */}
            <div className="flex-1 min-h-0 grid grid-cols-7 gap-1.5 p-2">
                {days.map(renderDay)}
            </div>
        </div>
    );
};

export default ChineseLunarCalendar;