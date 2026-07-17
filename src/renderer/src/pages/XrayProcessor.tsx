import React, { Suspense, use, useRef, useState, useEffect, useCallback } from 'react';
import init, { apply_light_advanced, apply_dark_advanced } from '../pkg/xray_processor.js';

const wasmPromise = init();

interface Material {
    id: string;
    image: HTMLImageElement;
    x: number;
    y: number;
    width: number;
    height: number;
}

// ============================================================================
// 全屏编辑器组件（独立状态 + 离屏渲染）
// ============================================================================
interface FullscreenEditorProps {
    isOpen: boolean;
    originalImageData: ImageData | null;
    initialMaterials: Material[];
    onConfirm: (compositeImageData: ImageData) => void;
    onCancel: () => void;
}

const FullscreenEditor: React.FC<FullscreenEditorProps> = ({
    isOpen,
    originalImageData,
    initialMaterials,
    onConfirm,
    onCancel,
}) => {
    // ---------- Refs ----------
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);       // 主显示画布
    const offscreenCanvasRef = useRef<HTMLCanvasElement>(null); // 离屏缓存

    // ---------- 编辑状态 ----------
    const [materials, setMaterials] = useState<Material[]>(initialMaterials);
    const [selectedId, setSelectedId] = useState<string | null>(
        initialMaterials.length > 0 ? initialMaterials[0].id : null
    );
    const [transform, setTransform] = useState({ scale: 1, translateX: 0, translateY: 0 });

    // 拖拽状态
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [dragTargetId, setDragTargetId] = useState<string | null>(null);

    // ---------- 初始化画布尺寸 ----------
    useEffect(() => {
        if (!originalImageData) return;
        const offscreen = offscreenCanvasRef.current;
        const mainCanvas = canvasRef.current;
        if (offscreen) {
            offscreen.width = originalImageData.width;
            offscreen.height = originalImageData.height;
        }
        if (mainCanvas) {
            mainCanvas.width = originalImageData.width;
            mainCanvas.height = originalImageData.height;
        }
    }, [originalImageData]);

    // ---------- 离屏渲染函数 ----------
    const renderToOffscreen = useCallback(() => {
        const canvas = offscreenCanvasRef.current;
        if (!canvas || !originalImageData) return;
        const ctx = canvas.getContext('2d')!;
        // 清空画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 绘制原图
        ctx.putImageData(originalImageData, 0, 0);
        // 绘制所有素材
        materials.forEach(mat => {
            ctx.drawImage(mat.image, mat.x, mat.y, mat.width, mat.height);
        });
    }, [originalImageData, materials]);

    // ---------- 主画布绘制（只绘制离屏内容 + 变换） ----------
    const drawEditor = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const offscreen = offscreenCanvasRef.current;
        if (!offscreen) return;

        ctx.save();
        ctx.translate(transform.translateX, transform.translateY);
        ctx.scale(transform.scale, transform.scale);
        ctx.drawImage(offscreen, 0, 0);
        ctx.restore();

        // 绘制选中框
        if (selectedId) {
            const mat = materials.find(m => m.id === selectedId);
            if (mat) {
                const { x, y, width, height } = mat;
                ctx.save();
                ctx.translate(transform.translateX, transform.translateY);
                ctx.scale(transform.scale, transform.scale);
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2 / transform.scale;
                ctx.setLineDash([4 / transform.scale, 4 / transform.scale]);
                ctx.strokeRect(x, y, width, height);
                ctx.setLineDash([]);
                ctx.restore();
            }
        }
    }, [transform, materials, selectedId]);

    // 当素材或原图变化时，更新离屏缓存，并重绘主画布
    useEffect(() => {
        if (originalImageData) {
            renderToOffscreen();
            drawEditor();
        }
    }, [originalImageData, materials, renderToOffscreen, drawEditor]);

    // ---------- 交互：鼠标事件 ----------
    const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            mouseX: (e.clientX - rect.left) * scaleX,
            mouseY: (e.clientY - rect.top) * scaleY,
        };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const coords = getCanvasCoords(e);
        if (!coords) return;
        const { mouseX, mouseY } = coords;
        const { scale, translateX, translateY } = transform;
        const invScale = 1 / scale;
        const canvasX = (mouseX - translateX) * invScale;
        const canvasY = (mouseY - translateY) * invScale;

        for (let i = materials.length - 1; i >= 0; i--) {
            const mat = materials[i];
            if (canvasX >= mat.x && canvasX <= mat.x + mat.width &&
                canvasY >= mat.y && canvasY <= mat.y + mat.height) {
                setSelectedId(mat.id);
                setIsDragging(true);
                setDragOffset({ x: canvasX - mat.x, y: canvasY - mat.y });
                setDragTargetId(mat.id);
                return;
            }
        }
        setSelectedId(null);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDragging || !dragTargetId) return;
        const coords = getCanvasCoords(e);
        if (!coords) return;
        const { mouseX, mouseY } = coords;
        const { scale, translateX, translateY } = transform;
        const invScale = 1 / scale;
        const canvasX = (mouseX - translateX) * invScale;
        const canvasY = (mouseY - translateY) * invScale;
        setMaterials(prev =>
            prev.map(mat => {
                if (mat.id === dragTargetId) {
                    return {
                        ...mat,
                        x: canvasX - dragOffset.x,
                        y: canvasY - dragOffset.y,
                    };
                }
                return mat;
            })
        );
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setDragTargetId(null);
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / rect.width * canvas.width;
        const mouseY = (e.clientY - rect.top) / rect.height * canvas.height;

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(transform.scale * delta, 0.1), 10);
        const { scale, translateX, translateY } = transform;
        const newTranslateX = mouseX - (mouseX - translateX) * (newScale / scale);
        const newTranslateY = mouseY - (mouseY - translateY) * (newScale / scale);
        setTransform({ scale: newScale, translateX: newTranslateX, translateY: newTranslateY });
    };

    // ---------- 素材管理 ----------
    const handleAddMaterial = (file: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                // 默认居中放置
                const x = (canvas.width - img.width) / 2;
                const y = (canvas.height - img.height) / 2;
                const newMat: Material = {
                    id: `mat-${Date.now()}`,
                    image: img,
                    x,
                    y,
                    width: img.width,
                    height: img.height,
                };
                setMaterials(prev => [...prev, newMat]);
                setSelectedId(newMat.id);
            };
            img.onerror = () => {
                console.error('加载素材失败');
            };
            img.src = e.target?.result as string;
        };
        reader.onerror = () => {
            console.error('读取文件失败');
        };
        reader.readAsDataURL(file);
    };

    const deleteMaterial = (id: string) => {
        setMaterials(prev => prev.filter(m => m.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    // ---------- 缩放控制 ----------
    const zoomIn = () => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 10) }));
    const zoomOut = () => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));
    const fitToScreen = () => setTransform({ scale: 1, translateX: 0, translateY: 0 });

    // ---------- 确认/取消 ----------
    const handleConfirm = () => {
        const offscreen = offscreenCanvasRef.current;
        if (!offscreen) return;
        const ctx = offscreen.getContext('2d')!;
        const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
        onConfirm(imageData);
    };

    const handleCancel = () => {
        onCancel();
    };

    // ---------- 渲染 ----------
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-95 flex flex-col">
            {/* 标题栏 */}
            <div className="flex justify-between items-center p-4 bg-gray-900 text-white">
                <h2 className="text-xl font-bold">✏️ 全屏编辑</h2>
                <div className="flex gap-3">
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
                    >
                        ✅ 确认
                    </button>
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
                    >
                        ❌ 取消
                    </button>
                </div>
            </div>

            {/* 工具栏 */}
            <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-800 text-white">
                <input
                    type="file"
                    accept="image/*"
                    id="materialInputFullscreen"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                            handleAddMaterial(f);
                        }
                        e.target.value = ''; // 重置input，允许重复选择同一文件
                    }}
                />
                <label htmlFor="materialInputFullscreen" className="px-3 py-1 bg-blue-600 rounded cursor-pointer hover:bg-blue-700">
                    + 添加素材
                </label>
                <button onClick={zoomIn} className="px-3 py-1 bg-gray-600 rounded hover:bg-gray-700">🔍+</button>
                <button onClick={zoomOut} className="px-3 py-1 bg-gray-600 rounded hover:bg-gray-700">🔍-</button>
                <button onClick={fitToScreen} className="px-3 py-1 bg-gray-600 rounded hover:bg-gray-700">适应</button>
                <span className="text-sm text-gray-400 ml-4">滚轮缩放 · 拖拽素材</span>
            </div>

            {/* 素材缩略图列表 */}
            <div className="flex gap-2 p-2 bg-gray-800 border-t border-gray-700 overflow-x-auto">
                {materials.map(mat => (
                    <div
                        key={mat.id}
                        className={`relative border-2 p-1 cursor-pointer ${selectedId === mat.id ? 'border-green-500' : 'border-gray-600'}`}
                        onClick={() => setSelectedId(mat.id)}
                    >
                        <img src={mat.image.src} alt="素材" className="w-16 h-16 object-contain" />
                        <button
                            onClick={(e) => { e.stopPropagation(); deleteMaterial(mat.id); }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        >
                            ×
                        </button>
                    </div>
                ))}
                {materials.length === 0 && <span className="text-gray-400 text-sm">暂无素材</span>}
            </div>

            {/* 主画布 */}
            <div className="flex-1 flex items-center justify-center p-4 bg-black">
                <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-full border border-gray-600"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    style={{ cursor: isDragging ? 'grabbing' : (selectedId ? 'grab' : 'default') }}
                />
            </div>
        </div>
    );
};

// ============================================================================
// 主组件
// ============================================================================
function ProcessorCore() {
    const wasmModule = use(wasmPromise);

    // ---- DOM Refs ----
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const brightPreviewRef = useRef<HTMLCanvasElement>(null);
    const darkPreviewRef = useRef<HTMLCanvasElement>(null);

    // ---- 状态 ----
    const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [materials, setMaterials] = useState<Material[]>([]);

    // 控制参数
    const [brightStrength, setBrightStrength] = useState(0.4);
    const [darkStrength, setDarkStrength] = useState(0.3);
    const [saturationBoost, setSaturationBoost] = useState(0.2);
    const [detailBoost, setDetailBoost] = useState(0.5);

    // 预览触发
    const [previewTrigger, setPreviewTrigger] = useState(0);
    const [isPreviewing, setIsPreviewing] = useState(false);

    // 全屏编辑器
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [fullscreenPreview, setFullscreenPreview] = useState<string | null>(null);

    // ---- 原图预览绘制（只读） ----
    const drawPreview = useCallback(() => {
        const canvas = previewCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        if (!originalImageData) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#555';
            ctx.font = '20px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('请选择原图', canvas.width / 2, canvas.height / 2);
            return;
        }
        canvas.width = originalImageData.width;
        canvas.height = originalImageData.height;
        ctx.putImageData(originalImageData, 0, 0);
    }, [originalImageData]);

    useEffect(() => {
        drawPreview();
    }, [drawPreview]);

    // ---- 图片加载 ----
    const handleFileSelect = useCallback((file: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                setOriginalImageData(imageData);
                setImageLoaded(true);
                setMaterials([]);
                clearPreviews();
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    }, []);

    // ---- 清空预览 ----
    const clearPreviews = useCallback(() => {
        [brightPreviewRef, darkPreviewRef].forEach(ref => {
            const canvas = ref.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }, []);

    // ---- 重置编辑（仅清除素材，不重置原图） ----
    const handleResetEditor = useCallback(() => {
        setMaterials([]);
        clearPreviews();
        setPreviewTrigger(0);
    }, [clearPreviews]);

    // ---- 全屏编辑器确认/取消 ----
    const handleEditorConfirm = useCallback((composite: ImageData) => {
        setOriginalImageData(composite);
        setMaterials([]); // 素材已合成，清空列表
        setIsEditorOpen(false);
        clearPreviews();
        setPreviewTrigger(0);
    }, [clearPreviews]);

    const handleEditorCancel = useCallback(() => {
        setIsEditorOpen(false);
    }, []);

    // ---- 预览逻辑 ----
    const getCompositeImageData = useCallback((): ImageData | null => {
        return originalImageData;
    }, [originalImageData]);

    const updatePreviews = useCallback(() => {
        const composite = getCompositeImageData();
        if (!composite) return;
        const { width, height, data } = composite;
        setIsPreviewing(true);

        const brightCanvas = brightPreviewRef.current;
        if (brightCanvas) {
            brightCanvas.width = width;
            brightCanvas.height = height;
            const ctx = brightCanvas.getContext('2d')!;
            const result = apply_light_advanced(
                data as unknown as Uint8Array,
                width,
                height,
                brightStrength,
                saturationBoost,
                detailBoost
            );
            ctx.putImageData(new ImageData(Uint8ClampedArray.from(result), width, height), 0, 0);
        }

        const darkCanvas = darkPreviewRef.current;
        if (darkCanvas) {
            darkCanvas.width = width;
            darkCanvas.height = height;
            const ctx = darkCanvas.getContext('2d')!;
            const result = apply_dark_advanced(
                data as unknown as Uint8Array,
                width,
                height,
                darkStrength,
                saturationBoost,
                detailBoost
            );
            ctx.putImageData(new ImageData(Uint8ClampedArray.from(result), width, height), 0, 0);
        }
        setIsPreviewing(false);
    }, [getCompositeImageData, brightStrength, darkStrength, saturationBoost, detailBoost]);

    useEffect(() => {
        if (imageLoaded && previewTrigger > 0) {
            updatePreviews();
        }
    }, [previewTrigger, imageLoaded, updatePreviews]);

    // ---- 导出 ----
    const exportCanvas = (canvas: HTMLCanvasElement | null, prefix: string) => {
        if (!canvas) return;
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        link.download = `${prefix}_${timestamp}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const exportProcessed = (mode: 'light' | 'dark') => {
        if (!originalImageData) return;
        const { width, height, data } = originalImageData;
        const result = mode === 'light'
            ? apply_light_advanced(data as unknown as Uint8Array, width, height, brightStrength, saturationBoost, detailBoost)
            : apply_dark_advanced(data as unknown as Uint8Array, width, height, darkStrength, saturationBoost, detailBoost);
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = width;
        tmpCanvas.height = height;
        const ctx = tmpCanvas.getContext('2d')!;
        ctx.putImageData(new ImageData(Uint8ClampedArray.from(result), width, height), 0, 0);
        exportCanvas(tmpCanvas, mode === 'light' ? 'brightened' : 'darkened');
    };

    // ---- 渲染 ----
    return (
        <div className="flex flex-col lg:flex-row gap-8 p-6 min-h-screen bg-gray-50">
            {/* 左侧：原图预览 + 控制 */}
            <div className="flex-1 flex flex-col bg-white p-6 rounded-xl shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">📷 原图</h3>
                    <button
                        onClick={() => setIsEditorOpen(true)}
                        disabled={!imageLoaded}
                        className={`px-4 py-2 rounded-lg shadow-sm transition ${imageLoaded
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        ✏️ 编辑
                    </button>
                </div>

                <div className="w-full border border-gray-300 rounded-lg overflow-hidden bg-black">
                    <canvas
                        ref={previewCanvasRef}
                        className="w-full h-auto block max-h-[600px]"
                    />
                </div>

                {/* 操作按钮 */}
                <div className="mt-4 flex flex-wrap gap-3 justify-center">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
                        className="hidden"
                        id="fileInput"
                    />
                    <label htmlFor="fileInput" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition shadow-sm">
                        📁 选择原图
                    </label>

                    <button
                        onClick={() => setPreviewTrigger(prev => prev + 1)}
                        disabled={!imageLoaded || isPreviewing}
                        className={`px-5 py-2.5 rounded-lg shadow-sm transition ${imageLoaded && !isPreviewing
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        {isPreviewing ? '⏳ 处理中...' : '👁️ 预览'}
                    </button>

                    <button
                        onClick={handleResetEditor}
                        disabled={!imageLoaded}
                        className={`px-5 py-2.5 rounded-lg shadow-sm transition ${imageLoaded
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        🔄 重置编辑
                    </button>
                </div>

                {/* 导出按钮 */}
                <div className="mt-3 flex flex-wrap gap-3 justify-center">
                    <button
                        onClick={() => exportCanvas(previewCanvasRef.current, 'composite')}
                        disabled={!imageLoaded}
                        className={`px-4 py-2 rounded-lg shadow-sm transition ${imageLoaded
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        ⬇️ 合成图
                    </button>
                    <button
                        onClick={() => exportProcessed('light')}
                        disabled={!imageLoaded}
                        className={`px-4 py-2 rounded-lg shadow-sm transition ${imageLoaded
                                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        ⬇️ 加亮图
                    </button>
                    <button
                        onClick={() => exportProcessed('dark')}
                        disabled={!imageLoaded}
                        className={`px-4 py-2 rounded-lg shadow-sm transition ${imageLoaded
                                ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        ⬇️ 加暗图
                    </button>
                </div>

                {/* 全局参数 */}
                <div className="w-full max-w-md mt-4 pt-4 border-t border-gray-200 space-y-3">
                    <div className="text-sm font-medium text-gray-600">全局参数</div>
                    <label className="block text-sm">
                        <span className="flex justify-between">饱和度补偿 <span className="font-mono">{Math.round(saturationBoost * 100)}%</span></span>
                        <input type="range" min="0" max="0.5" step="0.01" value={saturationBoost} onChange={(e) => setSaturationBoost(parseFloat(e.target.value))} className="w-full mt-1" />
                    </label>
                    <label className="block text-sm">
                        <span className="flex justify-between">细节增强 <span className="font-mono">{Math.round(detailBoost * 100)}%</span></span>
                        <input type="range" min="0" max="1.5" step="0.01" value={detailBoost} onChange={(e) => setDetailBoost(parseFloat(e.target.value))} className="w-full mt-1" />
                    </label>
                </div>
            </div>

            {/* 右侧：预览区 */}
            <div className="flex-1 flex flex-col bg-white p-6 rounded-xl shadow-md min-w-0">
                <h3 className="text-xl font-bold text-gray-800 text-center mb-4">📊 预览</h3>

                <div className="flex flex-col items-center mb-6">
                    <h4 className="text-md font-semibold text-gray-700 mb-1">☀️ 加亮</h4>
                    <div
                        className="w-full max-w-md border border-gray-300 rounded-lg overflow-hidden bg-black cursor-pointer relative"
                        onClick={() => {
                            const canvas = brightPreviewRef.current;
                            if (canvas) setFullscreenPreview(canvas.toDataURL('image/png'));
                        }}
                    >
                        <canvas ref={brightPreviewRef} className="w-full h-auto block max-h-[350px]" />
                        <div className="absolute bottom-1 right-1 text-white bg-black bg-opacity-50 px-2 py-0.5 text-xs rounded">点击全屏</div>
                    </div>
                    <div className="w-full max-w-md mt-2">
                        <label className="block text-sm">
                            <span className="flex justify-between">加亮强度 <span className="font-mono">{Math.round(brightStrength * 100)}%</span></span>
                            <input type="range" min="0" max="1" step="0.01" value={brightStrength} onChange={(e) => setBrightStrength(parseFloat(e.target.value))} className="w-full mt-1" />
                        </label>
                    </div>
                </div>

                <div className="flex flex-col items-center">
                    <h4 className="text-md font-semibold text-gray-700 mb-1">🌙 加暗</h4>
                    <div
                        className="w-full max-w-md border border-gray-300 rounded-lg overflow-hidden bg-black cursor-pointer relative"
                        onClick={() => {
                            const canvas = darkPreviewRef.current;
                            if (canvas) setFullscreenPreview(canvas.toDataURL('image/png'));
                        }}
                    >
                        <canvas ref={darkPreviewRef} className="w-full h-auto block max-h-[350px]" />
                        <div className="absolute bottom-1 right-1 text-white bg-black bg-opacity-50 px-2 py-0.5 text-xs rounded">点击全屏</div>
                    </div>
                    <div className="w-full max-w-md mt-2">
                        <label className="block text-sm">
                            <span className="flex justify-between">加暗强度 <span className="font-mono">{Math.round(darkStrength * 100)}%</span></span>
                            <input type="range" min="0" max="1" step="0.01" value={darkStrength} onChange={(e) => setDarkStrength(parseFloat(e.target.value))} className="w-full mt-1" />
                        </label>
                    </div>
                </div>

                <div className="mt-4 text-center text-xs text-gray-400 border-t border-gray-100 pt-3">
                    点击预览图全屏查看 · 点击「预览」更新效果
                </div>
            </div>

            {/* 全屏编辑器 */}
            <FullscreenEditor
                isOpen={isEditorOpen}
                originalImageData={originalImageData}
                initialMaterials={materials}
                onConfirm={handleEditorConfirm}
                onCancel={handleEditorCancel}
            />

            {/* 预览全屏模态框 */}
            {fullscreenPreview && (
                <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center" onClick={() => setFullscreenPreview(null)}>
                    <img src={fullscreenPreview} alt="预览全屏" className="max-w-full max-h-full object-contain" />
                    <button className="absolute top-4 right-4 text-white text-4xl" onClick={() => setFullscreenPreview(null)}>×</button>
                </div>
            )}
        </div>
    );
}

export default function XrayProcessor() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-gray-600">⏳ 加载 WASM 模块...</div>}>
            <ProcessorCore />
        </Suspense>
    );
}