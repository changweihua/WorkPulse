import { createBrowserRouter } from 'react-router-dom';
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

export const router = createBrowserRouter([
    {
        path: '/',
        element: <Layout />,
        children: [
            // 需要居中的页面（设置 maxWidth: true）
            { index: true, element: <WorkLogPage />, handle: { maxWidth: false } },
            { path: 'worklog', element: <WorkLogPage />, handle: { maxWidth: false } },
            { path: 'kanban', element: <KanbanPage />, handle: { maxWidth: true } },
            { path: 'report', element: <ReportPage />, handle: { maxWidth: false } },
            { path: 'stats', element: <StatsPage />, handle: { maxWidth: false } },
            { path: 'calendar', element: <CalendarPage />, handle: { maxWidth: true } },
            { path: 'chat', element: <ChatPage />, handle: { maxWidth: false } },
            { path: 'xray', element: <XrayProcessor />, handle: { maxWidth: true } },
            { path: 'onnx', element: <OnnxPage />, handle: { maxWidth: true } },
            { path: 'ocr', element: <OcrPage />, handle: { maxWidth: true } },
            { path: 'pp', element: <OcrPagePP />, handle: { maxWidth: true } },
            // 全宽页面（不设置 handle 或显式设置 maxWidth: false）
            { path: 'dsh', element: <DSHPage /> }, // 默认全宽
            { path: 'settings', element: <SettingsPage /> }, // 默认全宽
        ],
    },
]);