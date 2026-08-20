import { createHashRouter, Navigate } from 'react-router-dom';
import TitleBarLayout from './layout/TitleBarLayout';
import NavLayout from './layout/NavLayout';
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
                    { path: 'worklog', element: <WorkLogPage /> },
                    { path: 'kanban', element: <KanbanPage />, handle: { fluid: true } },
                    { path: 'report', element: <ReportPage />, handle: { fluid: true } },
                    { path: 'stats', element: <StatsPage />, handle: { fluid: true } },
                    { path: 'calendar', element: <CalendarPage />, handle: { fluid: true } },
                    { path: 'chat', element: <ChatPage /> },
                    { path: 'xray', element: <XrayProcessor />, handle: { fluid: true } },
                    { path: 'onnx', element: <OnnxPage />, handle: { fluid: true } },
                    { path: 'ocr', element: <OcrPage />, handle: { fluid: true } },
                    { path: 'pp', element: <OcrPagePP />, handle: { fluid: true } },
                
                ],
            },
            // 设置页直接挂在 TitleBarLayout 下，没有导航栏
            { path: 'settings', element: <SettingsPage /> },
            // 404
            { path: '*', element: <NotFound /> },
        ],
    },
]);