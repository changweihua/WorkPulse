// src/renderer/src/hooks/usePPOCR.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import type { WorkerRequest, WorkerResponse, ExecutionBackend } from '../workers/ppocrTypes';

// ---------- 类型定义 ----------
export type OCRStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

export interface DetectionBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    cy: number;
}

export interface RecognitionResult {
    box: DetectionBox;
    text: string;
    confidence: number;
    charCount: number;
}

export interface ProgressInfo {
    percent: number;
    step: string;
}

// ---------- 模型变体定义 ----------
export type ModelVariant = 'tiny' | 'small' | 'medium';

export interface ModelVariantInfo {
    id: ModelVariant;
    label: string;
    det: string;
    rec: string;
    dict: string;
    size: string;
}

export const MODEL_VARIANTS: ModelVariantInfo[] = [
    {
        id: 'tiny',
        label: 'Tiny (6 MB)',
        det: 'ppocrv6-tiny/det.onnx',
        rec: 'ppocrv6-tiny/rec.onnx',
        dict: 'ppocrv6-tiny/dict.json',
        size: '~6 MB',
    },
    {
        id: 'small',
        label: 'Small (29 MB)',
        det: 'ppocrv6-small/det.onnx',
        rec: 'ppocrv6-small/rec.onnx',
        dict: 'ppocrv6-small/dict.json',
        size: '~29 MB',
    },
    {
        id: 'medium',
        label: 'Medium (132 MB)',
        det: 'ppocrv6-medium/det.onnx',
        rec: 'ppocrv6-medium/rec.onnx',
        dict: 'ppocrv6-medium/dict.json',
        size: '~132 MB',
    },
];

function getVariantConfig(variant: ModelVariant): ModelVariantInfo {
    return MODEL_VARIANTS.find((v) => v.id === variant) ?? MODEL_VARIANTS[0];
}

// ---------- Hook ----------
export function usePPOCR(initialVariant: ModelVariant = 'tiny') {
    const [status, setStatus] = useState<OCRStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ProgressInfo>({ percent: 0, step: '等待开始' });
    const [results, setResults] = useState<RecognitionResult[]>([]);
    const [imageData, setImageData] = useState<ImageData | null>(null);
    const [variant, setVariant] = useState<ModelVariant>(initialVariant);
    const [backend, setBackend] = useState<ExecutionBackend | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const runResolveRef = useRef<((r: RecognitionResult[]) => void) | null>(null);
    const runRejectRef = useRef<((e: Error) => void) | null>(null);
    const variantRef = useRef<ModelVariant>(initialVariant);
    // 代数计数器：每次切换变体递增，防止过期的 loadModels 向新 worker 发送 init
    const loadGenerationRef = useRef(0);

    // 通过 IPC 读取模型文件（返回 ArrayBuffer）
    const readModelFile = useCallback(async (fileName: string): Promise<ArrayBuffer> => {
        const ipc = (window as any).pp?.ipcRenderer;
        if (!ipc) {
            throw new Error('IPC 不可用，请确保 preload 脚本正确配置');
        }
        return await ipc.invoke('read-model-file', fileName);
    }, []);

    // 处理来自 Worker 的消息
    const handleWorkerMessage = useCallback((e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        switch (msg.type) {
            case 'ready':
                setStatus('ready');
                setProgress({ percent: 100, step: '模型加载完成' });
                setError(null);
                setBackend(msg.backend);
                break;
            case 'progress':
                setProgress({ percent: msg.percent, step: msg.stage });
                break;
            case 'box-recognized':
                // 渐进式更新：每个文本框识别完成后立即追加显示
                setResults((prev) => [
                    ...prev,
                    {
                        box: msg.box,
                        text: msg.text,
                        confidence: msg.confidence,
                        charCount: msg.charCount,
                    },
                ]);
                break;
            case 'done':
                setResults(msg.results);
                setStatus('ready');
                setProgress({ percent: 100, step: '完成' });
                runResolveRef.current?.(msg.results);
                runResolveRef.current = null;
                runRejectRef.current = null;
                break;
            case 'error':
                setStatus('error');
                setError(msg.message);
                runRejectRef.current?.(new Error(msg.message));
                runRejectRef.current = null;
                runResolveRef.current = null;
                break;
        }
    }, []);

    const handleWorkerError = useCallback((e: ErrorEvent) => {
        setStatus('error');
        setError(e.message || 'Worker 运行错误');
    }, []);

    // 加载模型：读取文件（用于进度上报），随后将 buffer 转移给 Worker 创建会话
    const loadModels = useCallback(async (targetVariant?: ModelVariant) => {
        const v = targetVariant ?? variantRef.current;
        const cfg = getVariantConfig(v);
        const generation = ++loadGenerationRef.current;
        try {
            setStatus('loading');
            setProgress({ percent: 0, step: `加载字符集 (${v})...` });

            const keysData = await readModelFile(cfg.dict);
            const jsonStr = new TextDecoder().decode(new Uint8Array(keysData));
            const dict = JSON.parse(jsonStr);
            const charList = ['', ...dict, ' '];
            console.log(`[OCR] 字符集大小: ${charList.length}, 模型: ${v}`);

            // 检查：如果代数已变，说明用户已切换到其他模型，丢弃本次加载
            if (generation !== loadGenerationRef.current) {
                console.log(`[OCR] 模型 ${v} 已过期，跳过初始化`);
                return;
            }

            setProgress({ percent: 20, step: `加载检测模型 (${v})...` });
            const detBuffer = await readModelFile(cfg.det);

            if (generation !== loadGenerationRef.current) return;

            setProgress({ percent: 60, step: `加载识别模型 (${v})...` });
            const recBuffer = await readModelFile(cfg.rec);

            if (generation !== loadGenerationRef.current) return;

            // 将模型 buffer 以 transferable 方式交给 Worker，由 Worker 创建推理会话
            workerRef.current?.postMessage(
                { type: 'init', detBuffer, recBuffer, charList } as WorkerRequest,
                [detBuffer, recBuffer]
            );
            // 真正的会话创建在 Worker 内完成，'ready' 消息到达后状态置为 ready
        } catch (err) {
            if (generation !== loadGenerationRef.current) return;
            setStatus('error');
            setError((err as Error).message);
            console.error('[OCR] 加载失败:', err);
        }
    }, [readModelFile]);

    // 运行 OCR：将图像发送给 Worker，推理在 Worker 线程执行
    const runOCR = useCallback(
        async (imgData: ImageData): Promise<RecognitionResult[]> => {
            if (status !== 'ready' || !workerRef.current) {
                throw new Error('模型未加载完成');
            }

            setStatus('running');
            setResults([]);
            setProgress({ percent: 0, step: '开始处理...' });

            const worker = workerRef.current;
            return new Promise<RecognitionResult[]>((resolve, reject) => {
                runResolveRef.current = resolve;
                runRejectRef.current = reject;
                // 不转移 buffer，保留渲染线程的 imgData 供 Canvas 绘制使用
                worker.postMessage({ type: 'run', imageData: imgData } as WorkerRequest);
            });
        },
        [status]
    );

    // 切换模型变体：终止旧 Worker，创建新 Worker，加载新模型
    const switchVariant = useCallback(
        async (newVariant: ModelVariant) => {
            if (newVariant === variantRef.current) return;
            variantRef.current = newVariant;
            setVariant(newVariant);
            setResults([]);
            setError(null);
            setBackend(null);

            // 终止旧 Worker
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }

            // 创建新 Worker 并加载模型
            const worker = new Worker(new URL('../workers/ppocr.worker.ts', import.meta.url), {
                type: 'module',
            });
            workerRef.current = worker;
            worker.onmessage = handleWorkerMessage;
            worker.onerror = handleWorkerError;

            await loadModels(newVariant);
        },
        [loadModels, handleWorkerMessage, handleWorkerError]
    );

    // 创建 Worker 并加载模型
    useEffect(() => {
        const worker = new Worker(new URL('../workers/ppocr.worker.ts', import.meta.url), {
            type: 'module',
        });
        workerRef.current = worker;
        worker.onmessage = handleWorkerMessage;
        worker.onerror = handleWorkerError;

        loadModels(variantRef.current);

        return () => {
            worker.terminate();
            workerRef.current = null;
            runResolveRef.current = null;
            runRejectRef.current = null;
        };
    }, [loadModels, handleWorkerMessage, handleWorkerError]);

    return {
        status,
        error,
        progress,
        results,
        imageData,
        setImageData,
        runOCR,
        loadModels,
        variant,
        switchVariant,
        backend,
    };
}
