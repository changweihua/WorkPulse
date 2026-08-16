import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';

export default function DSHPage() {
    const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error' | 'stopped'>('idle');
    const [port, setPort] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [viewCreated, setViewCreated] = useState(false);
    const [offsetTop, setOffsetTop] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

    // ---- 计算偏移量（标题栏 + 导航栏 + 调试栏高度） ----
    const calculateOffset = useCallback(() => {
        let total = 0;
        // 1. 标题栏（可能有 .title-bar 或 data-titlebar）
        const titleBar = document.querySelector('.title-bar') || document.querySelector('[data-titlebar]');
        if (titleBar) {
            const rect = titleBar.getBoundingClientRect();
            total += rect.height;
        }
        // 2. 导航栏（header）
        const header = document.querySelector('header');
        if (header) {
            const rect = header.getBoundingClientRect();
            total += rect.height;
        }
        // 3. 当前组件的调试栏（本组件内的 .debug-bar）
        const debugBar = containerRef.current?.querySelector('.debug-bar');
        if (debugBar) {
            const rect = debugBar.getBoundingClientRect();
            total += rect.height;
        }
        // 如果 total 仍为 0，用默认值（例如 80px）
        if (total === 0) {
            total = 80;
        }
        // 加 1px 间隙
        const newOffset = total + 1;
        if (newOffset !== offsetTop) {
            setOffsetTop(newOffset);
            console.log('📍 计算偏移量:', newOffset);
        }
        return newOffset;
    }, [offsetTop]);

    // ---- 使用 useLayoutEffect 确保 DOM 已更新，并加入重试 ----
    useLayoutEffect(() => {
        // 首次计算
        const doCalc = () => {
            const off = calculateOffset();
            if (off > 0 && viewCreated) {
                window.dsh.resizeView(off);
            }
        };
        // 延迟一帧确保布局完成
        requestAnimationFrame(() => {
            doCalc();
        });
        // 如果第一次计算为 0，每 100ms 重试一次，最多 5 次
        let retries = 0;
        const retryInterval = setInterval(() => {
            if (offsetTop > 0 || retries >= 5) {
                clearInterval(retryInterval);
                return;
            }
            retries++;
            calculateOffset();
        }, 100);
        return () => clearInterval(retryInterval);
    }, [calculateOffset, viewCreated, offsetTop]);

    // ---- 窗口变化时重新计算 ----
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

    // ---- 偏移量变化时调整 BrowserView ----
    useEffect(() => {
        if (viewCreated && offsetTop > 0) {
            window.dsh.resizeView(offsetTop);
        }
    }, [viewCreated, offsetTop]);

    // ---- 其余功能函数（fetchStatus, startDSH, stopDSH, goBack） ----
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
        // 通过 IPC 切换页面
        if (window.api && window.api.send) {
            window.api.send('navigate', 'worklog');
        } else {
            window.history.back();
        }
    }, []);

    // ---- 生命周期 ----
    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    useEffect(() => {
        if (status === 'idle' && !loading) {
            startDSH();
        }
    }, [status, loading, startDSH]);

    // ---- 创建 BrowserView ----
    useEffect(() => {
        if (status === 'running' && port && !viewCreated) {
            window.dsh.createView(`http://127.0.0.1:${port}`)
                .then(() => {
                    setViewCreated(true);
                    // 创建后立即调整一次
                    setTimeout(() => {
                        if (offsetTop > 0) {
                            window.dsh.resizeView(offsetTop);
                        } else {
                            // 如果偏移量还没算出来，强制计算
                            calculateOffset();
                        }
                    }, 100);
                })
                .catch(console.error);
        }
    }, [status, port, viewCreated, offsetTop, calculateOffset]);

    // ---- 组件卸载时销毁 ----
    useEffect(() => {
        return () => {
            window.dsh.destroyView();
        };
    }, []);

    // ---- 引导提示 ----
    const [showTip, setShowTip] = useState(false);
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
            {/* 调试栏（含返回按钮） - 添加 class="debug-bar" 以便计算高度 */}
            <div className="debug-bar shrink-0 bg-gray-200 p-1 text-xs text-gray-700 flex gap-2 flex-wrap items-center" style={{ height: '30px' }}>
                <button onClick={goBack} className="px-2 py-0.5 bg-purple-500 text-white rounded hover:bg-purple-600">← 返回</button>
                <span>状态: {status}</span>
                <span>端口: {port || '无'}</span>
                <span>视图: {viewCreated ? '已创建' : '未创建'}</span>
                <span>偏移: {offsetTop}px</span>
                <button onClick={fetchStatus} className="px-2 py-0.5 bg-blue-500 text-white rounded">刷新</button>
                <button onClick={startDSH} className="px-2 py-0.5 bg-green-500 text-white rounded">启动</button>
                <button onClick={stopDSH} className="px-2 py-0.5 bg-red-500 text-white rounded">停止</button>
            </div>

            {/* 内容区（BrowserView 覆盖） */}
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