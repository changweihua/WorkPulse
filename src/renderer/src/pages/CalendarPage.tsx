import React, { useState } from 'react';
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

    const handleDateClick = (date: Date, dateStr: string, info: { isHoliday: boolean; isWorkday: boolean }) => {
        const statusText = info.isHoliday ? '🏖️ 法定假日' : info.isWorkday ? '💼 调休上班' : '📅 普通日';
        setSelectedDate({ date, dateStr, info });
        setRecords((prev) => [{ dateStr, isHoliday: info.isHoliday, isWorkday: info.isWorkday, statusText }, ...prev.slice(0, 49)]);
    };

    const clearRecords = () => setRecords([]);

    return (
        // 【关键修复】使用 flex-1 而不是 h-full！
        // 因为父容器 main 是 overflow-auto，h-full 会失效
        <div className="flex-1 flex flex-col bg-gray-50 px-4 md:px-6 pt-6 md:pt-10 pb-6 md:pb-10 overflow-hidden">

            {/* 左右容器：flex-1 填充剩余空间 */}
            <div className="flex flex-1 flex-col lg:flex-row gap-6 w-full lg:w-[80vw] mx-auto min-h-0">

                {/* 左侧日历容器：flex-1 让它填满高度 */}
                <div className="lg:w-2/3 xl:w-3/5 flex-1 flex flex-col overflow-hidden rounded-xl">
                    <ChineseLunarCalendar onDateClick={handleDateClick} />
                </div>

                {/* 右侧面板：flex-1 让它填满高度 */}
                <div className="lg:w-1/3 xl:w-2/5 flex flex-col gap-4 flex-1 min-h-0">
                    {/* 当前选中 - 固定高度 */}
                    <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500 shrink-0">
                        <h3 className="text-sm font-semibold text-blue-500 uppercase tracking-wider mb-2">当前选中</h3>
                        {selectedDate ? (
                            <>
                                <p className="text-lg font-medium text-gray-800">{selectedDate.dateStr}</p>
                                <p className="text-sm text-gray-600 mt-1">
                                    {selectedDate.info.isHoliday ? '🏖️ 法定假日' : selectedDate.info.isWorkday ? '💼 调休上班' : '📅 普通日'}
                                </p>
                            </>
                        ) : (
                            <p className="text-gray-400 text-sm">暂无选择，请点击日期</p>
                        )}
                    </div>

                    {/* 点击历史 - flex-1 填充剩余空间 */}
                    <div className="bg-white rounded-xl shadow-sm p-5 flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">点击历史</h3>
                            {records.length > 0 && (
                                <button onClick={clearRecords} className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md transition">清空</button>
                            )}
                        </div>
                        <div className="flex-1 min-h-0">
                            <div className="h-full overflow-y-auto pr-2">
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
        </div>
    );
};

export default CalendarPage;