// src/renderer/src/hooks/useONNXModel.ts
import { useHuggingFaceModel, ModelOption } from './useHuggingFaceModel';

// ---------- 模型分组 ----------
export const MODEL_GROUPS = [
    { id: 'ultra-light', label: '超轻量级 (< 1B)' },
    { id: 'light', label: '轻量级 (1B ~ 4B)' },
    { id: 'medium', label: '中量级 (7B ~ 8B)' },
] as const;
export type ModelGroupId = (typeof MODEL_GROUPS)[number]['id'];

// ---------- 可用模型列表 ----------
export const AVAILABLE_MODELS: (ModelOption & { groupId: ModelGroupId })[] = [
    // 超轻量级
    { id: 'onnx-community/functiongemma-270m-it-ONNX', label: 'FunctionGemma 270M', groupId: 'ultra-light' },
    { id: 'onnx-community/Bitnet-SmolLM-135M-ONNX', label: 'Bitnet-SmolLM 135M', groupId: 'ultra-light' },
    { id: 'onnx-community/gpt2-mini-ONNX', label: 'GPT2-Mini', groupId: 'ultra-light' },
    { id: 'onnx-community/trlm-135m-ONNX', label: 'TRLM 135M', groupId: 'ultra-light' },
    { id: 'onnx-community/gemma-3-270m-it-ONNX', label: 'Gemma 3 270M', groupId: 'ultra-light' },
    // 轻量级
    { id: 'onnx-community/Llama-3.2-1B-Instruct-ONNX', label: 'Llama 3.2 1B', groupId: 'light' },
    { id: 'onnx-community/LFM2-1.2B-ONNX', label: 'LFM2 1.2B', groupId: 'light' },
    { id: 'onnxruntime/DeepSeek-R1-Distill-ONNX', label: 'DeepSeek-R1 1.5B', groupId: 'light' },
    { id: 'microsoft/Phi-3-mini-4k-instruct-onnx-web', label: 'Phi-3 Mini 4K', groupId: 'light' },
    // 中量级
    { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B-ONNX', label: 'DeepSeek-R1 7B', groupId: 'medium' },
    { id: 'onnx-community/DeepSeek-R1-Distill-Llama-8B-ONNX-DirectML-GenAI-INT4', label: 'DeepSeek-R1 8B', groupId: 'medium' },
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