import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '../components/TitleBar';

export default function TitleBarLayout() {
    return (
        <div className="h-screen flex flex-col">
            {/* 标题栏与内容区同色涂装：视觉连续且无叠加变深；浅色带蓝晕呼应清新基调 */}
            <div className="bg-[#eef4ff]/70 dark:bg-[#28282b]/88">
                <TitleBar />
            </div>
            <div className="flex-1 overflow-auto bg-[#eef4ff]/70 dark:bg-[#28282b]/88">
                <Outlet />
            </div>
        </div>
    );
}