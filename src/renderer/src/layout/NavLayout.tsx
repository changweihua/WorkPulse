import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Link, useLocation, useMatches, useNavigate } from 'react-router-dom';
import AnimatedOutlet from '../components/AnimatedOutlet';
import { AnimatePresence, motion } from 'motion/react';
import {
    Settings,
    FileText,
    ClipboardList,
    Columns3,
    BarChart3,
    Calendar,
    CalendarRange,
    Zap,
    ArrowUp,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { SiOnnx, SiPaddle, SiPaddlepaddle } from 'react-icons/si';
import { useI18n } from '../stores/languageStore';
import { useClickAway } from 'react-use';

interface NavItem {
    path: string;
    icon: React.ReactNode;
    label: string;
    title?: string;
}

interface NavSection {
    id: string;
    label: string;
    items: NavItem[];
}

const SIDEBAR_WIDTH_COLLAPSED = 64;
const SIDEBAR_WIDTH_EXPANDED = 220;
const STORAGE_KEY = 'sidebar-collapsed';

export default function NavLayout() {
    const location = useLocation();
    const matches = useMatches();
    const { t } = useI18n();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showTopBtn, setShowTopBtn] = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const [showMoreMenu, setShowMoreMenu] = useState(false);

    // Tooltip state — track hovered item key and its bounding rect
    const [hoveredItem, setHoveredItem] = useState<{ key: string; rect: DOMRect } | null>(null);

    // Collapsed state, persisted in localStorage
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    // Persist collapsed state
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, String(collapsed));
        } catch {
            // ignore
        }
    }, [collapsed]);

    // 监听主进程导航 IPC（从径向菜单/托盘/快捷键触发）
    const navigate = useNavigate();
    useEffect(() => {
        const cleanup = window.api.on.navigate((page) => {
            navigate(`/${page}`);
        });
        return cleanup;
    }, [navigate]);

    const fluid =
        (matches[matches.length - 1]?.handle as { fluid?: boolean })?.fluid ?? false;

    // Close dropdown on outside click via react-use
    useClickAway(moreMenuRef, () => setShowMoreMenu(false));

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (el) setShowTopBtn(el.scrollTop > 300);
    }, []);

    const scrollToTop = () => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const toggleCollapse = useCallback(() => {
        setCollapsed((prev) => !prev);
    }, []);

    // Tooltip handlers — capture the DOM rect on mouse enter for precise positioning
    const handleItemEnter = useCallback((e: React.MouseEvent, key: string) => {
        if (!collapsed) return;
        setHoveredItem({ key, rect: e.currentTarget.getBoundingClientRect() });
    }, [collapsed]);

    const handleItemLeave = useCallback(() => {
        setHoveredItem(null);
    }, []);

    // ---- Navigation sections ----
    const sections: NavSection[] = [
        {
            id: 'core',
            label: '核心',
            items: [
                { path: 'worklog', icon: <ClipboardList className="w-[18px] h-[18px]" />, label: t('nav.worklog') },
                { path: 'kanban', icon: <Columns3 className="w-[18px] h-[18px]" />, label: t('nav.kanban') },
                { path: 'calendar', icon: <Calendar className="w-[18px] h-[18px]" />, label: t('nav.calendar') },
                { path: 'stats', icon: <BarChart3 className="w-[18px] h-[18px]" />, label: t('nav.stats') },
            ],
        },
        {
            id: 'insights',
            label: '洞察',
            items: [
                { path: 'report', icon: <FileText className="w-[18px] h-[18px]" />, label: t('nav.report') },
                { path: 'reports', icon: <CalendarRange className="w-[18px] h-[18px]" />, label: t('nav.weekly') },
            ],
        },
        {
            id: 'tools',
            label: '工具',
            items: [
                { path: 'ocr', icon: <SiPaddle className="w-[18px] h-[18px]" />, label: t('nav.ocr') },
                { path: 'pp', icon: <SiPaddlepaddle className="w-[18px] h-[18px]" />, label: t('nav.pp') },
                { path: 'xray', icon: <Zap className="w-[18px] h-[18px]" />, label: t('nav.xray') },
                { path: 'onnx', icon: <SiOnnx className="w-[18px] h-[18px]" />, label: t('nav.onnx') },
            ],
        },
    ];

    const isActive = (path: string) =>
        location.pathname === `/${path}` || (path === 'worklog' && location.pathname === '/');

    const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

    // Resolve tooltip label from the hovered key
    const tooltipLabel = hoveredItem
        ? hoveredItem.key === 'settings'
            ? t('nav.settings')
            : sections.flatMap((s) => s.items).find((i) => i.path === hoveredItem.key)?.label ?? ''
        : '';

    return (
        <div className="flex h-full">
            {/* ===== Sidebar ===== */}
            <motion.aside
                className="relative flex flex-col shrink-0 h-full
                           bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl
                           border-r border-zinc-200/40 dark:border-zinc-700/40
                           select-none z-30"
                style={{
                    boxShadow: collapsed
                        ? '2px 0 12px rgba(0,0,0,0.03)'
                        : '4px 0 24px rgba(0,0,0,0.06)',
                }}
                animate={{ width: sidebarWidth }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
                {/* -- Top: brand + toggle -- */}
                <div className="flex items-center justify-between px-4 py-3 shrink-0">
                    <span
                        className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate overflow-hidden whitespace-nowrap"
                        style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }}
                    >
                        工作台
                    </span>
                    {/* Toggle button — always at the far right of sidebar */}
                    <button
                        onClick={toggleCollapse}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700
                                   dark:text-zinc-500 dark:hover:text-zinc-200
                                   hover:bg-zinc-100/60 dark:hover:bg-white/10
                                   transition-colors duration-150 shrink-0 ml-auto"
                        aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
                    >
                        {collapsed ? (
                            <ChevronRight className="w-4 h-4" />
                        ) : (
                            <ChevronLeft className="w-4 h-4" />
                        )}
                    </button>
                </div>

                {/* -- Scrollable nav body -- */}
                <nav className="flex-1 overflow-y-auto overflow-x-hidden pb-2">
                    {sections.map((section, sIdx) => (
                        <div key={section.id} className={sIdx > 0 ? 'mt-2' : ''}>
                            {/* Section divider — thin line when collapsed, label when expanded */}
                            {collapsed ? (
                                <div className="mx-3 my-2 border-t border-zinc-200/40 dark:border-zinc-700/40" />
                            ) : (
                                <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-4 py-2">
                                    {section.label}
                                </h3>
                            )}

                            {section.items.map((item) => {
                                const active = isActive(item.path);
                                const sharedClassName = `
                                    relative flex items-center gap-3 mx-2 rounded-lg text-sm
                                    transition-all duration-150 outline-none cursor-pointer
                                    focus-visible:ring-2 focus-visible:ring-sky-500/70
                                    ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'}
                                    ${
                                        active
                                            ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/15 font-medium'
                                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/60 dark:hover:bg-white/10'
                                    }
                                `;

                                return (
                                    <Link
                                        key={item.path}
                                        to={`/${item.path}`}
                                        className={sharedClassName}
                                        onMouseEnter={(e) => handleItemEnter(e, item.path)}
                                        onMouseLeave={handleItemLeave}
                                    >
                                        {active && (
                                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-blue-500" />
                                        )}
                                        <span className="flex items-center justify-center shrink-0">
                                            {item.icon}
                                        </span>
                                        {!collapsed && (
                                            <span className="truncate whitespace-nowrap">
                                                {item.label}
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                {/* -- Footer: settings -- */}
                <div className="shrink-0 border-t border-zinc-200/40 dark:border-zinc-700/40 pt-1">
                    <Link
                        to="/settings"
                        className={`
                            flex items-center gap-3 mx-2 rounded-lg text-sm outline-none
                            transition-all duration-150 settings-spin
                            focus-visible:ring-2 focus-visible:ring-sky-500/70
                            ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'}
                            ${
                                isActive('settings')
                                    ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/15 font-medium'
                                    : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/60 dark:hover:bg-white/10'
                            }
                        `}
                        onMouseEnter={(e) => handleItemEnter(e, 'settings')}
                        onMouseLeave={handleItemLeave}
                    >
                        {isActive('settings') && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-blue-500" />
                        )}
                        <span className="flex items-center justify-center shrink-0">
                            <Settings className="w-[18px] h-[18px]" />
                        </span>
                        {!collapsed && (
                            <span className="truncate whitespace-nowrap">
                                {t('nav.settings')}
                            </span>
                        )}
                    </Link>
                </div>
            </motion.aside>

            {/* ===== Tooltip (collapsed mode) — positioned via DOM rect ===== */}
            <AnimatePresence>
                {collapsed && hoveredItem && tooltipLabel && (
                    <motion.div
                        key={hoveredItem.key}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.12, ease: 'easeOut' }}
                        className="fixed z-50 px-2.5 py-1.5 text-xs font-medium
                                   bg-zinc-800/90 dark:bg-zinc-100/90
                                   text-white dark:text-zinc-900
                                   rounded-md shadow-lg
                                   pointer-events-none
                                   backdrop-blur-sm whitespace-nowrap"
                        style={{
                            left: hoveredItem.rect.right + 8,
                            top: hoveredItem.rect.top + hoveredItem.rect.height / 2,
                            transform: 'translateY(-50%)',
                        }}
                    >
                        {tooltipLabel}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ===== Main content area ===== */}
            <div ref={scrollRef} className="flex-1 min-w-0 overflow-auto" onScroll={handleScroll}>
                <div className={fluid ? 'h-full' : 'max-w-3xl mx-auto px-4 py-6'}>
                    <AnimatedOutlet />
                </div>

                {/* Scroll-to-top button */}
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
        </div>
    );
}
