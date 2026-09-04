/**
 * AIChatPanel — Slide-in drawer panel for AI conversation.
 * Renders as a right-side overlay (z-40) that slides in over the current page content.
 * Uses useAIPanelStore for open/close state, and persists chat data with `chatPanel_*` keys.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
    Bot,
    User,
    X,
    Plus,
    Trash2,
    MessageSquare,
    Send,
    Loader2,
    Settings,
    ChevronLeft,
    RotateCw,
    Minus,
} from 'lucide-react';
import { Message } from '@fauzitech/ai-ui';
import { useAIPanelStore } from '../stores/aiPanelStore';

// ─── Types ────────────────────────────────────────────────────────────────
interface ModelConfig {
    id: string;
    name: string;
    baseURL: string;
    model: string;
    token: string;
    headers: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    reasoning?: string;
    tokenUsage?: { input: number; output: number; total: number };
    timestamp: number;
}

interface Conversation {
    id: string;
    title: string;
    modelId: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

interface ProviderPreset {
    id: string;
    name: string;
    baseURL: string;
    models: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────
const PROVIDER_PRESETS: ProviderPreset[] = [
    { id: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { id: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
    { id: 'anthropic', name: 'Anthropic', baseURL: 'https://api.anthropic.com/v1', models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'] },
    { id: 'zhipu', name: '智谱AI', baseURL: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'] },
    { id: 'moonshot', name: 'Moonshot', baseURL: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'] },
    { id: 'qwen', name: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
    { id: 'gitee', name: 'Gitee AI', baseURL: 'https://ai.gitee.com/v1', models: ['Qwen/Qwen2.5-32B-Instruct', 'deepseek-ai/DeepSeek-V3'] },
    { id: 'ollama', name: 'Ollama', baseURL: 'http://localhost:11434/v1', models: ['qwen2.5:latest', 'llama3.1:latest'] },
    { id: 'custom', name: '自定义', baseURL: '', models: [] },
];

const DEFAULT_CONFIGS: ModelConfig[] = [
    {
        id: 'deepseek-default',
        name: 'DeepSeek Chat',
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        token: '',
        headers: '',
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.9,
    },
    {
        id: 'gitee-default',
        name: 'Gitee AI Qwen',
        baseURL: 'https://ai.gitee.com/v1',
        model: 'Qwen/Qwen2.5-32B-Instruct',
        token: '',
        headers: '',
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.9,
    },
    {
        id: 'zhipu-default',
        name: '智谱 GLM-4',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4-plus',
        token: '',
        headers: '',
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.9,
    },
];

function estimateTokens(text: string): number {
    if (!text) return 0;
    let count = 0;
    for (const ch of text) {
        if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) count += 1.5;
        else if (/[\u0800-\uFFFF]/.test(ch)) count += 2.5;
        else count += 0.25;
    }
    return Math.ceil(count);
}

// ─── Sub-components ───────────────────────────────────────────────────────

/** Animated typing dots */
function LoadingDots() {
    return (
        <div className="flex gap-1 items-center py-1">
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
            ))}
        </div>
    );
}

/** Number input field with increment/decrement buttons */
function NumberField({
    label,
    value,
    onChange,
    min,
    max,
    step,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                {label}
            </label>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => onChange(Math.max(min ?? 0, value - (step ?? 0.1)))}
                    className="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition text-xs"
                >
                    <Minus size={12} />
                </button>
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    min={min}
                    max={max}
                    step={step}
                    className="flex-1 text-center px-2 py-1.5 text-xs font-mono border border-zinc-200 dark:border-zinc-700 rounded-md bg-white/50 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-400"
                />
                <button
                    type="button"
                    onClick={() => onChange(Math.min(max ?? 100, value + (step ?? 0.1)))}
                    className="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition text-xs"
                >
                    <RotateCw size={12} />
                </button>
            </div>
        </div>
    );
}

/** Model config editor (shown as overlay within the panel) */
function ConfigEditor({
    configs,
    currentConfigId,
    onSave,
    onDelete,
    onClose,
}: {
    configs: ModelConfig[];
    currentConfigId: string;
    onSave: (config: ModelConfig, isNew: boolean) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}) {
    const [selectedId, setSelectedId] = useState(currentConfigId);
    const [form, setForm] = useState<ModelConfig>(() => {
        const found = configs.find((c) => c.id === currentConfigId);
        return found ? { ...found } : { ...DEFAULT_CONFIGS[0], id: crypto.randomUUID() };
    });
    const [isNew, setIsNew] = useState(false);

    const handlePreset = (preset: ProviderPreset) => {
        if (preset.id === 'custom') {
            setForm({
                id: crypto.randomUUID(),
                name: '自定义',
                baseURL: '',
                model: '',
                token: '',
                headers: '',
                temperature: 0.7,
                max_tokens: 4096,
                top_p: 0.9,
            });
            setIsNew(true);
            return;
        }
        setForm({
            id: crypto.randomUUID(),
            name: preset.name + ' ' + (preset.models[0] || ''),
            baseURL: preset.baseURL,
            model: preset.models[0] || '',
            token: '',
            headers: '',
            temperature: 0.7,
            max_tokens: 4096,
            top_p: 0.9,
        });
        setIsNew(true);
    };

    const handleSelectExisting = (id: string) => {
        const found = configs.find((c) => c.id === id);
        if (found) {
            setForm({ ...found });
            setSelectedId(id);
            setIsNew(false);
        }
    };

    const handleSave = () => {
        onSave(form, isNew);
        onClose();
    };

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="absolute inset-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/40 dark:border-zinc-700/40 shrink-0">
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition">
                    <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">模型配置</span>
                <div className="w-8" />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                {/* Existing configs */}
                {configs.length > 0 && (
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            已有配置
                        </label>
                        {configs.map((c) => (
                            <div
                                key={c.id}
                                onClick={() => handleSelectExisting(c.id)}
                                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition border ${
                                    form.id === c.id && !isNew
                                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-zinc-800 dark:text-zinc-200'
                                        : 'border-zinc-200/40 dark:border-zinc-700/40 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400'
                                }`}
                            >
                                <div className="min-w-0">
                                    <div className="font-medium truncate">{c.name}</div>
                                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{c.model}</div>
                                </div>
                                {configs.length > 1 && form.id === c.id && !isNew && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Provider presets */}
                <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        供应商预设
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                        {PROVIDER_PRESETS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => handlePreset(p)}
                                className="px-2 py-1.5 rounded-lg text-[11px] font-medium border border-zinc-200/40 dark:border-zinc-700/40 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400 transition"
                            >
                                {p.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Form fields */}
                <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">名称</label>
                        <input
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white/50 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-400"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Base URL</label>
                        <input
                            value={form.baseURL}
                            onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
                            placeholder="https://api.example.com/v1"
                            className="px-3 py-1.5 text-xs font-mono border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white/50 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-400 placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">模型</label>
                        <input
                            value={form.model}
                            onChange={(e) => setForm({ ...form, model: e.target.value })}
                            placeholder="model-name"
                            className="px-3 py-1.5 text-xs font-mono border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white/50 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-400 placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">API Key</label>
                        <input
                            type="password"
                            value={form.token}
                            onChange={(e) => setForm({ ...form, token: e.target.value })}
                            placeholder="sk-..."
                            className="px-3 py-1.5 text-xs font-mono border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white/50 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-400 placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">自定义 Headers (JSON)</label>
                        <textarea
                            value={form.headers}
                            onChange={(e) => setForm({ ...form, headers: e.target.value })}
                            placeholder='{"X-Custom": "value"}'
                            rows={2}
                            className="px-3 py-1.5 text-xs font-mono border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white/50 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-400 resize-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <NumberField label="Temperature" value={form.temperature} onChange={(v) => setForm({ ...form, temperature: v })} min={0} max={2} step={0.1} />
                        <NumberField label="Max Tokens" value={form.max_tokens} onChange={(v) => setForm({ ...form, max_tokens: v })} min={1} max={128000} step={256} />
                        <NumberField label="Top P" value={form.top_p} onChange={(v) => setForm({ ...form, top_p: v })} min={0} max={1} step={0.05} />
                    </div>
                </div>
            </div>

            {/* Save button */}
            <div className="shrink-0 px-4 py-3 border-t border-zinc-200/40 dark:border-zinc-700/40">
                <button
                    onClick={handleSave}
                    disabled={!form.name || !form.baseURL || !form.model}
                    className="w-full py-2 rounded-xl text-sm font-medium bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white transition shadow-sm"
                >
                    保存配置
                </button>
            </div>
        </motion.div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function AIChatPanel() {
    const { open, closePanel } = useAIPanelStore();

    // ── State ──
    const [configs, setConfigs] = useState<ModelConfig[]>(() => {
        try {
            const saved = localStorage.getItem('chatPanelModelConfigs');
            return saved ? JSON.parse(saved) : DEFAULT_CONFIGS;
        } catch {
            return DEFAULT_CONFIGS;
        }
    });
    const [currentConfigId, setCurrentConfigId] = useState<string>(() => {
        try {
            return localStorage.getItem('chatPanelCurrentConfigId') || configs[0]?.id || '';
        } catch {
            return configs[0]?.id || '';
        }
    });
    const [conversations, setConversations] = useState<Conversation[]>(() => {
        try {
            const saved = localStorage.getItem('chatPanelConversations');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [currentConvId, setCurrentConvId] = useState<string>(() => {
        try {
            return localStorage.getItem('chatPanelCurrentConvId') || '';
        } catch {
            return '';
        }
    });
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [showConfigEditor, setShowConfigEditor] = useState(false);
    const [showConvList, setShowConvList] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Derived
    const currentConfig = configs.find((c) => c.id === currentConfigId) || configs[0];
    const currentConv = conversations.find((c) => c.id === currentConvId);
    const messages = currentConv?.messages || [];

    // ── Persistence — tokens 存储到 main process 加密存储，localStorage 只存脱敏版本 ──
    useEffect(() => {
        // Save tokens to encrypted storage via IPC
        configs.forEach((config) => {
            if (config.token && window.ai?.saveLLMToken) {
                window.ai.saveLLMToken(config.id, config.token);
            }
        });
        // Strip tokens before saving to localStorage (security)
        const stripped = configs.map(({ token: _, ...rest }) => ({ ...rest, token: '' }));
        localStorage.setItem('chatPanelModelConfigs', JSON.stringify(stripped));
    }, [configs]);
    useEffect(() => { localStorage.setItem('chatPanelCurrentConfigId', currentConfigId); }, [currentConfigId]);
    useEffect(() => { localStorage.setItem('chatPanelConversations', JSON.stringify(conversations)); }, [conversations]);
    useEffect(() => { localStorage.setItem('chatPanelCurrentConvId', currentConvId); }, [currentConvId]);

    // ── Auto-scroll ──
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Close on Escape ──
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closePanel();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, closePanel]);

    // ── IPC streaming listeners ──
    useEffect(() => {
        if (!window.ai || !open) return;

        const onReasoning = (_: any, reasoning: string) => {
            setConversations((prev) =>
                prev.map((conv) => {
                    if (conv.id !== currentConvId) return conv;
                    const last = conv.messages[conv.messages.length - 1];
                    if (last?.role === 'assistant' && last.id === 'streaming') {
                        return {
                            ...conv,
                            updatedAt: Date.now(),
                            messages: [
                                ...conv.messages.slice(0, -1),
                                { ...last, reasoning: (last.reasoning || '') + reasoning },
                            ],
                        };
                    }
                    return conv;
                })
            );
        };

        const onChunk = (_: any, chunk: string) => {
            setConversations((prev) =>
                prev.map((conv) => {
                    if (conv.id !== currentConvId) return conv;
                    const last = conv.messages[conv.messages.length - 1];
                    if (last?.role === 'assistant' && last.id === 'streaming') {
                        return {
                            ...conv,
                            updatedAt: Date.now(),
                            messages: [
                                ...conv.messages.slice(0, -1),
                                { ...last, content: last.content + chunk },
                            ],
                        };
                    }
                    return conv;
                })
            );
        };

        const onDone = () => {
            setIsStreaming(false);
            setConversations((prev) =>
                prev.map((conv) => {
                    if (conv.id !== currentConvId) return conv;
                    const last = conv.messages[conv.messages.length - 1];
                    if (last?.id === 'streaming') {
                        const outputTokens = estimateTokens(last.content);
                        return {
                            ...conv,
                            updatedAt: Date.now(),
                            messages: [
                                ...conv.messages.slice(0, -1),
                                {
                                    ...last,
                                    id: crypto.randomUUID(),
                                    tokenUsage: {
                                        input: last.tokenUsage?.input || 0,
                                        output: outputTokens,
                                        total: (last.tokenUsage?.input || 0) + outputTokens,
                                    },
                                },
                            ],
                        };
                    }
                    return conv;
                })
            );
        };

        const onError = (_: any, error: string) => {
            setIsStreaming(false);
            setConversations((prev) =>
                prev.map((conv) => {
                    if (conv.id !== currentConvId) return conv;
                    return {
                        ...conv,
                        updatedAt: Date.now(),
                        messages: [
                            ...conv.messages.slice(0, -1),
                            { id: crypto.randomUUID(), role: 'assistant', content: `❌ 错误: ${error}`, timestamp: Date.now() },
                        ],
                    };
                })
            );
        };

        window.ai.on('ai-stream-reasoning', onReasoning);
        window.ai.on('ai-stream-chunk', onChunk);
        window.ai.on('ai-stream-done', onDone);
        window.ai.on('ai-stream-error', onError);

        return () => {
            window.ai.removeAllListeners('ai-stream-reasoning');
            window.ai.removeAllListeners('ai-stream-chunk');
            window.ai.removeAllListeners('ai-stream-done');
            window.ai.removeAllListeners('ai-stream-error');
        };
    }, [currentConvId, open]);

    // ── Actions ──
    const newConversation = useCallback(() => {
        const conv: Conversation = {
            id: crypto.randomUUID(),
            title: '新会话',
            modelId: currentConfigId,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        setConversations((prev) => [conv, ...prev]);
        setCurrentConvId(conv.id);
        setShowConvList(false);
    }, [currentConfigId]);

    const deleteConversation = useCallback((id: string) => {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (currentConvId === id) {
            setCurrentConvId('');
        }
    }, [currentConvId]);

    const handleSend = async () => {
        if (!input.trim() || isStreaming || !currentConfig) return;

        let convId = currentConvId;
        let conv = conversations.find((c) => c.id === convId);

        if (!conv) {
            const newConv: Conversation = {
                id: crypto.randomUUID(),
                title: input.trim().slice(0, 30),
                modelId: currentConfigId,
                messages: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            setConversations((prev) => [newConv, ...prev]);
            setCurrentConvId(newConv.id);
            convId = newConv.id;
            conv = newConv;
        }

        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: input.trim(),
            timestamp: Date.now(),
        };

        const history = (conv?.messages || []).map((m) => ({ role: m.role, content: m.content }));
        const fullHistory = [...history, { role: 'user' as const, content: userMsg.content }];
        const inputTokens = fullHistory.reduce((acc, m) => acc + estimateTokens(m.content), 0);

        const assistantMsg: ChatMessage = {
            id: 'streaming',
            role: 'assistant',
            content: '',
            reasoning: '',
            timestamp: Date.now(),
            tokenUsage: { input: inputTokens, output: 0, total: inputTokens },
        };

        const isFirstMessage = conv.messages.length === 0;
        setConversations((prev) =>
            prev.map((c) => {
                if (c.id !== convId) return c;
                return {
                    ...c,
                    title: isFirstMessage ? input.trim().slice(0, 30) : c.title,
                    updatedAt: Date.now(),
                    messages: [...c.messages, userMsg, assistantMsg],
                };
            })
        );

        setIsStreaming(true);
        setInput('');

        await window.ai.invoke('ai-chat-stream', {
            userMessage: userMsg.content,
            history: conv?.messages.map((m) => ({ role: m.role, content: m.content })) || [],
            config: {
                id: currentConfig.id,
                baseURL: currentConfig.baseURL,
                model: currentConfig.model,
                token: currentConfig.token,
                headers: currentConfig.headers,
                temperature: currentConfig.temperature,
                max_tokens: currentConfig.max_tokens,
                top_p: currentConfig.top_p,
            },
        });
    };

    const handleSaveConfig = (config: ModelConfig, isNew: boolean) => {
        if (isNew) {
            setConfigs((prev) => [...prev, config]);
            setCurrentConfigId(config.id);
        } else {
            setConfigs((prev) => prev.map((c) => (c.id === config.id ? config : c)));
        }
    };

    const handleDeleteConfig = (id: string) => {
        if (configs.length <= 1) return;
        // Clean up encrypted token
        if (window.ai?.deleteLLMToken) {
            window.ai.deleteLLMToken(id);
        }
        setConfigs((prev) => prev.filter((c) => c.id !== id));
        if (currentConfigId === id) setCurrentConfigId(configs[0]?.id || '');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── Render ──
    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="ai-panel-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                        style={{ top: 44 }}
                        onClick={closePanel}
                    />

                    {/* Panel */}
                    <motion.div
                        key="ai-panel"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                        className="fixed top-[44px] right-0 bottom-0 z-40 w-[420px]
                                   bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl
                                   border-l border-zinc-200/40 dark:border-zinc-700/40
                                   shadow-[-8px_0_32px_rgba(0,0,0,0.08)] dark:shadow-[-8px_0_32px_rgba(0,0,0,0.25)]
                                   flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200/40 dark:border-zinc-700/40 shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm">
                                    <Bot size={14} className="text-white" />
                                </div>
                                <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                    AI 助手
                                </h2>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => setShowConfigEditor(!showConfigEditor)}
                                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition"
                                    title="模型配置"
                                >
                                    <Settings size={14} />
                                </button>
                                <button
                                    onClick={closePanel}
                                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition"
                                    title="关闭面板"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Conversation bar */}
                        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-200/30 dark:border-zinc-700/30 shrink-0">
                            <button
                                onClick={newConversation}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium
                                           bg-zinc-100/60 dark:bg-zinc-800/60 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60
                                           text-zinc-600 dark:text-zinc-400 transition shrink-0"
                            >
                                <Plus size={12} />
                                新建
                            </button>
                            <button
                                onClick={() => setShowConvList(!showConvList)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition shrink-0 ${
                                    showConvList
                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                        : 'bg-zinc-100/60 dark:bg-zinc-800/60 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 text-zinc-600 dark:text-zinc-400'
                                }`}
                            >
                                <MessageSquare size={12} />
                                历史 ({conversations.length})
                            </button>
                            {currentConfig && (
                                <select
                                    value={currentConfigId}
                                    onChange={(e) => setCurrentConfigId(e.target.value)}
                                    className="flex-1 min-w-0 px-2 py-1 text-[11px] border border-zinc-200/40 dark:border-zinc-700/40 rounded-md
                                               bg-white/50 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400
                                               outline-none cursor-pointer truncate"
                                >
                                    {configs.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Conversation list (collapsible) */}
                        <AnimatePresence>
                            {showConvList && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-b border-zinc-200/30 dark:border-zinc-700/30 overflow-hidden shrink-0"
                                >
                                    <div className="max-h-[160px] overflow-y-auto px-2 py-1.5 space-y-0.5">
                                        {conversations.length === 0 && (
                                            <div className="text-center py-4 text-[11px] text-zinc-400 dark:text-zinc-500">
                                                暂无会话
                                            </div>
                                        )}
                                        {conversations.map((conv) => (
                                            <div
                                                key={conv.id}
                                                onClick={() => { setCurrentConvId(conv.id); setShowConvList(false); }}
                                                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition ${
                                                    conv.id === currentConvId
                                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                        : 'hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400'
                                                }`}
                                            >
                                                <span className="truncate min-w-0">{conv.title}</span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                                                    className="shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Messages area */}
                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                            {messages.length === 0 && !showConfigEditor && (
                                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg">
                                        <Bot size={22} className="text-white" />
                                    </div>
                                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        有什么可以帮你的？
                                    </p>
                                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-[240px]">
                                        选择模型配置，输入消息开始对话。支持流式输出。
                                    </p>
                                    {/* Quick prompts */}
                                    <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
                                        {['帮我写一段代码', '解释这个概念', '翻译成英文'].map((prompt) => (
                                            <button
                                                key={prompt}
                                                onClick={() => setInput(prompt)}
                                                className="px-2.5 py-1 text-[11px] rounded-full border border-zinc-200/40 dark:border-zinc-700/40
                                                           hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400 transition"
                                            >
                                                {prompt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg) => {
                                const isUser = msg.role === 'user';
                                return (
                                    <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                                        <div
                                            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${
                                                isUser
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-gradient-to-br from-zinc-600 to-zinc-700 dark:from-zinc-500 dark:to-zinc-600 text-white'
                                            }`}
                                        >
                                            {isUser ? <User size={13} /> : <Bot size={13} />}
                                        </div>
                                        <div className={`max-w-[80%] space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
                                            <div
                                                className={`rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                                                    isUser
                                                        ? 'bg-blue-500 text-white rounded-br-md'
                                                        : 'bg-zinc-100/80 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 rounded-bl-md border border-zinc-200/30 dark:border-zinc-700/30'
                                                }`}
                                            >
                                                <Message role={msg.role} content={msg.content} />
                                            </div>
                                            {msg.tokenUsage && (
                                                <div className={`text-[10px] text-zinc-400 dark:text-zinc-500 ${isUser ? 'text-right' : ''}`}>
                                                    {msg.tokenUsage.total} tokens
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Streaming indicator */}
                            {isStreaming && messages[messages.length - 1]?.id === 'streaming' && (
                                <div className="flex items-start gap-2.5">
                                    <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-700 dark:from-zinc-500 dark:to-zinc-600 flex items-center justify-center text-white shadow-sm">
                                        <Bot size={13} />
                                    </div>
                                    <div className="rounded-2xl rounded-bl-md px-3 py-2 bg-zinc-100/80 dark:bg-zinc-800/80 border border-zinc-200/30 dark:border-zinc-700/30">
                                        <LoadingDots />
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input area */}
                        <div className="shrink-0 px-3 py-2.5 border-t border-zinc-200/40 dark:border-zinc-700/40">
                            <div className="flex items-end gap-2">
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="输入消息... (Enter 发送)"
                                    disabled={isStreaming}
                                    rows={1}
                                    className="flex-1 px-3 py-2 text-[13px] border border-zinc-200 dark:border-zinc-700 rounded-xl
                                               bg-white/50 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200
                                               outline-none focus:border-blue-400 resize-none disabled:opacity-50
                                               min-h-[38px] max-h-[100px] transition"
                                    style={{ height: 'auto' }}
                                    onInput={(e) => {
                                        const t = e.target as HTMLTextAreaElement;
                                        t.style.height = 'auto';
                                        t.style.height = Math.min(t.scrollHeight, 100) + 'px';
                                    }}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={isStreaming || !input.trim()}
                                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl
                                               bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700
                                               text-white transition shadow-sm"
                                >
                                    {isStreaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
                                </button>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500 px-0.5">
                                <span className="truncate">{currentConfig ? `${currentConfig.name}` : '未选择模型'}</span>
                                {currentConfig && (
                                    <span className="shrink-0 ml-2 opacity-60">{currentConfig.model}</span>
                                )}
                            </div>
                        </div>

                        {/* Config editor overlay */}
                        <AnimatePresence>
                            {showConfigEditor && (
                                <ConfigEditor
                                    configs={configs}
                                    currentConfigId={currentConfigId}
                                    onSave={handleSaveConfig}
                                    onDelete={handleDeleteConfig}
                                    onClose={() => setShowConfigEditor(false)}
                                />
                            )}
                        </AnimatePresence>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
