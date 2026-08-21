import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '../components/TitleBar';

export default function TitleBarLayout() {
    return (
        <div className="h-screen flex flex-col bg-white/50 dark:bg-[#232326]/88">
            <TitleBar />
            <div className="flex-1 overflow-auto">
                <Outlet />
            </div>
        </div>
    );
}