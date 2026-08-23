import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ChineseLunarCalendar from '../components/ChineseLunarCalendar';
import { useHolidays, isHolidayDate, isWorkdaySwap, getHolidayName } from '../lib/holiday';
import { Fade } from '../components/Motion';
import {
    Plus,
    Trash2,
    Check,
    Circle,
    CheckCircle2,
    MapPin,
    Clock,
    ListTodo,
    Users,
    X,
    Pencil,
} from 'lucide-react';

interface CalEvent {
    id: number;
    type: 'todo' | 'meeting';
    title: string;
    description: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    location: string;
    completed: number;
    created_at: string;
}

type TabType = 'todo' | 'meeting';

const CalendarPage: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<{
        date: Date;
        dateStr: string;
    } | null>(null);
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>('todo');
    const [showForm, setShowForm] = useState(false);
    const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);

    // 表单状态
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [startTime, setStartTime] = useState('10:00');
    const [endTime, setEndTime] = useState('11:00');
    const [location, setLocation] = useState('');

    useEffect(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        setSelectedDate({
            date: today,
            dateStr: `${year}-${month}-${day}`,
        });
    }, []);

    // 节假日数据（选中日期所在年份）
    const selectedYear = selectedDate ? Number(selectedDate.dateStr.slice(0, 4)) : new Date().getFullYear();
    const holidays = useHolidays(selectedYear);

    // ---------- 左侧日历联动：当月事件标记 ----------
    const [monthMarks, setMonthMarks] = useState<Record<string, { todo: number; done: number; meeting: number }>>({});
    const [calMonth, setCalMonth] = useState<{ year: number; month: number }>({
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
    });

    const loadMonthEvents = useCallback(async (year: number, month: number) => {
        if (!window.api?.event?.byRange) return;
        try {
            const mm = String(month).padStart(2, '0');
            const start = `${year}-${mm}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const end = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
            const list = await window.api.event.byRange(start, end);
            const marks: Record<string, { todo: number; done: number; meeting: number }> = {};
            for (const ev of list || []) {
                if (!marks[ev.event_date]) marks[ev.event_date] = { todo: 0, done: 0, meeting: 0 };
                const m = marks[ev.event_date];
                if (ev.type === 'todo') {
                    m.todo += 1;
                    if (ev.completed) m.done += 1;
                } else {
                    m.meeting += 1;
                }
            }
            setMonthMarks(marks);
        } catch {
            setMonthMarks({});
        }
    }, []);

    useEffect(() => {
        loadMonthEvents(calMonth.year, calMonth.month);
    }, [calMonth, loadMonthEvents]);

    const handleMonthChange = useCallback((year: number, month: number) => {
        setCalMonth((prev) => (prev.year === year && prev.month === month ? prev : { year, month }));
    }, []);

    const loadEvents = useCallback(async (dateStr: string) => {
        if (!window.api?.event) return;
        try {
            const list = await window.api.event.byDate(dateStr);
            setEvents(list || []);
        } catch {
            setEvents([]);
        }
    }, []);

    useEffect(() => {
        if (selectedDate?.dateStr) loadEvents(selectedDate.dateStr);
    }, [selectedDate?.dateStr, loadEvents]);

    const handleDateClick = (date: Date, dateStr: string) => {
        setSelectedDate({ date, dateStr });
        setShowForm(false);
        setEditingEvent(null);
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setStartTime('10:00');
        setEndTime('11:00');
        setLocation('');
        setEditingEvent(null);
    };

    const openNewForm = () => {
        resetForm();
        setShowForm(true);
    };

    const openEditForm = (e: CalEvent) => {
        setEditingEvent(e);
        setTitle(e.title);
        setDescription(e.description || '');
        setStartTime(e.start_time || '10:00');
        setEndTime(e.end_time || '11:00');
        setLocation(e.location || '');
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!title.trim() || !selectedDate) return;
        const base = {
            type: activeTab,
            title: title.trim(),
            description: description.trim(),
            event_date: selectedDate.dateStr,
        };
        try {
            if (editingEvent) {
                await window.api.event.update(editingEvent.id, {
                    ...base,
                    start_time: activeTab === 'meeting' ? startTime : null,
                    end_time: activeTab === 'meeting' ? endTime : null,
                    location: activeTab === 'meeting' ? location.trim() : '',
                });
            } else {
                await window.api.event.add({
                    ...base,
                    start_time: activeTab === 'meeting' ? startTime : null,
                    end_time: activeTab === 'meeting' ? endTime : null,
                    location: activeTab === 'meeting' ? location.trim() : '',
                });
            }
            await loadEvents(selectedDate.dateStr);
            loadMonthEvents(calMonth.year, calMonth.month);
            setShowForm(false);
            resetForm();
        } catch (err) {
            console.error('保存失败', err);
        }
    };

    const handleToggleTodo = async (e: CalEvent) => {
        if (!selectedDate) return;
        await window.api.event.update(e.id, { completed: !e.completed });
        await loadEvents(selectedDate.dateStr);
        loadMonthEvents(calMonth.year, calMonth.month);
    };

    const handleDelete = async (id: number) => {
        if (!selectedDate) return;
        await window.api.event.delete(id);
        await loadEvents(selectedDate.dateStr);
        loadMonthEvents(calMonth.year, calMonth.month);
    };

    const todos = useMemo(() => events.filter((e) => e.type === 'todo'), [events]);
    const meetings = useMemo(() => events.filter((e) => e.type === 'meeting'), [events]);
    const doneCount = todos.filter((t) => t.completed).length;

    const weekDay = selectedDate
        ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][selectedDate.date.getDay()]
        : '';

    return (
        <div className="h-full flex flex-col px-4 md:px-6 pt-6 pb-6 overflow-hidden">
            <div className="flex flex-1 flex-col lg:flex-row gap-5 w-full max-w-[1400px] mx-auto min-h-0">
                {/* 左侧日历 */}
                <div className="lg:w-3/5 flex-1 flex flex-col overflow-hidden rounded-xl min-h-0">
                    <ChineseLunarCalendar
                        onDateClick={handleDateClick}
                        eventMarks={monthMarks}
                        selectedDateStr={selectedDate?.dateStr}
                        onMonthChange={handleMonthChange}
                    />
                </div>

                {/* 右侧面板 */}
                <div className="lg:w-2/5 xl:w-[420px] flex flex-col gap-4 min-h-0 overflow-y-auto">
                    {/* 选中日期卡片 */}
                    <div className="surface-card p-4 border-l-4 border-blue-500 shrink-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-0.5">当前选中</h3>
                                <p className="text-lg font-medium text-zinc-800 dark:text-zinc-100">
                                    {selectedDate ? `${selectedDate.dateStr} ${weekDay}` : '\u00A0'}
                                </p>
                            </div>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 text-right">
                                {selectedDate ? (
                                    isHolidayDate(holidays, selectedDate.dateStr) ? (
                                        <span className="text-red-500 dark:text-red-400">
                                            🏖️ {getHolidayName(holidays, selectedDate.dateStr) || '法定假日'}
                                        </span>
                                    ) : isWorkdaySwap(holidays, selectedDate.dateStr) ? (
                                        <span className="text-emerald-600 dark:text-emerald-400">
                                            💼 调休上班（{holidays[selectedDate.dateStr]?.name}）
                                        </span>
                                    ) : (
                                        '📅 普通日'
                                    )
                                ) : ''}
                            </p>
                        </div>
                        {/* 当日概览 */}
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--color-border)] text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="flex items-center gap-1">
                                <ListTodo size={13} />
                                待办 {todos.length - doneCount}/{todos.length}
                            </span>
                            <span className="flex items-center gap-1">
                                <Users size={13} />
                                会议 {meetings.length}
                            </span>
                        </div>
                    </div>

                    {/* 待办 / 会议 面板 */}
                    <div className="surface-card flex flex-col flex-1 min-h-[300px] overflow-hidden">
                        {/* Tabs */}
                        <div className="shrink-0 flex items-center border-b border-[var(--color-border)]">
                            <button
                                onClick={() => setActiveTab('todo')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition relative ${
                                    activeTab === 'todo'
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                                }`}
                            >
                                <ListTodo size={15} />
                                待办事项
                                {activeTab === 'todo' && (
                                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-500 rounded-full" />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('meeting')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition relative ${
                                    activeTab === 'meeting'
                                        ? 'text-purple-600 dark:text-purple-400'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                                }`}
                            >
                                <Users size={15} />
                                会议预约
                                {activeTab === 'meeting' && (
                                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-purple-500 rounded-full" />
                                )}
                            </button>
                            <button
                                onClick={() => (showForm ? (setShowForm(false), resetForm()) : openNewForm())}
                                className={`shrink-0 mx-2 p-1.5 rounded-lg transition ${
                                    showForm
                                        ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                                        : 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm'
                                }`}
                                title={showForm ? '取消' : `新增${activeTab === 'todo' ? '待办' : '会议'}`}
                            >
                                {showForm ? <X size={15} /> : <Plus size={15} />}
                            </button>
                        </div>

                        {/* 新增/编辑表单 */}
                        {showForm && (
                            <Fade className="shrink-0 p-4 space-y-2.5 surface-inset border-b border-[var(--color-border)]">
                                <input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                    placeholder={activeTab === 'todo' ? '待办内容，如：完成周报' : '会议主题，如：项目评审会'}
                                    autoFocus
                                    className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400"
                                />
                                {activeTab === 'meeting' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="relative">
                                                <Clock size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                                                <input
                                                    type="time"
                                                    value={startTime}
                                                    onChange={(e) => setStartTime(e.target.value)}
                                                    className="w-full pl-8 pr-2 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400"
                                                />
                                            </label>
                                            <label className="relative">
                                                <Clock size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                                                <input
                                                    type="time"
                                                    value={endTime}
                                                    onChange={(e) => setEndTime(e.target.value)}
                                                    className="w-full pl-8 pr-2 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400"
                                                />
                                            </label>
                                        </div>
                                        <label className="relative block">
                                            <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                                            <input
                                                value={location}
                                                onChange={(e) => setLocation(e.target.value)}
                                                placeholder="会议地点 / 链接（可选）"
                                                className="w-full pl-8 pr-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400"
                                            />
                                        </label>
                                    </>
                                )}
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="备注（可选）"
                                    rows={2}
                                    className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 resize-none outline-none focus:border-blue-400"
                                />
                                <button
                                    onClick={handleSave}
                                    disabled={!title.trim()}
                                    className="w-full py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-1.5"
                                >
                                    <Check size={14} />
                                    {editingEvent ? '保存修改' : `添加${activeTab === 'todo' ? '待办' : '会议'}`}
                                </button>
                            </Fade>
                        )}

                        {/* 列表 */}
                        <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarGutter: 'stable' }}>
                            {activeTab === 'todo' ? (
                                todos.length === 0 && !showForm ? (
                                    <EmptyState icon={<ListTodo size={24} />} text="当天暂无待办，点击 + 添加" />
                                ) : (
                                    <ul className="space-y-1">
                                        {todos.map((t) => (
                                            <li
                                                key={t.id}
                                                className="group flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
                                            >
                                                <button
                                                    onClick={() => handleToggleTodo(t)}
                                                    className="shrink-0 mt-0.5 text-zinc-300 dark:text-zinc-600 hover:text-blue-500 transition"
                                                >
                                                    {t.completed ? (
                                                        <CheckCircle2 size={17} className="text-green-500" />
                                                    ) : (
                                                        <Circle size={17} />
                                                    )}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm leading-snug break-words ${
                                                        t.completed
                                                            ? 'text-zinc-400 dark:text-zinc-500 line-through'
                                                            : 'text-zinc-800 dark:text-zinc-100'
                                                    }`}>
                                                        {t.title}
                                                    </p>
                                                    {t.description && (
                                                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 break-words">{t.description}</p>
                                                    )}
                                                </div>
                                                <div className="shrink-0 hidden group-hover:flex items-center gap-0.5">
                                                    <IconBtn onClick={() => openEditForm(t)} title="编辑"><Pencil size={12} /></IconBtn>
                                                    <IconBtn onClick={() => handleDelete(t.id)} title="删除" danger><Trash2 size={12} /></IconBtn>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )
                            ) : meetings.length === 0 && !showForm ? (
                                <EmptyState icon={<Users size={24} />} text="当天暂无会议，点击 + 预约" />
                            ) : (
                                <ul className="space-y-2">
                                    {meetings.map((m) => (
                                        <li
                                            key={m.id}
                                            className="group relative px-3 py-2.5 rounded-xl bg-gradient-to-r from-purple-50/80 to-indigo-50/50 dark:from-purple-900/20 dark:to-indigo-900/10 border border-purple-100/70 dark:border-purple-800/40 hover:shadow-sm transition"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">{m.title}</p>
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                                        {m.start_time && (
                                                            <span className="flex items-center gap-1">
                                                                <Clock size={11} />
                                                                {m.start_time}{m.end_time ? ` – ${m.end_time}` : ''}
                                                            </span>
                                                        )}
                                                        {m.location && (
                                                            <span className="flex items-center gap-1 truncate max-w-[180px]">
                                                                <MapPin size={11} />
                                                                {m.location}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {m.description && (
                                                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 break-words">{m.description}</p>
                                                    )}
                                                </div>
                                                <div className="shrink-0 hidden group-hover:flex items-center gap-0.5">
                                                    <IconBtn onClick={() => openEditForm(m)} title="编辑"><Pencil size={12} /></IconBtn>
                                                    <IconBtn onClick={() => handleDelete(m.id)} title="删除" danger><Trash2 size={12} /></IconBtn>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* 底部统计 */}
                        {activeTab === 'todo' && todos.length > 0 && (
                            <div className="shrink-0 px-4 py-2 border-t border-[var(--color-border)] text-xs text-zinc-400 dark:text-zinc-500 flex items-center justify-between">
                                <span>共 {todos.length} 项</span>
                                <span className="flex items-center gap-1">
                                    <CheckCircle2 size={12} className="text-green-500" />
                                    已完成 {doneCount} · {todos.length > 0 ? Math.round((doneCount / todos.length) * 100) : 0}%
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

function IconBtn({ children, onClick, title, danger }: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-1.5 rounded-md transition ${
                danger
                    ? 'text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
                    : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
            }`}
        >
            {children}
        </button>
    );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-zinc-300 dark:text-zinc-600 gap-2">
            {icon}
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{text}</p>
        </div>
    );
}

export default CalendarPage;
