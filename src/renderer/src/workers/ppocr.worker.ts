// src/renderer/src/workers/ppocr.worker.ts
// PP-OCR 推理 Worker：在独立线程中完成检测 + 并行识别，避免阻塞渲染线程。
import * as ort from 'onnxruntime-web';
import type { WorkerRequest, WorkerResponse } from './ppocrTypes';
import type { DetectionBox, RecognitionResult } from '../hooks/usePPOCR';

// ---------- 模型参数 ----------
const DET_MAX_SIDE = 960;
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];
const REC_MEAN = [0.5, 0.5, 0.5];
const REC_STD = [0.5, 0.5, 0.5];
const REC_HEIGHT = 48;
const REC_MAX_WIDTH = 2400;
// 并行识别的并发数（每个 slot 拥有独立的复用 buffer）
const CONCURRENCY = 6;

// ---------- 全局状态 ----------
let detSession: ort.InferenceSession | null = null;
let recSession: ort.InferenceSession | null = null;
let charList: string[] = [];
// 每个并发 slot 一个预分配的 CHW buffer，避免频繁 GC
const recBuffers: Float32Array[] = [];

// 使用类型安全的 postMessage（避免 DOM lib 的 postMessage 签名冲突）
const ctx = self as unknown as {
    postMessage: (msg: WorkerResponse) => void;
    onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

function post(msg: WorkerResponse): void {
    ctx.postMessage(msg);
}

function postProgress(stage: string, percent: number): void {
    post({ type: 'progress', stage, percent });
}

// ---------- 图像工具 ----------
// 将 RGBA ImageData 转为 CHW Float32，写入预分配的 out buffer（避免重复分配）
function rgbaToCHWInto(imageData: ImageData, mean: number[], std: number[], out: Float32Array): void {
    const { data, width, height } = imageData;
    const wh = width * height;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const si = (y * width + x) * 4;
            const di = y * width + x;
            for (let c = 0; c < 3; c++) {
                out[c * wh + di] = (data[si + c] / 255 - mean[c]) / std[c];
            }
        }
    }
}

// 使用 OffscreenCanvas 进行缩放（Worker 中无 DOM canvas）
function resizeImageDataOffscreen(src: ImageData, targetW: number, targetH: number): ImageData {
    const srcCanvas = new OffscreenCanvas(src.width, src.height);
    const sctx = srcCanvas.getContext('2d')!;
    sctx.putImageData(src, 0, 0);
    const dstCanvas = new OffscreenCanvas(targetW, targetH);
    const dctx = dstCanvas.getContext('2d')!;
    dctx.drawImage(srcCanvas, 0, 0, targetW, targetH);
    return dctx.getImageData(0, 0, targetW, targetH);
}

function cropImageData(imgData: ImageData, x: number, y: number, w: number, h: number): ImageData | null {
    x = Math.max(0, Math.floor(x));
    y = Math.max(0, Math.floor(y));
    w = Math.min(Math.floor(w), imgData.width - x);
    h = Math.min(Math.floor(h), imgData.height - y);
    if (w <= 0 || h <= 0) return null;
    const cropped = new ImageData(w, h);
    for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
            const si = ((y + row) * imgData.width + (x + col)) * 4;
            const di = (row * w + col) * 4;
            for (let c = 0; c < 4; c++) {
                cropped.data[di + c] = imgData.data[si + c];
            }
        }
    }
    return cropped;
}

// 连通域（flood-fill）提取文本框
function dbBoxes(
    probData: Float32Array | Uint8Array,
    probW: number,
    probH: number,
    scaleX: number,
    scaleY: number
): DetectionBox[] {
    const thresh = 0.2;
    const boxThresh = 0.4;
    const unclip = 1.4;
    const minSide = 3;

    const bin = new Uint8Array(probW * probH);
    for (let i = 0; i < probW * probH; i++) {
        bin[i] = probData[i] > thresh ? 1 : 0;
    }

    const label = new Int32Array(probW * probH).fill(0);
    let curLabel = 0;
    const stack = new Int32Array(probW * probH);
    const boxes: DetectionBox[] = [];

    for (let s = 0; s < probW * probH; s++) {
        if (bin[s] !== 1 || label[s] !== 0) continue;
        curLabel++;
        let sp = 0;
        stack[sp++] = s;
        label[s] = curLabel;

        let minX = probW,
            minY = probH,
            maxX = 0,
            maxY = 0;
        let sum = 0,
            cnt = 0;

        while (sp > 0) {
            const p = stack[--sp];
            const px = p % probW,
                py = (p / probW) | 0;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            sum += probData[p];
            cnt++;

            if (px > 0 && bin[p - 1] && !label[p - 1]) {
                label[p - 1] = curLabel;
                stack[sp++] = p - 1;
            }
            if (px < probW - 1 && bin[p + 1] && !label[p + 1]) {
                label[p + 1] = curLabel;
                stack[sp++] = p + 1;
            }
            if (py > 0 && bin[p - probW] && !label[p - probW]) {
                label[p - probW] = curLabel;
                stack[sp++] = p - probW;
            }
            if (py < probH - 1 && bin[p + probW] && !label[p + probW]) {
                label[p + probW] = curLabel;
                stack[sp++] = p + probW;
            }
        }

        const bw = maxX - minX + 1,
            bh = maxY - minY + 1;
        if (Math.min(bw, bh) < minSide) continue;
        if (sum / cnt < boxThresh) continue;

        const area = bw * bh,
            peri = 2 * (bw + bh),
            d = (area * unclip) / peri;
        const x0 = Math.max(0, minX - d) * scaleX;
        const y0 = Math.max(0, minY - d) * scaleY;
        const x1 = Math.min(probW, maxX + d) * scaleX;
        const y1 = Math.min(probH, maxY + d) * scaleY;
        boxes.push({ x0, y0, x1, y1, cy: ((minY + maxY) / 2) * scaleY });
    }

    boxes.sort((a, b) => (Math.abs(a.cy - b.cy) > 10 ? a.cy - b.cy : a.x0 - b.x0));
    return boxes;
}

// CTC 解码
function ctcDecode(
    data: Float32Array | Uint8Array,
    T: number,
    C: number,
    charList: string[]
): { text: string; confidence: number; charCount: number } {
    let text = '';
    const confidences: number[] = [];
    let prev = -1;

    for (let t = 0; t < T; t++) {
        let maxV = -1e9,
            idx = 0,
            base = t * C;
        for (let c = 0; c < C; c++) {
            const v = data[base + c];
            if (!isFinite(v)) continue;
            if (v > maxV) {
                maxV = v;
                idx = c;
            }
        }
        if (maxV === -1e9) continue;

        if (idx !== 0 && idx !== prev) {
            let sumE = 0;
            for (let c = 0; c < C; c++) {
                const diff = data[base + c] - maxV;
                if (diff < -50 || !isFinite(diff)) continue;
                sumE += Math.exp(diff);
            }
            const p = sumE > 0 ? 1 / sumE : 0.001;
            text += charList[idx] || ' ';
            confidences.push(Math.max(0.001, Math.min(p, 0.999)));
        }
        prev = idx;
    }

    const charCount = text.length;
    const confidence =
        confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
    return { text, confidence, charCount };
}

// ---------- 并发池 ----------
async function runWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T, slot: number) => Promise<void>
): Promise<void> {
    let idx = 0;
    const n = Math.min(limit, items.length);
    async function worker(slot: number): Promise<void> {
        while (idx < items.length) {
            const cur = idx++;
            await fn(items[cur], slot);
        }
    }
    await Promise.all(Array.from({ length: n }, (_, slot) => worker(slot)));
}

// ---------- 会话初始化 ----------
async function initSessions(detBuffer: ArrayBuffer, recBuffer: ArrayBuffer, list: string[]): Promise<void> {
    charList = list;
    let backend: 'webgl' | 'wasm' = 'webgl';
    try {
        detSession = await ort.InferenceSession.create(detBuffer, {
            executionProviders: ['webgl'],
        });
    } catch {
        console.warn('[OCR Worker] WebGL 不可用，降级到 WASM');
        backend = 'wasm';
        detSession = await ort.InferenceSession.create(detBuffer, {
            executionProviders: ['wasm'],
        });
    }
    recSession = await ort.InferenceSession.create(recBuffer, {
        executionProviders: [backend],
    });
    // 预分配每个并发 slot 的复用 buffer
    recBuffers.length = 0;
    for (let i = 0; i < CONCURRENCY; i++) {
        recBuffers.push(new Float32Array(3 * REC_HEIGHT * REC_MAX_WIDTH));
    }
    console.log('[OCR Worker] 模型加载完成，并发数:', CONCURRENCY);
}

// ---------- 主推理流程 ----------
async function runPipeline(imageData: ImageData): Promise<void> {
    if (!detSession || !recSession) {
        throw new Error('模型未初始化');
    }
    const origW = imageData.width;
    const origH = imageData.height;

    postProgress('步骤 1/3: 图像预处理...', 5);
    const r = Math.min(1, DET_MAX_SIDE / Math.max(origW, origH));
    const detW = Math.max(32, Math.round((origW * r) / 32) * 32);
    const detH = Math.max(32, Math.round((origH * r) / 32) * 32);

    const detResized = resizeImageDataOffscreen(imageData, detW, detH);
    const detChw = new Float32Array(3 * detW * detH);
    rgbaToCHWInto(detResized, DET_MEAN, DET_STD, detChw);
    const detTensor = new ort.Tensor('float32', detChw, [1, 3, detH, detW]);

    postProgress('步骤 1/3: 检测模型推理...', 15);
    const detResult = await detSession.run({ x: detTensor });
    const detOutput = detResult[detSession.outputNames[0]];
    const probData = detOutput.data as Float32Array;
    const probH = detOutput.dims[2];
    const probW = detOutput.dims[3];
    const scaleX = origW / probW;
    const scaleY = origH / probH;

    postProgress('步骤 1/3: 提取文本框...', 25);
    const boxes = dbBoxes(probData, probW, probH, scaleX, scaleY);
    console.log('[OCR Worker] 检测到', boxes.length, '个文本区域');

    if (boxes.length === 0) {
        postProgress('完成', 100);
        post({ type: 'done', results: [] });
        return;
    }

    const total = boxes.length;
    const results: (RecognitionResult | null)[] = new Array(total).fill(null);
    let completed = 0;

    await runWithConcurrency(
        boxes.map((b, i) => ({ b, i })),
        CONCURRENCY,
        async ({ b, i }, slot) => {
            const cw = b.x1 - b.x0;
            const ch = b.y1 - b.y0;
            if (cw < 2 || ch < 2) {
                completed++;
                postProgress('步骤 2/3: 识别中...', 30 + Math.round((completed / total) * 60));
                return;
            }

            const cropped = cropImageData(imageData, b.x0, b.y0, cw, ch);
            if (!cropped) {
                completed++;
                postProgress('步骤 2/3: 识别中...', 30 + Math.round((completed / total) * 60));
                return;
            }

            const recW = Math.max(8, Math.round((REC_HEIGHT * cw) / ch));
            const finalRecW = Math.min(recW, REC_MAX_WIDTH);

            const recResized = resizeImageDataOffscreen(cropped, finalRecW, REC_HEIGHT);
            const buf = recBuffers[slot];
            const need = 3 * REC_HEIGHT * finalRecW;
            rgbaToCHWInto(recResized, REC_MEAN, REC_STD, buf.subarray(0, need));
            const recTensor = new ort.Tensor(
                'float32',
                buf.subarray(0, need),
                [1, 3, REC_HEIGHT, finalRecW]
            );

            const recResult = await recSession!.run({ x: recTensor });
            const recOutput = recResult[recSession!.outputNames[0]];
            const T = recOutput.dims[1];
            const C = recOutput.dims[2];
            const decoded = ctcDecode(recOutput.data as Float32Array, T, C, charList);
            const text = decoded.text.trim();

            completed++;
            postProgress('步骤 2/3: 识别中...', 30 + Math.round((completed / total) * 60));

            if (text) {
                const res: RecognitionResult = {
                    box: b,
                    text,
                    confidence: decoded.confidence,
                    charCount: decoded.charCount,
                };
                results[i] = res;
                post({
                    type: 'box-recognized',
                    index: i,
                    text,
                    confidence: decoded.confidence,
                    charCount: decoded.charCount,
                    box: b,
                });
            }
        }
    );

    const finalResults = results.filter((r): r is RecognitionResult => r !== null);
    postProgress('完成', 100);
    post({ type: 'done', results: finalResults });
}

// ---------- 消息入口 ----------
ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const msg = e.data;
    try {
        if (msg.type === 'init') {
            await initSessions(msg.detBuffer, msg.recBuffer, msg.charList);
            post({ type: 'ready' });
        } else if (msg.type === 'run') {
            await runPipeline(msg.imageData);
        }
    } catch (err) {
        post({ type: 'error', message: (err as Error).message });
    }
};
