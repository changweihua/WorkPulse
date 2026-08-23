// src/renderer/src/hooks/useOCRModel.ts
import { useHuggingFaceModel, ModelOption } from './useHuggingFaceModel';

// ---------- OCR 模型分组 ----------
export const OCR_MODEL_GROUPS = [
    { id: 'document', label: '文档级 OCR (SOTA)' },
    { id: 'line', label: '单行/场景文字' },
] as const;
export type OCRModelGroupId = (typeof OCR_MODEL_GROUPS)[number]['id'];

// ---------- 可用 OCR 模型 ----------
export const AVAILABLE_OCR_MODELS: (ModelOption & { groupId: OCRModelGroupId })[] = [
    // 文档级 OCR
    { id: 'onnx-community/GLM-OCR-ONNX', label: 'GLM-OCR (文档/表格/公式)', groupId: 'document' },
    { id: 'onnx-community/LightOnOCR-2-1B-ONNX', label: 'LightOnOCR-2 (11语言)', groupId: 'document' },
    // 单行/场景文字
    { id: 'Xenova/trocr-small-printed', label: 'TrOCR 印刷体 (Small)', groupId: 'line' },
    { id: 'Xenova/trocr-base-printed', label: 'TrOCR 印刷体 (Base)', groupId: 'line' },
    { id: 'Xenova/trocr-small-handwritten', label: 'TrOCR 手写体 (Small)', groupId: 'line' },
    { id: 'Xenova/trocr-base-handwritten', label: 'TrOCR 手写体 (Base)', groupId: 'line' },
    { id: 'onnx-community/mgp-str-base', label: 'MGP-STR 场景文本', groupId: 'line' },
];

export const getOCRModelsByGroup = (groupId: OCRModelGroupId) =>
    AVAILABLE_OCR_MODELS.filter((m) => m.groupId === groupId);

// ---------- Hook ----------
export function useOCRModel(initialModelId?: string) {
    return useHuggingFaceModel({
        task: 'image-to-text',
        modelList: AVAILABLE_OCR_MODELS,
        defaultModelId: initialModelId || AVAILABLE_OCR_MODELS[0]?.id,
        pipelineOptions: {
            dtype: 'q4f16',
            device: 'webgpu',
            max_new_tokens: 128,
        },
    });
}