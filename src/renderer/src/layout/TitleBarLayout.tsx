import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '../components/TitleBar';
import AIChatPanel from '../components/AIChatPanel';
import AIFloatingButton from '../components/AIFloatingButton';

export default function TitleBarLayout() {
    return (
        <div className="h-screen flex flex-col">
            {/* 标题栏与内容区同色涂装：视觉连续且无叠加变深；浅色带蓝晕呼应清新基调 */}
            <div className="bg-[#eef4ff]/70 dark:bg-[#28282b]/88">
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