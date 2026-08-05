// src/renderer/src/hooks/useHuggingFaceModel.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { pipeline, env, PipelineType } from '@huggingface/transformers';

// ---------- 类型定义 ----------
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

export interface ProgressInfo {
    file: string;
    progress: number; // 0-100
}

export interface ModelOption {
    id: string;
    label: string;
    groupId: string;
}

// 定义 pipeline 允许的 dtype 类型（从 @huggingface/transformers 类型中提取）
export type DType =
    | 'auto'
    | 'fp32'
    | 'fp16'
    | 'q8'
    | 'int8'
    | 'uint8'
    | 'q4'
    | 'bnb4'
    | 'q2'
    | 'q2f16'
    | 'q1'
    | 'q1f16'
    | 'q4f16';

export type DeviceType = 'webgpu' | 'wasm' | 'cpu';

export interface UseModelOptions<T extends PipelineType> {
    task: T;
    modelList: ModelOption[];
    defaultModelId?: string;
    pipelineOptions?: {
        dtype?: DType;
        device?: DeviceType;
        max_new_tokens?: number;
        temperature?: number;
        do_sample?: boolean;
    };
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

export function useHuggingFaceModel<T extends PipelineType>({
    task,
    modelList,
    defaultModelId,
    pipelineOptions = {},
}: UseModelOptions<T>) {
    const defaultId = defaultModelId || modelList[0]?.id || '';

    // ---------- 状态 ----------
    const [status, setStatus] = useState<ModelStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [progressItems, setProgressItems] = useState<ProgressInfo[]>([]);
    const [overallProgress, setOverallProgress] = useState(0);
    const [currentModel, setCurrentModel] = useState<string>(defaultId);
    const [pendingModel, setPendingModel] = useState<string | null>(null);
    const [mirrorEnabled, setMirrorEnabledState] = useState<boolean>(getMirrorEnabled);

    // ---------- Refs ----------
    const pipeRef = useRef<any>(null);
    const loadIdRef = useRef<number>(0);

    // ---------- 镜像切换 ----------
    const toggleMirror = useCallback((enabled: boolean) => {
        setMirrorEnabledState(enabled);
        setMirrorEnabledStorage(enabled);
        env.remoteHost = enabled ? MIRROR_URL : DEFAULT_REMOTE_HOST;
    }, []);

    // ---------- 加载模型 ----------
    const loadModel = useCallback(
        async (modelId: string) => {
            const currentLoadId = ++loadIdRef.current;
            setStatus('loading');
            setError(null);
            setProgressItems([]);
            setOverallProgress(0);
            pipeRef.current = null;

            try {
                env.remoteHost = mirrorEnabled ? MIRROR_URL : DEFAULT_REMOTE_HOST;

                // 修复：显式指定 dtype 类型，并确保类型正确
                const dtype = pipelineOptions.dtype || 'q4f16' as const;
                const device = pipelineOptions.device || 'webgpu' as const;

                const pipe = await pipeline(
                    task,
                    modelId,
                    {
                        dtype,
                        device,
                        progress_callback: (info: any) => {
                            if (currentLoadId !== loadIdRef.current) return;
                            if (info.status === 'progress_total') {
                                setOverallProgress(Math.round(info.progress || 0));
                                return;
                            }
                            if (info.status === 'progress' && info.file) {
                                setProgressItems((prev) => {
                                    const existing = prev.find((item) => item.file === info.file);
                                    if (existing) {
                                        return prev.map((item) =>
                                            item.file === info.file
                                                ? { ...item, progress: Math.round(info.progress || 0) }
                                                : item
                                        );
                                    }
                                    return [...prev, { file: info.file, progress: Math.round(info.progress || 0) }];
                                });
                            }
                        },
                    }
                );

                if (currentLoadId !== loadIdRef.current) {
                    await pipe?.dispose?.();
                    return;
                }

                pipeRef.current = pipe;
                setCurrentModel(modelId);
                setPendingModel(null);
                setStatus('ready');
            } catch (err) {
                if (currentLoadId !== loadIdRef.current) return;
                setStatus('error');
                setError((err as Error).message);
                setPendingModel(null);
                console.error('模型加载失败:', err);
            }
        },
        [task, mirrorEnabled, pipelineOptions.dtype, pipelineOptions.device]
    );

    // ---------- 推理（文本生成） ----------
    const generate = useCallback(
        async (prompt: string): Promise<string> => {
            if (!pipeRef.current) throw new Error('模型未加载');
            setStatus('generating');
            setError(null);
            try {
                const result = await pipeRef.current(prompt, {
                    max_new_tokens: pipelineOptions.max_new_tokens || 256,
                    temperature: pipelineOptions.temperature || 0.7,
                    do_sample: pipelineOptions.do_sample ?? true,
                });
                setStatus('ready');
                return result[0]?.generated_text || '';
            } catch (err) {
                setStatus('error');
                setError((err as Error).message);
                throw err;
            }
        },
        [pipelineOptions.max_new_tokens, pipelineOptions.temperature, pipelineOptions.do_sample]
    );

    // ---------- 推理（OCR 图像识别） ----------
    const recognize = useCallback(
        async (imageSource: HTMLImageElement | string): Promise<string> => {
            if (!pipeRef.current) throw new Error('模型未加载');
            setStatus('generating');
            setError(null);
            try {
                const result = await pipeRef.current(imageSource, {
                    max_new_tokens: pipelineOptions.max_new_tokens || 128,
                });
                setStatus('ready');
                return result[0]?.generated_text || '';
            } catch (err) {
                setStatus('error');
                setError((err as Error).message);
                throw err;
            }
        },
        [pipelineOptions.max_new_tokens]
    );

    // ---------- 切换模型 ----------
    const switchModel = useCallback(
        async (modelId: string) => {
            if (modelId === currentModel) return;
            setPendingModel(modelId);
            await loadModel(modelId);
        },
        [currentModel, loadModel]
    );

    // ---------- 释放资源 ----------
    const dispose = useCallback(async () => {
        if (pipeRef.current?.dispose) {
            await pipeRef.current.dispose();
        }
        pipeRef.current = null;
        setStatus('idle');
    }, []);

    // ---------- 首次加载 ----------
    useEffect(() => {
        env.remoteHost = mirrorEnabled ? MIRROR_URL : DEFAULT_REMOTE_HOST;
        loadModel(currentModel);

        return () => {
            loadIdRef.current++;
            if (pipeRef.current?.dispose) {
                pipeRef.current.dispose().catch(console.warn);
            }
            pipeRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------- 派生状态 ----------
    const loadingMessage = (() => {
        switch (status) {
            case 'loading':
                return `正在加载模型 ${currentModel}...`;
            case 'generating':
                return task === 'image-to-text' ? '正在识别文字...' : '正在推理生成答案...';
            case 'error':
                return '加载或推理失败，请检查网络或重试';
            default:
                return '';
        }
    })();

    return {
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
        recognize,
        switchModel,
        dispose,
        modelList,
        isLoading: status === 'loading',
        isReady: status === 'ready',
        isGenerating: status === 'generating',
        isError: status === 'error',
    };
}