import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '../components/TitleBar';

export default function TitleBarLayout() {
    return (
        <div className="h-screen flex flex-col bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm">
            <TitleBar />
            <div className="flex-1 overflow-auto">
                <Outlet />
            </div>
        </div>
    );
}