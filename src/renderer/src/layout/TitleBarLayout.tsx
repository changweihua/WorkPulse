import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '../components/TitleBar';

export default function TitleBarLayout() {
    return (
        <div className="h-screen flex flex-col">
            {/* 标题栏与内容区同色涂装：视觉连续且无叠加变深 */}
            <div className="bg-white/50 dark:bg-[#28282b]/88">
                <TitleBar />
            </div>
            <div className="flex-1 overflow-auto bg-white/50 dark:bg-[#28282b]/88">
                <Outlet />
            </div>
        </div>
    );
}