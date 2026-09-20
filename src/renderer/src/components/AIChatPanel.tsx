/**
 * AIChatPanel — Slide-in drawer panel for AI conversation.
 * Renders as a right-side overlay (z-40) that slides in over the current page content.
 * Uses useAIPanelStore for open/close state, and persists chat data via IndexedDB.
 *
 * Clean Modern Design: inspired by ChatGPT/Claude, clean surfaces,
 * minimal chrome, clear hierarchy.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
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
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Share2,
} from 'lucide-react';
import { Message } from '@fauzitech/ai-ui';
import { useAIPanelStore } from '../stores/aiPanelStore';
import {
  recoverConversations,
  saveConversation,
  onSyncEvent,
  deleteConversation as deleteConversationFromDB,
} from '../lib/chat-storage';
import { useStreamingReveal } from '../hooks/useStreamingReveal';
import { encode as cl100kEncode } from 'gpt-tokenizer/encoding/cl100k_base';

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
  try {
    return cl100kEncode(text).length;
  } catch {
    let count = 0;
    for (const ch of text) {
      if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) count += 1.5;
      else if (/[\u0800-\uFFFF]/.test(ch)) count += 2.5;
      else count += 0.25;
    }
    return Math.ceil(count);
  }
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

// ─── 流式消息渲染（独立组件，避免 IIFE 导致的 diff 抖动） ──────────────
interface PanelStreamingMessageProps {
  content: string;
  reasoning?: string;
  isDark: boolean;
}

const PanelStreamingMessage = memo(function PanelStreamingMessage({
  content,
  reasoning,
  isDark,
}: PanelStreamingMessageProps) {
  const revealed = useStreamingReveal(content, true);
  return (
    <div className="group w-full" style={{ contain: 'layout style' } as React.CSSProperties}>
      {/* 全宽AI消息 — 左侧微灰背景条 */}
      <div className="w-full px-4 py-3 bg-zinc-50/80 dark:bg-zinc-800/20 rounded-lg">
        <div className="max-w-[768px] mx-auto">
          {/* AI 标签 */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
              <Bot size={11} className="text-white" />
            </div>
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              AI 助手
            </span>
          </div>
          {/* 思考过程 — 可折叠 */}
          {reasoning && (
            <details className="mb-2 group/reasoning">
              <summary className="text-[11px] text-zinc-400 dark:text-zinc-500 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 select-none flex items-center gap-1">
                <span className="text-sm">🧠</span>
                思考过程
                <span className="text-zinc-300 dark:text-zinc-600">({reasoning.length} 字符)</span>
              </summary>
              <div className="mt-1 pl-4 text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed border-l-2 border-zinc-200 dark:border-zinc-700 whitespace-pre-wrap">
                {reasoning}
              </div>
            </details>
          )}
          {/* 消息内容 */}
          <div className="text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200">
            {revealed ? <Message role="assistant" content={revealed} /> : <LoadingDots />}
          </div>
          {/* 流式光标 — 闪烁竖线 */}
          {revealed && content.length > 0 && (
            <span className="inline-block w-[2px] h-[14px] bg-blue-500 ml-0.5 animate-pulse" />
          )}
        </div>
      </div>
      {/* 操作栏 — hover 显示，右对齐 */}
      {revealed && (
        <div className="px-4 max-w-[768px] mx-auto">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 mt-1">
            <MessageActionBar content={content} isUser={false} />
          </div>
        </div>
      )}
    </div>
  );
});

// ─── 复制按钮（独立组件，避免 memo 组件无法访问父级 state） ──────────────
function PanelCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
      title="复制"
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
    </button>
  );
}

// ─── 消息操作栏（参考 ChatGPT/Claude 设计） ──────────────
function MessageActionBar({ content, isUser }: { content: string; isUser: boolean }) {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<'up' | 'down' | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex items-center gap-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* 复制按钮 */}
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all duration-150"
        title={copied ? '已复制' : '复制'}
      >
        {copied ? (
          <>
            <Check size={13} className="text-green-500" />
            <span className="text-green-500">已复制</span>
          </>
        ) : (
          <>
            <Copy size={13} />
            <span>复制</span>
          </>
        )}
      </button>

      {/* AI 回复专属：点赞/踩/分享 */}
      {!isUser && (
        <>
          <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
          <button
            onClick={() => setLiked(liked === 'up' ? null : 'up')}
            className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-all duration-150 ${
              liked === 'up'
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            }`}
            title="有帮助"
          >
            <ThumbsUp size={13} />
          </button>
          <button
            onClick={() => setLiked(liked === 'down' ? null : 'down')}
            className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-all duration-150 ${
              liked === 'down'
                ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
            }`}
            title="没帮助"
          >
            <ThumbsDown size={13} />
          </button>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all duration-150"
            title="分享"
          >
            <Share2 size={13} />
          </button>
        </>
      )}
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
  const [showConvList, setShowConvList] = useState(true);
  const currentRequestIdRef = useRef<string>('');
  const [retryInfo, setRetryInfo] = useState<{
    attempt: number;
    maxRetries: number;
    waitMs: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Dark mode detection ──
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const classObs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    classObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => classObs.disconnect();
  }, []);

  // Hydrate: 全局配置 → 旧 localStorage 兜底 → 自动迁移
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
          // 2. 全局配置为空，从旧 localStorage 恢复配置
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
              }),
            );
            loadedConfigs = withTokens;
            loadedConfigId = withTokens[0].id;
            // 自动迁移到全局配置（带完整 token）
            const migrationPayload = {
              chatConfigs: withTokens,
              activeChatConfigId: loadedConfigId,
              embeddingConfigs: [
                {
                  id: 'openai-embedding',
                  name: 'OpenAI Embedding',
                  baseURL: 'https://api.openai.com/v1',
                  model: 'text-embedding-3-small',
                  dimension: 1536,
                  headers: '',
                  token: '',
                },
              ],
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
            }),
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
    conversations
      .filter((conv) => conv.messages.length > 0)
      .forEach((conv) => {
        saveConversation(conv).catch(console.error);
      });
  }, [conversations, isHydrated]);
  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem('chatPanelCurrentConvId', currentConvId);
  }, [currentConvId, isHydrated]);

  // ── Auto-scroll — 仅在用户已接近底部时平滑滚动，避免流式输出时的抖动 ──
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
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
        }),
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
              messages: [...conv.messages.slice(0, -1), { ...last, content: last.content + chunk }],
            };
          }
          return conv;
        }),
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
        }),
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
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `❌ 错误: ${error}`,
                timestamp: Date.now(),
              },
            ],
          };
        }),
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

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConvId === id) {
        setCurrentConvId('');
      }
      deleteConversationFromDB(id).catch(console.error);
    },
    [currentConvId],
  );

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
      }),
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
          {/* Backdrop — clean overlay */}
          <motion.div
            key="ai-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 backdrop-blur-[2px]"
            style={{ top: 44 }}
            onClick={closePanel}
          />

          {/* Panel — clean modern design */}
          <motion.div
            key="ai-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed top-[44px] right-0 bottom-0 z-40 w-[420px]
                                   flex flex-col overflow-hidden
                                   bg-white dark:bg-zinc-900
                                   border-l border-zinc-200/80 dark:border-zinc-700/60
                                   shadow-[−8px_0_30px_rgba(0,0,0,0.12)] dark:shadow-[−8px_0_30px_rgba(0,0,0,0.4)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shrink-0 shadow-sm">
                  <Bot size={16} className="text-white" />
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
                  onClick={() => setShowConvList(!showConvList)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    showConvList
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                  }`}
                  title="会话历史"
                >
                  <MessageSquare size={14} />
                </button>
                <button
                  onClick={newConversation}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
                  title="新建会话"
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={closePanel}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
                  title="关闭面板"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Model selector — subtle bar, always visible */}
            {currentConfig && (
              <div className="px-3 py-2 shrink-0 border-b border-zinc-100 dark:border-zinc-800">
                <select
                  value={currentConfigId}
                  onChange={(e) => handleConfigChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg
                                               bg-zinc-50 dark:bg-zinc-800/50
                                               border border-zinc-200 dark:border-zinc-700/50
                                               text-zinc-600 dark:text-zinc-400
                                               outline-none cursor-pointer
                                               focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50
                                               transition-all"
                >
                  {configs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.model}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Conversation list (collapsible) */}
            <AnimatePresence>
              {showConvList && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden shrink-0 border-b border-zinc-100 dark:border-zinc-800"
                >
                  <div className="max-h-[180px] overflow-y-auto px-2 py-1.5 space-y-0.5">
                    {conversations.length === 0 && (
                      <div className="text-center py-4 text-[11px] text-zinc-400 dark:text-zinc-500">
                        暂无会话记录
                      </div>
                    )}
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => {
                          setCurrentConvId(conv.id);
                          setShowConvList(false);
                        }}
                        className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all duration-150 ${
                          conv.id === currentConvId
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <span className="truncate min-w-0">{conv.title}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conv.id);
                          }}
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
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center mb-3 shadow-sm">
                    <Bot size={20} className="text-white" />
                  </div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    AI 助手
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-[280px] mb-5 leading-relaxed">
                    输入消息开始对话，支持流式输出和代码渲染
                  </p>
                  <div className="flex flex-col gap-2 w-full max-w-[300px]">
                    {[
                      { icon: '💻', text: '帮我写一段代码' },
                      { icon: '📖', text: '解释这个概念' },
                      { icon: '🌐', text: '翻译成英文' },
                    ].map((item) => (
                      <button
                        key={item.text}
                        onClick={() => setInput(item.text)}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl
                                                           bg-white dark:bg-zinc-800/50
                                                           border border-zinc-200 dark:border-zinc-700/50
                                                           text-left text-[12px] text-zinc-600 dark:text-zinc-400
                                                           hover:bg-zinc-50 dark:hover:bg-zinc-800
                                                           hover:border-blue-300 dark:hover:border-blue-600/50
                                                           transition-all duration-150"
                      >
                        <span className="text-base">{item.icon}</span>
                        <span>{item.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages
                .filter((msg) => msg.id !== 'streaming')
                .map((msg) => {
                  const isUser = msg.role === 'user';
                  const msgTokens = estimateTokens(msg.content);
                  return (
                    <div key={msg.id} className="group w-full">
                      {/* 用户消息 — 右对齐，淡蓝背景 */}
                      {isUser ? (
                        <div className="flex justify-end w-full">
                          <div className="max-w-[80%] bg-blue-500 text-white rounded-2xl rounded-br-md px-4 py-3 text-[13px] leading-relaxed">
                            <Message role={msg.role} content={msg.content} />
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 ml-2 self-end">
                            <MessageActionBar content={msg.content} isUser={true} />
                          </div>
                        </div>
                      ) : (
                        /* AI消息 — 全宽，左侧微灰背景 */
                        <div className="w-full px-4 py-3 bg-zinc-50/80 dark:bg-zinc-800/20 rounded-lg">
                          <div className="max-w-[768px] mx-auto">
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                                <Bot size={11} className="text-white" />
                              </div>
                              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                {currentConfig?.name || 'AI 助手'}
                              </span>
                            </div>
                            <div className="text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200">
                              <Message role={msg.role} content={msg.content} />
                            </div>
                          </div>
                          <div className="max-w-[768px] mx-auto px-0">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 mt-1">
                              <MessageActionBar content={msg.content} isUser={false} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Streaming indicator — 独立组件，避免 IIFE diff 抖动 */}
              {isStreaming && messages[messages.length - 1]?.id === 'streaming' && (
                <PanelStreamingMessage
                  content={messages[messages.length - 1].content}
                  reasoning={messages[messages.length - 1].reasoning}
                  isDark={isDark}
                />
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area — ChatGPT-style integrated input */}
            <div className="shrink-0 p-3 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-end gap-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/50 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/50 transition-all duration-200">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息..."
                  disabled={isStreaming}
                  rows={1}
                  className="flex-1 bg-transparent text-[13px] text-zinc-800 dark:text-zinc-200
                                               resize-none outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500
                                               disabled:opacity-50 min-h-[24px] max-h-[100px] leading-relaxed"
                  onInput={(e) => {
                    const t = e.target as HTMLTextAreaElement;
                    t.style.height = 'auto';
                    t.style.height = Math.min(t.scrollHeight, 100) + 'px';
                  }}
                />
                <button
                  onClick={
                    isStreaming && currentRequestIdRef.current
                      ? () => (window.ai as any).cancel?.(currentRequestIdRef.current)
                      : handleSend
                  }
                  disabled={!isStreaming && !input.trim()}
                  className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 ${
                    isStreaming
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-sm'
                      : input.trim()
                        ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  {isStreaming ? <X size={14} /> : <Send size={14} />}
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500 px-1">
                {retryInfo ? (
                  <span className="text-amber-500 dark:text-amber-400 truncate">
                    连接中断，第 {retryInfo.attempt}/{retryInfo.maxRetries} 次重连中...
                  </span>
                ) : (
                  <>
                    <span className="truncate">
                      {currentConfig ? currentConfig.name : '未选择模型'}
                    </span>
                    <span className="shrink-0 ml-2 opacity-60">Enter 发送</span>
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
