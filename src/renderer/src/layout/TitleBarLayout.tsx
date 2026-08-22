import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '../components/TitleBar';

export default function TitleBarLayout() {
    return (
        <div className="h-screen flex flex-col relative">
            {/* 全窗口统一画布：标题栏、导航栏、内容区共享同一底色，消除割裂感 */}
            <div className="absolute inset-0 bg-white/50 dark:bg-[#28282b]/88 pointer-events-none" />
            <TitleBar />
            <div className="flex-1 overflow-auto relative">
                <Outlet />
            </div>
        </div>
    );
}