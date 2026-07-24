// src/renderer/src/hooks/useONNXModel.ts
import { useState, useEffect, useRef } from 'react';
import { pipeline, env } from '@huggingface/transformers';

// ---------- 模型分组 ----------
export const MODEL_GROUPS = [
    { id: 'ultra-light', label: '超轻量级 (< 1B)' },
    { id: 'light', label: '轻量级 (1B ~ 4B)' },
    { id: 'medium', label: '中量级 (7B ~ 8B)' },
] as const;
export type ModelGroupId = (typeof MODEL_GROUPS)[number]['id'];

export interface ModelInfo {
    id: string;
    label: string;
    groupId: ModelGroupId;
}

// ---------- 可用模型列表（经联网核实，优先 Transformers.js 官方推荐的 onnx-community 模型） ----------
export const AVAILABLE_MODELS: ModelInfo[] = [
    // 超轻量级 (< 1B)
    {
        id: 'onnx-community/functiongemma-270m-it-ONNX',
        label: 'FunctionGemma 270M (功能调用)',
        groupId: 'ultra-light',
    },
    {
        id: 'onnx-community/Bitnet-SmolLM-135M-ONNX',
        label: 'Bitnet-SmolLM 135M (极轻量)',
        groupId: 'ultra-light',
    },
    {
        id: 'onnx-community/gpt2-mini-ONNX',
        label: 'GPT2-Mini (约 100M)',
        groupId: 'ultra-light',
    },
    {
        id: 'onnx-community/trlm-135m-ONNX',
        label: 'TRLM 135M',
        groupId: 'ultra-light',
    },
    {
        id: 'onnx-community/gemma-3-270m-it-ONNX',
        label: 'Gemma 3 270M',
        groupId: 'ultra-light',
    },
    // 轻量级 (1B ~ 4B)
    {
        id: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
        label: 'Llama 3.2 1B Instruct',
        groupId: 'light',
    },
    {
        id: 'onnx-community/LFM2-1.2B-ONNX',
        label: 'LFM2 1.2B (Liquid AI)',
        groupId: 'light',
    },
    {
        id: 'onnxruntime/DeepSeek-R1-Distill-ONNX',
        label: 'DeepSeek-R1 1.5B (官方优化)',
        groupId: 'light',
    },
    {
        id: 'microsoft/Phi-3-mini-4k-instruct-onnx-web',
        label: 'Phi-3 Mini 4K (微软 Web 版)',
        groupId: 'light',
    },
    // 中量级 (7B ~ 8B)
    {
        id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B-ONNX',
        label: 'DeepSeek-R1 7B (Qwen)',
        groupId: 'medium',
    },
    {
        id: 'onnx-community/DeepSeek-R1-Distill-Llama-8B-ONNX-DirectML-GenAI-INT4',
        label: 'DeepSeek-R1 8B (Llama + DirectML)',
        groupId: 'medium',
    },
];

export const getModelsByGroup = (groupId: ModelGroupId) =>
    AVAILABLE_MODELS.filter((m) => m.groupId === groupId);

export interface ProgressItem {
    file: string;
    progress: number;
}

// ---------- 镜像管理 ----------
const MIRROR_KEY = 'hf_mirror_enabled';
const MIRROR_URL = 'https://hf-mirror.com';
const DEFAULT_REMOTE_HOST = 'https://huggingface.co';

const getMirrorEnabled = (): boolean => {
    try {
        return localStorage.getItem(MIRROR_KEY) === 'true';
    } catch {
        return false;
    }
};

const setMirrorEnabledStorage = (enabled: boolean) => {
    try {
        localStorage.setItem(MIRROR_KEY, String(enabled));
    } catch { }
};

const applyMirrorConfig = (enabled: boolean) => {
    if (enabled) {
        env.remoteHost = MIRROR_URL;
    } else {
        env.remoteHost = DEFAULT_REMOTE_HOST;
    }
};

// ---------- Hook ----------
export function useONNXModel(initialModelId?: string) {
    type Status = 'idle' | 'loading' | 'ready' | 'generating' | 'error';
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
    const [currentModel, setCurrentModel] = useState<string>(
        initialModelId || AVAILABLE_MODELS[0].id
    );
    const [pendingModel, setPendingModel] = useState<string | null>(null);
    const [mirrorEnabled, setMirrorEnabledState] = useState<boolean>(getMirrorEnabled());

    const pipeRef = useRef<any>(null);

    const toggleMirror = (enabled: boolean) => {
        setMirrorEnabledState(enabled);
        setMirrorEnabledStorage(enabled);
        applyMirrorConfig(enabled);
    };

    const loadModel = async (modelId: string) => {
        setStatus('loading');
        setError(null);
        setProgressItems([]);
        pipeRef.current = null;

        try {
            applyMirrorConfig(mirrorEnabled);

            const pipe = await pipeline<"text-generation">(
                'text-generation',
                modelId,
                {
                    dtype: 'q4f16',
                    device: 'webgpu',
                    progress_callback: (p: any) => {
                        let progress = 0;
                        if (typeof p.progress === 'number' && !isNaN(p.progress)) {
                            progress = p.progress <= 1 ? Math.round(p.progress * 100) : Math.round(p.progress);
                        }
                        const file = p.file || 'unknown';
                        setProgressItems((prev) => {
                            const existing = prev.find((item) => item.file === file);
                            if (existing) {
                                return prev.map((item) =>
                                    item.file === file ? { ...item, progress } : item
                                );
                            }
                            return [...prev, { file, progress }];
                        });
                    },
                }
            );
            pipeRef.current = pipe;
            setCurrentModel(modelId);
            setPendingModel(null);
            setStatus('ready');
        } catch (err) {
            setStatus('error');
            setError((err as Error).message);
            setPendingModel(null);
            console.error('模型加载失败:', err);
        }
    };

    const generate = async (prompt: string): Promise<string> => {
        if (!pipeRef.current) throw new Error('模型未加载');
        setStatus('generating');
        setError(null);
        try {
            const result = await pipeRef.current(prompt, {
                max_new_tokens: 256,
                temperature: 0.7,
                do_sample: true,
            });
            setStatus('ready');
            return result[0]?.generated_text || '';
        } catch (err) {
            setStatus('error');
            setError((err as Error).message);
            throw err;
        }
    };

    useEffect(() => {
        applyMirrorConfig(mirrorEnabled);
        loadModel(currentModel);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const switchModel = async (modelId: string) => {
        if (modelId === currentModel) return;
        setPendingModel(modelId);
        await loadModel(modelId);
    };

    const overallProgress = progressItems.length
        ? Math.round(
            progressItems.reduce((sum, p) => sum + (typeof p.progress === 'number' && !isNaN(p.progress) ? p.progress : 0), 0) /
            progressItems.length
        )
        : 0;

    return {
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
        availableModels: AVAILABLE_MODELS,
        modelGroups: MODEL_GROUPS,
        isLoading: status === 'loading',
        isReady: status === 'ready',
        isGenerating: status === 'generating',
        isError: status === 'error',
    };
}