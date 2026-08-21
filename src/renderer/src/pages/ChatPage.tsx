import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Message } from '@fauzitech/ai-ui';
// @ts-ignore
import '@fauzitech/ai-ui/styles.css';
import {
    Bot,
    User,
    Plus,
    Trash2,
    Settings,
    Send,
    Loader2,
    Coins,
    BarChart3,
    X,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    MessageSquare,
    Clock,
    Zap,
    Copy,
    Check,
    PanelRightOpen,
    PanelRightClose,
    MoreVertical,
} from 'lucide-react';

// ---------- 类型定义 ----------
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

interface TokenStats {
    totalInput: number;
    totalOutput: number;
    totalTokens: number;
    messageCount: number;
    avgTokensPerMessage: number;
}

// ---------- Token 估算 ----------
function estimateTokens(text: string): number {
    if (!text) return 0;
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars / 1.5) + Math.ceil(otherChars / 4);
}

// ---------- 日期格式化 ----------
function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ---------- 默认配置 ----------
const DEFAULT_CONFIGS: ModelConfig[] = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        token: '',
        headers: '',
        temperature: 0.7,
        max_tokens: 4096,
        top_p: 0.9,
    },
    {
        id: 'gitee',
        name: 'Gitee AI (Qwen3-8B)',
        baseURL: 'https://ai.gitee.com/v1',
        model: 'Qwen3-8B',
        token: '',
        headers: '{"X-Failover-Enabled":"true"}',
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 0.7,
    },
    {
        id: 'zhipu',
        name: '智谱 GLM-4',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4',
        token: '',
        headers: '',
        temperature: 0.8,
        max_tokens: 4096,
        top_p: 0.95,
    },
];

// ---------- 加载动画 ----------
function LoadingDots() {
    return (
        <span className="inline-flex gap-1.5 items-center py-1">
            <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" />
        </span>
    );
}

// ---------- 思考面板 ----------
function ThinkingPanel({ reasoning }: { reasoning: string }) {
    const [expanded, setExpanded] = useState(false);
    if (!reasoning) return null;

    return (
        <div className="mb-2 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 transition"
            >
                <span className="text-sm">🧠</span>
                <span>思考过程</span>
                <span className="text-zinc-400 dark:text-zinc-500">({reasoning.length} 字符)</span>
                <span className="ml-auto text-xs">{expanded ? '▼' : '▶'}</span>
            </button>
            {expanded && (
                <div className="px-3 py-2 bg-zinc-50/50 dark:bg-zinc-800/50 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto leading-relaxed">
                    {reasoning}
                </div>
            )}
        </div>
    );
}

// ---------- 侧栏：会话列表 ----------
function ConversationSidebar({
    conversations,
    currentId,
    onSelect,
    onNew,
    onDelete,
}: {
    conversations: Conversation[];
    currentId: string;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
}) {
    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 px-3 py-3 border-b border-[var(--color-border)]">
                <button
                    onClick={onNew}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                >
                    <Plus size={16} />
                    新建会话
                </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
                {conversations.length === 0 && (
                    <div className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500 text-sm">
                        <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
                        暂无会话
                    </div>
                )}
                {conversations.map((conv) => (
                    <div
                        key={conv.id}
                        onClick={() => onSelect(conv.id)}
                        className={`group flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-all ${
                            currentId === conv.id
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                    >
                        <MessageSquare size={15} className="shrink-0 opacity-50" />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{conv.title}</div>
                            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                                {conv.messages.length} 条消息 · {formatTime(conv.updatedAt)}
                            </div>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(conv.id);
                            }}
                            className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ---------- 侧栏：Token 统计 ----------
function TokenStatsPanel({ stats, messages }: { stats: TokenStats; messages: ChatMessage[] }) {
    const [copied, setCopied] = useState(false);

    const costEstimate = useMemo(() => {
        const outputCost = (stats.totalOutput / 1_000_000) * 2;
        const inputCost = (stats.totalInput / 1_000_000) * 0.5;
        return { inputCost, outputCost, totalCost: inputCost + outputCost };
    }, [stats]);

    const copyStats = useCallback(() => {
        const text = `Token 统计
输入: ${stats.totalInput.toLocaleString()}
输出: ${stats.totalOutput.toLocaleString()}
总计: ${stats.totalTokens.toLocaleString()}
消息: ${stats.messageCount}
平均/消息: ${stats.avgTokensPerMessage}
费用: $${costEstimate.totalCost.toFixed(4)}`;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [stats, costEstimate]);

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                        <BarChart3 size={15} className="text-blue-500" />
                        Token 统计
                    </h3>
                    <button
                        onClick={copyStats}
                        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
                        title="复制统计"
                    >
                        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {/* 总览 */}
                <div className="space-y-2">
                    <StatCard
                        icon={<Coins size={14} className="text-blue-500" />}
                        label="输入 Tokens"
                        value={stats.totalInput.toLocaleString()}
                        color="blue"
                    />
                    <StatCard
                        icon={<Zap size={14} className="text-amber-500" />}
                        label="输出 Tokens"
                        value={stats.totalOutput.toLocaleString()}
                        color="amber"
                    />
                    <StatCard
                        icon={<Sparkles size={14} className="text-purple-500" />}
                        label="总计 Tokens"
                        value={stats.totalTokens.toLocaleString()}
                        color="purple"
                        highlight
                    />
                </div>

                {/* 会话信息 */}
                <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                    <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">会话信息</h4>
                    <div className="space-y-1.5">
                        <InfoRow label="消息数" value={String(stats.messageCount)} />
                        <InfoRow label="平均/消息" value={String(stats.avgTokensPerMessage)} />
                    </div>
                </div>

                {/* 费用估算 */}
                <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                    <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">费用估算</h4>
                    <div className="surface-card rounded-lg p-3 space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-zinc-500 dark:text-zinc-400">输入</span>
                            <span className="font-mono text-zinc-700 dark:text-zinc-300">${costEstimate.inputCost.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-zinc-500 dark:text-zinc-400">输出</span>
                            <span className="font-mono text-zinc-700 dark:text-zinc-300">${costEstimate.outputCost.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between text-xs font-medium pt-1 border-t border-[var(--color-border)]">
                            <span className="text-zinc-700 dark:text-zinc-200">合计</span>
                            <span className="font-mono text-blue-600 dark:text-blue-400">${costEstimate.totalCost.toFixed(4)}</span>
                        </div>
                    </div>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
                        基于 DeepSeek 定价估算（输入 $0.50/M，输出 $2.00/M）
                    </p>
                </div>

                {/* 每条消息的 Token 使用 */}
                {messages.filter(m => m.tokenUsage).length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                        <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">逐条明细</h4>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {messages
                                .filter((m) => m.tokenUsage)
                                .slice(-20)
                                .map((m, i) => (
                                    <div key={m.id} className="flex items-center gap-2 text-[11px]">
                                        <span className={`shrink-0 w-1 h-1 rounded-full ${m.role === 'user' ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                                        <span className="text-zinc-400 dark:text-zinc-500 shrink-0">
                                            {m.role === 'user' ? '用户' : 'AI'}
                                        </span>
                                        <span className="flex-1 truncate text-zinc-500 dark:text-zinc-400">
                                            {m.content.slice(0, 30)}...
                                        </span>
                                        <span className="font-mono text-zinc-600 dark:text-zinc-300 shrink-0">
                                            {m.tokenUsage?.total}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, color, highlight }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    color: string;
    highlight?: boolean;
}) {
    const colorMap: Record<string, string> = {
        blue: 'from-blue-500/10 to-blue-600/5 dark:from-blue-500/20 dark:to-blue-600/10',
        amber: 'from-amber-500/10 to-amber-600/5 dark:from-amber-500/20 dark:to-amber-600/10',
        purple: 'from-purple-500/10 to-purple-600/5 dark:from-purple-500/20 dark:to-purple-600/10',
    };
    return (
        <div className={`bg-gradient-to-r ${colorMap[color] || colorMap.blue} rounded-lg px-3 py-2.5 ${highlight ? 'ring-1 ring-purple-200 dark:ring-purple-800' : ''}`}>
            <div className="flex items-center gap-2 mb-1">
                {icon}
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
            </div>
            <div className="text-lg font-bold text-zinc-800 dark:text-zinc-100 font-mono">{value}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">{value}</span>
        </div>
    );
}

// ---------- 模型配置抽屉 ----------
function ConfigDrawer({
    open,
    onClose,
    configs,
    currentConfigId,
    onSelectConfig,
    onSaveConfig,
    onDeleteConfig,
}: {
    open: boolean;
    onClose: () => void;
    configs: ModelConfig[];
    currentConfigId: string;
    onSelectConfig: (id: string) => void;
    onSaveConfig: (config: ModelConfig, isNew: boolean) => void;
    onDeleteConfig: (id: string) => void;
}) {
    const [editing, setEditing] = useState<ModelConfig | null>(null);
    const [formData, setFormData] = useState<Partial<ModelConfig>>({});

    const openNew = () => {
        setEditing(null);
        setFormData({ name: '', baseURL: '', model: '', token: '', headers: '', temperature: 0.7, max_tokens: 4096, top_p: 0.9 });
    };

    const openEdit = (c: ModelConfig) => {
        setEditing(c);
        setFormData({ ...c });
    };

    const save = () => {
        if (!formData.name || !formData.baseURL || !formData.model) return;
        if (formData.headers?.trim()) {
            try { JSON.parse(formData.headers); } catch { return; }
        }
        const config: ModelConfig = {
            id: editing?.id || crypto.randomUUID(),
            name: formData.name!,
            baseURL: formData.baseURL!,
            model: formData.model!,
            token: formData.token || '',
            headers: formData.headers || '',
            temperature: formData.temperature ?? 0.7,
            max_tokens: formData.max_tokens ?? 4096,
            top_p: formData.top_p ?? 0.9,
        };
        onSaveConfig(config, !editing);
        setEditing(null);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative ml-auto w-[400px] h-full surface-elevated shadow-2xl flex flex-col animate-slide-in-right">
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
                    <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                        <Settings size={16} />
                        模型配置
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* 配置列表 */}
                    <div className="px-4 py-3 space-y-1">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">已保存的配置</span>
                            <button onClick={openNew} className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium">
                                + 新增
                            </button>
                        </div>
                        {configs.map((c) => (
                            <div
                                key={c.id}
                                onClick={() => onSelectConfig(c.id)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition ${
                                    currentConfigId === c.id
                                        ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-200 dark:ring-blue-800'
                                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                }`}
                            >
                                <div className={`w-2 h-2 rounded-full shrink-0 ${currentConfigId === c.id ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{c.name}</div>
                                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{c.model}</div>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                >
                                    编辑
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDeleteConfig(c.id); }}
                                    className="text-xs text-zinc-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                    删除
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* 编辑表单 */}
                    {editing !== null && (
                        <div className="px-4 py-3 border-t border-[var(--color-border)] space-y-3">
                            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                                <span>{editing ? '编辑配置' : '新增配置'}</span>
                                <button onClick={() => setEditing(null)} className="text-zinc-400 hover:text-zinc-600">
                                    <X size={14} />
                                </button>
                            </div>
                            <InputField label="名称" placeholder="如 DeepSeek" value={formData.name || ''} onChange={(v) => setFormData({ ...formData, name: v })} />
                            <InputField label="API 地址" placeholder="https://api.deepseek.com" value={formData.baseURL || ''} onChange={(v) => setFormData({ ...formData, baseURL: v })} />
                            <InputField label="模型" placeholder="deepseek-chat" value={formData.model || ''} onChange={(v) => setFormData({ ...formData, model: v })} />
                            <InputField label="API Key" placeholder="留空则使用环境变量" value={formData.token || ''} onChange={(v) => setFormData({ ...formData, token: v })} type="password" />
                            <div>
                                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">自定义 Headers</label>
                                <textarea
                                    placeholder='{"X-Custom":"value"}'
                                    value={formData.headers || ''}
                                    onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                                    rows={2}
                                    className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 font-mono resize-none outline-none focus:border-blue-400"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <NumberField label="Temperature" step={0.1} min={0} max={2} value={formData.temperature ?? 0.7} onChange={(v) => setFormData({ ...formData, temperature: v })} />
                                <NumberField label="Max Tokens" step={256} min={256} value={formData.max_tokens ?? 4096} onChange={(v) => setFormData({ ...formData, max_tokens: v })} />
                                <NumberField label="Top P" step={0.05} min={0} max={1} value={formData.top_p ?? 0.9} onChange={(v) => setFormData({ ...formData, top_p: v })} />
                            </div>
                            <button
                                onClick={save}
                                className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition"
                            >
                                保存
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function InputField({ label, placeholder, value, onChange, type = 'text' }: {
    label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string;
}) {
    return (
        <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">{label}</label>
            <input
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400"
            />
        </div>
    );
}

function NumberField({ label, step, min, max, value, onChange }: {
    label: string; step: number; min: number; max?: number; value: number; onChange: (v: number) => void;
}) {
    return (
        <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">{label}</label>
            <input
                type="number"
                step={step}
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400 font-mono"
            />
        </div>
    );
}

// ========== 主组件 ==========
export default function ChatPage() {
    // 配置
    const [configs, setConfigs] = useState<ModelConfig[]>(() => {
        const saved = localStorage.getItem('chatModelConfigs');
        return saved ? JSON.parse(saved) : DEFAULT_CONFIGS;
    });
    const [currentConfigId, setCurrentConfigId] = useState(() => {
        return localStorage.getItem('chatCurrentConfigId') || configs[0]?.id || '';
    });
    const [showConfigDrawer, setShowConfigDrawer] = useState(false);

    // 会话
    const [conversations, setConversations] = useState<Conversation[]>(() => {
        const saved = localStorage.getItem('chatConversations');
        return saved ? JSON.parse(saved) : [];
    });
    const [currentConvId, setCurrentConvId] = useState(() => {
        return localStorage.getItem('chatCurrentConvId') || '';
    });

    // 聊天
    const [isStreaming, setIsStreaming] = useState(false);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // UI
    const [showStats, setShowStats] = useState(true);
    const [showSidebar, setShowSidebar] = useState(true);

    const currentConfig = configs.find((c) => c.id === currentConfigId) || configs[0];
    const currentConv = conversations.find((c) => c.id === currentConvId);
    const messages = currentConv?.messages || [];

    // Token 统计
    const tokenStats = useMemo<TokenStats>(() => {
        let totalInput = 0;
        let totalOutput = 0;
        let messageCount = 0;
        for (const m of messages) {
            if (m.tokenUsage) {
                totalInput += m.tokenUsage.input;
                totalOutput += m.tokenUsage.output;
            }
            messageCount++;
        }
        return {
            totalInput,
            totalOutput,
            totalTokens: totalInput + totalOutput,
            messageCount,
            avgTokensPerMessage: messageCount > 0 ? Math.round((totalInput + totalOutput) / messageCount) : 0,
        };
    }, [messages]);

    // 持久化
    useEffect(() => { localStorage.setItem('chatModelConfigs', JSON.stringify(configs)); }, [configs]);
    useEffect(() => { localStorage.setItem('chatCurrentConfigId', currentConfigId); }, [currentConfigId]);
    useEffect(() => { localStorage.setItem('chatConversations', JSON.stringify(conversations)); }, [conversations]);
    useEffect(() => { localStorage.setItem('chatCurrentConvId', currentConvId); }, [currentConvId]);

    // 自动滚动
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 监听流式事件
    useEffect(() => {
        if (!window.ai) return;

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
                                    tokenUsage: { input: last.tokenUsage?.input || 0, output: outputTokens, total: (last.tokenUsage?.input || 0) + outputTokens },
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
    }, [currentConvId]);

    // 新建会话
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
    }, [currentConfigId]);

    // 删除会话
    const deleteConversation = useCallback((id: string) => {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (currentConvId === id) {
            setCurrentConvId('');
        }
    }, [currentConvId]);

    // 发送
    const handleSend = async () => {
        if (!input.trim() || isStreaming || !currentConfig) return;

        let convId = currentConvId;
        let conv = conversations.find((c) => c.id === convId);

        // 自动创建会话
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

        // 计算输入 token
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

        // 更新标题
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

    // 配置操作
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
        setConfigs((prev) => prev.filter((c) => c.id !== id));
        if (currentConfigId === id) setCurrentConfigId(configs[0]?.id || '');
    };

    return (
        <div className="h-full overflow-hidden flex bg-white/50 dark:bg-zinc-900/50">
            {/* 左侧：会话列表 */}
            {showSidebar && (
                <div className="shrink-0 w-[240px] h-full border-r border-[var(--color-border)] surface-card">
                    <ConversationSidebar
                        conversations={conversations}
                        currentId={currentConvId}
                        onSelect={setCurrentConvId}
                        onNew={newConversation}
                        onDelete={deleteConversation}
                    />
                </div>
            )}

            {/* 中间：聊天区 */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
                {/* 顶部栏 */}
                <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] surface-card">
                    <button
                        onClick={() => setShowSidebar(!showSidebar)}
                        className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition"
                        title="切换侧栏"
                    >
                        {showSidebar ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                    </button>

                    <select
                        value={currentConfigId}
                        onChange={(e) => setCurrentConfigId(e.target.value)}
                        className="flex-1 max-w-[260px] px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400 cursor-pointer"
                    >
                        {configs.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} — {c.model}</option>
                        ))}
                    </select>

                    <button
                        onClick={() => setShowConfigDrawer(true)}
                        className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition"
                        title="模型配置"
                    >
                        <Settings size={16} />
                    </button>

                    <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />

                    <button
                        onClick={() => setShowStats(!showStats)}
                        className={`p-1.5 rounded-lg transition ${showStats ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}
                        title="Token 统计"
                    >
                        {showStats ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                    </button>
                </div>

                {/* 消息列表 */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
                                <Bot size={28} className="text-white" />
                            </div>
                            <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200 mb-2">AI 对话助手</h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
                                选择模型配置，输入消息开始对话。支持流式输出、思考过程展示和 Token 用量统计。
                            </p>
                        </div>
                    )}

                    {messages.map((msg) => {
                        const isUser = msg.role === 'user';
                        return (
                            <div key={msg.id} className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${
                                    isUser
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gradient-to-br from-zinc-600 to-zinc-700 dark:from-zinc-500 dark:to-zinc-600 text-white'
                                }`}>
                                    {isUser ? <User size={15} /> : <Bot size={15} />}
                                </div>

                                <div className={`max-w-[75%] space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
                                    {!isUser && msg.reasoning && <ThinkingPanel reasoning={msg.reasoning} />}
                                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                        isUser
                                            ? 'bg-blue-500 text-white rounded-br-md'
                                            : 'surface-card text-zinc-800 dark:text-zinc-200 rounded-bl-md'
                                    }`}>
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

                    {isStreaming && messages[messages.length - 1]?.id === 'streaming' && (
                        <div className="flex items-start gap-3">
                            <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-700 dark:from-zinc-500 dark:to-zinc-600 flex items-center justify-center text-white shadow-sm">
                                <Bot size={15} />
                            </div>
                            <div className="surface-card rounded-2xl rounded-bl-md px-4 py-3">
                                <LoadingDots />
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* 输入区 */}
                <div className="shrink-0 px-4 py-3 border-t border-[var(--color-border)] surface-card">
                    <div className="flex items-end gap-2 max-w-4xl mx-auto">
                        <div className="flex-1 relative">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                                disabled={isStreaming}
                                rows={1}
                                className="w-full px-4 py-2.5 pr-12 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400 resize-none disabled:opacity-50 min-h-[42px] max-h-[120px]"
                                style={{ height: 'auto' }}
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                                }}
                            />
                        </div>
                        <button
                            onClick={handleSend}
                            disabled={isStreaming || !input.trim()}
                            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white transition shadow-sm"
                        >
                            {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
                        </button>
                    </div>
                    <div className="max-w-4xl mx-auto mt-1.5 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
                        <span>
                            {currentConfig ? `${currentConfig.name} · ${currentConfig.model}` : '未选择模型'}
                        </span>
                        <span>
                            {tokenStats.totalTokens > 0 && `${tokenStats.totalTokens.toLocaleString()} tokens`}
                        </span>
                    </div>
                </div>
            </div>

            {/* 右侧：Token 统计 */}
            {showStats && (
                <div className="shrink-0 w-[260px] h-full border-l border-[var(--color-border)] surface-card">
                    <TokenStatsPanel stats={tokenStats} messages={messages} />
                </div>
            )}

            {/* 配置抽屉 */}
            <ConfigDrawer
                open={showConfigDrawer}
                onClose={() => setShowConfigDrawer(false)}
                configs={configs}
                currentConfigId={currentConfigId}
                onSelectConfig={(id) => { setCurrentConfigId(id); setShowConfigDrawer(false); }}
                onSaveConfig={handleSaveConfig}
                onDeleteConfig={handleDeleteConfig}
            />
        </div>
    );
}
