import React, { useRef, useState, useCallback } from 'react';
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
    ArrowUp,
} from 'lucide-react';
import { SiDeepseek, SiOnnx, SiPaddle, SiPaddlepaddle } from 'react-icons/si';
import { useI18n } from '../stores/languageStore';

export default function NavLayout() {
    const location = useLocation();
    const matches = useMatches();
    const { t } = useI18n();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showTopBtn, setShowTopBtn] = useState(false);

    const fluid =
        (matches[matches.length - 1]?.handle as { fluid?: boolean })?.fluid ?? false;

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (el) setShowTopBtn(el.scrollTop > 300);
    }, []);

    const scrollToTop = () => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const navLink = (path: string, icon: React.ReactNode, label: string) => {
        const isActive =
            location.pathname === `/${path}` || (path === 'worklog' && location.pathname === '/');
        return (
            <Link
                to={`/${path}`}
                className={`px-3 py-1.5 text-sm rounded-md transition-all duration-200 reveal-border ${isActive
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 tab-active'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 hover:scale-[1.02]'
                    }`}
            >
                {icon}
                {label}
            </Link>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {/* 导航栏 - Fluent Acrylic */}
            <header
                className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/40 dark:border-zinc-800/40 
                           bg-white/50 dark:bg-zinc-900/50 backdrop-blur-2xl backdrop-saturate-150 shrink-0"
            >
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
            <div ref={scrollRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
                <div className={fluid ? 'h-full' : 'max-w-3xl mx-auto px-4 py-6'}>
                    <Outlet />
                </div>
            </div>

            {/* 返回顶部按钮 */}
            {showTopBtn && (
                <button
                    onClick={scrollToTop}
                    className="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-zinc-900 dark:bg-zinc-100 
                               text-white dark:text-zinc-900 shadow-lg hover:scale-110 transition-all duration-200"
                    aria-label="返回顶部"
                >
                    <ArrowUp className="w-5 h-5" />
                </button>
            )}
        </div>
    );
}
