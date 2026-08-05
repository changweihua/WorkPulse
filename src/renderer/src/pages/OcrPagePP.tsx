// src/renderer/src/pages/OcrPagePP.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { usePPOCR } from '../hooks/usePPOCR';
import { ErrorBoundary } from '../components/ErrorBoundary';

function OcrPageContent() {
    const { status, error, progress, results, runOCR, setImageData } = usePPOCR();

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [displayResults, setDisplayResults] = useState<typeof results>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    const releaseImageUrl = useCallback(() => {
        if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
        }
    }, [imageUrl]);

    useEffect(() => {
        return releaseImageUrl;
    }, [releaseImageUrl]);

    const drawImageWithBoxes = useCallback(
        (imgData: ImageData, boxes: typeof results) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = imgData.width;
            canvas.height = imgData.height;
            const ctx = canvas.getContext('2d')!;
            ctx.putImageData(imgData, 0, 0);

            if (boxes.length === 0) return;

            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;

            for (const r of boxes) {
                const conf = typeof r.confidence === 'number' && isFinite(r.confidence) ? r.confidence : 0.05;
                const color = conf > 0.04 ? '#00ff88' : conf > 0.02 ? '#ffcc00' : '#ff9900';
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
                ctx.fillStyle = color;
                ctx.strokeRect(r.box.x0, r.box.y0, r.box.x1 - r.box.x0, r.box.y1 - r.box.y0);
                ctx.fillText(`${r.text} (${(conf * 100).toFixed(2)}%)`, r.box.x0, r.box.y0 - 6);
            }
            ctx.shadowBlur = 0;
        },
        []
    );

    useEffect(() => {
        if (results.length > 0 && canvasRef.current) {
            // draw 会在 handleOCR 后调用
        }
    }, [results]);

    const loadImage = useCallback(
        (file: File) => {
            releaseImageUrl();
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(img, 0, 0);
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    setImageData(imgData);
                    setImageFile(file);
                    setImageUrl(URL.createObjectURL(file));
                    setDisplayResults([]);
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        },
        [releaseImageUrl, setImageData]
    );

    const handleOCR = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const imgData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        try {
            const result = await runOCR(imgData);
            setDisplayResults(result);
            drawImageWithBoxes(imgData, result);
        } catch (err) {
            console.error(err);
        }
    }, [runOCR, drawImageWithBoxes]);

    const handleClear = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }
        setImageFile(null);
        releaseImageUrl();
        setImageUrl(null);
        setDisplayResults([]);
        setImageData(null);
    }, [releaseImageUrl, setImageData]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) loadImage(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
    };
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        const file = e.dataTransfer.files?.[0];
        if (file) loadImage(file);
    };

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const file = e.clipboardData?.files[0];
            if (file && file.type.startsWith('image/')) {
                loadImage(file);
            }
        };
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [loadImage]);

    const statusDot = () => {
        if (status === 'loading') return <span className="status-dot loading" />;
        if (status === 'ready') return <span className="status-dot ready" />;
        if (status === 'error') return <span className="status-dot error" />;
        return <span className="status-dot idle" />;
    };

    const statusLabel = {
        idle: '未加载',
        loading: '加载中...',
        ready: '就绪',
        running: '运行中',
        error: '错误',
    }[status];

    const isReady = status === 'ready';
    const isRunning = status === 'running';
    const hasImage = imageUrl !== null;

    return (
        <div className="flex flex-col min-h-screen bg-gray-900 text-gray-200">
            <header className="flex items-center gap-4 px-6 py-4 border-b border-gray-700 bg-gray-800">
                <h1 className="text-xl font-semibold">浏览器端 OCR</h1>
                <span className="px-3 py-1 text-xs border border-blue-400/30 bg-blue-400/10 text-blue-400 rounded-full">
                    PP-OCRv6 tiny + onnxruntime-web
                </span>
            </header>

            <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6">
                {/* 左侧：图片上传 + Canvas */}
                <div className="flex-1 min-w-0">
                    <div
                        className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <div className="text-4xl mb-2 opacity-60">📷</div>
                        <div className="text-sm text-gray-400">点击或拖拽图片到此处</div>
                        <div className="text-xs text-gray-500 mt-1">支持 PNG / JPG</div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </div>

                    <div className="mt-4 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                        <canvas
                            ref={canvasRef}
                            className="w-full h-auto max-h-[600px] object-contain"
                        />
                        {!hasImage && (
                            <div className="py-8 text-center text-gray-500">
                                上传图片后，点击「开始识别」运行 OCR
                            </div>
                        )}
                    </div>
                </div>

                {/* 右侧：状态、进度、结果 */}
                <div className="w-full lg:w-96 flex-shrink-0 space-y-4">
                    {/* 模型状态 */}
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            模型状态
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            <span className="text-sm text-gray-400">状态</span>
                            <span className="flex items-center gap-2 text-sm">
                                {statusDot()}
                                {statusLabel}
                            </span>
                        </div>
                        {status === 'loading' && (
                            <div className="mt-2">
                                <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
                                        style={{ width: `${progress.percent}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>{progress.step}</span>
                                    <span>{progress.percent}%</span>
                                </div>
                            </div>
                        )}
                        {status === 'error' && (
                            <div className="mt-2 text-sm text-red-400">❌ {error}</div>
                        )}
                    </div>

                    {/* OCR 进度（运行时） */}
                    {isRunning && (
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                OCR 进度
                            </div>
                            <div className="mt-2">
                                <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
                                        style={{ width: `${progress.percent}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>{progress.step}</span>
                                    <span>{progress.percent}%</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleOCR}
                            disabled={!isReady || isRunning || !hasImage}
                            className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 rounded-md font-medium transition"
                        >
                            {isRunning ? '识别中...' : '开始识别'}
                        </button>
                        <button
                            onClick={handleClear}
                            disabled={!hasImage}
                            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-md font-medium transition"
                        >
                            清除
                        </button>
                    </div>

                    {/* 识别结果 */}
                    <div className="bg-gray-800 border border-gray-700 rounded-lg flex-1 overflow-hidden">
                        <div className="flex justify-between items-center px-4 py-2 border-b border-gray-700">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                识别结果
                            </span>
                            <span className="text-xs text-blue-400">
                                {displayResults.length > 0 ? `${displayResults.length} 个文本块` : '等待识别'}
                            </span>
                        </div>
                        <div className="p-4 max-h-[300px] overflow-y-auto font-mono text-sm space-y-2">
                            {displayResults.length === 0 ? (
                                <div className="text-gray-500 text-sm">
                                    {status === 'idle' ? '加载模型后，上传图片开始识别...' : '上传图片并识别'}
                                </div>
                            ) : (
                                displayResults.map((r, i) => {
                                    const conf = r.confidence || 0.05;
                                    const color =
                                        conf > 0.04 ? '#00ff88' : conf > 0.02 ? '#ffcc00' : '#ff9900';
                                    return (
                                        <div
                                            key={i}
                                            className="pl-3 border-l-4 rounded-r bg-gray-700/30"
                                            style={{ borderLeftColor: color }}
                                        >
                                            <div className="text-xs text-gray-400">
                                                #{i + 1} conf {(conf * 100).toFixed(2)}% {r.charCount}字
                                            </div>
                                            <div className="text-sm" style={{ color }}>
                                                {r.text}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            {displayResults.length > 0 && (
                                <div className="border-t border-gray-700 mt-2 pt-2">
                                    <div className="text-xs text-gray-400 mb-1">全文：</div>
                                    <div className="text-sm text-gray-200 whitespace-pre-wrap">
                                        {displayResults.map((r) => r.text).join('\n')}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 底部状态栏 */}
            <div className="text-xs text-gray-500 text-center py-2 border-t border-gray-700">
                WebGPU 未启用 ｜ 状态：{status}
            </div>
        </div>
    );
}

// 错误边界包装
export default function OcrPagePP() {
    return (
        <ErrorBoundary>
            <OcrPageContent />
        </ErrorBoundary>
    );
}