// src/renderer/src/hooks/usePPOCR.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import type { WorkerRequest, WorkerResponse } from '../workers/ppocrTypes';

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

// ---------- 模型文件名 ----------
const DET_MODEL = 'PP-OCRv6_det_tiny.onnx';
const REC_MODEL = 'PP-OCRv6_rec_tiny.onnx';
const CHARLIST_FILE = 'ppocr_keys_v6_tiny.json';

// ---------- Hook ----------
export function usePPOCR() {
    const [status, setStatus] = useState<OCRStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ProgressInfo>({ percent: 0, step: '等待开始' });
    const [results, setResults] = useState<RecognitionResult[]>([]);
    const [imageData, setImageData] = useState<ImageData | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const runResolveRef = useRef<((r: RecognitionResult[]) => void) | null>(null);
    const runRejectRef = useRef<((e: Error) => void) | null>(null);

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
    const loadModels = useCallback(async () => {
        try {
            setStatus('loading');
            setProgress({ percent: 0, step: '加载字符集...' });

            const keysData = await readModelFile(CHARLIST_FILE);
            const jsonStr = new TextDecoder().decode(new Uint8Array(keysData));
            const dict = JSON.parse(jsonStr);
            const charList = ['', ...dict, ' '];
            console.log('[OCR] 字符集大小:', charList.length);

            setProgress({ percent: 20, step: '加载检测模型...' });
            const detBuffer = await readModelFile(DET_MODEL);

            setProgress({ percent: 60, step: '加载识别模型...' });
            const recBuffer = await readModelFile(REC_MODEL);

            // 将模型 buffer 以 transferable 方式交给 Worker，由 Worker 创建推理会话
            workerRef.current?.postMessage(
                { type: 'init', detBuffer, recBuffer, charList } as WorkerRequest,
                [detBuffer, recBuffer]
            );
            // 真正的会话创建在 Worker 内完成，'ready' 消息到达后状态置为 ready
        } catch (err) {
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

    // 创建 Worker 并加载模型
    useEffect(() => {
        const worker = new Worker(new URL('../workers/ppocr.worker.ts', import.meta.url), {
            type: 'module',
        });
        workerRef.current = worker;
        worker.onmessage = handleWorkerMessage;
        worker.onerror = handleWorkerError;

        loadModels();

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
    };
}
