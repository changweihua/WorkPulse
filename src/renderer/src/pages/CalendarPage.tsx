import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import ChineseLunarCalendar from '../components/ChineseLunarCalendar';

interface ClickRecord {
    dateStr: string;
    isHoliday: boolean;
    isWorkday: boolean;
    statusText: string;
}

const CalendarPage: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<{
        date: Date;
        dateStr: string;
        info: { isHoliday: boolean; isWorkday: boolean };
    } | null>(null);
    const [records, setRecords] = useState<ClickRecord[]>([]);

    const rightPanelRef = useRef<HTMLDivElement>(null);
    const fixedPanelRef = useRef<HTMLDivElement>(null);
    const historyScrollRef = useRef<HTMLDivElement>(null);

    const updateHistoryHeight = () => {
        if (!rightPanelRef.current || !fixedPanelRef.current || !historyScrollRef.current) return;
        const rightHeight = rightPanelRef.current.clientHeight;
        const fixedHeight = fixedPanelRef.current.offsetHeight;
        const gap = 16;
        const remaining = rightHeight - fixedHeight - gap;
        if (remaining > 50) {
            historyScrollRef.current.style.height = remaining + 'px';
        } else {
            historyScrollRef.current.style.height = '100px';
        }
    };

    useLayoutEffect(() => {
        updateHistoryHeight();
        let timeoutId: ReturnType<typeof setTimeout>;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                requestAnimationFrame(updateHistoryHeight);
            }, 100);
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeoutId);
        };
    }, []);

    useEffect(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        setSelectedDate({
            date: today,
            dateStr,
            info: { isHoliday: false, isWorkday: false },
        });
    }, []);

    const handleDateClick = (date: Date, dateStr: string, info: { isHoliday: boolean; isWorkday: boolean }) => {
        const statusText = info.isHoliday ? '🏖️ 法定假日' : info.isWorkday ? '💼 调休上班' : '📅 普通日';
        setSelectedDate({ date, dateStr, info });
        setRecords((prev) => [{ dateStr, isHoliday: info.isHoliday, isWorkday: info.isWorkday, statusText }, ...prev.slice(0, 49)]);
    };

    const clearRecords = () => setRecords([]);

    return (
        <div className="flex-1 flex flex-col bg-gray-50 px-4 md:px-6 pt-6 md:pt-10 pb-6 md:pb-10 overflow-hidden">
            <div className="flex flex-1 flex-col lg:flex-row gap-6 w-full lg:w-[80vw] mx-auto min-h-0">
                <div className="lg:w-2/3 xl:w-3/5 flex-1 flex flex-col overflow-hidden rounded-xl">
                    <ChineseLunarCalendar onDateClick={handleDateClick} />
                </div>

                <div ref={rightPanelRef} className="lg:w-1/3 xl:w-2/5 flex flex-col gap-4 flex-1 min-h-0">
                    {/* 固定区域 */}
                    <div ref={fixedPanelRef} className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500 shrink-0">
                        <h3 className="text-sm font-semibold text-blue-500 uppercase tracking-wider mb-1">当前选中</h3>
                        <p className="text-lg font-medium text-gray-800">
                            {selectedDate ? selectedDate.dateStr : '\u00A0'}
                        </p>
                        <p className="text-sm text-gray-600">
                            {selectedDate ? (
                                selectedDate.info.isHoliday ? '🏖️ 法定假日' :
                                    selectedDate.info.isWorkday ? '💼 调休上班' : '📅 普通日'
                            ) : '\u00A0'}
                        </p>
                    </div>

                    {/* 历史记录 */}
                    <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">点击历史</h3>
                            {records.length > 0 && (
                                <button onClick={clearRecords} className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md transition">
                                    清空
                                </button>
                            )}
                        </div>
                        {/* 关键：添加 scrollbarGutter: 'stable' 消除滚动条引起的宽度变化抖动 */}
                        <div
                            ref={historyScrollRef}
                            className="overflow-y-auto pr-2"
                            style={{ height: '200px', scrollbarGutter: 'stable' }}
                        >
                            {records.length === 0 ? (
                                <p className="text-gray-400 text-sm text-center mt-6">暂无记录</p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {records.map((rec, idx) => (
                                        <li key={idx} className="py-2 flex justify-between text-sm">
                                            <span className="font-medium text-gray-700">{rec.dateStr}</span>
                                            <span className="text-gray-500">{rec.statusText}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CalendarPage;