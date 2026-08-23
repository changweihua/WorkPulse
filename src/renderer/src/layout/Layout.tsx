import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useNavigate, useLocation, useMatches } from 'react-router-dom';
import {
    Settings,
    FileText,
    ClipboardList,
    Columns3,
    BarChart3,
    Calendar,
    Bot,
    Zap,
} from 'lucide-react';
import { SiOnnx, SiPaddle, SiPaddlepaddle } from 'react-icons/si';
import { TitleBar } from '../components/TitleBar';
import { useToast } from '../components/Toast';
import { useI18n } from '../stores/languageStore';
import { QuickCreate } from '../components/QuickCreate';

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const matches = useMatches();
    const { t } = useI18n();
    const toast = useToast();
    const updateDownloadedNotifiedRef = useRef(false);
    const [quickCreate, setQuickCreate] = useState<'log' | 'task' | null>(null);

    // 关键：从路由 handle 读取 fluid，默认为 false（受限宽度）
    const fluid =
        (matches[matches.length - 1]?.handle as { fluid?: boolean })?.fluid ?? false;

    // 调试日志（可删除）
    console.log(`[Layout] 当前路径: ${location.pathname}, fluid: ${fluid}`);

    // ---- 监听 IPC 事件 ----
    useEffect(() => {
        const unsubCreate = window.api.on.quickCreate((type) => {
            setQuickCreate(type);
        });
        const unsubNav = window.api.on.navigate((page) => {
            navigate(`/${page}`);
        });
        const unsubUpdate = window.api.on.updateStatus?.((state) => {
            if (state.status === 'downloaded' && !updateDownloadedNotifiedRef.current) {
                updateDownloadedNotifiedRef.current = true;
                toast.success(t('settings.updateDownloaded'));
            }
        });
        return () => {
            unsubCreate();
            unsubNav();
            unsubUpdate?.();
        };
    }, [navigate, toast, t]);

    // ---- 键盘快捷键 ----
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (quickCreate) return;
            const isMod = e.metaKey || e.ctrlKey;
            if (isMod && e.key === '1') {
                e.preventDefault();
                navigate('/worklog');
            } else if (isMod && e.key === '2') {
                e.preventDefault();
                navigate('/kanban');
            } else if (isMod && e.key === '3') {
                e.preventDefault();
                navigate('/report');
            } else if (isMod && e.key === '4') {
                e.preventDefault();
                navigate('/stats');
            } else if (isMod && e.key === '5') {
                e.preventDefault();
                navigate('/calendar');
            } else if (isMod && e.key === ',') {
                e.preventDefault();
                navigate('/settings');
            } else if (e.key === 'Escape' && location.pathname === '/settings') {
                navigate('/worklog');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate, location, quickCreate]);

    // ---- 导航按钮 ----
    const navLink = (path: string, icon: React.ReactNode, label: string) => {
        const isActive =
            location.pathname === `/${path}` || (path === 'worklog' && location.pathname === '/');
        return (
            <Link
                to={`/${path}`}
                className={`px-3 py-1.5 text-sm rounded-md transition-all duration-200 ${isActive
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 tab-active'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:scale-[1.02]'
                    }`}
            >
                {icon}
                {label}
            </Link>
        );
    };

    return (
        <div className="h-screen flex flex-col">
            {/* 标题栏与内容区同色涂装 */}
            <div className="bg-[#eef4ff]/70 dark:bg-[#28282b]/88">
                <TitleBar />
            </div>
            <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/20 dark:border-zinc-700/20">
                <div className="flex items-center gap-1">
                    <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mr-4">工作台</h1>
                    <nav className="flex gap-1">
                        {navLink('worklog', <ClipboardList className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.worklog'))}
                        {navLink('kanban', <Columns3 className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.kanban'))}
                        {navLink('report', <FileText className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.report'))}
                        {navLink('stats', <BarChart3 className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.stats'))}
                        {navLink('calendar', <Calendar className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.calendar'))}
                        {navLink('chat', <Bot className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.chat'))}
                        {navLink('pp', <SiPaddlepaddle className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.pp'))}
                        {navLink('xray', <Zap className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.xray'))}
                        {navLink('onnx', <SiOnnx className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.onnx'))}
                        {navLink('ocr', <SiPaddle className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.ocr'))}

                    </nav>
                </div>
                <Link
                    to="/settings"
                    className="p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors settings-spin"
                    aria-label={t('nav.settings')}
                >
                    <Settings className="w-5 h-5" />
                </Link>
            </header>

            <main className="flex-1 overflow-auto relative">
                <div className={fluid ? '' : 'max-w-3xl mx-auto px-4 py-6'}>
                    <Outlet />
                </div>
            </main>

            {quickCreate && (
                <QuickCreate initialMode={quickCreate} onClose={() => setQuickCreate(null)} />
            )}
        </div>
    );
}