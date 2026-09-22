import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router';
import { createHashRouter } from 'react-router-dom';
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
const RssPage = lazy(() => import('./pages/RssPage'));
const FluidGlassPage = lazy(() => import('./pages/FluidGlassPage'));
const DotnetBridgePage = lazy(() => import('./pages/DotnetBridgePage'));
const ModelConfigPage = lazy(() => import('./pages/ModelConfigPage'));
const AiStatsPage = lazy(() => import('./pages/AiStatsPage'));

function PageLoader() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <div className="relative w-[68px] h-[68px] flex items-center justify-center">
        {/* 外圈：圆形旋转环 */}
        <div className="absolute inset-0 rounded-full border-[2px] border-transparent border-t-indigo-400 border-r-indigo-300 animate-spin" />
        <div
          className="absolute -inset-[4px] rounded-full border border-transparent border-b-indigo-300/20 border-l-indigo-400/10 animate-spin"
          style={{ animationDirection: 'reverse', animationDuration: '2.4s' }}
        />
        {/* 内部方形 Logo */}
        <div className="w-[44px] h-[44px] rounded-[12px] bg-gradient-to-br from-indigo-500 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/25 relative z-[1]">
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6h16M4 12h16M4 18h8" />
          </svg>
        </div>
      </div>
      <span className="text-xs text-zinc-400 animate-pulse">加载中...</span>
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
          {
            path: 'worklog',
            element: (
              <Suspense fallback={<PageLoader />}>
                <WorkLogPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'kanban',
            element: (
              <Suspense fallback={<PageLoader />}>
                <KanbanPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'report',
            element: (
              <Suspense fallback={<PageLoader />}>
                <ReportPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'reports',
            element: (
              <Suspense fallback={<PageLoader />}>
                <ReportsPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'stats',
            element: (
              <Suspense fallback={<PageLoader />}>
                <StatsPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'calendar',
            element: (
              <Suspense fallback={<PageLoader />}>
                <CalendarPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'chat',
            element: (
              <Suspense fallback={<PageLoader />}>
                <ChatPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'xray',
            element: (
              <Suspense fallback={<PageLoader />}>
                <XrayProcessor />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'onnx',
            element: (
              <Suspense fallback={<PageLoader />}>
                <OnnxPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'rss',
            element: (
              <Suspense fallback={<PageLoader />}>
                <RssPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'ocr',
            element: (
              <Suspense fallback={<PageLoader />}>
                <OcrPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'pp',
            element: (
              <Suspense fallback={<PageLoader />}>
                <OcrPagePP />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'fluid-glass',
            element: (
              <Suspense fallback={<PageLoader />}>
                <FluidGlassPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'dotnet',
            element: (
              <Suspense fallback={<PageLoader />}>
                <DotnetBridgePage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'model-config',
            element: (
              <Suspense fallback={<PageLoader />}>
                <ModelConfigPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'ai-stats',
            element: (
              <Suspense fallback={<PageLoader />}>
                <AiStatsPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
          {
            path: 'settings',
            element: (
              <Suspense fallback={<PageLoader />}>
                <SettingsPage />
              </Suspense>
            ),
            handle: { fluid: true },
          },
        ],
      },
      // 404
      { path: '*', element: <NotFound /> },
    ],
  },
]);
