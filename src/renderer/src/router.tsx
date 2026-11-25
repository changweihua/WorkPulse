import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router';
import { createHashRouter } from 'react-router-dom';
import TitleBarLayout from './layout/TitleBarLayout';
import NavLayout from './layout/NavLayout';
import { SkeletonLine, SkeletonStatCard } from './components/Skeleton';

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

/**
 * 路由级占位骨架：结构稳定、不旋转不脉冲。
 * 切换页面时只替换骨架内容，避免懒加载首帧闪出全屏 spinner。
 */
function PageLoader() {
  return (
    <div className="h-full w-full p-6 flex flex-col gap-5" aria-busy="true" aria-label="页面加载中">
      <div className="flex flex-col gap-2.5">
        <SkeletonLine width="220px" height="1.5rem" rounded="0.5rem" />
        <SkeletonLine width="360px" height="0.75rem" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>
      <div className="flex flex-col gap-3">
        <SkeletonLine width="100%" height="3.5rem" rounded="1rem" />
        <SkeletonLine width="100%" height="3.5rem" rounded="1rem" />
        <SkeletonLine width="72%" height="3.5rem" rounded="1rem" />
      </div>
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
