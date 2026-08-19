import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '../components/TitleBar';

export default function TitleBarLayout() {
    return (
        <div className="h-screen flex flex-col bg-zinc-50/70 dark:bg-zinc-950/70">
            <TitleBar />
            <div className="flex-1 overflow-auto">
                <Outlet />
            </div>
        </div>
    );
}