import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '../components/TitleBar';

export default function TitleBarLayout() {
    return (
        <div className="h-screen flex flex-col">
            <TitleBar />
            {/* 基础层只铺在内容区：标题栏与导航栏直接透出 Mica 材质 */}
            <div className="flex-1 overflow-auto bg-white/50 dark:bg-[#28282b]/88">
                <Outlet />
            </div>
        </div>
    );
}