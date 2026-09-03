import { lazy, Suspense } from 'react'
import { createHashRouter, Navigate } from 'react-router-dom';
import TitleBarLayout from './layout/TitleBarLayout';
import NavLayout from './layout/NavLayout';

const WorkLogPage = lazy(() => import('./pages/WorkLogPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const KanbanPage = lazy(() => import('./pages/KanbanPage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const XrayProcessor = lazy(() => import('./pages/XrayProcessor'));
const OnnxPage = lazy(() => import('./pages/OnnxPage'));
const OcrPage = lazy(() => import('./pages/OcrPage'));
const OcrPagePP = lazy(() => import('./pages/OcrPagePP'));

function PageLoader() {
    return (
        <div className="h-full flex items-center justify-center text-zinc-400">
            <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
        </div>
    );
}

const NotFound = () => (
    <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
            <h1 className="text-4xl font-bold text-zinc-800 dark:text-zinc-200">404</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2">页面未找到</p>
        </div>
    </div>
);

export const router = createHashRouter([
    {
        path: '/',
        element: <TitleBarLayout />, // 根布局：始终显示 TitleBar
        children: [
            // 所有需要导航栏的页面放在 NavLayout 下
            {
                element: <NavLayout />,
                children: [
                    { index: true, element: <Navigate to="/worklog" replace /> },
                    { path: 'worklog', element: <Suspense fallback={<PageLoader />}><WorkLogPage /></Suspense> },
                    { path: 'kanban', element: <Suspense fallback={<PageLoader />}><KanbanPage /></Suspense>, handle: { fluid: true } },
                    { path: 'report', element: <Suspense fallback={<PageLoader />}><ReportPage /></Suspense>, handle: { fluid: true } },
                    { path: 'reports', element: <Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>, handle: { fluid: true } },
                    { path: 'stats', element: <Suspense fallback={<PageLoader />}><StatsPage /></Suspense>, handle: { fluid: true } },
                    { path: 'calendar', element: <Suspense fallback={<PageLoader />}><CalendarPage /></Suspense>, handle: { fluid: true } },
                    { path: 'chat', element: <Suspense fallback={<PageLoader />}><ChatPage /></Suspense>, handle: { fluid: true } },
                    { path: 'xray', element: <Suspense fallback={<PageLoader />}><XrayProcessor /></Suspense>, handle: { fluid: true } },
                    { path: 'onnx', element: <Suspense fallback={<PageLoader />}><OnnxPage /></Suspense>, handle: { fluid: true } },
                    { path: 'ocr', element: <Suspense fallback={<PageLoader />}><OcrPage /></Suspense>, handle: { fluid: true } },
                    { path: 'pp', element: <Suspense fallback={<PageLoader />}><OcrPagePP /></Suspense>, handle: { fluid: true } },
                    { path: 'settings', element: <Suspense fallback={<PageLoader />}><SettingsPage /></Suspense> },
                ],
            },
            // 404
            { path: '*', element: <NotFound /> },
        ],
    },
]);
