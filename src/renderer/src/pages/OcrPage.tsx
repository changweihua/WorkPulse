// src/renderer/src/pages/OcrPage.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import {
    useOCRModel,
    OCR_MODEL_GROUPS,
    getOCRModelsByGroup,
    OCRModelGroupId,
} from '../hooks/useOCRModel';
import { ErrorBoundary } from '../components/ErrorBoundary';

const IS_WEBGPU_AVAILABLE = !!(navigator as any).gpu;

// ---------- 子组件（复用部分） ----------
function MirrorToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (val: boolean) => void }) {
    return (
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-4">
            <span className="text-sm font-medium text-gray-700">🇨🇳 使用国内镜像（hf-mirror）</span>
            <button
                onClick={() => onToggle(!enabled)}
                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                aria-label="切换镜像源"
            >
                <span
                    className={`inline-block w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                />
            </button>
        </div>
    );
}

function OCRModelSelector({
    groups,
    selectedGroup,
    onGroupChange,
    models,
    currentModel,
    onModelChange,
    disabled,
}: {
    groups: readonly { id: OCRModelGroupId; label: string }[];
    selectedGroup: OCRModelGroupId;
    onGroupChange: (group: OCRModelGroupId) => void;
    models: { id: string; label: string }[];
    currentModel: string;
    onModelChange: (model: string) => void;
    disabled: boolean;
}) {
    return (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1">
                <label htmlFor="ocr-group" className="block text-sm font-medium text-gray-700 mb-1">
                    识别类型
                </label>
                <select
                    id="ocr-group"
                    value={selectedGroup}
                    onChange={(e) => onGroupChange(e.target.value as OCRModelGroupId)}
                    disabled={disabled}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                    {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                            {g.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex-1">
                <label htmlFor="ocr-model" className="block text-sm font-medium text-gray-700 mb-1">
                    具体模型
                </label>
                <select
                    id="ocr-model"
                    value={currentModel}
                    onChange={(e) => onModelChange(e.target.value)}
                    disabled={disabled}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                    {models.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

function ProgressDisplay({
    overall,
    items,
}: {
    overall: number;
    items: { file: string; progress: number }[];
}) {
    return (
        <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(overall, 100)}%` }}
                    role="progressbar"
                    aria-valuenow={overall}
                    aria-valuemin={0}
                    aria-valuemax={100}
                />
            </div>
            <p className="text-sm text-gray-600 mt-1">加载模型中... {overall}%</p>
            {items.length > 0 && (
                <div className="mt-1 text-xs text-gray-500 max-h-24 overflow-y-auto">
                    {items.map((item) => (
                        <div key={item.file} className="flex justify-between">
                            <span className="truncate">{item.file}</span>
                            <span>{Math.round(item.progress)}%</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ImageUploader({
    onFileChange,
    imageUrl,
    disabled,
}: {
    onFileChange: (file: File) => void;
    imageUrl: string | null;
    disabled: boolean;
}) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onFileChange(file);
    };

    return (
        <div className="mb-4">
            <label htmlFor="image-upload" className="block text-sm font-medium text-gray-700 mb-2">
                选择图片
            </label>
            <input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleChange}
                disabled={disabled}
                className="w-full p-2 border border-gray-300 rounded-lg"
            />
            {imageUrl && (
                <div className="mt-2">
                    <img src={imageUrl} alt="待识别" className="max-h-60 rounded-lg border border-gray-200 object-contain" />
                </div>
            )}
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
        mirrorEnabled,
        toggleMirror,
        recognize,
        switchModel,
        isLoading,
        isReady,
        isGenerating,
        isError,
    } = useOCRModel();

    const [selectedGroup, setSelectedGroup] = useState<OCRModelGroupId>(OCR_MODEL_GROUPS[0].id);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<string>('');
    const imgRef = useRef<HTMLImageElement>(null);

    // 释放图片 URL（防止内存泄漏）[reference:10]
    const releaseImageUrl = useCallback(() => {
        if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
        }
    }, [imageUrl]);

    // 组件卸载时释放
    useEffect(() => {
        return releaseImageUrl;
    }, [releaseImageUrl]);

    const handleFileChange = useCallback(
        (file: File) => {
            releaseImageUrl();
            const url = URL.createObjectURL(file);
            setImageFile(file);
            setImageUrl(url);
            setOcrResult('');
        },
        [releaseImageUrl]
    );

    const handleGroupChange = useCallback(
        (groupId: OCRModelGroupId) => {
            setSelectedGroup(groupId);
            const first = getOCRModelsByGroup(groupId)[0];
            if (first && first.id !== currentModel) {
                switchModel(first.id).catch((err) => setOcrResult(`切换失败：${err.message}`));
            }
        },
        [currentModel, switchModel]
    );

    const handleModelChange = useCallback(
        (modelId: string) => {
            if (modelId === currentModel) return;
            switchModel(modelId).catch((err) => setOcrResult(`切换失败：${err.message}`));
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
            setOcrResult(`识别失败：${(err as Error).message}`);
        }
    }, [imageFile, recognize]);

    const displayModel = pendingModel || currentModel;
    const modelsInGroup = getOCRModelsByGroup(selectedGroup);

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-6">
                    <h1 className="text-3xl font-bold mb-4 text-center text-gray-800">
                        📷 本地 OCR 识别 (ONNX + WebGPU)
                    </h1>

                    <MirrorToggle enabled={mirrorEnabled} onToggle={toggleMirror} />

                    <OCRModelSelector
                        groups={OCR_MODEL_GROUPS}
                        selectedGroup={selectedGroup}
                        onGroupChange={handleGroupChange}
                        models={modelsInGroup}
                        currentModel={displayModel}
                        onModelChange={handleModelChange}
                        disabled={isLoading || isGenerating}
                    />

                    {!IS_WEBGPU_AVAILABLE && (
                        <div className="mb-4 p-4 bg-yellow-100 text-yellow-800 rounded-lg border border-yellow-300">
                            <p className="font-semibold">⚠️ 您的浏览器不支持 WebGPU</p>
                            <p className="text-sm mt-1">请使用最新版 Chrome/Edge (113+) 或 Firefox。</p>
                        </div>
                    )}

                    {isLoading && <ProgressDisplay overall={overallProgress} items={progressItems} />}

                    {isGenerating && (
                        <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg">{loadingMessage}</div>
                    )}

                    {isError && (
                        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg">
                            <strong>❌ 错误：</strong> {error}
                        </div>
                    )}

                    <ImageUploader
                        onFileChange={handleFileChange}
                        imageUrl={imageUrl}
                        disabled={!isReady || isGenerating}
                    />

                    <button
                        onClick={handleRecognize}
                        disabled={!isReady || isGenerating || !imageFile}
                        className="w-full py-2 bg-green-600 text-white rounded-lg disabled:opacity-50 hover:bg-green-700 transition mb-4"
                    >
                        {isGenerating ? '识别中...' : '🔍 识别文字'}
                    </button>

                    {ocrResult && (
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <h3 className="font-semibold text-gray-700 mb-2">识别结果：</h3>
                            <p className="whitespace-pre-wrap text-gray-800">{ocrResult}</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="text-xs text-gray-400 text-center py-2 border-t border-gray-200">
                WebGPU {IS_WEBGPU_AVAILABLE ? '✅ 已启用' : '❌ 未支持'} ｜ 状态：{status}
            </div>
        </div>
    );
}

// ---------- 带错误边界的导出 ----------
export default function OcrPage() {
    return (
        <ErrorBoundary>
            <OcrPageContent />
        </ErrorBoundary>
    );
}