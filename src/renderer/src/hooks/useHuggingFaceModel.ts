// src/renderer/src/hooks/useHuggingFaceModel.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { PipelineType } from '@huggingface/transformers';

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

// ---------- 固定使用国内镜像（huggingface.co 部分网络不可达） ----------
// 注意：remoteHost 必须以 / 结尾，否则拼接出 https://hf-mirror.comorg/... 全部 404
const REMOTE_HOST = 'https://hf-mirror.com/';
// 本地文件夹缓存协议：主进程下载到 userData/models 后经此回放（见 src/main/index.ts）
const LOCAL_HOST = 'appmodel://models/';

// ---------- 文件清单 ----------
const BASE_FILES = ['config.json', 'tokenizer_config.json', 'tokenizer.json'];
const OPTIONAL_FILES = [
    'generation_config.json',
    'preprocessor_config.json',
    'added_tokens.json',
    'special_tokens_map.json',
    'vocab.txt',
    'merges.txt',
    'vocab.json',
];
const weightFileFor = (dtype: DType): string => {
    switch (dtype) {
        case 'q4f16':
            return 'onnx/model_q4f16.onnx';
        case 'q8':
        case 'int8':
        case 'uint8':
            return 'onnx/model_quantized.onnx';
        case 'fp32':
        case 'auto':
            return 'onnx/model.onnx';
        default:
            return `onnx/model_${dtype}.onnx`;
    }
};

// ---------- WebWorker 单例（跨页面、跨挂载复用，模型保留在 worker 内供秒开） ----------
let worker: Worker | null = null;
const messageHandlers = new Map<number, (msg: any) => void>();

function getWorker(): Worker {
    if (!worker) {
        worker = new Worker(new URL('../workers/hf-pipeline.worker.ts', import.meta.url), {
            type: 'module',
        });
        worker.onmessage = (e: MessageEvent) => {
            const msg = e.data;
            const handler = messageHandlers.get(msg.rid);
            if (handler) handler(msg);
        };
    }
    return worker;
}

// 将 HTMLImageElement 转为可序列化（跨 worker 边界）的 data URL
async function toSerializableImage(src: HTMLImageElement | string): Promise<string> {
    if (typeof src === 'string') return src;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = src.naturalWidth || src.width;
        canvas.height = src.naturalHeight || src.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return src.src;
        ctx.drawImage(src, 0, 0);
        return canvas.toDataURL('image/png');
    } catch {
        return src.src;
    }
}

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

    // ---------- Refs ----------
    const loadIdRef = useRef<number>(0); // 每次 loadModel 自增，用于丢弃过期加载
    const reqIdRef = useRef<number>(0); // worker 请求自增 id
    const pendingModelRef = useRef<string | null>(null);
    const loadedComboRef = useRef<{ dtype: DType; device: DeviceType } | null>(null);
    const mountedRef = useRef<boolean>(true);
    const myRidsRef = useRef<Set<number>>(new Set()); // 本 hook 实例发起的请求，卸载时清理

    useEffect(() => {
        pendingModelRef.current = pendingModel;
    }, [pendingModel]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            // 卸载时清理本实例注册的 worker 回调，避免对已卸载组件 setState
            myRidsRef.current.forEach((rid) => messageHandlers.delete(rid));
            myRidsRef.current.clear();
        };
    }, []);

    // ---------- 主进程下载进度合并（本地文件夹缓存） ----------
    useEffect(() => {
        if (status !== 'loading') return;
        const off = window.api.models.onProgress((p) => {
            if (p.modelId !== (pendingModelRef.current ?? currentModel)) return;
            const pct = p.percent >= 0 ? p.percent : 0;
            setProgressItems((prev) => {
                const existing = prev.find((item) => item.file === p.file);
                if (existing) {
                    return prev.map((item) =>
                        item.file === p.file ? { ...item, progress: pct } : item
                    );
                }
                return [...prev, { file: p.file, progress: pct }];
            });
        });
        return off;
    }, [status, currentModel]);

    // ---------- 加载模型（带回退链 + worker 内缓存复用） ----------
    const loadModel = useCallback(
        async (modelId: string) => {
            const myLoadId = ++loadIdRef.current;
            if (!mountedRef.current) return;
            setStatus('loading');
            setError(null);
            setProgressItems([]);
            setOverallProgress(0);
            loadedComboRef.current = null;

            const requestedDtype = pipelineOptions.dtype || 'q4f16';
            const requestedDevice = pipelineOptions.device || 'webgpu';

            // 回退链：请求的组合 → webgpu+q8 → wasm+q8
            const combos: { device: DeviceType; dtype: DType }[] = [
                { device: requestedDevice, dtype: requestedDtype },
                { device: 'webgpu', dtype: 'q8' },
                { device: 'wasm', dtype: 'q8' },
            ];
            const seen = new Set<string>();
            const attempts = combos.filter((c) => {
                const key = `${c.device}/${c.dtype}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            let lastError: Error | null = null;

            for (let i = 0; i < attempts.length; i++) {
                if (myLoadId !== loadIdRef.current) return;
                const { device, dtype } = attempts[i];

                // 先经主进程把文件下载到本地文件夹（已存在则秒过），
                // 成功则走 appmodel:// 协议本地回放；失败则回退直连镜像
                let host = REMOTE_HOST;
                try {
                    const res = await window.api.models.ensure(
                        modelId,
                        [...BASE_FILES, weightFileFor(dtype)],
                        OPTIONAL_FILES
                    );
                    if (res?.ok) host = LOCAL_HOST;
                } catch {
                    /* 主进程不可用时直连镜像 */
                }

                const ok = await new Promise<boolean>((resolve) => {
                    const rid = ++reqIdRef.current;
                    myRidsRef.current.add(rid);
                    messageHandlers.set(rid, (msg: any) => {
                        if (msg.type === 'progress') {
                            if (myLoadId !== loadIdRef.current || !mountedRef.current) return;
                            if (msg.status === 'progress_total') {
                                setOverallProgress(Math.round(msg.progress || 0));
                            } else if (msg.status === 'progress' && msg.file) {
                                setProgressItems((prev) => {
                                    const existing = prev.find((item) => item.file === msg.file);
                                    if (existing) {
                                        return prev.map((item) =>
                                            item.file === msg.file
                                                ? { ...item, progress: Math.round(msg.progress || 0) }
                                                : item
                                        );
                                    }
                                    return [
                                        ...prev,
                                        { file: msg.file, progress: Math.round(msg.progress || 0) },
                                    ];
                                });
                            }
                        } else if (msg.type === 'loaded') {
                            messageHandlers.delete(rid);
                            myRidsRef.current.delete(rid);
                            if (myLoadId !== loadIdRef.current || !mountedRef.current) {
                                resolve(false);
                                return;
                            }
                            loadedComboRef.current = { dtype, device };
                            setCurrentModel(modelId);
                            setPendingModel(null);
                            setStatus('ready');
                            resolve(true);
                        } else if (msg.type === 'error') {
                            messageHandlers.delete(rid);
                            myRidsRef.current.delete(rid);
                            lastError = new Error(msg.message || '未知错误');
                            resolve(false);
                        }
                    });
                    getWorker().postMessage({
                        type: 'load',
                        rid,
                        task,
                        modelId,
                        dtype,
                        device,
                        host,
                    });
                });

                if (ok) return;
                if (myLoadId !== loadIdRef.current) return;
            }

            if (myLoadId !== loadIdRef.current || !mountedRef.current) return;
            setStatus('error');
            const msg = (lastError as Error | null)?.message || '未知错误';
            setError(
                msg.includes('404') || msg.toLowerCase().includes('could not locate')
                    ? `该模型缺少可用的权重文件（已尝试 ${attempts.map((a) => `${a.device}/${a.dtype}`).join('、')}）。请更换其他模型。`
                    : `网络加载失败：${msg}。已尝试本地缓存与 hf-mirror.com 国内镜像。`
            );
            setPendingModel(null);
        },
        [task, pipelineOptions.dtype, pipelineOptions.device]
    );

    // ---------- 推理（文本生成，流式 token） ----------
    // onToken 每产生一个 token 即被调用，用于实现打字机效果
    const generateStream = useCallback(
        async (prompt: string, onToken?: (text: string) => void): Promise<string> => {
            if (!loadedComboRef.current) throw new Error('模型未加载');
            if (!mountedRef.current) throw new Error('组件已卸载');
            setStatus('generating');
            setError(null);
            const { dtype, device } = loadedComboRef.current;
            const rid = ++reqIdRef.current;
            myRidsRef.current.add(rid);
            return new Promise<string>((resolve, reject) => {
                messageHandlers.set(rid, (msg: any) => {
                    if (msg.type === 'token') {
                        onToken?.(msg.text);
                    } else if (msg.type === 'done') {
                        messageHandlers.delete(rid);
                        myRidsRef.current.delete(rid);
                        if (!mountedRef.current) return;
                        setStatus('ready');
                        resolve(msg.fullText || '');
                    } else if (msg.type === 'error') {
                        messageHandlers.delete(rid);
                        myRidsRef.current.delete(rid);
                        if (!mountedRef.current) return;
                        setStatus('error');
                        setError(msg.message);
                        reject(new Error(msg.message));
                    }
                });
                getWorker().postMessage({
                    type: 'generate',
                    rid,
                    task,
                    modelId: currentModel,
                    dtype,
                    device,
                    prompt,
                    options: {
                        max_new_tokens: pipelineOptions.max_new_tokens || 256,
                        temperature: pipelineOptions.temperature || 0.7,
                        do_sample: pipelineOptions.do_sample ?? true,
                    },
                });
            });
        },
        [task, currentModel, pipelineOptions.max_new_tokens, pipelineOptions.temperature, pipelineOptions.do_sample]
    );

    // 兼容旧调用：一次性返回完整文本
    const generate = useCallback(
        async (prompt: string): Promise<string> => generateStream(prompt),
        [generateStream]
    );

    // ---------- 推理（OCR 图像识别，worker 内执行，支持流式 token） ----------
    const recognize = useCallback(
        async (
            imageSource: HTMLImageElement | string,
            onToken?: (text: string) => void
        ): Promise<string> => {
            if (!loadedComboRef.current) throw new Error('模型未加载');
            if (!mountedRef.current) throw new Error('组件已卸载');
            setStatus('generating');
            setError(null);
            const { dtype, device } = loadedComboRef.current;
            const imageData = await toSerializableImage(imageSource);
            const rid = ++reqIdRef.current;
            myRidsRef.current.add(rid);
            return new Promise<string>((resolve, reject) => {
                messageHandlers.set(rid, (msg: any) => {
                    if (msg.type === 'token') {
                        onToken?.(msg.text);
                    } else if (msg.type === 'result') {
                        messageHandlers.delete(rid);
                        myRidsRef.current.delete(rid);
                        if (!mountedRef.current) return;
                        setStatus('ready');
                        resolve(msg.data || '');
                    } else if (msg.type === 'error') {
                        messageHandlers.delete(rid);
                        myRidsRef.current.delete(rid);
                        if (!mountedRef.current) return;
                        setStatus('error');
                        setError(msg.message);
                        reject(new Error(msg.message));
                    }
                });
                getWorker().postMessage({
                    type: 'recognize',
                    rid,
                    task,
                    modelId: currentModel,
                    dtype,
                    device,
                    imageData,
                    options: {
                        max_new_tokens: pipelineOptions.max_new_tokens || 128,
                    },
                });
            });
        },
        [task, currentModel, pipelineOptions.max_new_tokens]
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

    // ---------- 重试当前模型 ----------
    const retry = useCallback(() => {
        return loadModel(currentModel);
    }, [currentModel, loadModel]);

    // ---------- 首次加载（卸载时不销毁 worker，模型保留在 worker 内供下次复用） ----------
    useEffect(() => {
        loadModel(currentModel);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------- 派生状态 ----------
    const loadingMessage = (() => {
        switch (status) {
            case 'loading':
                return `正在加载模型 ${pendingModel || currentModel}...`;
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
        generate,
        generateStream,
        recognize,
        switchModel,
        retry,
        modelList,
        isLoading: status === 'loading',
        isReady: status === 'ready',
        isGenerating: status === 'generating',
        isError: status === 'error',
    };
}
