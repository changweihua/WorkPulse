import React, { Suspense, use, useRef, useState, useEffect, useCallback } from 'react';
import init, { apply_light_advanced, apply_dark_advanced } from '../pkg/xray_processor.js';

const wasmPromise = init();

function ProcessorCore() {
    const wasmModule = use(wasmPromise);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const brightCanvasRef = useRef<HTMLCanvasElement>(null);
    const darkCanvasRef = useRef<HTMLCanvasElement>(null);

    const [imageLoaded, setImageLoaded] = useState(false);
    const [brightStrength, setBrightStrength] = useState(0.4);
    const [darkStrength, setDarkStrength] = useState(0.3);
    const [saturationBoost, setSaturationBoost] = useState(0.2);
    const [detailBoost, setDetailBoost] = useState(0.5); // 新增细节增强

    const originalImageDataRef = useRef<ImageData | null>(null);
    const rafIdRef = useRef<number | null>(null);

    // ---------- 图片加载 ----------
    const handleFileSelect = useCallback((file: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d')!;
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                originalImageDataRef.current = ctx.getImageData(0, 0, img.width, img.height);
                setImageLoaded(true);
                applyAllFiltersNow();
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    }, []);

    // ---------- 应用滤镜（适配新函数签名） ----------
    const applyFilterToCanvas = useCallback((
        canvas: HTMLCanvasElement,
        filterFn: (
            data: Uint8Array,
            width: number,
            height: number,
            strength: number,
            saturation: number,
            detail: number
        ) => Uint8Array,
        strength: number,
        saturation: number,
        detail: number
    ) => {
        const original = originalImageDataRef.current;
        if (!original || !canvas) return;
        const ctx = canvas.getContext('2d')!;
        // 确保画布尺寸与原始图像一致
        if (canvas.width !== original.width || canvas.height !== original.height) {
            canvas.width = original.width;
            canvas.height = original.height;
        }
        // 双重断言解决类型不兼容
        const processedData = filterFn(
            original.data as unknown as Uint8Array,
            original.width,
            original.height,
            strength,
            saturation,
            detail
        );
        const clamped = Uint8ClampedArray.from(processedData);
        const imageData = new ImageData(clamped, original.width, original.height);
        ctx.putImageData(imageData, 0, 0);
    }, []);

    // ---------- 同时更新两个预览 ----------
    const applyAllFiltersNow = useCallback(() => {
        if (!originalImageDataRef.current) return;
        if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        rafIdRef.current = requestAnimationFrame(() => {
            const brightCanvas = brightCanvasRef.current;
            const darkCanvas = darkCanvasRef.current;
            if (brightCanvas) {
                applyFilterToCanvas(
                    brightCanvas,
                    apply_light_advanced,
                    brightStrength,
                    saturationBoost,
                    detailBoost
                );
            }
            if (darkCanvas) {
                applyFilterToCanvas(
                    darkCanvas,
                    apply_dark_advanced,
                    darkStrength,
                    saturationBoost,
                    detailBoost
                );
            }
            rafIdRef.current = null;
        });
    }, [brightStrength, darkStrength, saturationBoost, detailBoost, applyFilterToCanvas]);

    useEffect(() => {
        if (originalImageDataRef.current) {
            applyAllFiltersNow();
        }
    }, [brightStrength, darkStrength, saturationBoost, detailBoost, applyAllFiltersNow]);

    // ---------- 导出 ----------
    const exportCanvas = (canvas: HTMLCanvasElement | null, prefix: string) => {
        if (!canvas) return;
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        link.download = `${prefix}_${timestamp}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const handleReset = () => {
        setBrightStrength(0.4);
        setDarkStrength(0.3);
        setSaturationBoost(0.2);
        setDetailBoost(0.5);
    };

    // ---------- 渲染 ----------
    return (
        <div className="flex flex-col lg:flex-row gap-6 p-5 min-h-screen">
            {/* 左侧：原图 + 操作按钮 */}
            <div className="flex-1 flex flex-col items-center min-w-0">
                <h3 className="text-lg font-semibold mb-2">📷 原图</h3>
                <div className="w-full max-w-md border border-gray-300 rounded overflow-hidden bg-black">
                    <canvas
                        ref={canvasRef}
                        className="w-full h-auto block max-h-125"
                    />
                </div>
                <div className="mt-4 flex flex-wrap gap-3 justify-center">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileSelect(file);
                        }}
                        className="hidden"
                        id="fileInput"
                    />
                    <label
                        htmlFor="fileInput"
                        className="px-4 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700 transition"
                    >
                        📁 选择图片
                    </label>
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition"
                    >
                        🔄 重置
                    </button>
                    <button
                        onClick={() => exportCanvas(canvasRef.current, 'original')}
                        disabled={!imageLoaded}
                        className={`px-4 py-2 bg-green-600 text-white rounded ${imageLoaded ? 'hover:bg-green-700' : 'opacity-50 cursor-not-allowed'
                            }`}
                    >
                        ⬇️ 导出
                    </button>
                </div>
            </div>

            {/* 右侧：加亮 + 加暗（上下排列） */}
            <div className="flex-1 flex flex-col gap-6 min-w-0">
                {/* 加亮 */}
                <div className="flex flex-col items-center">
                    <h4 className="text-md font-semibold mb-1">☀️ 加亮</h4>
                    <div className="w-full max-w-md border border-gray-300 rounded overflow-hidden bg-black">
                        <canvas
                            ref={brightCanvasRef}
                            className="w-full h-auto block max-h-100"
                        />
                    </div>
                    <div className="w-full max-w-md mt-2">
                        <label className="block text-sm">
                            强度: {Math.round(brightStrength * 100)}%
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={brightStrength}
                                onChange={(e) => setBrightStrength(parseFloat(e.target.value))}
                                className="w-full"
                            />
                        </label>
                    </div>
                    <button
                        onClick={() => exportCanvas(brightCanvasRef.current, 'brightened')}
                        disabled={!imageLoaded}
                        className={`mt-1 px-4 py-1.5 bg-yellow-500 text-black rounded ${imageLoaded ? 'hover:bg-yellow-600' : 'opacity-50 cursor-not-allowed'
                            }`}
                    >
                        ⬇️ 导出加亮图
                    </button>
                </div>

                {/* 加暗 */}
                <div className="flex flex-col items-center">
                    <h4 className="text-md font-semibold mb-1">🌙 加暗</h4>
                    <div className="w-full max-w-md border border-gray-300 rounded overflow-hidden bg-black">
                        <canvas
                            ref={darkCanvasRef}
                            className="w-full h-auto block max-h-100"
                        />
                    </div>
                    <div className="w-full max-w-md mt-2">
                        <label className="block text-sm">
                            强度: {Math.round(darkStrength * 100)}%
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={darkStrength}
                                onChange={(e) => setDarkStrength(parseFloat(e.target.value))}
                                className="w-full"
                            />
                        </label>
                    </div>
                    <button
                        onClick={() => exportCanvas(darkCanvasRef.current, 'darkened')}
                        disabled={!imageLoaded}
                        className={`mt-1 px-4 py-1.5 bg-cyan-600 text-white rounded ${imageLoaded ? 'hover:bg-cyan-700' : 'opacity-50 cursor-not-allowed'
                            }`}
                    >
                        ⬇️ 导出加暗图
                    </button>
                </div>

                {/* 全局参数控制区 */}
                <div className="w-full max-w-md mx-auto mt-2 space-y-2">
                    <label className="block text-sm">
                        色彩饱和度补偿: {Math.round(saturationBoost * 100)}%
                        <input
                            type="range"
                            min="0"
                            max="0.5"
                            step="0.01"
                            value={saturationBoost}
                            onChange={(e) => setSaturationBoost(parseFloat(e.target.value))}
                            className="w-full"
                        />
                        <p className="text-xs text-gray-500">建议 0.15~0.3，补偿色彩鲜艳度</p>
                    </label>

                    <label className="block text-sm">
                        细节增强 (边缘清晰度): {Math.round(detailBoost * 100)}%
                        <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.01"
                            value={detailBoost}
                            onChange={(e) => setDetailBoost(parseFloat(e.target.value))}
                            className="w-full"
                        />
                        <p className="text-xs text-gray-500">调高可使轮廓更锋利，推荐 0.3~0.8</p>
                    </label>
                </div>
            </div>
        </div>
    );
}

// 父组件
export default function XrayProcessor() {
    return (
        <Suspense fallback={<div className="p-10 text-center">⏳ 加载 WASM 模块...</div>}>
            <ProcessorCore />
        </Suspense>
    );
}