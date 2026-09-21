/**
 * AIChatPanel — Slide-in drawer panel for AI conversation.
 * Renders as a right-side overlay (z-40) that slides in over the current page content.
 * Uses useAIPanelStore for open/close state, and persists chat data via IndexedDB.
 *
 * Liquid Glass Design — 亮色基底 + 多色渐变点缀 + 轻量层次，
 * 参考 ChatGPT / Claude / Gemini 2025-2026 设计趋势。
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useInfiniteScroll } from '@reactuses/core';
import {
  Bot,
  User,
  X,
  Plus,
  Trash2,
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

// ─── Constants ────────────────────────────────────────────────────────────
const INITIAL_MESSAGE_COUNT = 50;

// ─── 会话时间分组工具 ──────────────────────────────────────────────────────
function formatConvTime(timestamp: number): string {
  const now = new Date();
  const d = new Date(timestamp);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay === 1) return '昨天';
  if (diffDay < 7) return `${diffDay} 天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function groupConversationsByMonth(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const groups = new Map<string, Conversation[]>();
  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(conv);
  }
  const result: { label: string; items: Conversation[] }[] = [];
  const now = new Date();
  for (const [key, items] of groups) {
    const [y, m] = key.split('-').map(Number);
    let label: string;
    if (y === now.getFullYear() && m === now.getMonth() + 1) {
      label = '本月';
    } else if (y === now.getFullYear() && m === now.getMonth()) {
      label = '上月';
    } else if (y === now.getFullYear()) {
      label = `${m}月`;
    } else {
      label = `${y}年${m}月`;
    }
    result.push({ label, items });
  }
  return result;
}
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

/** 动画渐变打字点 */
function LoadingDots() {
  return (
    <div className="flex gap-1.5 items-center py-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
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
      <div className="w-full px-4 py-3.5 bg-gradient-to-br from-zinc-800/40 via-zinc-800/20 to-violet-900/10 dark:from-zinc-800/50 dark:via-zinc-800/30 dark:to-violet-900/10 rounded-xl border border-zinc-200/40 dark:border-zinc-700/30">
        <div className="max-w-[768px] mx-auto">
          {/* AI 标签 — 多色渐变图标 */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 flex items-center justify-center shadow-sm shadow-violet-500/20">
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
              <div className="mt-1 pl-4 text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed border-l-2 border-zinc-700 whitespace-pre-wrap">
                {reasoning}
              </div>
            </details>
          )}
          {/* 消息内容 */}
          <div className="text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200">
            {revealed ? <Message role="assistant" content={revealed} /> : <LoadingDots />}
          </div>
          {/* 流式光标 — 多色渐变闪烁竖线 */}
          {revealed && content.length > 0 && (
            <span className="inline-block w-[2px] h-[14px] bg-gradient-to-b from-violet-400 via-blue-400 to-cyan-400 ml-0.5 animate-pulse rounded-full" />
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
      className="p-1 rounded-md text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-all duration-200"
      title="复制"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
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
        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-all duration-200"
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
          <div className="w-px h-3 bg-zinc-200/60 dark:bg-white/[0.08] mx-0.5" />
          <button
            onClick={() => setLiked(liked === 'up' ? null : 'up')}
            className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-all duration-200 ${
              liked === 'up'
                ? 'text-violet-400 bg-violet-500/10'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
            }`}
            title="有帮助"
          >
            <ThumbsUp size={13} />
          </button>
          <button
            onClick={() => setLiked(liked === 'down' ? null : 'down')}
            className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-all duration-200 ${
              liked === 'down'
                ? 'text-red-400 bg-red-500/10'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
            }`}
            title="没帮助"
          >
            <ThumbsDown size={13} />
          </button>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-all duration-200"
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
  const currentRequestIdRef = useRef<string>('');
  const [retryInfo, setRetryInfo] = useState<{
    attempt: number;
    maxRetries: number;
    waitMs: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // ── Infinite scroll state ──
  const [visibleCount, setVisibleCount] = useState(INITIAL_MESSAGE_COUNT);

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
  const allMessages = currentConv?.messages || [];
  // ── Infinite scroll: only show the latest `visibleCount` messages ──
  const visibleMessages = allMessages.slice(Math.max(0, allMessages.length - visibleCount));
  const hasMoreMessages = visibleCount < allMessages.length;

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

  // ── Reset visible count when conversation changes ──
  useEffect(() => {
    setVisibleCount(INITIAL_MESSAGE_COUNT);
  }, [currentConvId]);

  // ── Auto-scroll — 仅在用户已接近底部时平滑滚动，避免流式输出时的抖动 ──
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [visibleMessages]);

  // ── 打开面板或切换会话时，强制滚动到底部显示最新消息 ──
  useEffect(() => {
    if (!open || !scrollContainerRef.current) return;
    // 用 rAF 确保 DOM 渲染完成后再滚动
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, [open, currentConvId]);

  // ── Infinite scroll: load older messages when scrolling to top ──
  useInfiniteScroll(scrollContainerRef, async () => {
    if (!hasMoreMessages) return;
    setVisibleCount((prev) => Math.min(prev + INITIAL_MESSAGE_COUNT, allMessages.length));
  }, {
    direction: 'top',
    preserveScrollPosition: true,
    distance: 80,
  });

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
          {/* Backdrop — 自适应遮罩 */}
          <motion.div
            key="ai-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/10 dark:bg-black/60 backdrop-blur-[2px] dark:backdrop-blur-[3px]"
            style={{ top: 44 }}
            onClick={closePanel}
          />

          {/* Panel — 两栏布局：左侧导航 + 右侧主内容区 */}
          <motion.div
            key="ai-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed top-[44px] right-0 bottom-0 z-40 w-[680px]
                                   flex flex-row overflow-hidden
                                   bg-white dark:bg-[#0D0D14]
                                   border-l border-zinc-200/80 dark:border-white/[0.06]
                                   shadow-[-8px_0_40px_rgba(0,0,0,0.08)] dark:shadow-[-8px_0_40px_rgba(0,0,0,0.5)]"
          >
            {/* ── Left Sidebar: 会话导航 ── */}
            <div className="w-[260px] shrink-0 flex flex-col border-r border-zinc-200/60 dark:border-white/[0.06] bg-zinc-50/80 dark:bg-white/[0.02]">
              {/* 新建会话按钮 */}
              <div className="p-3 shrink-0">
                <button
                  onClick={newConversation}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl
                             bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400
                             hover:from-violet-600 hover:via-blue-600 hover:to-cyan-500
                             text-white text-[13px] font-medium
                             shadow-lg shadow-violet-500/25 hover:shadow-violet-500/35
                             transition-all duration-200 active:scale-[0.98]"
                >
                  <Plus size={15} />
                  <span>新建会话</span>
                </button>
              </div>

              {/* 会话列表 — 按月分组，占满剩余空间 */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
                {conversations.length === 0 && (
                  <div className="text-center py-8 px-4">
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                      <Bot size={18} className="text-zinc-400 dark:text-zinc-500" />
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      暂无会话记录
                    </p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-1">
                      点击上方按钮开始对话
                    </p>
                  </div>
                )}
                {groupConversationsByMonth(conversations).map((group) => (
                  <div key={group.label} className="mb-2">
                    <div className="px-2 py-1.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                      {group.label}
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map((conv) => (
                        <div
                          key={conv.id}
                          onClick={() => setCurrentConvId(conv.id)}
                          className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-all duration-200 ${
                            conv.id === currentConvId
                              ? 'bg-gradient-to-r from-violet-500/15 via-blue-500/10 to-cyan-500/10 dark:from-violet-500/15 dark:via-blue-500/10 dark:to-cyan-500/10 text-violet-600 dark:text-violet-300 border border-violet-500/20'
                              : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.04] hover:text-zinc-700 dark:hover:text-zinc-300 border border-transparent'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate leading-relaxed">{conv.title}</div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                              {formatConvTime(conv.updatedAt)}
                              {conv.messages.length > 0 && (
                                <span className="ml-1.5">· {conv.messages.length} 条消息</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConversation(conv.id);
                            }}
                            className="shrink-0 p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100 ml-1"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right Main Area: 对话内容 ── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Header — 简化：模型选择 + 关闭 */}
              <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-zinc-200/60 dark:border-white/[0.06] bg-zinc-50/80 dark:bg-white/[0.02]">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 flex items-center justify-center shrink-0 shadow-md shadow-violet-500/20">
                    <Bot size={14} className="text-white" />
                  </div>
                  {currentConfig && (
                    <select
                      value={currentConfigId}
                      onChange={(e) => handleConfigChange(e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded-lg
                                       bg-zinc-50 dark:bg-white/[0.04] hover:bg-zinc-100 dark:hover:bg-white/[0.06]
                                       border border-zinc-200/60 dark:border-white/[0.06]
                                       text-zinc-600 dark:text-zinc-400
                                       outline-none cursor-pointer
                                       focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30
                                       transition-all duration-200 max-w-[280px]"
                    >
                      {configs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.model}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  onClick={closePanel}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-all duration-200 shrink-0"
                  title="关闭面板"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Messages area */}
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Load more indicator — 向上滚动自动加载，也可手动点击 */}
                {hasMoreMessages && (
                  <div className="flex justify-center py-2">
                    <button
                      onClick={() => setVisibleCount((prev) => Math.min(prev + INITIAL_MESSAGE_COUNT, allMessages.length))}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-full bg-zinc-100/80 dark:bg-white/[0.04] hover:bg-zinc-200/80 dark:hover:bg-white/[0.08] border border-zinc-200/60 dark:border-white/[0.06] transition-all duration-200"
                    >
                      <Loader2 size={12} className="animate-spin" />
                      <span>加载更多 ({allMessages.length - visibleCount} 条)</span>
                    </button>
                  </div>
                )}
                {visibleMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 flex items-center justify-center mb-4 shadow-xl shadow-violet-500/25">
                      <Bot size={28} className="text-white" />
                    </div>
                    <p className="text-base font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                      AI 助手
                    </p>
                    <p className="text-[12px] text-zinc-500 max-w-[320px] mb-6 leading-relaxed">
                      输入消息开始对话，支持流式输出和代码渲染
                    </p>
                    <div className="flex flex-col gap-2.5 w-full max-w-[340px]">
                      {[
                        { icon: '💻', text: '帮我写一段代码' },
                        { icon: '📖', text: '解释这个概念' },
                        { icon: '🌐', text: '翻译成英文' },
                      ].map((item) => (
                        <button
                          key={item.text}
                          onClick={() => setInput(item.text)}
                          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl
                                                             bg-zinc-50 dark:bg-white/[0.04] hover:bg-zinc-100 dark:hover:bg-white/[0.07]
                                                             border border-zinc-200/60 dark:border-white/[0.06] hover:border-violet-500/20
                                                             text-left text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200
                                                             transition-all duration-200"
                        >
                          <span className="text-base">{item.icon}</span>
                          <span>{item.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {visibleMessages
                  .filter((msg) => msg.id !== 'streaming')
                  .map((msg) => {
                    const isUser = msg.role === 'user';
                    const msgTokens = estimateTokens(msg.content);
                    return (
                      <div key={msg.id} className="group w-full">
                        {/* 用户消息 — 右对齐气泡 + 下方操作栏 */}
                        {isUser ? (
                          <div className="flex flex-col items-end w-full">
                            <div className="max-w-[80%] bg-gradient-to-br from-zinc-100 via-zinc-50 to-white dark:from-zinc-700/90 dark:via-zinc-700/70 dark:to-zinc-800/90 text-zinc-800 dark:text-zinc-100 rounded-2xl rounded-br-md px-4 py-3 text-[13px] leading-relaxed border border-zinc-200/60 dark:border-white/[0.06] shadow-lg shadow-zinc-200/50 dark:shadow-black/20">
                              <Message role={msg.role} content={msg.content} />
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 mt-1 mr-1">
                              <MessageActionBar content={msg.content} isUser={true} />
                            </div>
                          </div>
                        ) : (
                          /* AI消息 — 全宽，微渐变背景 */
                          <div className="w-full px-4 py-3 bg-gradient-to-br from-zinc-50/80 via-violet-50/30 to-transparent dark:from-white/[0.03] dark:via-violet-500/[0.02] dark:to-transparent rounded-xl border border-zinc-200/40 dark:border-white/[0.03]">
                            <div className="max-w-[768px] mx-auto">
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 flex items-center justify-center shadow-sm shadow-violet-500/15">
                                  <Bot size={11} className="text-white" />
                                </div>
                                <span className="text-[11px] font-medium text-zinc-500">
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
                {isStreaming && allMessages[allMessages.length - 1]?.id === 'streaming' && (
                  <PanelStreamingMessage
                    content={allMessages[allMessages.length - 1].content}
                    reasoning={allMessages[allMessages.length - 1].reasoning}
                    isDark={isDark}
                  />
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* 输入区 — 亮/暗自适应 */}
              <div className="shrink-0 p-3 border-t border-zinc-200/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.01]">
                <div className="flex items-end gap-2 bg-zinc-50 dark:bg-white/[0.04] rounded-2xl border border-zinc-200/60 dark:border-white/[0.06] px-3 py-2 focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500/30 transition-all duration-300">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息..."
                    disabled={isStreaming}
                    rows={1}
                    className="flex-1 bg-transparent text-[13px] text-zinc-800 dark:text-zinc-200
                                                 resize-none outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600
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
                    className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-300 ${
                      isStreaming
                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/25'
                        : input.trim()
                          ? 'bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400 hover:from-violet-600 hover:via-blue-600 hover:to-cyan-500 text-white shadow-lg shadow-violet-500/25'
                          : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                    }`}
                  >
                    {isStreaming ? <X size={14} /> : <Send size={14} />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-600 px-1">
                  {retryInfo ? (
                    <span className="text-amber-500 truncate">
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
