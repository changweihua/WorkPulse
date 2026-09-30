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

// 生成唯一 taskId
let taskIdCounter = 0;
function generateTaskId(): string {
  return `ocr-${Date.now()}-${++taskIdCounter}`;
}

// ---------- 模型文件读取（H2：appmodel:// 协议 fetch 优先，IPC 兜底） ----------

// 渲染层模型缓存：key = fileName（已含变体目录，如 `ppocrv6-medium/det.onnx`，天然隔离 tiny/small/medium）
// 缓存的 buffer 永远不会被 postMessage 转移（只转移其 slice 副本），因此不会被 detach，可跨页面复用
const modelFileCache = new Map<string, ArrayBuffer>();

// appmodel 本地模型协议根路径 —— 与主进程 protocol.handle('appmodel')（src/main/index.ts）及
// HF worker 生产先例 LOCAL_HOST（hf-pipeline.worker.ts）的 URL 形状保持一致
const APPMODEL_BASE = 'appmodel://models/';

/**
 * 通过 appmodel:// 协议流式读取模型文件（渲染层本地读取，不经 IPC invoke）。
 *
 * 背景：invoke('read-model-file') 的返回值无法 transfer，只能结构化克隆
 * （medium 变体 det 62MB + rec 76.5MB ≈ 138MB 克隆，峰值双份内存 + 100-300ms 序列化）；
 * fetch 响应体在渲染层直接消费，配合 content-length 预分配 buffer 流式填充并上报进度。
 *
 * 抛错条件：fetch 失败、!response.ok、body 缺失但 content-length 异常、字节数与 content-length 不符。
 * 调用方捕获后回退 IPC read-model-file 兜底。
 */
async function fetchModelFile(
  fileName: string,
  onChunk?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(APPMODEL_BASE + fileName);
  if (!response.ok) {
    throw new Error(`appmodel 协议响应 ${response.status}: ${fileName}`);
  }
  const total = Number(response.headers.get('content-length') || 0);
  const reader = response.body?.getReader();
  if (!reader || total <= 0) {
    // 无流式 body 或缺失 content-length：一次性读取（进度只能在完成时上报一次）
    const buffer = await response.arrayBuffer();
    onChunk?.(buffer.byteLength, buffer.byteLength || total);
    return buffer;
  }
  // content-length 已知：预分配单块 buffer 流式填充，避免「分块收集 + 合并」造成瞬时双份内存
  const buffer = new Uint8Array(total);
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (loaded + value.byteLength > total) {
      throw new Error(
        `模型数据超出 content-length (${loaded + value.byteLength}/${total}): ${fileName}`,
      );
    }
    buffer.set(value, loaded);
    loaded += value.byteLength;
    onChunk?.(loaded, total);
  }
  if (loaded !== total) {
    throw new Error(`模型数据不完整 (${loaded}/${total}): ${fileName}`);
  }
  return buffer.buffer as ArrayBuffer;
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
  const activeTaskIdRef = useRef<string | null>(null); // 当前活动任务的 taskId，用于取消

  // 读取模型文件（返回 ArrayBuffer）：
  // 1. 渲染层模块级缓存命中 → 直接复用（key 含变体目录，不会混用 tiny/small/medium）
  // 2. 否则优先 fetch('appmodel://models/' + fileName)，按 content-length 流式上报进度
  // 3. fetch 抛错或 !response.ok → 回退原 IPC read-model-file 兜底（主进程 handler 保持不变）
  // 无论哪种来源，读到的 buffer 均写入缓存，供下次进入 OCR 页复用
  const readModelFile = useCallback(
    async (
      fileName: string,
      onProgress?: (loaded: number, total: number) => void,
    ): Promise<ArrayBuffer> => {
      // 1. 缓存命中：立即按「已读满」上报进度，保持进度条机制一致
      const cached = modelFileCache.get(fileName);
      if (cached && cached.byteLength > 0) {
        onProgress?.(cached.byteLength, cached.byteLength);
        return cached;
      }

      // 2. 优先走 appmodel:// 协议（渲染层本地读取，绕过 IPC 结构化克隆）
      let buffer: ArrayBuffer | null = null;
      try {
        buffer = await fetchModelFile(fileName, onProgress);
      } catch (err) {
        console.warn(`[OCR] appmodel 协议读取失败，回退 IPC: ${fileName}`, err);
      }

      // 3. IPC 兜底：协议未注册、文件不在协议根目录、CSP 拦截等任何失败都不会白屏
      if (!buffer) {
        const ipc = (window as any).pp?.ipcRenderer;
        if (!ipc) {
          throw new Error('IPC 不可用，请确保 preload 脚本正确配置');
        }
        const ipcBuffer: ArrayBuffer = await ipc.invoke('read-model-file', fileName);
        onProgress?.(ipcBuffer.byteLength, ipcBuffer.byteLength);
        buffer = ipcBuffer;
      }

      // 写入缓存（缓存持有的是原始 buffer，postMessage 时只转移其副本，不会被 detach）
      modelFileCache.set(fileName, buffer);
      return buffer;
    },
    [],
  );

  // 取消函数：发送 cancel 消息到 worker，清理本地状态
  const cancel = useCallback(() => {
    const taskId = activeTaskIdRef.current;
    if (!taskId || !workerRef.current) return;
    console.log(`[usePPOCR] 取消任务 taskId=${taskId}`);
    workerRef.current.postMessage({ type: 'cancel', taskId } as WorkerRequest);
    activeTaskIdRef.current = null;
    // 恢复状态
    setStatus('ready');
    runResolveRef.current?.([]);
    runResolveRef.current = null;
    runRejectRef.current = null;
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
      case 'cancelled':
        // 任务被取消，清理状态
        activeTaskIdRef.current = null;
        setStatus('ready');
        setProgress({ percent: 100, step: '已取消' });
        runResolveRef.current?.([]);
        runResolveRef.current = null;
        runRejectRef.current = null;
        break;
      case 'done':
        activeTaskIdRef.current = null;
        setResults(msg.results);
        setStatus('ready');
        setProgress({ percent: 100, step: '完成' });
        runResolveRef.current?.(msg.results);
        runResolveRef.current = null;
        runRejectRef.current = null;
        break;
      case 'error':
        activeTaskIdRef.current = null;
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

  // 加载模型：读取文件（优先 appmodel:// fetch + 渲染层缓存，失败回退 IPC），
  // 按 content-length 上报区间进度，随后将 buffer 以 transferable 副本转移给 Worker 创建会话
  const loadModels = useCallback(
    async (targetVariant?: ModelVariant) => {
      const v = targetVariant ?? variantRef.current;
      const cfg = getVariantConfig(v);
      const generation = ++loadGenerationRef.current;
      // 将单文件的字节进度映射到整体百分比区间 [from, to]，step 文案保持与原逻辑一致
      const rangeProgress =
        (from: number, to: number, step: string) => (loaded: number, total: number) => {
          const ratio = total > 0 ? Math.min(loaded / total, 1) : 0;
          setProgress({ percent: Math.round(from + (to - from) * ratio), step });
        };
      try {
        setStatus('loading');
        setProgress({ percent: 0, step: `加载字符集 (${v})...` });

        const keysData = await readModelFile(
          cfg.dict,
          rangeProgress(0, 20, `加载字符集 (${v})...`),
        );
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
        const detBuffer = await readModelFile(
          cfg.det,
          rangeProgress(20, 60, `加载检测模型 (${v})...`),
        );

        if (generation !== loadGenerationRef.current) return;

        setProgress({ percent: 60, step: `加载识别模型 (${v})...` });
        const recBuffer = await readModelFile(
          cfg.rec,
          rangeProgress(60, 100, `加载识别模型 (${v})...`),
        );

        if (generation !== loadGenerationRef.current) return;

        // 将模型 buffer 以 transferable 方式交给 Worker，由 Worker 创建推理会话。
        // 缓存的是原始 buffer，这里转移 slice 副本，避免缓存条目被 detach 后失效；
        // slice 为渲染进程内 memcpy（约数十 ms），远低于原 IPC 结构化克隆的 100-300ms 序列化开销。
        const detTransfer = detBuffer.slice(0);
        const recTransfer = recBuffer.slice(0);
        workerRef.current?.postMessage(
          {
            type: 'init',
            detBuffer: detTransfer,
            recBuffer: recTransfer,
            charList,
          } as WorkerRequest,
          [detTransfer, recTransfer],
        );
        // 真正的会话创建在 Worker 内完成，'ready' 消息到达后状态置为 ready
      } catch (err) {
        if (generation !== loadGenerationRef.current) return;
        setStatus('error');
        setError((err as Error).message);
        console.error('[OCR] 加载失败:', err);
      }
    },
    [readModelFile],
  );

  // 运行 OCR：将图像发送给 Worker，推理在 Worker 线程执行
  const runOCR = useCallback(
    async (imgData: ImageData): Promise<RecognitionResult[]> => {
      if (status !== 'ready' || !workerRef.current) {
        throw new Error('模型未加载完成');
      }

      // 如果有正在运行的任务，先取消
      if (activeTaskIdRef.current) {
        cancel();
      }

      setStatus('running');
      setResults([]);
      setProgress({ percent: 0, step: '开始处理...' });

      const taskId = generateTaskId();
      activeTaskIdRef.current = taskId;
      const worker = workerRef.current;
      return new Promise<RecognitionResult[]>((resolve, reject) => {
        runResolveRef.current = resolve;
        runRejectRef.current = reject;
        // 以 transferable 方式发送：转移 ImageData 的 buffer，避免 4K 图（约 33MB）被结构化克隆。
        // 发送后渲染线程不再读取该 buffer（调用方 Canvas 持有独立像素数据，runOCR 内部也无后续读取），
        // 因此可以安全转移；postMessage 之后 imgData.data 将被置空不可用。
        worker.postMessage(
          {
            type: 'run',
            imageData: imgData,
            taskId,
            version: 0, // 版本号由 worker 内部管理，此处占位
          } as WorkerRequest,
          [imgData.data.buffer],
        );
      });
    },
    [status, cancel],
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

      // 终止旧 Worker（自动取消正在运行的任务）
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      activeTaskIdRef.current = null;

      // 创建新 Worker 并加载模型
      const worker = new Worker(new URL('../workers/ppocr.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
      worker.onmessage = handleWorkerMessage;
      worker.onerror = handleWorkerError;

      await loadModels(newVariant);
    },
    [loadModels, handleWorkerMessage, handleWorkerError],
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
      activeTaskIdRef.current = null;
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
    cancel,
    loadModels,
    variant,
    switchVariant,
    backend,
  };
}
