// src/renderer/src/workers/hf-pipeline.worker.ts
// WebWorker 承载 HuggingFace transformers.js 推理，避免阻塞渲染线程。
// 渲染进程（useHuggingFaceModel）通过 postMessage 下发「加载 / 生成 / 识别」指令，
// 本 worker 回传「进度 / 流式 token / 结果」消息。
import { pipeline, env, TextStreamer } from '@huggingface/transformers';

// ---------- 环境配置（与渲染进程保持一致） ----------
// 禁止尝试本地模型路径，避免先请求 localhost 失败浪费时间
env.allowLocalModels = false;

// 固定使用国内镜像（huggingface.co 部分网络不可达）
const REMOTE_HOST = 'https://hf-mirror.com/';
// 本地文件夹缓存协议：主进程下载到 userData/models 后经此回放
const LOCAL_HOST = 'appmodel://models/';

// ---------- 模块级 pipeline 缓存（worker 内跨调用复用） ----------
// 使用 LRU 策略，最多保留 2 个模型，避免切换模型时旧模型常驻导致内存泄漏
const MAX_CACHED_MODELS = 2;
const pipelineCache = new Map<string, any>();
const cacheKey = (task: string, modelId: string, dtype: string, device: string) =>
    `${task}|${modelId}|${dtype}|${device}`;

// 取缓存并把命中项移到末尾（最近使用）
function getFromCache(key: string): any | undefined {
    if (!pipelineCache.has(key)) return undefined;
    const value = pipelineCache.get(key)!;
    pipelineCache.delete(key);
    pipelineCache.set(key, value);
    return value;
}

// 写入缓存，容量满时淘汰最旧（Map 首部）的模型并 dispose 释放显存/内存
function putInCache(key: string, value: any): void {
    if (pipelineCache.has(key)) pipelineCache.delete(key);
    if (pipelineCache.size >= MAX_CACHED_MODELS) {
        const oldest = pipelineCache.keys().next().value;
        if (oldest) {
            const oldPipeline = pipelineCache.get(oldest);
            if (oldPipeline && typeof oldPipeline.dispose === 'function') {
                oldPipeline.dispose();
            }
            pipelineCache.delete(oldest);
            console.log(`[HF Worker] Evicted cached model: ${oldest}`);
        }
    }
    pipelineCache.set(key, value);
}

// ---------- Worker 作用域类型兼容（避免引入 webworker lib 与 DOM lib 冲突） ----------
const ctx = self as unknown as Worker;

// ---------- 消息类型 ----------
interface LoadMsg {
    type: 'load';
    rid: number;
    task: string;
    modelId: string;
    dtype: string;
    device: string;
    host: string; // REMOTE_HOST 或 LOCAL_HOST
}
interface GenerateMsg {
    type: 'generate';
    rid: number;
    task: string;
    modelId: string;
    dtype: string;
    device: string;
    prompt: string;
    options: Record<string, any>;
}
interface RecognizeMsg {
    type: 'recognize';
    rid: number;
    task: string;
    modelId: string;
    dtype: string;
    device: string;
    imageData: string; // data URL 或远程 URL（可序列化）
    options: Record<string, any>;
}
type InboundMsg = LoadMsg | GenerateMsg | RecognizeMsg;

// ---------- 加载 pipeline ----------
async function handleLoad(msg: LoadMsg) {
    const { rid, task, modelId, dtype, device, host } = msg;
    const key = cacheKey(task, modelId, dtype, device);

    // 缓存命中：直接复用已加载的模型，不重复拉取
    if (getFromCache(key)) {
        ctx.postMessage({ type: 'loaded', rid });
        return;
    }

    env.remoteHost = host || REMOTE_HOST;

    try {
        const pipe = await pipeline(task as any, modelId, {
            dtype: dtype as any,
            device: device as any,
            progress_callback: (info: any) => {
                if (info.status === 'progress_total') {
                    ctx.postMessage({
                        type: 'progress',
                        rid,
                        status: 'progress_total',
                        progress: Math.round(info.progress || 0),
                    });
                } else if (info.status === 'progress' && info.file) {
                    ctx.postMessage({
                        type: 'progress',
                        rid,
                        status: 'progress',
                        file: info.file,
                        progress: Math.round(info.progress || 0),
                    });
                }
            },
        });
        putInCache(key, pipe);
        ctx.postMessage({ type: 'loaded', rid });
    } catch (err) {
        ctx.postMessage({ type: 'error', rid, message: (err as Error)?.message || String(err) });
    }
}

// ---------- 文本生成（流式 token） ----------
async function handleGenerate(msg: GenerateMsg) {
    const { rid, task, modelId, dtype, device, prompt, options } = msg;
    const pipe = getFromCache(cacheKey(task, modelId, dtype, device));
    if (!pipe) {
        ctx.postMessage({ type: 'error', rid, message: '模型未加载' });
        return;
    }

    let fullText = '';
    const streamer = new TextStreamer(pipe.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => {
            fullText += text;
            ctx.postMessage({ type: 'token', rid, text });
        },
    });

    try {
        await pipe(prompt, {
            ...options,
            streamer,
        });
        ctx.postMessage({ type: 'done', rid, fullText });
    } catch (err) {
        ctx.postMessage({ type: 'error', rid, message: (err as Error)?.message || String(err) });
    }
}

// ---------- 图像识别（OCR，支持流式 token） ----------
async function handleRecognize(msg: RecognizeMsg) {
    const { rid, task, modelId, dtype, device, imageData, options } = msg;
    const pipe = getFromCache(cacheKey(task, modelId, dtype, device));
    if (!pipe) {
        ctx.postMessage({ type: 'error', rid, message: '模型未加载' });
        return;
    }

    try {
        let fullText = '';
        let usedStreamer = false;
        const generateOptions: Record<string, any> = { ...options };

        // 若模型带 tokenizer（如 GLM-OCR 等自回归 OCR），用 TextStreamer 流式回传
        if (pipe.tokenizer) {
            try {
                const streamer = new TextStreamer(pipe.tokenizer, {
                    skip_special_tokens: true,
                    callback_function: (text: string) => {
                        fullText += text;
                        ctx.postMessage({ type: 'token', rid, text });
                    },
                });
                generateOptions.streamer = streamer;
                usedStreamer = true;
            } catch {
                usedStreamer = false;
            }
        }

        const output = await pipe(imageData, generateOptions);
        if (!usedStreamer || !fullText) {
            fullText = output?.[0]?.generated_text ?? '';
        }
        ctx.postMessage({ type: 'result', rid, data: fullText });
    } catch (err) {
        ctx.postMessage({ type: 'error', rid, message: (err as Error)?.message || String(err) });
    }
}

// ---------- 消息入口 ----------
ctx.onmessage = (e: MessageEvent) => {
    const msg = e.data as InboundMsg;
    switch (msg.type) {
        case 'load':
            void handleLoad(msg);
            break;
        case 'generate':
            void handleGenerate(msg);
            break;
        case 'recognize':
            void handleRecognize(msg);
            break;
    }
};

export {};
