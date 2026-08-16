import React from 'react';
import { Outlet, Link, useLocation, useMatches } from 'react-router-dom';
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
import { SiDeepseek, SiOnnx, SiPaddle, SiPaddlepaddle } from 'react-icons/si';
import { useI18n } from '../stores/languageStore';

export default function NavLayout() {
    const location = useLocation();
    const matches = useMatches();
    const { t } = useI18n();


    // 关键：从路由 handle 读取 maxWidth，默认为 false（全宽）
    const maxWidth =
        (matches[matches.length - 1]?.handle as { maxWidth?: boolean })?.maxWidth ?? false;

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
        <div className="flex flex-col h-full">
            {/* 导航栏 */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
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
                        {navLink('dsh', <SiDeepseek className="inline-block w-4 h-4 mr-1 -mt-0.5" />, t('nav.dsh'))}
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

            {/* 内容区域 */}
            <div className="flex-1 overflow-auto">
                <div className={`px-4 py-6 ${maxWidth ? '' : 'max-w-3xl mx-auto'}`}>
                                    <Outlet />
                                </div>
            </div>
        </div>
    );
}