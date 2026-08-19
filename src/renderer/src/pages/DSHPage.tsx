import { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type ViewStatus = 'idle' | 'starting' | 'loading' | 'running' | 'error' | 'stopped' | 'crashed';

const STATUS_LABELS: Record<ViewStatus, string> = {
    idle: '未启动',
    starting: '启动中...',
    loading: '加载中...',
    running: '运行中',
    error: '出错',
    stopped: '已停止',
    crashed: '已崩溃',
};

const STATUS_COLORS: Record<ViewStatus, string> = {
    idle: 'text-gray-400',
    starting: 'text-blue-500',
    loading: 'text-blue-500',
    running: 'text-green-500',
    error: 'text-red-500',
    stopped: 'text-gray-400',
    crashed: 'text-red-600',
};

const STATUS_ICONS: Record<ViewStatus, React.ReactNode> = {
    idle: null,
    starting: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    loading: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    running: <CheckCircle2 className="w-3.5 h-3.5" />,
    error: <AlertCircle className="w-3.5 h-3.5" />,
    stopped: null,
    crashed: <AlertCircle className="w-3.5 h-3.5" />,
};

const TOOLBAR_HEIGHT = 32;

export default function DSHPage() {
    const navigate = useNavigate();
    const [status, setStatus] = useState<ViewStatus>('idle');
    const [port, setPort] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [viewCreated, setViewCreated] = useState(false);
    const [viewLoading, setViewLoading] = useState(false);
    const viewRef = useRef<HTMLDivElement>(null);
    const cleanupRef = useRef<(() => void) | null>(null);

    // ---- Status change listener (main → renderer push) ----
    useEffect(() => {
        const cleanup = window.dsh.onStatusChanged((data) => {
            if (data.status) setStatus(data.status as ViewStatus);
            if (data.autoRestarting) {
                setError(`服务崩溃，正在自动重启 (第${data.attempt}次)...`);
            } else if (data.status === 'error' && data.reason === 'crash' && !data.autoRestarting) {
                setError('服务崩溃且自动重启失败');
            }
        });
        return cleanup;
    }, []);

    // ---- Fetch initial status ----
    useEffect(() => {
        window.dsh.getStatus().then((result) => {
            setStatus(result.status as ViewStatus);
            setPort(result.port);
        });
    }, []);

    // ---- Auto-start if idle ----
    useEffect(() => {
        if (status === 'idle' && !loading) {
            startDSH();
        }
    }, [status, loading]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---- Start DSH service ----
    const startDSH = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await window.dsh.start();
            setPort(result.port);
        } catch (err: any) {
            setError(err.message || '启动失败');
            setStatus('error');
        } finally {
            setLoading(false);
        }
    }, []);

    // ---- Stop DSH service ----
    const stopDSH = useCallback(async () => {
        await window.dsh.stop();
        setStatus('stopped');
        setPort(null);
        if (viewCreated) {
            await window.dsh.destroyView();
            setViewCreated(false);
        }
    }, [viewCreated]);

    // ---- Create BrowserView ----
    useEffect(() => {
        if (status === 'running' && port && !viewCreated) {
            window.dsh.createView(`http://127.0.0.1:${port}`, TOOLBAR_HEIGHT)
                .then(() => setViewCreated(true))
                .catch(console.error);
        }
    }, [status, port, viewCreated]);

    // ---- Destroy view on unmount ----
    useEffect(() => {
        return () => {
            window.dsh.destroyView();
        };
    }, []);

    // ---- Cleanup status listener on unmount ----
    useEffect(() => {
        return () => {
            cleanupRef.current?.();
        };
    }, []);

    // ---- Render ----
    return (
        <div className="flex flex-col h-full bg-white/70 dark:bg-zinc-950/70">
            {/* Toolbar */}
            <div
                className="shrink-0 flex items-center gap-2 px-3 bg-gray-100/60 backdrop-blur-xl border-b border-gray-200/40 text-xs"
                style={{ height: TOOLBAR_HEIGHT }}
            >
                <button
                    onClick={() => {
                        window.dsh.destroyView();
                        setViewCreated(false);
                        navigate('/worklog');
                    }}
                    className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-600"
                    title="返回"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-gray-300" />

                {/* Status indicator */}
                <div className={`flex items-center gap-1 ${STATUS_COLORS[status]}`}>
                    {STATUS_ICONS[status]}
                    <span>{STATUS_LABELS[status]}</span>
                </div>

                {port && (
                    <span className="text-gray-400">:{port}</span>
                )}

                {error && (
                    <span className="text-red-500 truncate max-w-[300px]" title={error}>
                        {error}
                    </span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Actions */}
                <button
                    onClick={() => window.dsh.getStatus().then(r => { setStatus(r.status as ViewStatus); setPort(r.port); })}
                    className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-500"
                    title="刷新状态"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Content area – BrowserView covers this div */}
            <div ref={viewRef} className="flex-1 relative bg-white">
                {/* Loading overlay */}
                {(status === 'starting' || loading) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                        <div className="text-center">
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
                            <p className="text-sm text-gray-500">正在启动 DSH 服务...</p>
                        </div>
                    </div>
                )}

                {/* Error overlay */}
                {status === 'error' && !loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                        <div className="text-center max-w-sm">
                            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                            <p className="text-sm text-gray-700 mb-1">启动失败</p>
                            <p className="text-xs text-gray-400 mb-4 break-all">{error}</p>
                            <button
                                onClick={startDSH}
                                className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                            >
                                重试
                            </button>
                        </div>
                    </div>
                )}

                {/* Not started */}
                {status === 'stopped' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                        <div className="text-center">
                            <p className="text-sm text-gray-400 mb-4">DSH 服务已停止</p>
                            <button
                                onClick={startDSH}
                                className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                            >
                                重新启动
                            </button>
                        </div>
                    </div>
                )}

                {/* Idle */}
                {status === 'idle' && !loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                        <div className="text-center">
                            <Loader2 className="w-10 h-10 text-gray-300 animate-spin mx-auto mb-3" />
                            <p className="text-sm text-gray-400">准备启动...</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
