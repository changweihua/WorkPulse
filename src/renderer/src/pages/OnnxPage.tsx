// src/renderer/src/pages/OnnxPage.tsx
import { useState, useEffect, useMemo } from 'react';
import {
    useONNXModel,
    MODEL_GROUPS,
    AVAILABLE_MODELS,
    getModelsByGroup,
    ModelGroupId,
} from '../hooks/useONNXModel';

const isWebGPUSupported = () => !!navigator.gpu;

export default function OnnxPage() {
    const {
        status,
        error,
        progressItems,
        overallProgress,
        currentModel,
        pendingModel,
        mirrorEnabled,
        toggleMirror,
        generate,
        switchModel,
        modelGroups,
        availableModels,
        isLoading,
        isReady,
        isGenerating,
        isError,
    } = useONNXModel();

    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<ModelGroupId>(MODEL_GROUPS[0].id);

    const modelsInGroup = useMemo(() => getModelsByGroup(selectedGroup), [selectedGroup]);

    useEffect(() => {
        const modelInfo = availableModels.find((m) => m.id === currentModel);
        if (modelInfo) {
            setSelectedGroup(modelInfo.groupId);
        }
    }, [currentModel, availableModels]);

    const handleGroupChange = (groupId: ModelGroupId) => {
        setSelectedGroup(groupId);
        const first = getModelsByGroup(groupId)[0];
        if (first && first.id !== currentModel) {
            switchModel(first.id).catch((err) => {
                setOutput(`切换模型失败：${err.message}`);
            });
        }
    };

    const handleModelChange = (modelId: string) => {
        if (modelId === currentModel) return;
        switchModel(modelId).catch((err) => {
            setOutput(`切换模型失败：${err.message}`);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        setOutput('⏳ 推理中，请稍候...');
        try {
            const result = await generate(input);
            setOutput(result);
        } catch (err) {
            setOutput(`推理失败：${(err as Error).message}`);
        }
    };

    const displayModel = pendingModel || currentModel;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold mb-4">本地 AI 推理 (ONNX + WebGPU)</h1>

                {/* 镜像切换开关 */}
                <div className="mb-4 p-3 bg-white rounded-lg shadow flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                        🇨🇳 使用国内镜像（hf-mirror.com）
                    </span>
                    <button
                        onClick={() => toggleMirror(!mirrorEnabled)}
                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none ${mirrorEnabled ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                    >
                        <span
                            className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${mirrorEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                        />
                    </button>
                </div>

                {/* 模型选择区 */}
                <div className="mb-4 flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">量级分组</label>
                        <select
                            value={selectedGroup}
                            onChange={(e) => handleGroupChange(e.target.value as ModelGroupId)}
                            disabled={isLoading || isGenerating}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {modelGroups.map((g) => (
                                <option key={g.id} value={g.id}>
                                    {g.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">具体模型</label>
                        <select
                            value={displayModel}
                            onChange={(e) => handleModelChange(e.target.value)}
                            disabled={isLoading || isGenerating}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {modelsInGroup.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* WebGPU 检测 */}
                {!isWebGPUSupported() && (
                    <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg border border-red-300">
                        <p className="font-semibold">⚠️ 当前浏览器不支持 WebGPU</p>
                        <p className="text-sm mt-1">
                            请使用最新版 Chrome/Edge (113+) 或 Firefox，并确保硬件支持。
                            可访问{' '}
                            <a
                                href="https://webgpureport.org/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                            >
                                webgpureport.org
                            </a>{' '}
                            检测。
                        </p>
                    </div>
                )}

                {/* 加载进度 */}
                {isLoading && (
                    <div className="mb-4">
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${overallProgress}%` }}
                            />
                        </div>
                        <p className="text-sm text-gray-600 mt-1">加载模型中... {overallProgress}%</p>
                        {progressItems.length > 0 && (
                            <div className="mt-1 text-xs text-gray-500 space-y-0.5 max-h-24 overflow-y-auto">
                                {progressItems.map((item) => (
                                    <div key={item.file} className="flex items-center gap-2">
                                        <span className="truncate flex-1">{item.file}</span>
                                        <span>{Math.round(item.progress)}%</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {isGenerating && (
                    <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg">
                        ⏳ 正在推理生成答案，请耐心等待...
                    </div>
                )}

                {isError && (
                    <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg">
                        ❌ 错误：{error}
                    </div>
                )}

                {/* 输入表单 */}
                <form onSubmit={handleSubmit} className="mb-4">
                    <textarea
                        className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="输入你的问题..."
                        disabled={!isReady || isGenerating}
                    />
                    <button
                        type="submit"
                        disabled={!isReady || isGenerating || !input.trim()}
                        className="mt-2 px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition"
                    >
                        {isGenerating ? '生成中...' : '发送'}
                    </button>
                </form>

                {/* 输出 */}
                {output && (
                    <div className="p-4 bg-white rounded-lg shadow">
                        <h3 className="font-semibold text-gray-700 mb-2">回复：</h3>
                        <p className="whitespace-pre-wrap">{output}</p>
                    </div>
                )}
            </div>
        </div>
    );
}