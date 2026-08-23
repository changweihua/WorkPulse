// src/renderer/src/hooks/useONNXModel.ts
import { useHuggingFaceModel, ModelOption } from './useHuggingFaceModel';

// ---------- 模型分组 ----------
export const MODEL_GROUPS = [
    { id: 'ultra-light', label: '超轻量级 (< 1B)' },
    { id: 'light', label: '轻量级 (1B ~ 4B)' },
] as const;
export type ModelGroupId = (typeof MODEL_GROUPS)[number]['id'];

// ---------- 可用模型列表 ----------
export const AVAILABLE_MODELS: (ModelOption & { groupId: ModelGroupId })[] = [
    // 超轻量级
    { id: 'onnx-community/Qwen3-0.6B-ONNX', label: 'Qwen3 0.6B (Thinking)', groupId: 'ultra-light' },
    { id: 'onnx-community/SmolLM2-135M-Instruct-ONNX-GQA', label: 'SmolLM2 135M GQA', groupId: 'ultra-light' },
    { id: 'onnx-community/LFM2.5-350M-ONNX', label: 'LFM2.5 350M', groupId: 'ultra-light' },
    { id: 'onnx-community/gemma-3-270m-it-ONNX', label: 'Gemma 3 270M', groupId: 'ultra-light' },
    // 轻量级
    { id: 'onnx-community/Qwen3-4B-ONNX', label: 'Qwen3 4B (旗舰)', groupId: 'light' },
    { id: 'onnx-community/Qwen3-1.7B-ONNX', label: 'Qwen3 1.7B (Thinking)', groupId: 'light' },
    { id: 'onnx-community/Phi-4-mini-instruct-ONNX-GQA', label: 'Phi-4 Mini 3.8B', groupId: 'light' },
    { id: 'onnx-community/gemma-3-1b-it-ONNX-GQA', label: 'Gemma 3 1B GQA', groupId: 'light' },
    { id: 'LiquidAI/LFM2.5-1.2B-Base-ONNX', label: 'LFM2.5 1.2B', groupId: 'light' },
    { id: 'onnx-community/Qwen2.5-1.5B-Instruct', label: 'Qwen2.5 1.5B', groupId: 'light' },
    { id: 'onnx-community/Llama-3.2-1B-Instruct-ONNX', label: 'Llama 3.2 1B', groupId: 'light' },
];

export const getModelsByGroup = (groupId: ModelGroupId) =>
    AVAILABLE_MODELS.filter((m) => m.groupId === groupId);

// ---------- Hook ----------
export function useONNXModel(initialModelId?: string) {
    return useHuggingFaceModel({
        task: 'text-generation',
        modelList: AVAILABLE_MODELS,
        defaultModelId: initialModelId || AVAILABLE_MODELS[0]?.id,
        pipelineOptions: {
            dtype: 'q4f16',
            device: 'webgpu',
            max_new_tokens: 256,
            temperature: 0.7,
            do_sample: true,
        },
    });
}