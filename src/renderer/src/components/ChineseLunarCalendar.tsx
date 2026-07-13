import React, { useState, useMemo } from 'react';
import { Lunar } from 'lunar-typescript';

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

interface ChineseLunarCalendarProps {
    onDateClick?: (date: Date, dateStr: string, info: ClickInfo) => void;
}

const SPECIAL_DAYS: Record<string, string> = {
    '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦', '2026-01-04': '班',
    '2026-02-14': '班', '2026-02-17': '春节', '2026-02-18': '春节', '2026-02-19': '春节',
    '2026-02-20': '春节', '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
    '2026-02-28': '班',
    '2026-04-05': '清明节', '2026-04-06': '清明节', '2026-04-26': '班',
    '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节',
    '2026-05-04': '劳动节', '2026-05-05': '劳动节', '2026-05-09': '班',
    '2026-06-25': '端午节', '2026-06-26': '端午节', '2026-06-27': '端午节',
    '2026-09-27': '班',
    '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节',
    '2026-10-04': '国庆节', '2026-10-05': '国庆节', '2026-10-06': '国庆节',
    '2026-10-07': '国庆节', '2026-10-08': '国庆节', '2026-10-10': '班',
};

const isHoliday = (d: string) => !!SPECIAL_DAYS[d] && SPECIAL_DAYS[d] !== '班';
const isWorkday = (d: string) => SPECIAL_DAYS[d] === '班';
const getHolidayName = (d: string) => isHoliday(d) ? SPECIAL_DAYS[d] : '';

const ChineseLunarCalendar: React.FC<ChineseLunarCalendarProps> = ({ onDateClick }) => {
    const today = new Date();
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);

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
        onDateClick?.(day.date, day.dateStr, { isHoliday: isHoliday(day.dateStr), isWorkday: isWorkday(day.dateStr) });
    };

    const renderDay = (day: DayInfo, idx: number) => {
        const { date, dateStr, isCurrent, lunarDay, lunarFull, festivals } = day;
        const dow = date.getDay();
        const isToday = date.toDateString() === today.toDateString();
        const holidayName = dateStr ? getHolidayName(dateStr) : '';
        const isHolidayDay = dateStr ? isHoliday(dateStr) : false;
        const isWorkdayDay = dateStr ? isWorkday(dateStr) : false;
        const isWeekend = (dow === 0 || dow === 6) && isCurrent;

        // 底部文字：节日名 > 农历节日 > "正月 初一"
        const subText = holidayName || (festivals.length > 0 ? festivals[0] : `${lunarFull}${lunarDay}`);

        return (
            <div
                key={idx}
                onClick={() => handleClick(day)}
                className={[
                    // 基础：bg-gray-50 底色 + flex 上下分区 + 相对定位（给休/班 absolute 用）
                    'relative h-full flex flex-col justify-between p-2 rounded-lg transition-all duration-150 cursor-pointer',
                    'bg-gray-50/80 hover:bg-gray-100/90 border border-transparent',
                    !isCurrent && 'opacity-35 pointer-events-none bg-gray-50/30',
                    isToday && 'bg-blue-50/70 border-blue-100 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.75 before:rounded-full before:bg-blue-500',
                    isHolidayDay && 'bg-red-50/50',
                    isWorkdayDay && 'bg-emerald-50/50',
                ].filter(Boolean).join(' ')}
            >
                {/* 上半区：公历日期（水平居中）+ 休/班 badge（absolute 右上，不干扰居中） */}
                <div className="relative flex justify-center">
                    <span className={[
                        'text-lg md:text-xl font-semibold leading-none text-center',
                        isToday ? 'text-blue-600' : 'text-gray-800',
                        isWeekend && !isWorkdayDay && !isHolidayDay && 'text-gray-400',
                        isHolidayDay && 'text-red-500',
                        isWorkdayDay && 'text-emerald-600',
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

                {/* 下半区：农历 / 节日名 —— 水平居中 */}
                {isCurrent && (
                    <div className="text-center">
                        <span className={[
                            'text-[11px] md:text-xs truncate block',
                            isHolidayDay ? 'text-red-400 font-medium' : 'text-gray-400',
                            isWorkdayDay && 'text-emerald-600/70',
                        ].filter(Boolean).join(' ')}>
                            {subText}
                        </span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-100/80 overflow-hidden select-none">
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
                <button onClick={goPrev} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition text-xl">
                    ‹
                </button>
                <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold tracking-tight text-gray-800">
                        {currentYear} 年 {currentMonth} 月
                    </span>
                    <button onClick={goToday} className="text-sm font-medium text-blue-500 hover:text-blue-600 hover:bg-blue-50/60 px-3 py-1 rounded-md transition">
                        今天
                    </button>
                </div>
                <button onClick={goNext} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition text-xl">
                    ›
                </button>
            </div>

            {/* 周几栏 */}
            <div className="grid grid-cols-7 text-center border-b border-gray-50 shrink-0">
                {['日', '一', '二', '三', '四', '五', '六'].map((w, i) => (
                    <div key={w} className={`py-2.5 text-sm font-medium ${i === 0 || i === 6 ? 'text-gray-400' : 'text-gray-500'}`}>
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