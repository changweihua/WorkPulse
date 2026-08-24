// src/renderer/src/pages/OcrPage.tsx
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
    useOCRModel,
    OCR_MODEL_GROUPS,
    getOCRModelsByGroup,
    OCRModelGroupId,
} from '../hooks/useOCRModel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
    ScanText,
    Download,
    Loader2,
    AlertTriangle,
    Copy,
    Check,
    Trash2,
    ImagePlus,
    Zap,
    X,
    Upload,
    RotateCcw,
} from 'lucide-react';

const IS_WEBGPU_AVAILABLE = !!(navigator as any).gpu;

// ---------- 左侧：模型面板 ----------
function ModelPanel({
    status,
    currentModel,
    pendingModel,
    selectedGroup,
    onGroupChange,
    onModelChange,
    isLoading,
    isGenerating,
    overallProgress,
    progressItems,
    error,
    isError,
    onRetry,
}: {
    status: string;
    currentModel: string;
    pendingModel: string | null;
    selectedGroup: OCRModelGroupId;
    onGroupChange: (g: OCRModelGroupId) => void;
    onModelChange: (m: string) => void;
    isLoading: boolean;
    isGenerating: boolean;
    overallProgress: number;
    progressItems: { file: string; progress: number }[];
    error: string | null;
    isError: boolean;
    onRetry: () => void;
}) {
    const modelsInGroup = useMemo(() => getOCRModelsByGroup(selectedGroup), [selectedGroup]);
    const displayModel = pendingModel || currentModel;

    const statusMeta = isLoading
        ? { label: '下载中', color: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
        : isGenerating
            ? { label: '识别中', color: 'bg-blue-500 animate-pulse', text: 'text-blue-600 dark:text-blue-400' }
            : status === 'ready'
                ? { label: '就绪', color: 'bg-green-500', text: 'text-green-600 dark:text-green-400' }
                : { label: '待加载', color: 'bg-zinc-400', text: 'text-zinc-500' };

    return (
        <div className="shrink-0 w-[280px] h-full border-r border-[var(--color-border)] surface-card flex flex-col overflow-hidden">
            {/* 标题 */}
            <div className="shrink-0 px-4 py-3.5 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                        <ScanText size={16} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">本地 OCR 识别</h2>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">ONNX + WebGPU</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                {/* 运行状态 */}
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-800/40 border border-[var(--color-border-subtle)]">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                        <Zap size={12} /> 运行状态
                    </span>
                    <span className={`text-xs font-medium flex items-center gap-1.5 ${statusMeta.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.color}`} />
                        {statusMeta.label}
                    </span>
                </div>

                {!IS_WEBGPU_AVAILABLE && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-800/50">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <AlertTriangle size={12} /> 未检测到 WebGPU
                        </p>
                        <p className="text-[11px] text-amber-600/80 dark:text-amber-500/80 mt-1 leading-relaxed">
                            将回退到 WASM 模式，速度较慢。建议使用 Chrome/Edge 113+。
                        </p>
                    </div>
                )}

                {/* 识别类型 */}
                <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">识别类型</label>
                    <select
                        value={selectedGroup}
                        onChange={(e) => onGroupChange(e.target.value as OCRModelGroupId)}
                        disabled={isLoading || isGenerating}
                        className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-emerald-400 disabled:opacity-50 cursor-pointer"
                    >
                        {OCR_MODEL_GROUPS.map((g) => (
                            <option key={g.id} value={g.id}>{g.label}</option>
                        ))}
                    </select>
                </div>

                {/* 具体模型 */}
                <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">具体模型</label>
                    <select
                        value={displayModel}
                        onChange={(e) => onModelChange(e.target.value)}
                        disabled={isLoading || isGenerating}
                        className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-emerald-400 disabled:opacity-50 cursor-pointer"
                    >
                        {modelsInGroup.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                    </select>
                    <p className="mt-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 truncate" title={currentModel}>
                        {currentModel}
                    </p>
                </div>

                {/* 下载进度 */}
                {isLoading && (
                    <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-800/40">
                        <div className="flex items-center gap-1.5 mb-2">
                            <Download size={12} className="text-emerald-500" />
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                加载模型中... {Math.round(overallProgress)}%
                            </span>
                        </div>
                        <div className="w-full bg-emerald-100 dark:bg-emerald-900/40 rounded-full h-1.5">
                            <div
                                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(overallProgress, 100)}%` }}
                            />
                        </div>
                        {progressItems.length > 0 && (
                            <div className="mt-2 space-y-0.5">
                                {progressItems.map((item) => (
                                    <div key={item.file} className="flex justify-between text-[10px] text-emerald-500/80 dark:text-emerald-400/70">
                                        <span className="truncate max-w-[160px]">{item.file.split('/').pop()}</span>
                                        <span>{Math.round(item.progress)}%</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {isError && error && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200/70 dark:border-red-800/50">
                        <p className="text-xs font-medium text-red-600 dark:text-red-400">加载失败</p>
                        <p className="text-[11px] text-red-500/90 dark:text-red-400/80 mt-1 break-all">{error}</p>
                        <p className="text-[10px] text-red-400/70 mt-1.5">可尝试切换镜像或更换模型</p>
                        <button
                            onClick={onRetry}
                            disabled={isLoading}
                            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-[11px] font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <RotateCcw size={12} />
                            重试加载
                        </button>
                    </div>
                )}
            </div>

            <div className="shrink-0 px-4 py-2 border-t border-[var(--color-border)]">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center">
                    WebGPU {IS_WEBGPU_AVAILABLE ? '已启用' : '未支持'} · {status}
                </p>
            </div>
        </div>
    );
}

// ---------- 主页面 ----------
function OcrPageContent() {
    const {
        status,
        error,
        progressItems,
        overallProgress,
        loadingMessage,
        currentModel,
        pendingModel,
        recognize,
        switchModel,
        isLoading,
        isReady,
        isGenerating,
    isError,
    retry,
} = useOCRModel();

    const [selectedGroup, setSelectedGroup] = useState<OCRModelGroupId>(OCR_MODEL_GROUPS[0].id);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<string>('');
    const [dragOver, setDragOver] = useState(false);
    const [copied, setCopied] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // 释放图片 URL（防止内存泄漏）
    useEffect(() => {
        return () => {
            if (imageUrl) URL.revokeObjectURL(imageUrl);
        };
    }, [imageUrl]);

    const loadFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) return;
        setImageUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
        setImageFile(file);
        setOcrResult('');
    }, []);

    // 粘贴图片
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
            if (item) {
                const file = item.getAsFile();
                if (file) loadFile(file);
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [loadFile]);

    // 拖拽
    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) loadFile(file);
        },
        [loadFile]
    );

    const handleGroupChange = useCallback(
        (groupId: OCRModelGroupId) => {
            setSelectedGroup(groupId);
            const first = getOCRModelsByGroup(groupId)[0];
            if (first && first.id !== currentModel) {
                switchModel(first.id).catch(() => {});
            }
        },
        [currentModel, switchModel]
    );

    const handleModelChange = useCallback(
        (modelId: string) => {
            if (modelId === currentModel) return;
            switchModel(modelId).catch(() => {});
        },
        [currentModel, switchModel]
    );

    const handleRecognize = useCallback(async () => {
        if (!imageFile || !imgRef.current) return;
        if (!imgRef.current.complete) {
            setOcrResult('⏳ 图片加载中，请稍候...');
            return;
        }
        try {
            const result = await recognize(imgRef.current);
            setOcrResult(result);
        } catch (err) {
            setOcrResult(`❌ 识别失败：${(err as Error).message}`);
        }
    }, [imageFile, recognize]);

    const copyResult = async () => {
        if (!ocrResult) return;
        await navigator.clipboard.writeText(ocrResult);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const clearImage = () => {
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        setImageUrl(null);
        setImageFile(null);
        setOcrResult('');
    };

    const modelName = useMemo(
        () => (pendingModel || currentModel || '').split('/').pop() || '',
        [pendingModel, currentModel]
    );
    const charCount = ocrResult.replace(/\s/g, '').length;

    return (
        <div className="h-full overflow-hidden flex gap-4 bg-white/50 dark:bg-zinc-900/50">
            <ModelPanel
                status={status}
                currentModel={currentModel}
                pendingModel={pendingModel}
                selectedGroup={selectedGroup}
                onGroupChange={handleGroupChange}
                onModelChange={handleModelChange}
                isLoading={isLoading}
                isGenerating={isGenerating}
                overallProgress={overallProgress}
                progressItems={progressItems}
                error={error}
                isError={isError}
    onRetry={retry}
            />

            {/* 右侧主区 */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
                {/* 顶栏 */}
                <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] surface-card">
                    <div className="flex items-center gap-2 min-w-0">
                        <ScanText size={15} className="text-emerald-500 shrink-0" />
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">{modelName}</span>
                        {isReady && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 text-[10px] font-medium rounded-full">
                                已就绪
                            </span>
                        )}
                    </div>
                    {imageUrl && (
                        <button
                            onClick={clearImage}
                            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition shrink-0"
                            title="清除图片"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="max-w-3xl mx-auto space-y-4">
                        {/* 图片上传区 */}
                        {!imageUrl ? (
                            <div
                                onClick={() => inputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                className={`flex flex-col items-center justify-center py-14 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                                    dragOver
                                        ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/20 scale-[1.01]'
                                        : 'border-zinc-300 dark:border-zinc-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40'
                                }`}
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
                                    dragOver ? 'bg-emerald-500' : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                                } shadow-lg shadow-emerald-500/20`}>
                                    {dragOver ? <Upload size={24} className="text-white" /> : <ImagePlus size={24} className="text-white" />}
                                </div>
                                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                                    点击选择、拖拽或粘贴图片
                                </p>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                                    支持 PNG / JPG / WebP，可直接 Ctrl+V 粘贴截图
                                </p>
                                <input
                                    ref={inputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) loadFile(f);
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                        ) : (
                            /* 图片预览 */
                            <div className="relative surface-card rounded-xl p-3 group">
                                <button
                                    onClick={clearImage}
                                    className="absolute top-5 right-5 z-10 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                                    title="移除图片"
                                >
                                    <X size={14} />
                                </button>
                                <img
                                    ref={imgRef}
                                    src={imageUrl}
                                    alt="待识别"
                                    className="max-h-[320px] mx-auto rounded-lg object-contain"
                                />
                                <div className="flex items-center justify-between mt-2.5 px-1">
                                    <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate max-w-[70%]" title={imageFile?.name}>
                                        {imageFile?.name}
                                    </span>
                                    <button
                                        onClick={() => inputRef.current?.click()}
                                        className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                                    >
                                        更换图片
                                    </button>
                                </div>
                                <input
                                    ref={inputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) loadFile(f);
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                        )}

                        {/* 识别按钮 */}
                        <button
                            onClick={handleRecognize}
                            disabled={!isReady || isGenerating || !imageFile}
                            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white text-sm font-medium rounded-xl transition shadow-sm flex items-center justify-center gap-2"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 size={15} className="animate-spin" />
                                    {loadingMessage || '识别中...'}
                                </>
                            ) : (
                                <>
                                    <ScanText size={15} />
                                    开始识别
                                </>
                            )}
                        </button>

                        {/* 识别结果 */}
                        {(ocrResult || isGenerating) && (
                            <div className="surface-card rounded-xl p-4 relative group">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        识别结果
                                    </h3>
                                    {ocrResult && !isGenerating && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-zinc-400">{charCount} 字符</span>
                                            <button
                                                onClick={copyResult}
                                                className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 transition"
                                                title="复制结果"
                                            >
                                                {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {isGenerating && !ocrResult ? (
                                    <div className="flex items-center gap-2 py-2">
                                        <Loader2 size={14} className="animate-spin text-emerald-500" />
                                        <span className="text-xs text-zinc-400">正在识别文字...</span>
                                    </div>
                                ) : (
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 select-text">
                                        {ocrResult}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function OcrPage() {
    return (
        <ErrorBoundary>
            <OcrPageContent />
        </ErrorBoundary>
    );
}
