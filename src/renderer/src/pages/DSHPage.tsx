// src/renderer/src/pages/DSHPage.tsx
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react'; // 使用与 SettingsPage 相同的图标库

export default function DSHPage() {
    const navigate = useNavigate();
    const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error' | 'stopped'>('idle');
    const [port, setPort] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [viewCreated, setViewCreated] = useState(false);
    const [offsetTop, setOffsetTop] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const [showTip, setShowTip] = useState(false);

    // ---- 计算偏移量（标题栏 + 导航栏 + 调试栏高度） ----
    const calculateOffset = useCallback(() => {
        let total = 0;
        const titleBar = document.querySelector('.title-bar') || document.querySelector('[data-titlebar]');
        if (titleBar) {
            const rect = titleBar.getBoundingClientRect();
            total += rect.height;
        }
        const header = document.querySelector('header');
        if (header) {
            const rect = header.getBoundingClientRect();
            total += rect.height;
        }
        const debugBar = containerRef.current?.querySelector('.debug-bar');
        if (debugBar) {
            const rect = debugBar.getBoundingClientRect();
            total += rect.height;
        }
        if (total === 0) total = 80;
        const newOffset = total + 1;
        if (newOffset !== offsetTop) {
            setOffsetTop(newOffset);
        }
        return newOffset;
    }, [offsetTop]);

    // ---- 调整 BrowserView ----
    const resizeView = useCallback(() => {
        if (viewCreated && offsetTop > 0) {
            window.dsh.resizeView(offsetTop);
        }
    }, [viewCreated, offsetTop]);

    // ---- DSH 管理 ----
    const fetchStatus = useCallback(async () => {
        try {
            const result = await window.dsh.getStatus();
            setStatus(result.status as any);
            setPort(result.port);
        } catch (err) {
            console.error('fetchStatus error:', err);
        }
    }, []);

    const startDSH = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await window.dsh.start();
            setPort(result.port);
            setStatus('running');
        } catch (err: any) {
            setError(err.message || '启动失败');
            setStatus('error');
        } finally {
            setLoading(false);
        }
    }, []);

    const stopDSH = useCallback(async () => {
        await window.dsh.stop();
        setStatus('stopped');
        setPort(null);
        if (viewCreated) {
            await window.dsh.destroyView();
            setViewCreated(false);
        }
    }, [viewCreated]);

    const goBack = useCallback(async () => {
        await window.dsh.destroyView();
        setViewCreated(false);
        navigate('/worklog');
    }, [navigate]);

    // ---- 生命周期 ----
    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    useEffect(() => {
        if (status === 'idle' && !loading) {
            startDSH();
        }
    }, [status, loading, startDSH]);

    useEffect(() => {
        if (status === 'running' && port && !viewCreated) {
            window.dsh.createView(`http://127.0.0.1:${port}`)
                .then(() => {
                    setViewCreated(true);
                    setTimeout(() => resizeView(), 100);
                })
                .catch(console.error);
        }
    }, [status, port, viewCreated, resizeView]);

    useEffect(() => {
        resizeView();
    }, [offsetTop, resizeView]);

    useLayoutEffect(() => {
        const doCalc = () => {
            const off = calculateOffset();
            if (off > 0 && viewCreated) {
                window.dsh.resizeView(off);
            }
        };
        requestAnimationFrame(doCalc);
        let retries = 0;
        const interval = setInterval(() => {
            if (offsetTop > 0 || retries >= 5) {
                clearInterval(interval);
                return;
            }
            retries++;
            calculateOffset();
        }, 100);
        return () => clearInterval(interval);
    }, [calculateOffset, viewCreated, offsetTop]);

    useEffect(() => {
        const handleResize = () => {
            calculateOffset();
            if (viewCreated && offsetTop > 0) {
                window.dsh.resizeView(offsetTop);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [calculateOffset, viewCreated, offsetTop]);

    useEffect(() => {
        return () => {
            window.dsh.destroyView();
        };
    }, []);

    // ---- 引导提示 ----
    useEffect(() => {
        if (status === 'running') {
            const hasShown = localStorage.getItem('dsh_setup_tip_shown');
            if (!hasShown) {
                setShowTip(true);
                localStorage.setItem('dsh_setup_tip_shown', 'true');
            }
        }
    }, [status]);

    // ---- 渲染 ----
    return (
        <div className="flex flex-col h-full w-full bg-white" ref={containerRef}>
            {/* 调试栏（含返回按钮 - 与 SettingsPage 风格一致） */}
            <div className="debug-bar shrink-0 bg-gray-200 p-1 text-xs text-gray-700 flex gap-2 flex-wrap items-center" style={{ height: '30px' }}>
                <button
                    onClick={goBack}
                    className="flex items-center gap-1 px-2 py-0.5 bg-purple-500 text-white rounded hover:bg-purple-600 transition"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>返回</span>
                </button>
                <span>状态: {status}</span>
                <span>端口: {port || '无'}</span>
                <span>视图: {viewCreated ? '已创建' : '未创建'}</span>
                <span>偏移: {offsetTop}px</span>
                <button onClick={fetchStatus} className="px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600">刷新</button>
                <button onClick={startDSH} className="px-2 py-0.5 bg-green-500 text-white rounded hover:bg-green-600">启动</button>
                <button onClick={stopDSH} className="px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600">停止</button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 relative bg-gray-50">
                {status === 'starting' || loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                            <p>正在启动 DSH 服务...</p>
                        </div>
                    </div>
                ) : status === 'error' ? (
                    <div className="flex items-center justify-center h-full flex-col">
                        <p className="text-red-600 mb-4">启动失败: {error}</p>
                        <button onClick={startDSH} className="px-4 py-2 bg-blue-500 text-white rounded">重试</button>
                    </div>
                ) : status === 'running' && port ? (
                    showTip && (
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white border border-blue-300 shadow-lg rounded-lg p-4 max-w-md z-10">
                            <div className="flex items-start gap-3">
                                <span className="text-2xl">💡</span>
                                <div>
                                    <h3 className="font-semibold text-gray-800">首次使用 DeepSeek Harness</h3>
                                    <p className="text-sm text-gray-600 mt-1">
                                        请在界面右上角点击 <strong>设置</strong>，进入 <strong>模型</strong> 页面，
                                        输入 DeepSeek API Key 后即可使用。
                                    </p>
                                </div>
                                <button onClick={() => setShowTip(false)} className="shrink-0 text-gray-400 hover:text-gray-600">✕</button>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">DSH 未启动</div>
                )}
            </div>
        </div>
    );
}