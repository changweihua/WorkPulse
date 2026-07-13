import React, { useState, useMemo } from 'react';
import { Lunar } from 'lunar-typescript';

// ==================== 类型定义 ====================
interface DayInfo {
    date: Date;
    dateStr?: string;
    isCurrent: boolean;
    lunarDay: string;
    lunarMonth: string;
    festivals: string[];
}

interface ClickInfo {
    isHoliday: boolean;
    isWorkday: boolean;
}

interface ChineseLunarCalendarProps {
    onDateClick?: (date: Date, dateStr: string, info: ClickInfo) => void;
}

// ==================== 2026 年法定节假日数据 ====================
const SPECIAL_DAYS: Record<string, string> = {
    '2026-01-01': '元旦',
    '2026-01-02': '元旦',
    '2026-01-03': '元旦',
    '2026-01-04': '班',
    '2026-02-17': '春节',
    '2026-02-18': '春节',
    '2026-02-19': '春节',
    '2026-02-20': '春节',
    '2026-02-21': '春节',
    '2026-02-22': '春节',
    '2026-02-23': '春节',
    '2026-02-14': '班',
    '2026-02-28': '班',
    '2026-04-05': '清明节',
    '2026-04-06': '清明节',
    '2026-05-01': '劳动节',
    '2026-05-02': '劳动节',
    '2026-05-03': '劳动节',
    '2026-05-04': '劳动节',
    '2026-05-05': '劳动节',
    '2026-04-26': '班',
    '2026-05-09': '班',
    '2026-06-25': '端午节',
    '2026-06-26': '端午节',
    '2026-06-27': '端午节',
    '2026-10-01': '国庆节',
    '2026-10-02': '国庆节',
    '2026-10-03': '国庆节',
    '2026-10-04': '国庆节',
    '2026-10-05': '国庆节',
    '2026-10-06': '国庆节',
    '2026-10-07': '国庆节',
    '2026-10-08': '国庆节',
    '2026-09-27': '班',
    '2026-10-10': '班',
};

const isHoliday = (dateStr: string): boolean =>
    !!SPECIAL_DAYS[dateStr] && SPECIAL_DAYS[dateStr] !== '班';
const isWorkday = (dateStr: string): boolean => SPECIAL_DAYS[dateStr] === '班';
const getHolidayName = (dateStr: string): string =>
    isHoliday(dateStr) ? SPECIAL_DAYS[dateStr] : '';

// ==================== 组件 ====================
const ChineseLunarCalendar: React.FC<ChineseLunarCalendarProps> = ({
    onDateClick,
}) => {
    const today = new Date();
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);

    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();

    const goPrev = () => {
        if (currentMonth === 1) {
            setCurrentYear((y) => y - 1);
            setCurrentMonth(12);
        } else {
            setCurrentMonth((m) => m - 1);
        }
    };

    const goNext = () => {
        if (currentMonth === 12) {
            setCurrentYear((y) => y + 1);
            setCurrentMonth(1);
        } else {
            setCurrentMonth((m) => m + 1);
        }
    };

    const goToday = () => {
        setCurrentYear(today.getFullYear());
        setCurrentMonth(today.getMonth() + 1);
    };

    const days: DayInfo[] = useMemo(() => {
        const result: DayInfo[] = [];
        for (let i = 0; i < firstDayOfMonth; i++) {
            const d = new Date(currentYear, currentMonth - 1, -i);
            const lunar = Lunar.fromDate(d);
            result.unshift({
                date: d,
                isCurrent: false,
                lunarDay: lunar.getDayInChinese(),
                lunarMonth: lunar.getMonthInChinese(),
                festivals: lunar.getFestivals(),
            });
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(currentYear, currentMonth - 1, d);
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${day}`;
            const lunar = Lunar.fromDate(dateObj);
            result.push({
                date: dateObj,
                dateStr,
                isCurrent: true,
                lunarDay: lunar.getDayInChinese(),
                lunarMonth: lunar.getMonthInChinese(),
                festivals: lunar.getFestivals(),
            });
        }
        const totalSlots = Math.ceil(result.length / 7) * 7;
        for (let d = 1; d <= totalSlots - result.length; d++) {
            const dateObj = new Date(currentYear, currentMonth, d);
            const lunar = Lunar.fromDate(dateObj);
            result.push({
                date: dateObj,
                isCurrent: false,
                lunarDay: lunar.getDayInChinese(),
                lunarMonth: lunar.getMonthInChinese(),
                festivals: lunar.getFestivals(),
            });
        }
        return result;
    }, [currentYear, currentMonth, firstDayOfMonth, daysInMonth]);

    const handleClick = (day: DayInfo) => {
        if (!day.isCurrent || !day.dateStr) return;
        const info: ClickInfo = {
            isHoliday: isHoliday(day.dateStr),
            isWorkday: isWorkday(day.dateStr),
        };
        onDateClick?.(day.date, day.dateStr, info);
    };

    const renderDay = (day: DayInfo, index: number) => {
        const { date, dateStr, isCurrent, lunarDay, lunarMonth, festivals } = day;
        const dayOfWeek = date.getDay();
        const isToday = date.toDateString() === today.toDateString();

        const holidayName = dateStr ? getHolidayName(dateStr) : '';
        const isHolidayDay = dateStr ? isHoliday(dateStr) : false;
        const isWorkdayDay = dateStr ? isWorkday(dateStr) : false;
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6) && isCurrent;

        let bottomText = `${lunarMonth}${lunarDay}`;
        if (holidayName) bottomText = holidayName;
        else if (festivals.length > 0) bottomText = festivals[0];

        let cellClasses =
            'h-full flex flex-col justify-between p-1 rounded-lg bg-gray-50 transition hover:bg-blue-50 cursor-pointer min-h-0';
        if (!isCurrent) cellClasses += ' opacity-35 pointer-events-none';
        if (isToday) cellClasses += ' bg-blue-50 outline outline-2 outline-blue-500 outline-offset-[-2px] hover:bg-blue-100';
        if (isHolidayDay) cellClasses += ' bg-red-50';
        if (isWorkdayDay) cellClasses += ' bg-green-50';
        if (isWeekend && !isWorkdayDay) cellClasses += ' weekend';

        return (
            <div key={index} className={cellClasses} onClick={() => handleClick(day)}>
                <div className="flex justify-between items-center">
                    <span
                        className={`text-sm md:text-base font-medium text-gray-800 ${isWeekend && !isWorkdayDay ? 'text-red-500' : ''
                            } ${isHolidayDay ? 'text-red-600! font-semibold' : ''} ${isWorkdayDay ? 'text-green-600! font-semibold' : ''
                            }`}
                    >
                        {date.getDate()}
                    </span>
                    {isHolidayDay && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-red-500 text-white font-semibold leading-4 shrink-0">
                            休
                        </span>
                    )}
                    {isWorkdayDay && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-green-500 text-white font-semibold leading-4 shrink-0">
                            班
                        </span>
                    )}
                </div>
                <div className="text-right mt-auto">
                    <span
                        className={`text-[10px] md:text-xs text-gray-400 block truncate ${isHolidayDay ? 'text-red-600! font-medium' : ''
                            }`}
                    >
                        {bottomText}
                    </span>
                </div>
            </div>
        );
    };

    return (
        // 【核心】flex-1 填充父容器，flex-col 纵向排列
        <div className="w-full flex-1 flex flex-col bg-white rounded-2xl shadow-sm p-3 md:p-4 select-none overflow-hidden">
            {/* 头部：固定高度，不伸缩 */}
            <div className="flex justify-between items-center mb-3 shrink-0">
                <button
                    onClick={goPrev}
                    className="bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 text-xl transition"
                >
                    ‹
                </button>
                <div className="flex items-center gap-2 text-base md:text-lg font-semibold">
                    <span>
                        {currentYear} 年 {currentMonth} 月
                    </span>
                    <button
                        onClick={goToday}
                        className="text-xs bg-blue-50! text-blue-500! hover:bg-blue-100! font-medium px-2 py-0.5 rounded-md transition"
                    >
                        今天
                    </button>
                </div>
                <button
                    onClick={goNext}
                    className="bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 text-xl transition"
                >
                    ›
                </button>
            </div>

            {/* 星期行：固定高度，不伸缩 */}
            <div className="grid grid-cols-7 text-center mb-1 font-medium text-gray-400 text-xs md:text-sm shrink-0">
                {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
                    <div key={w} className="py-1">
                        {w}
                    </div>
                ))}
            </div>

            {/* 【核心】网格区域：flex-1 填充剩余高度，min-h-0 允许收缩 */}
            <div className="flex-1 min-h-0 grid grid-cols-7 gap-1">
                {days.map((d, i) => renderDay(d, i))}
            </div>
        </div>
    );
};

export default ChineseLunarCalendar;