import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { Link, useLocation, useMatches } from 'react-router-dom';
import AnimatedOutlet from '../components/AnimatedOutlet';
import { Fade } from '../components/Motion';
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
    MoreHorizontal,
} from 'lucide-react';
import { SiOnnx, SiPaddle, SiPaddlepaddle } from 'react-icons/si';
import { useI18n } from '../stores/languageStore';
import { useClickAway } from 'react-use';

interface NavItem {
    path: string;
    icon: React.ReactNode;
    label: string;
}

export default function NavLayout() {
    const location = useLocation();
    const matches = useMatches();
    const { t } = useI18n();
    const scrollRef = useRef<HTMLDivElement>(null);
    const navRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const [showTopBtn, setShowTopBtn] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [visibleCount, setVisibleCount] = useState(11);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const moreBtnRef = useRef<HTMLButtonElement>(null);
    const [dropdownRight, setDropdownRight] = useState(false);

    const fluid =
        (matches[matches.length - 1]?.handle as { fluid?: boolean })?.fluid ?? false;

    // Close dropdown on outside click via react-use
    useClickAway(moreMenuRef, () => setShowMoreMenu(false));

    // Toggle more menu with dynamic alignment
    const toggleMoreMenu = useCallback(() => {
        if (!showMoreMenu) {
            const btn = moreBtnRef.current;
            if (btn) {
                const rect = btn.getBoundingClientRect();
                // If button is within 140px of viewport right, align dropdown to right
                setDropdownRight(window.innerWidth - rect.right < 140);
            }
        }
        setShowMoreMenu((prev) => !prev);
    }, [showMoreMenu]);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (el) setShowTopBtn(el.scrollTop > 300);
    }, []);

    const scrollToTop = () => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // All nav items
    const allItems: NavItem[] = [
        { path: 'worklog', icon: <ClipboardList className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.worklog') },
        { path: 'kanban', icon: <Columns3 className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.kanban') },
        { path: 'report', icon: <FileText className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.report') },
        { path: 'stats', icon: <BarChart3 className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.stats') },
        { path: 'calendar', icon: <Calendar className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.calendar') },
        { path: 'chat', icon: <Bot className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.chat') },
        { path: 'pp', icon: <SiPaddlepaddle className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.pp') },
        { path: 'xray', icon: <Zap className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.xray') },
        { path: 'onnx', icon: <SiOnnx className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.onnx') },
        { path: 'ocr', icon: <SiPaddle className="inline-block w-4 h-4 mr-1 -mt-0.5" />, label: t('nav.ocr') },

    ];

    // Responsive: measure actual rendered items
    const calculateVisibleItems = useCallback(() => {
        const nav = navRef.current;
        const measure = measureRef.current;
        if (!nav || !measure) return;

        const containerWidth = nav.offsetWidth;
        // Reserve space for: title (approx100px) + settings btn (40px) + more btn (36px) + gaps
        const reservedWidth = 180;
        const availableWidth = containerWidth - reservedWidth;

        // Measure each item's actual rendered width from the hidden measure container
        const itemEls = measure.querySelectorAll('[data-nav-item]');
        if (itemEls.length === 0) return;

        let totalWidth = 0;
        let fitCount = 0;
        const gaps = 4; // gap-1 = 4px

        for (let i = 0; i < itemEls.length; i++) {
            const el = itemEls[i] as HTMLElement;
            const itemWidth = el.offsetWidth + gaps;
            if (totalWidth + itemWidth > availableWidth) break;
            totalWidth += itemWidth;
            fitCount = i + 1;
        }

        // Always show at least3 items
        const count = Math.max(fitCount, 3);
        setVisibleCount(count);
    }, []);

    useLayoutEffect(() => {
        calculateVisibleItems();
    }, [calculateVisibleItems]);

    useEffect(() => {
        const observer = new ResizeObserver(() => {
            calculateVisibleItems();
        });
        if (navRef.current) observer.observe(navRef.current);
        return () => observer.disconnect();
    }, [calculateVisibleItems]);

    const navLink = (path: string, icon: React.ReactNode, label: string) => {
        const isActive =
            location.pathname === `/${path}` || (path === 'worklog' && location.pathname === '/');
        return (
            <Link
                to={`/${path}`}
                onClick={() => setShowMoreMenu(false)}
                className={`relative px-3 py-1.5 text-sm rounded-lg outline-none whitespace-nowrap
                            transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-sky-500/70 ${
                    isActive
                        ? 'bg-zinc-900/85 text-white font-medium shadow-sm ring-1 ring-white/10 dark:bg-white/15 dark:text-zinc-50'
                        : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/60 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-zinc-50'
                }`}
            >
                {icon}
                {label}
            </Link>
        );
    };

    const visibleItems = allItems.slice(0, visibleCount);
    const hiddenItems = allItems.slice(visibleCount);

    return (
        <div ref={navRef} className="flex flex-col h-full">
            {/* Hidden measure container - renders all items off-screen for width measurement */}
            <div
                ref={measureRef}
                className="fixed top-0 left-0 invisible pointer-events-none flex gap-1"
                style={{ zIndex: -1 }}
                aria-hidden
            >
                {allItems.map((item) => (
                    <div
                        key={item.path}
                        data-nav-item
                        className="px-3 py-1.5 text-sm whitespace-nowrap inline-flex items-center"
                    >
                        {item.icon}
                        {item.label}
                    </div>
                ))}
            </div>

            {/* 导航栏 - Mica 半透明 */}
            <header
                className="flex items-center justify-between px-4 py-2.5
                           shrink-0
                           sticky top-0 z-20"
            >
                <div className="flex items-center gap-1 min-w-0">
                    <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mr-4 shrink-0">工作台</h1>
                    {/* Visible nav items - overflow hidden to clip */}
                    <nav className="flex gap-1 overflow-hidden">
                        {visibleItems.map((item) => (
                            <React.Fragment key={item.path}>
                                {navLink(item.path, item.icon, item.label)}
                            </React.Fragment>
                        ))}
                    </nav>
                    {/* More button + dropdown - OUTSIDE overflow-hidden nav so dropdown is visible */}
                    {hiddenItems.length > 0 && (
                        <div className="relative" ref={moreMenuRef}>
                            <button
                                ref={moreBtnRef}
                                onClick={toggleMoreMenu}
                                className={`px-2 py-1.5 text-sm rounded-lg outline-none
                                            transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-sky-500/70 ${
                                    hiddenItems.some(
                                        (item) =>
                                            location.pathname === `/${item.path}` ||
                                            (item.path === 'worklog' && location.pathname === '/')
                                    )
                                        ? 'bg-zinc-900/85 text-white shadow-sm ring-1 ring-white/10 dark:bg-white/15 dark:text-zinc-50'
                                        : showMoreMenu
                                          ? 'bg-zinc-100/80 text-zinc-900 dark:bg-white/10 dark:text-zinc-50'
                                          : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/60 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-zinc-50'
                                }`}
                            >
                                <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {showMoreMenu && (
                                <Fade
                                    className={`absolute top-full mt-1.5 py-1 bg-white/75 dark:bg-zinc-900/75 backdrop-blur-md
                                                rounded-xl shadow-lg shadow-zinc-900/5 border border-zinc-200/40 dark:border-zinc-700/40
                                                min-w-[132px] z-50 whitespace-nowrap ${
                                                    dropdownRight ? 'right-0' : 'left-0'
                                                }`}
                                >
                                    {hiddenItems.map((item) => (
                                        <Link
                                            key={item.path}
                                            to={`/${item.path}`}
                                            onClick={() => setShowMoreMenu(false)}
                                            className={`flex items-center gap-2.5 mx-1.5 my-0.5 px-3 py-2 text-sm rounded-lg outline-none
                                                        transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-sky-500/70 ${
                                                location.pathname === `/${item.path}` ||
                                                (item.path === 'worklog' && location.pathname === '/')
                                                    ? 'bg-zinc-900/8 text-zinc-900 font-medium dark:bg-white/15 dark:text-zinc-50'
                                                    : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-zinc-50'
                                            }`}
                                        >
                                            {item.icon}
                                            {item.label}
                                        </Link>
                                    ))}
                                </Fade>
                            )}
                        </div>
                    )}
                </div>
                <Link
                    to="/settings"
                    className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 
                               hover:bg-zinc-100/60 dark:hover:bg-white/10 rounded-lg outline-none shrink-0 settings-spin
                               transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-sky-500/70"
                    aria-label={t('nav.settings')}
                >
                    <Settings className="w-5 h-5" />
                </Link>
            </header>

            {/* 内容区域 */}
            <div ref={scrollRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
                <div className={fluid ? 'h-full' : 'max-w-3xl mx-auto px-4 py-6'}>
                    <AnimatedOutlet />
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
