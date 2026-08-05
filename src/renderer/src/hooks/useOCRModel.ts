// src/renderer/src/hooks/useOCRModel.ts
import { useHuggingFaceModel, ModelOption } from './useHuggingFaceModel';

// ---------- OCR 模型分组 ----------
export const OCR_MODEL_GROUPS = [
    { id: 'printed', label: '印刷体识别' },
    { id: 'scene', label: '场景/手写体识别' },
] as const;
export type OCRModelGroupId = (typeof OCR_MODEL_GROUPS)[number]['id'];

// ---------- 可用 OCR 模型 ----------
export const AVAILABLE_OCR_MODELS: (ModelOption & { groupId: OCRModelGroupId })[] = [
    // TrOCR 印刷体
    { id: 'Xenova/trocr-small-printed', label: 'TrOCR 印刷体 (Small)', groupId: 'printed' },
    { id: 'Xenova/trocr-base-printed', label: 'TrOCR 印刷体 (Base)', groupId: 'printed' },
    // TrOCR 手写体
    { id: 'Xenova/trocr-small-handwritten', label: 'TrOCR 手写体 (Small)', groupId: 'scene' },
    { id: 'Xenova/trocr-base-handwritten', label: 'TrOCR 手写体 (Base)', groupId: 'scene' },
    // MGP-STR 场景文本
    { id: 'onnx-community/mgp-str-base', label: 'MGP-STR 场景文本', groupId: 'scene' },
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