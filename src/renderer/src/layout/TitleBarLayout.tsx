import React from 'react';
import { Outlet } from 'react-router';
import { TitleBar } from '../components/TitleBar';
import AIChatPanel from '../components/AIChatPanel';
import AIFloatingButton from '../components/AIFloatingButton';
// L2 导航层玻璃样式：标题栏 L1 玻璃 + reduced-transparency 降级（不挂 Canvas）
import './nav-glass.css';

export default function TitleBarLayout() {
  return (
    <div className="h-screen flex flex-col">
      {/* 标题栏背景让位给 L0 系统材质：背景透明，仅保留分隔边框与浅阴影。
          阶段三 L2：titlebar-glass 只用 L1 CSS 毛玻璃，不挂 WebGL context（context 预算 ≤2 给侧栏/命令面板） */}
      <div className="titlebar-glass bg-transparent border-b border-black/[0.06] dark:border-white/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <TitleBar />
      </div>
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      {/* AI 浮动按钮 — 全局可用 */}
      <AIFloatingButton />
      {/* AI Chat 浮层面板 */}
      <AIChatPanel />
    </div>
  );
}
