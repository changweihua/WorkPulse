// src/renderer/src/workers/ppocrTypes.ts
// 共享的消息协议类型定义（仅类型，运行时无依赖）
import type { DetectionBox, RecognitionResult } from '../hooks/usePPOCR';

// ---------- 渲染进程 -> Worker ----------
export interface InitMessage {
    type: 'init';
    detBuffer: ArrayBuffer; // PP-OCRv6_det_tiny.onnx
    recBuffer: ArrayBuffer; // PP-OCRv6_rec_tiny.onnx
    charList: string[]; // 字符集（含占位符）
}

export interface RunMessage {
    type: 'run';
    imageData: ImageData; // 原始图像
}

export type WorkerRequest = InitMessage | RunMessage;

// ---------- Worker -> 渲染进程 ----------
export interface ProgressMessage {
    type: 'progress';
    stage: string;
    percent: number;
}

export interface BoxRecognizedMessage {
    type: 'box-recognized';
    index: number;
    text: string;
    confidence: number;
    charCount: number;
    box: DetectionBox;
}

export interface DoneMessage {
    type: 'done';
    results: RecognitionResult[];
}

export type ExecutionBackend = 'webgpu' | 'webgl' | 'wasm';

export interface ReadyMessage {
    type: 'ready';
    backend: ExecutionBackend;
}

export interface ErrorMessage {
    type: 'error';
    message: string;
}

export type WorkerResponse =
    | ProgressMessage
    | BoxRecognizedMessage
    | DoneMessage
    | ReadyMessage
    | ErrorMessage;
