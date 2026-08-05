// src/renderer/src/hooks/usePPOCR.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import * as ort from 'onnxruntime-web';

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

// ---------- 模型参数 ----------
const DET_MAX_SIDE = 960;
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];
const REC_MEAN = [0.5, 0.5, 0.5];
const REC_STD = [0.5, 0.5, 0.5];
const REC_HEIGHT = 48;

// ---------- 工具函数 ----------
function rgbaToCHW(imageData: ImageData, mean: number[], std: number[]): Float32Array {
    const { data, width, height } = imageData;
    const chw = new Float32Array(3 * height * width);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const si = (y * width + x) * 4;
            const di = y * width + x;
            for (let c = 0; c < 3; c++) {
                chw[c * height * width + di] = (data[si + c] / 255 - mean[c]) / std[c];
            }
        }
    }
    return chw;
}

function resizeImageData(source: HTMLImageElement | HTMLCanvasElement, targetW: number, targetH: number): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0, targetW, targetH);
    return ctx.getImageData(0, 0, targetW, targetH);
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

            const nb = [p - 1, p + 1, p - probW, p + probW];
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
            d = area * unclip / peri;
        const x0 = Math.max(0, minX - d) * scaleX;
        const y0 = Math.max(0, minY - d) * scaleY;
        const x1 = Math.min(probW, maxX + d) * scaleX;
        const y1 = Math.min(probH, maxY + d) * scaleY;
        boxes.push({ x0, y0, x1, y1, cy: (minY + maxY) / 2 * scaleY });
    }

    boxes.sort((a, b) =>
        Math.abs(a.cy - b.cy) > 10 ? a.cy - b.cy : a.x0 - b.x0
    );
    return boxes;
}

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
        confidences.length > 0
            ? confidences.reduce((a, b) => a + b, 0) / confidences.length
            : 0;
    return { text, confidence, charCount };
}

// ---------- Hook ----------
export function usePPOCR() {
    const [status, setStatus] = useState<OCRStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ProgressInfo>({ percent: 0, step: '等待开始' });
    const [results, setResults] = useState<RecognitionResult[]>([]);
    const [imageData, setImageData] = useState<ImageData | null>(null);

    const detSessionRef = useRef<ort.InferenceSession | null>(null);
    const recSessionRef = useRef<ort.InferenceSession | null>(null);
    const charListRef = useRef<string[]>([]);

    // 通过 IPC 读取文件
    const readModelFile = useCallback(async (fileName: string): Promise<ArrayBuffer> => {
        const ipc = (window as any).pp?.ipcRenderer;
        if (!ipc) {
            throw new Error('IPC 不可用，请确保 preload 脚本正确配置');
        }
        return await ipc.invoke('read-model-file', fileName);
    }, []);

    const loadModels = useCallback(async () => {
        try {
            setStatus('loading');
            setProgress({ percent: 0, step: '加载字符集...' });

            // 1. 加载字符集
            const keysData = await readModelFile('ppocr_keys_v6_tiny.json');
            const jsonStr = new TextDecoder().decode(new Uint8Array(keysData));
            const dict = JSON.parse(jsonStr);
            charListRef.current = ['', ...dict, ' '];
            console.log('[OCR] 字符集大小:', charListRef.current.length);

            setProgress({ percent: 20, step: '加载检测模型...' });
            // 2. 加载检测模型
            const detBuffer = await readModelFile('PP-OCRv6_det_tiny.onnx');
            let backend: 'webgl' | 'wasm' = 'webgl';
            try {
                detSessionRef.current = await ort.InferenceSession.create(detBuffer, {
                    executionProviders: ['webgl'],
                });
            } catch {
                console.warn('[OCR] WebGL 不可用，降级到 WASM');
                backend = 'wasm';
                detSessionRef.current = await ort.InferenceSession.create(detBuffer, {
                    executionProviders: ['wasm'],
                });
            }

            setProgress({ percent: 60, step: '加载识别模型...' });
            // 3. 加载识别模型
            const recBuffer = await readModelFile('PP-OCRv6_rec_tiny.onnx');
            recSessionRef.current = await ort.InferenceSession.create(recBuffer, {
                executionProviders: [backend],
            });

            setProgress({ percent: 100, step: '模型加载完成' });
            setStatus('ready');
            setError(null);
        } catch (err) {
            setStatus('error');
            setError((err as Error).message);
            console.error('[OCR] 加载失败:', err);
        }
    }, [readModelFile]);

    // 运行 OCR
    const runOCR = useCallback(
        async (imgData: ImageData): Promise<RecognitionResult[]> => {
            if (status !== 'ready' || !detSessionRef.current || !recSessionRef.current) {
                throw new Error('模型未加载完成');
            }

            const detSession = detSessionRef.current;
            const recSession = recSessionRef.current;
            const charList = charListRef.current;

            setStatus('running');
            setResults([]);
            setProgress({ percent: 0, step: '开始处理...' });

            try {
                const origW = imgData.width,
                    origH = imgData.height;

                setProgress({ percent: 5, step: '步骤 1/3: 图像预处理...' });
                const r = Math.min(1, DET_MAX_SIDE / Math.max(origW, origH));
                let detW = Math.max(32, Math.round(origW * r / 32) * 32);
                let detH = Math.max(32, Math.round(origH * r / 32) * 32);

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = origW;
                tempCanvas.height = origH;
                const tempCtx = tempCanvas.getContext('2d')!;
                tempCtx.putImageData(imgData, 0, 0);

                const detResized = resizeImageData(tempCanvas, detW, detH);
                const chw = rgbaToCHW(detResized, DET_MEAN, DET_STD);
                const detTensor = new ort.Tensor('float32', chw, [1, 3, detH, detW]);

                setProgress({ percent: 15, step: '步骤 1/3: 检测模型推理...' });
                const detResult = await detSession.run({ x: detTensor });
                const detOutput = detResult[detSession.outputNames[0]];
                const probData = detOutput.data as Float32Array;
                const probH = detOutput.dims[2],
                    probW = detOutput.dims[3];
                const scaleX = origW / probW,
                    scaleY = origH / probH;

                setProgress({ percent: 25, step: '步骤 1/3: 提取文本框...' });
                const boxes = dbBoxes(probData, probW, probH, scaleX, scaleY);
                console.log('[OCR] 检测到', boxes.length, '个文本区域');

                if (boxes.length === 0) {
                    setStatus('ready');
                    setProgress({ percent: 100, step: '未检测到文本' });
                    return [];
                }

                const results: RecognitionResult[] = [];
                const totalBoxes = boxes.length;

                for (let i = 0; i < totalBoxes; i++) {
                    const pct = 30 + Math.round((i / totalBoxes) * 60);
                    setProgress({
                        percent: pct,
                        step: `步骤 2/3: 识别第 ${i + 1}/${totalBoxes} 个区域...`,
                    });

                    const b = boxes[i];
                    const cw = b.x1 - b.x0,
                        ch = b.y1 - b.y0;
                    if (cw < 2 || ch < 2) continue;

                    const cropped = cropImageData(imgData, b.x0, b.y0, cw, ch);
                    if (!cropped) continue;

                    const recW = Math.max(8, Math.round(REC_HEIGHT * cw / ch));
                    const finalRecW = Math.min(recW, 2400);

                    const cropCanvas = document.createElement('canvas');
                    cropCanvas.width = cropped.width;
                    cropCanvas.height = cropped.height;
                    const cropCtx = cropCanvas.getContext('2d')!;
                    cropCtx.putImageData(cropped, 0, 0);

                    const recResized = resizeImageData(cropCanvas, finalRecW, REC_HEIGHT);
                    const recInput = rgbaToCHW(recResized, REC_MEAN, REC_STD);
                    const recTensor = new ort.Tensor('float32', recInput, [1, 3, REC_HEIGHT, finalRecW]);

                    const recResult = await recSession.run({ x: recTensor });
                    const recOutput = recResult[recSession.outputNames[0]];
                    const T = recOutput.dims[1],
                        C = recOutput.dims[2];

                    const decoded = ctcDecode(recOutput.data as Float32Array, T, C, charList);
                    const text = decoded.text.trim();
                    if (text) {
                        results.push({
                            box: b,
                            text,
                            confidence: decoded.confidence,
                            charCount: decoded.charCount,
                        });
                    }
                }

                setProgress({ percent: 100, step: '完成' });
                setStatus('ready');
                setResults(results);
                return results;
            } catch (err) {
                setStatus('error');
                setError((err as Error).message);
                throw err;
            }
        },
        [status]
    );

    useEffect(() => {
        loadModels();
        return () => {
            detSessionRef.current = null;
            recSessionRef.current = null;
        };
    }, [loadModels]);

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