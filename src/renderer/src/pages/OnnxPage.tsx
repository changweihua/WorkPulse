// src/renderer/src/pages/OnnxPage.tsx
import { useState, useCallback, useMemo } from 'react';
import { useONNXModel, getModelsByGroup, MODEL_GROUPS, ModelGroupId } from '../hooks/useONNXModel';
import { ErrorBoundary } from '../components/ErrorBoundary';

const IS_WEBGPU_AVAILABLE = !!(navigator as any).gpu;

// ---------- 子组件 ----------
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

function ModelSelector({
    groups,
    selectedGroup,
    onGroupChange,
    models,
    currentModel,
    onModelChange,
    disabled,
}: {
    groups: readonly { id: ModelGroupId; label: string }[];
    selectedGroup: ModelGroupId;
    onGroupChange: (group: ModelGroupId) => void;
    models: { id: string; label: string }[];
    currentModel: string;
    onModelChange: (model: string) => void;
    disabled: boolean;
}) {
    return (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1">
                <label htmlFor="model-group" className="block text-sm font-medium text-gray-700 mb-1">
                    量级分组
                </label>
                <select
                    id="model-group"
                    value={selectedGroup}
                    onChange={(e) => onGroupChange(e.target.value as ModelGroupId)}
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
                <label htmlFor="model-select" className="block text-sm font-medium text-gray-700 mb-1">
                    具体模型
                </label>
                <select
                    id="model-select"
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

function ChatInput({
    value,
    onChange,
    onSubmit,
    disabled,
    isGenerating,
}: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    disabled: boolean;
    isGenerating: boolean;
}) {
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit();
    };

    return (
        <form onSubmit={handleSubmit} className="mb-4">
            <textarea
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="输入你的问题..."
                disabled={disabled}
                aria-label="输入问题"
            />
            <button
                type="submit"
                disabled={disabled || !value.trim()}
                className="mt-2 w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition"
            >
                {isGenerating ? '生成中...' : '发送'}
            </button>
        </form>
    );
}

// ---------- 主页面 ----------
function OnnxPageContent() {
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
        generate,
        switchModel,
        isLoading,
        isReady,
        isGenerating,
        isError,
    } = useONNXModel();

    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<ModelGroupId>(MODEL_GROUPS[0].id);

    const modelsInGroup = useMemo(() => getModelsByGroup(selectedGroup), [selectedGroup]);

    const handleGroupChange = useCallback(
        (groupId: ModelGroupId) => {
            setSelectedGroup(groupId);
            const first = getModelsByGroup(groupId)[0];
            if (first && first.id !== currentModel) {
                switchModel(first.id).catch((err) => setOutput(`切换失败：${err.message}`));
            }
        },
        [currentModel, switchModel]
    );

    const handleModelChange = useCallback(
        (modelId: string) => {
            if (modelId === currentModel) return;
            switchModel(modelId).catch((err) => setOutput(`切换失败：${err.message}`));
        },
        [currentModel, switchModel]
    );

    const handleSubmit = useCallback(async () => {
        if (!input.trim()) return;
        setOutput('⏳ 推理中，请稍候...');
        try {
            const result = await generate(input);
            setOutput(result);
        } catch (err) {
            setOutput(`推理失败：${(err as Error).message}`);
        }
    }, [input, generate]);

    const displayModel = pendingModel || currentModel;

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
            <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
                <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-6">
                    <h1 className="text-3xl font-bold mb-4 text-center text-gray-800">
                        🚀 本地 AI 推理 (ONNX + WebGPU)
                    </h1>

                    <MirrorToggle enabled={mirrorEnabled} onToggle={toggleMirror} />

                    <ModelSelector
                        groups={MODEL_GROUPS}
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
                            <p className="text-sm mt-1">
                                请使用最新版 Chrome/Edge (113+) 或 Firefox，并确保硬件支持。
                            </p>
                        </div>
                    )}

                    {isLoading && <ProgressDisplay overall={overallProgress} items={progressItems} />}

                    {isGenerating && (
                        <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg">{loadingMessage}</div>
                    )}

                    {isError && (
                        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg">
                            <strong>❌ 错误：</strong> {error}
                            <p className="text-sm mt-1">提示：可尝试关闭镜像开关或切换其他模型。</p>
                        </div>
                    )}

                    <ChatInput
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSubmit}
                        disabled={!isReady || isGenerating}
                        isGenerating={isGenerating}
                    />

                    {output && (
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <h3 className="font-semibold text-gray-700 mb-2">回复：</h3>
                            <p className="whitespace-pre-wrap text-gray-800">{output}</p>
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
export default function OnnxPage() {
    return (
        <ErrorBoundary>
            <OnnxPageContent />
        </ErrorBoundary>
    );
}