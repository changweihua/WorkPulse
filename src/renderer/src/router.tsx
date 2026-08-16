import { createHashRouter } from 'react-router-dom';
import Layout from './Layout';
import WorkLogPage from './pages/WorkLogPage';
import ReportPage from './pages/ReportPage';
import KanbanPage from './pages/KanbanPage';
import StatsPage from './pages/StatsPage';
import SettingsPage from './pages/SettingsPage';
import CalendarPage from './pages/CalendarPage';
import ChatPage from './pages/ChatPage';
import XrayProcessor from './pages/XrayProcessor';
import OnnxPage from './pages/OnnxPage';
import OcrPage from './pages/OcrPage';
import OcrPagePP from './pages/OcrPagePP';
import DSHPage from './pages/DSHPage';

const NotFound = () => (
    <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
            <h1 className="text-4xl font-bold text-zinc-800 dark:text-zinc-200">404</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">页面未找到</p>
        </div>
    </div>
);

export const router = createHashRouter([
    // 1. 主布局（包含标题栏和导航栏），常规页面 + DSH 在此
    {
        path: '/',
        element: <Layout />,
        children: [
            { index: true, element: <WorkLogPage /> },
            { path: 'worklog', element: <WorkLogPage /> },
            { path: 'kanban', element: <KanbanPage />, handle: { maxWidth: true } },
            { path: 'report', element: <ReportPage /> },
            { path: 'stats', element: <StatsPage />},
            { path: 'calendar', element: <CalendarPage />, handle: { maxWidth: true } },
            { path: 'chat', element: <ChatPage /> },
            { path: 'xray', element: <XrayProcessor />, handle: { maxWidth: true } },
            { path: 'onnx', element: <OnnxPage />, handle: { maxWidth: true } },
            { path: 'ocr', element: <OcrPage />, handle: { maxWidth: true } },
            { path: 'pp', element: <OcrPagePP />, handle: { maxWidth: true } },
            { path: 'dsh', element: <DSHPage />, handle: { maxWidth: true } },
        ],
    },
    // 2. 独立的全屏路由（无 Layout 包裹）—— 仅 SettingsPage
    {
        path: '/settings',
        element: <SettingsPage />,
    },
    // 3. 404 兜底
    {
        path: '*',
        element: <NotFound />,
    },
]);