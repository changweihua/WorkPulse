/**
 * AIChatPanel — Slide-in drawer panel for AI conversation.
 * Renders as a right-side overlay (z-40) that slides in over the current page content.
 * Uses useAIPanelStore for open/close state, and persists chat data via IndexedDB.
 *
 * Liquid Glass Personality: layered glass surfaces, gradient borders,
 * glowing input focus, glass message bubbles, premium header strip.
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
} from 'lucide-react';
import { Message } from '@fauzitech/ai-ui';
import { useAIPanelStore } from '../stores/aiPanelStore';
import { recoverConversations, saveConversation, onSyncEvent, deleteConversation as deleteConversationFromDB } from '../lib/chat-storage';

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

// ─── Constants ────────────────────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────────────────────

export default function AIChatPanel() {
    const { open, closePanel } = useAIPanelStore();

    // ── State ──
    const [configs, setConfigs] = useState<ModelConfig[]>([]);
    const [currentConfigId, setCurrentConfigId] = useState<string>('');
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConvId, setCurrentConvId] = useState<string>('');
    const [isHydrated, setIsHydrated] = useState(false);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [showConvList, setShowConvList] = useState(false);
    const currentRequestIdRef = useRef<string>('');
    const [retryInfo, setRetryInfo] = useState<{ attempt: number; maxRetries: number; waitMs: number } | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Dark mode detection for inline glass styles ──
    const [isDark, setIsDark] = useState(() =>
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    );
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const classObs = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });
        classObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => classObs.disconnect();
    }, []);

    // Hydrate: 全局配置 → IndexedDB 兜底 → 自动迁移
    useEffect(() => {
        (async () => {
            try {
                let loadedConfigs: ModelConfig[] = [];
                let loadedConfigId = '';

                // 1. 优先从全局配置加载
                const globalConfig = await window.api?.models?.getGlobalConfig?.();
                if (globalConfig && globalConfig.chatConfigs.length > 0) {
                    loadedConfigs = globalConfig.chatConfigs;
                    loadedConfigId = globalConfig.activeChatConfigId || globalConfig.chatConfigs[0]?.id || '';
                } else {
                    // 2. 全局配置为空，从 IndexedDB 恢复旧配置
                    const { recoverConfigs } = await import('../lib/chat-storage');
                    const savedConfigs = await recoverConfigs('chatPanel');
                    if (savedConfigs.length > 0) {
                        // 从加密存储恢复 token
                        const withTokens = await Promise.all(
                            savedConfigs.map(async (config: any) => {
                                try {
                                    const token = await window.ai?.getLLMToken?.(config.id);
                                    return { ...config, token: token || '' };
                                } catch {
                                    return { ...config, token: '' };
                                }
                            })
                        );
                        loadedConfigs = withTokens;
                        loadedConfigId = withTokens[0].id;
                        // 自动迁移到全局配置（带完整 token）
                        const migrationPayload = {
                            chatConfigs: withTokens,
                            activeChatConfigId: loadedConfigId,
                            embeddingConfigs: [{ id: 'openai-embedding', name: 'OpenAI Embedding', baseURL: 'https://api.openai.com/v1', model: 'text-embedding-3-small', dimension: 1536, headers: '', token: '' }],
                            activeEmbeddingConfigId: 'openai-embedding',
                        };
                        await window.api?.models?.setGlobalConfig?.(migrationPayload);
                        console.log(`[AIChatPanel] 迁移了 ${withTokens.length} 个旧配置到全局配置`);
                    }
                }

                // 3. 加载 token 到每个配置
                if (loadedConfigs.length > 0) {
                    const withTokens = await Promise.all(
                        loadedConfigs.map(async (config: any) => {
                            try {
                                const token = await window.ai?.getLLMToken?.(config.id);
                                return { ...config, token: token || '' };
                            } catch {
                                return { ...config, token: '' };
                            }
                        })
                    );
                    setConfigs(withTokens);
                    setCurrentConfigId(loadedConfigId || withTokens[0].id);
                }

                // 4. 恢复会话列表
                const { recoverConversations } = await import('../lib/chat-storage');
                const savedConversations = await recoverConversations('chatPanel');
                if (savedConversations.length > 0) {
                    setConversations(savedConversations);
                }
                const savedConvId = localStorage.getItem('chatPanelCurrentConvId') || '';
                setCurrentConvId(savedConvId);
            } catch (err) {
                console.warn('Config hydration failed:', err);
            } finally {
                setIsHydrated(true);
            }
        })();
    }, []);

    // Derived
    const currentConfig = configs.find((c) => c.id === currentConfigId) || configs[0];
    const currentConv = conversations.find((c) => c.id === currentConvId);
    const messages = currentConv?.messages || [];

    // ── Persistence — conversations only via IndexedDB ──
    useEffect(() => {
        if (!isHydrated) return;
        // Save tokens to encrypted storage via IPC
        configs.forEach((config) => {
            if (config.token && window.ai?.saveLLMToken) {
                window.ai.saveLLMToken(config.id, config.token);
            }
        });
    }, [configs, isHydrated]);
    useEffect(() => {
        if (!isHydrated) return;
        conversations.filter((conv) => conv.messages.length > 0).forEach((conv) => {
            saveConversation(conv).catch(console.error);
        });
    }, [conversations, isHydrated]);
    useEffect(() => {
        if (!isHydrated) return;
        localStorage.setItem('chatPanelCurrentConvId', currentConvId);
    }, [currentConvId, isHydrated]);

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

    // ── Cross-tab sync: reload from IndexedDB when another tab updates data ──
    useEffect(() => {
        const unsubscribe = onSyncEvent((event) => {
            if (event.type === 'conversation-updated' || event.type === 'conversation-deleted') {
                recoverConversations('chatPanel').then(setConversations).catch(console.warn);
            }
        });
        return unsubscribe;
    }, []);

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
            setRetryInfo(null);
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
            setRetryInfo(null);
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

        const onRetry = (_: any, info: { attempt: number; maxRetries: number; waitMs: number }) => {
            setRetryInfo(info);
        };
        const onRequestId = (_: any, requestId: string) => {
            currentRequestIdRef.current = requestId;
        };
        window.ai.on('ai-stream-retry', onRetry);
        window.ai.on('ai-stream-request-id', onRequestId);

        return () => {
            window.ai.removeAllListeners('ai-stream-reasoning');
            window.ai.removeAllListeners('ai-stream-chunk');
            window.ai.removeAllListeners('ai-stream-done');
            window.ai.removeAllListeners('ai-stream-error');
            window.ai.removeAllListeners('ai-stream-retry');
            window.ai.removeAllListeners('ai-stream-request-id');
        };
    }, [currentConvId, open]);

    // ── Actions ──
    const newConversation = useCallback(() => {
        setCurrentConvId(crypto.randomUUID());
        setShowConvList(false);
    }, []);

    const deleteConversation = useCallback((id: string) => {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (currentConvId === id) {
            setCurrentConvId('');
        }
        deleteConversationFromDB(id).catch(console.error);
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

    const handleConfigChange = (newConfigId: string) => {
        setCurrentConfigId(newConfigId);
        // 通知主进程更新活跃配置
        window.api?.models?.setActiveChat?.(newConfigId);
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
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="fixed inset-0 z-40"
                        style={{
                            top: 44,
                            background: isDark
                                ? 'linear-gradient(135deg, rgba(0,0,0,0.2), rgba(0,0,0,0.35))'
                                : 'linear-gradient(135deg, rgba(0,0,0,0.1), rgba(0,0,0,0.18))',
                            backdropFilter: 'blur(3px)',
                            WebkitBackdropFilter: 'blur(3px)',
                        }}
                        onClick={closePanel}
                    />

                    {/* Panel */}
                    <motion.div
                        key="ai-panel"
                        initial={{ x: '100%', opacity: 0, scale: 0.95, filter: 'blur(8px)' }}
                        animate={{ x: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ x: '100%', opacity: 0, scale: 0.97, filter: 'blur(4px)' }}
                        transition={{
                            type: 'spring',
                            stiffness: 320,
                            damping: 30,
                            opacity: { duration: 0.25 },
                            scale: { duration: 0.3 },
                            filter: { duration: 0.3 },
                        }}
                        className="fixed top-[44px] right-0 bottom-0 z-40 w-[420px]
                                   flex flex-col overflow-hidden"
                        style={{
                            background: isDark
                                ? 'linear-gradient(180deg, rgba(22,25,38,0.95) 0%, rgba(18,20,32,0.93) 100%)'
                                : 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,248,255,0.90) 100%)',
                            backdropFilter: 'blur(32px) saturate(200%)',
                            WebkitBackdropFilter: 'blur(32px) saturate(200%)',
                            borderLeft: 'none',
                            boxShadow: isDark
                                ? '-16px 0 60px rgba(0,0,0,0.4), -4px 0 20px rgba(0,0,0,0.25), inset 1px 0 0 rgba(255,255,255,0.05), 0 0 80px rgba(59,130,246,0.03)'
                                : '-16px 0 60px rgba(0,0,0,0.08), -4px 0 20px rgba(0,0,0,0.04), inset 1px 0 0 rgba(255,255,255,0.9), 0 0 80px rgba(59,130,246,0.04)',
                            borderRadius: '16px 0 0 16px',
                        }}
                    >
                        {/* ─── Animated gradient border on left edge ─── */}
                        <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none z-[1]"
                             style={{
                                 background: 'linear-gradient(180deg, rgba(59,130,246,0.5) 0%, rgba(139,92,246,0.3) 30%, rgba(99,180,255,0.4) 60%, rgba(139,92,246,0.2) 100%)',
                                 boxShadow: '0 0 12px rgba(59,130,246,0.15), 0 0 24px rgba(139,92,246,0.08)',
                             }} />

                        {/* ─── Subtle top glow line ─── */}
                        <div className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
                             style={{
                                 background: 'linear-gradient(90deg, transparent 0%, rgba(99,130,255,0.4) 20%, rgba(160,120,255,0.3) 50%, rgba(99,130,255,0.4) 80%, transparent 100%)',
                                 boxShadow: '0 0 16px rgba(59,130,246,0.1)',
                             }} />

                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 shrink-0 relative z-[2]"
                             style={{
                                 borderBottom: isDark
                                     ? '1px solid rgba(255,255,255,0.05)'
                                     : '1px solid rgba(0,0,0,0.04)',
                                 background: isDark
                                     ? 'linear-gradient(135deg, rgba(30,40,70,0.25), rgba(20,25,45,0.15))'
                                     : 'linear-gradient(135deg, rgba(240,245,255,0.4), rgba(255,255,255,0.2))',
                             }}>
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 relative overflow-hidden"
                                     style={{
                                         background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(139,92,246,0.9))',
                                         boxShadow: '0 3px 12px rgba(59,130,246,0.35), inset 0 1px 1px rgba(255,255,255,0.2)',
                                     }}>
                                    <Bot size={16} className="text-white relative z-[1] drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 leading-tight">
                                        AI 助手
                                    </h2>
                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight mt-0.5">
                                        {currentConfig?.model || '未配置模型'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
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
                        <div className="flex items-center gap-1.5 px-3 py-2 shrink-0"
                             style={{
                                 borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.05)',
                                 background: isDark ? 'rgba(25,30,50,0.2)' : 'rgba(245,248,255,0.3)',
                             }}>
                            <button
                                onClick={newConversation}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition shrink-0"
                                style={{
                                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
                                    color: isDark ? 'rgba(200,210,230,0.8)' : 'rgba(60,70,90,0.8)',
                                }}
                            >
                                <Plus size={12} />
                                新建
                            </button>
                            <button
                                onClick={() => setShowConvList(!showConvList)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition shrink-0"
                                style={{
                                    background: showConvList
                                        ? isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)'
                                        : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    border: showConvList
                                        ? '1px solid rgba(59,130,246,0.25)'
                                        : isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
                                    color: showConvList
                                        ? 'rgba(59,130,246,0.9)'
                                        : isDark ? 'rgba(200,210,230,0.8)' : 'rgba(60,70,90,0.8)',
                                }}
                            >
                                <MessageSquare size={12} />
                                历史 ({conversations.length})
                            </button>
                            {currentConfig && (
                                <select
                                    value={currentConfigId}
                                    onChange={(e) => handleConfigChange(e.target.value)}
                                    className="flex-1 min-w-0 px-2 py-1 text-[11px] rounded-md outline-none cursor-pointer truncate"
                                    style={{
                                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                                        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.5)',
                                        color: isDark ? 'rgba(200,210,230,0.8)' : 'rgba(60,70,90,0.8)',
                                    }}
                                >
                                    {configs.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name} ({c.model})</option>
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
                                    className="overflow-hidden shrink-0"
                                    style={{
                                        borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.05)',
                                    }}
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
                                                className="group flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-all duration-150"
                                                style={{
                                                    background: conv.id === currentConvId
                                                        ? isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.06)'
                                                        : 'transparent',
                                                    color: conv.id === currentConvId
                                                        ? isDark ? 'rgba(130,170,255,0.95)' : 'rgba(59,130,246,0.9)'
                                                        : isDark ? 'rgba(180,190,210,0.8)' : 'rgba(80,90,110,0.8)',
                                                    borderLeft: conv.id === currentConvId
                                                        ? '2px solid rgba(59,130,246,0.7)'
                                                        : '2px solid transparent',
                                                    borderRadius: '6px',
                                                }}
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
                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 relative z-[1]">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                    {/* Glowing orb avatar with breathing animation */}
                                    <div className="relative mb-4">
                                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-[1]"
                                             style={{
                                                 background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(139,92,246,0.9))',
                                                 boxShadow: '0 4px 24px rgba(59,130,246,0.3), 0 0 40px rgba(139,92,246,0.15), inset 0 1px 2px rgba(255,255,255,0.2)',
                                                 animation: 'ai-fab-breathe 3s ease-in-out infinite',
                                             }}>
                                            <Bot size={24} className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
                                        </div>
                                        {/* Ambient glow ring */}
                                        <div className="absolute inset-[-12px] rounded-3xl pointer-events-none"
                                             style={{
                                                 background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
                                             }} />
                                        {/* Outer glow */}
                                        <div className="absolute inset-[-24px] rounded-full pointer-events-none"
                                             style={{
                                                 background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)',
                                             }} />
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
                                                className="px-2.5 py-1 text-[11px] rounded-full transition-all duration-200 hover:scale-[1.03]"
                                                style={{
                                                    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                                                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)',
                                                    color: isDark ? 'rgba(200,210,230,0.7)' : 'rgba(100,110,130,0.8)',
                                                    boxShadow: isDark ? '0 1px 4px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
                                                }}
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
                                                    : 'text-white'
                                            }`}
                                            style={!isUser ? {
                                                background: 'linear-gradient(135deg, rgba(90,100,130,0.9), rgba(60,70,100,0.9))',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.1)',
                                            } : undefined}
                                        >
                                            {isUser ? <User size={13} /> : <Bot size={13} />}
                                        </div>
                                        <div className={`max-w-[80%] space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
                                            <div
                                                className="rounded-2xl px-3 py-2 text-[13px] leading-relaxed"
                                                style={isUser ? {
                                                    background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(79,110,246,0.85))',
                                                    color: 'white',
                                                    borderRadius: '16px 16px 4px 16px',
                                                    boxShadow: '0 2px 12px rgba(59,130,246,0.2), inset 0 1px 1px rgba(255,255,255,0.15)',
                                                } : {
                                                    background: isDark
                                                        ? 'linear-gradient(135deg, rgba(35,40,60,0.7), rgba(25,30,50,0.6))'
                                                        : 'linear-gradient(135deg, rgba(255,255,255,0.8), rgba(245,248,255,0.7))',
                                                    color: isDark ? 'rgba(220,225,240,0.95)' : 'rgba(30,35,50,0.9)',
                                                    borderRadius: '16px 16px 16px 4px',
                                                    border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
                                                    boxShadow: isDark
                                                        ? '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)'
                                                        : '0 2px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
                                                    backdropFilter: 'blur(8px)',
                                                }}
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
                                    <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white shadow-sm"
                                         style={{
                                             background: 'linear-gradient(135deg, rgba(90,100,130,0.9), rgba(60,70,100,0.9))',
                                             boxShadow: '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.1)',
                                         }}>
                                        <Bot size={13} />
                                    </div>
                                    <div className="rounded-2xl rounded-bl-md px-3 py-2"
                                         style={{
                                             background: isDark
                                                 ? 'linear-gradient(135deg, rgba(35,40,60,0.7), rgba(25,30,50,0.6))'
                                                 : 'linear-gradient(135deg, rgba(255,255,255,0.8), rgba(245,248,255,0.7))',
                                             border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
                                             boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
                                         }}>
                                        <LoadingDots />
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input area */}
                        <div className="shrink-0 px-3 py-2.5 relative z-[2]"
                             style={{
                                 borderTop: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.04)',
                                 background: isDark
                                     ? 'linear-gradient(180deg, rgba(20,25,40,0.25), rgba(15,18,30,0.35))'
                                     : 'linear-gradient(180deg, rgba(248,250,255,0.4), rgba(255,255,255,0.5))',
                             }}>
                            <div className="flex items-end gap-2">
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="输入消息... (Enter 发送)"
                                    disabled={isStreaming}
                                    rows={1}
                                    className="flex-1 px-3 py-2 text-[13px] rounded-xl
                                               text-zinc-800 dark:text-zinc-200
                                               outline-none resize-none disabled:opacity-50
                                               min-h-[38px] max-h-[100px] transition-all duration-200"
                                    style={{
                                        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                                        boxShadow: isDark
                                            ? 'inset 0 1px 4px rgba(0,0,0,0.15)'
                                            : 'inset 0 1px 4px rgba(0,0,0,0.04), 0 1px 2px rgba(255,255,255,0.6)',
                                        backdropFilter: 'blur(8px)',
                                    }}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)';
                                        e.currentTarget.style.boxShadow = isDark
                                            ? 'inset 0 1px 4px rgba(0,0,0,0.15), 0 0 0 3px rgba(59,130,246,0.1), 0 0 16px rgba(59,130,246,0.08)'
                                            : 'inset 0 1px 4px rgba(0,0,0,0.04), 0 0 0 3px rgba(59,130,246,0.08), 0 0 16px rgba(59,130,246,0.06)';
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
                                        e.currentTarget.style.boxShadow = isDark
                                            ? 'inset 0 1px 4px rgba(0,0,0,0.15)'
                                            : 'inset 0 1px 4px rgba(0,0,0,0.04), 0 1px 2px rgba(255,255,255,0.6)';
                                    }}
                                    onInput={(e) => {
                                        const t = e.target as HTMLTextAreaElement;
                                        t.style.height = 'auto';
                                        t.style.height = Math.min(t.scrollHeight, 100) + 'px';
                                    }}
                                />
                                <button
                                    onClick={isStreaming && currentRequestIdRef.current
                                        ? () => (window.ai as any).cancel?.(currentRequestIdRef.current)
                                        : handleSend}
                                    disabled={!isStreaming && !input.trim()}
                                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200"
                                    style={isStreaming
                                        ? {
                                            background: 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,50,50,0.85))',
                                            color: 'white',
                                            boxShadow: '0 2px 12px rgba(239,68,68,0.3), inset 0 1px 1px rgba(255,255,255,0.15)',
                                        }
                                        : {
                                            background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(79,120,246,0.85))',
                                            color: 'white',
                                            boxShadow: input.trim()
                                                ? '0 2px 12px rgba(59,130,246,0.35), inset 0 1px 1px rgba(255,255,255,0.15)'
                                                : '0 2px 8px rgba(59,130,246,0.15)',
                                        }}
                                >
                                    {isStreaming ? <X size={15} /> : <Send size={14} />}
                                </button>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500 px-0.5">
                                {retryInfo ? (
                                    <span className="text-amber-500 dark:text-amber-400 truncate">
                                        连接中断，第 {retryInfo.attempt}/{retryInfo.maxRetries} 次重连中...
                                    </span>
                                ) : (
                                    <>
                                        <span className="truncate">{currentConfig ? `${currentConfig.name}` : '未选择模型'}</span>
                                        {currentConfig && (
                                            <span className="shrink-0 ml-2 opacity-60">{currentConfig.model}</span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
