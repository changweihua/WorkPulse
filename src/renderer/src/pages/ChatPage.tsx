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
    Eye,
    EyeOff,
    Download,
    Upload,
    CheckCircle,
    AlertCircle,
    RefreshCw,
    Key,
    Server,
    Thermometer,
    Hash,
    FileJson,
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

// ---------- 供应商预设 ----------
interface ProviderPreset {
    id: string;
    name: string;
    icon: string;
    baseURL: string;
    models: string[];
    defaultModel: string;
    maxTokens: number;
    description: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
    { id: 'deepseek', name: 'DeepSeek', icon: '🐋', baseURL: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'], defaultModel: 'deepseek-chat', maxTokens: 4096, description: '高性价比，支持推理' },
    { id: 'openai', name: 'OpenAI', icon: '🤖', baseURL: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'], defaultModel: 'gpt-4o-mini', maxTokens: 4096, description: 'GPT 系列模型' },
    { id: 'anthropic', name: 'Anthropic', icon: '🧠', baseURL: 'https://api.anthropic.com', models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'], defaultModel: 'claude-sonnet-4-20250514', maxTokens: 4096, description: 'Claude 系列模型' },
    { id: 'zhipu', name: '智谱 AI', icon: '🔮', baseURL: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4', 'glm-4-flash', 'glm-4-air'], defaultModel: 'glm-4', maxTokens: 4096, description: 'GLM 系列模型' },
    { id: 'moonshot', name: 'Moonshot', icon: '🌙', baseURL: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], defaultModel: 'moonshot-v1-8k', maxTokens: 4096, description: '月之暗面 Kimi' },
    { id: 'qwen', name: '通义千问', icon: '☁️', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-turbo', 'qwen-max'], defaultModel: 'qwen-plus', maxTokens: 4096, description: '阿里云通义系列' },
    { id: 'gitee', name: 'Gitee AI', icon: '🐙', baseURL: 'https://ai.gitee.com/v1', models: ['Qwen3-8B', 'DeepSeek-R1', 'GLM-4-9B'], defaultModel: 'Qwen3-8B', maxTokens: 2048, description: 'Gitee 开源模型' },
    { id: 'ollama', name: 'Ollama (本地)', icon: '🦙', baseURL: 'http://localhost:11434/v1', models: ['llama3', 'qwen2', 'mistral', 'codellama'], defaultModel: 'llama3', maxTokens: 4096, description: '本地部署模型' },
    { id: 'custom', name: '自定义', icon: '⚙️', baseURL: '', models: [], defaultModel: '', maxTokens: 4096, description: '自定义 API 地址' },
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
                className="w-full px-3 py-1.5 surface-card hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 transition"
            >
                <span className="text-sm">🧠</span>
                <span>思考过程</span>
                <span className="text-zinc-400 dark:text-zinc-500">({reasoning.length} 字符)</span>
                <span className="ml-auto text-xs">{expanded ? '▼' : '▶'}</span>
            </button>
            {expanded && (
                                <div className="px-3 py-2 surface-inset text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto leading-relaxed">
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
            <div className="flex-1 overflow-y-auto py-2 space-y-1.5">
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
    const [activeTab, setActiveTab] = useState<'list' | 'edit'>('list');
    const [showKey, setShowKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [importMode, setImportMode] = useState(false);
    const [importJson, setImportJson] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const validate = (data: Partial<ModelConfig>): string[] => {
        const errors: string[] = [];
        if (!data.name?.trim()) errors.push('名称不能为空');
        if (!data.baseURL?.trim()) errors.push('API 地址不能为空');
        if (!data.model?.trim()) errors.push('模型名称不能为空');
        if (data.baseURL?.trim() && !/^https?:\/\//.test(data.baseURL.trim()) && !/^https?:\/\/localhost/.test(data.baseURL.trim())) {
            errors.push('API 地址格式不正确（需要 http:// 或 https://）');
        }
        if (data.headers?.trim()) {
            try { JSON.parse(data.headers); } catch { errors.push('自定义 Headers JSON 格式错误'); }
        }
        return errors;
    };

    const openNew = (presetId?: string) => {
        setEditing(null);
        setShowKey(false);
        setTestResult(null);
        setValidationErrors([]);
        setShowAdvanced(false);
        if (presetId) {
            const preset = PROVIDER_PRESETS.find((p) => p.id === presetId);
            if (preset) {
                setFormData({
                    name: preset.name,
                    baseURL: preset.baseURL,
                    model: preset.defaultModel,
                    token: '',
                    headers: '',
                    temperature: 0.7,
                    max_tokens: preset.maxTokens,
                    top_p: 0.9,
                });
            }
        } else {
            setFormData({ name: '', baseURL: '', model: '', token: '', headers: '', temperature: 0.7, max_tokens: 4096, top_p: 0.9 });
        }
        setActiveTab('edit');
    };

    const openEdit = (c: ModelConfig) => {
        setEditing(c);
        setFormData({ ...c });
        setShowKey(false);
        setTestResult(null);
        setValidationErrors([]);
        setShowAdvanced(false);
        setActiveTab('edit');
    };

    const duplicateConfig = (c: ModelConfig) => {
        const newConfig: ModelConfig = {
            ...c,
            id: crypto.randomUUID(),
            name: `${c.name} (副本)`,
        };
        onSaveConfig(newConfig, true);
    };

    const testConnection = async () => {
        if (!formData.baseURL?.trim()) {
            setTestResult({ ok: false, msg: '请填写 API 地址' });
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            const url = formData.baseURL.trim().replace(/\/+$/, '') + '/models';
            const headers: Record<string, string> = {};
            if (formData.token) headers['Authorization'] = `Bearer ${formData.token}`;
            if (formData.headers?.trim()) {
                try {
                    const custom = JSON.parse(formData.headers);
                    Object.assign(headers, custom);
                } catch { /* ignore */ }
            }
            const resp = await fetch(url, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(10000),
            });
            if (resp.ok) {
                const data = await resp.json().catch(() => null);
                const modelCount = data?.data?.length;
                setTestResult({ ok: true, msg: `连接成功 (${resp.status})${modelCount ? `，发现 ${modelCount} 个模型` : ''}` });
            } else {
                const text = await resp.text().catch(() => '');
                setTestResult({ ok: false, msg: `HTTP ${resp.status}: ${text.slice(0, 120)}` });
            }
        } catch (e: any) {
            setTestResult({ ok: false, msg: e?.name === 'TimeoutError' ? '连接超时 (10s)' : `连接失败: ${e?.message || e}` });
        } finally {
            setTesting(false);
        }
    };

    const save = () => {
        const errors = validate(formData);
        setValidationErrors(errors);
        if (errors.length > 0) return;
        const config: ModelConfig = {
            id: editing?.id || crypto.randomUUID(),
            name: formData.name!.trim(),
            baseURL: formData.baseURL!.trim(),
            model: formData.model!.trim(),
            token: formData.token || '',
            headers: formData.headers || '',
            temperature: formData.temperature ?? 0.7,
            max_tokens: formData.max_tokens ?? 4096,
            top_p: formData.top_p ?? 0.9,
        };
        onSaveConfig(config, !editing);
        setActiveTab('list');
        setEditing(null);
    };

    const exportConfigs = () => {
        const json = JSON.stringify(configs, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workpulse-models-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const importConfigs = () => {
        try {
            const parsed = JSON.parse(importJson);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            let count = 0;
            for (const item of arr) {
                if (item.name && item.baseURL && item.model) {
                    onSaveConfig({
                        id: item.id || crypto.randomUUID(),
                        name: item.name,
                        baseURL: item.baseURL,
                        model: item.model,
                        token: item.token || '',
                        headers: item.headers || '',
                        temperature: item.temperature ?? 0.7,
                        max_tokens: item.max_tokens ?? 4096,
                        top_p: item.top_p ?? 0.9,
                    }, true);
                    count++;
                }
            }
            setImportMode(false);
            setImportJson('');
            if (count > 0) alert(`成功导入 ${count} 个配置`);
        } catch {
            alert('JSON 格式错误');
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative ml-auto w-[440px] h-full surface-elevated shadow-2xl flex flex-col animate-slide-in-right">
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
                    <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                        <Settings size={16} />
                        {activeTab === 'edit' ? (editing ? '编辑模型' : '新增模型') : '模型管理'}
                    </h3>
                    <div className="flex items-center gap-1">
                        {activeTab === 'edit' && (
                            <button onClick={() => { setActiveTab('list'); setEditing(null); }} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition" title="返回列表">
                                <ChevronLeft size={16} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'list' ? (
                        <>
                            {/* 工具栏 */}
                            <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--color-border)]">
                                <button onClick={() => openNew()} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition shadow-sm">
                                    <Plus size={15} />
                                    手动新增
                                </button>
                                <button onClick={() => setImportMode(true)} className="flex items-center gap-1.5 px-3 py-2.5 border border-zinc-200 dark:border-zinc-700 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition">
                                    <Upload size={14} />
                                    导入
                                </button>
                                <button onClick={exportConfigs} className="flex items-center gap-1.5 px-3 py-2.5 border border-zinc-200 dark:border-zinc-700 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition">
                                    <Download size={14} />
                                    导出
                                </button>
                            </div>

                            {/* 供应商预设 */}
                            <div className="px-4 py-3 border-b border-[var(--color-border)]">
                                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2.5">快速新增（供应商模板）</div>
                                <div className="grid grid-cols-3 gap-2">
                                    {PROVIDER_PRESETS.filter((p) => p.id !== 'custom').map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => openNew(preset.id)}
                                            className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-center group"
                                        >
                                            <span className="text-xl group-hover:scale-110 transition-transform">{preset.icon}</span>
                                            <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 leading-tight">{preset.name}</span>
                                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-tight">{preset.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 已保存配置列表 */}
                            <div className="px-4 py-3 space-y-1.5">
                                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">已保存的配置 ({configs.length})</div>
                                {configs.length === 0 && (
                                    <div className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-sm">暂无配置，点击上方按钮添加</div>
                                )}
                                {configs.map((c) => {
                                    const preset = PROVIDER_PRESETS.find((p) => c.baseURL.includes(p.baseURL.replace(/https?:\/\//, '')));
                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => onSelectConfig(c.id)}
                                            className={`group flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all ${
                                                currentConfigId === c.id
                                                    ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-200 dark:ring-blue-800'
                                                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                            }`}
                                        >
                                            <span className="text-xl shrink-0">{preset?.icon || '⚙️'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{c.name}</span>
                                                    {currentConfigId === c.id && (
                                                        <span className="shrink-0 px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-medium rounded-full">使用中</span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                                                    {c.model} · {c.baseURL.replace(/https?:\/\//, '').slice(0, 35)}
                                                </div>
                                                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 flex items-center gap-2">
                                                    <span className="flex items-center gap-0.5">
                                                        <Key size={9} />
                                                        {c.token ? '已设置' : '未设置'}
                                                    </span>
                                                    <span className="flex items-center gap-0.5">
                                                        <Thermometer size={9} />
                                                        {c.temperature}
                                                    </span>
                                                    <span className="flex items-center gap-0.5">
                                                        <Hash size={9} />
                                                        {c.max_tokens}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); duplicateConfig(c); }}
                                                    className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
                                                    title="复制配置"
                                                >
                                                    <Copy size={13} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                                                    className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
                                                    title="编辑"
                                                >
                                                    <Settings size={13} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (confirm(`确定删除「${c.name}」？`)) onDeleteConfig(c.id); }}
                                                    className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition"
                                                    title="删除"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 导入弹窗 */}
                            {importMode && (
                                <div className="px-4 py-3 border-t border-[var(--color-border)] space-y-3 surface-inset">
                                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5"><FileJson size={13} /> 导入配置 (JSON)</span>
                                        <button onClick={() => setImportMode(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"><X size={14} /></button>
                                    </div>
                                    <textarea
                                        value={importJson}
                                        onChange={(e) => setImportJson(e.target.value)}
                                        placeholder={'[\n  {"name":"My API", "baseURL":"https://...", "model":"gpt-4o", "token":"sk-..."}\n]'}
                                        rows={6}
                                        className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 font-mono resize-none outline-none focus:border-blue-400"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={importConfigs} className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition flex items-center justify-center gap-1.5">
                                            <Upload size={13} /> 确认导入
                                        </button>
                                        <button onClick={() => setImportMode(false)} className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
                                            取消
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        /* 编辑表单 */
                        <div className="px-5 py-4 space-y-4">
                            {/* 验证错误 */}
                            {validationErrors.length > 0 && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg space-y-1">
                                    {validationErrors.map((err, i) => (
                                        <div key={i} className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                                            <AlertCircle size={12} />
                                            {err}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 基础信息 */}
                            <div className="space-y-3">
                                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                                    <Server size={12} /> 基础信息
                                </div>
                                <InputField label="名称" placeholder="如 DeepSeek" value={formData.name || ''} onChange={(v) => setFormData({ ...formData, name: v })} />
                                <InputField label="API 地址" placeholder="https://api.deepseek.com" value={formData.baseURL || ''} onChange={(v) => setFormData({ ...formData, baseURL: v })} />
                                <div>
                                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">模型</label>
                                    <input
                                        type="text"
                                        placeholder="deepseek-chat"
                                        value={formData.model || ''}
                                        onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                                        list={`model-list-${editing?.id || 'new'}`}
                                        className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400"
                                    />
                                    <datalist id={`model-list-${editing?.id || 'new'}`}>
                                        {PROVIDER_PRESETS.flatMap((p) => p.models.map((m) => (
                                            <option key={`${p.id}-${m}`} value={m} />
                                        )))}
                                    </datalist>
                                </div>
                            </div>

                            {/* API Key */}
                            <div className="space-y-3">
                                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                                    <Key size={12} /> 认证
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">API Key</label>
                                    <div className="relative">
                                        <input
                                            type={showKey ? 'text' : 'password'}
                                            placeholder="sk-... 或留空使用环境变量"
                                            value={formData.token || ''}
                                            onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                                            className="w-full px-3 py-2 pr-10 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-blue-400 font-mono"
                                        />
                                        <button
                                            onClick={() => setShowKey(!showKey)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 transition"
                                        >
                                            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">自定义 Headers (JSON)</label>
                                    <textarea
                                        placeholder='{"X-Custom":"value"}'
                                        value={formData.headers || ''}
                                        onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                                        rows={2}
                                        className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 font-mono resize-none outline-none focus:border-blue-400"
                                    />
                                </div>
                            </div>

                            {/* 测试连接 */}
                            <div className="p-3 surface-inset rounded-lg border border-zinc-200/50 dark:border-zinc-700/50">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">连接测试</span>
                                    <button
                                        onClick={testConnection}
                                        disabled={testing}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg surface-card border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition disabled:opacity-50"
                                    >
                                        <RefreshCw size={12} className={testing ? 'animate-spin' : ''} />
                                        {testing ? '测试中...' : '测试连接'}
                                    </button>
                                </div>
                                {testResult && (
                                    <div className={`flex items-start gap-1.5 text-xs ${testResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                        {testResult.ok ? <CheckCircle size={12} className="shrink-0 mt-0.5" /> : <AlertCircle size={12} className="shrink-0 mt-0.5" />}
                                        <span className="break-all">{testResult.msg}</span>
                                    </div>
                                )}
                            </div>

                            {/* 高级参数 */}
                            <div className="space-y-3">
                                <button
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition"
                                >
                                    <Zap size={12} />
                                    高级参数
                                    <ChevronRight size={12} className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                                </button>
                                {showAdvanced && (
                                    <div className="grid grid-cols-3 gap-3 p-3 surface-inset rounded-lg border border-zinc-200/50 dark:border-zinc-700/50">
                                        <NumberField label="Temperature" step={0.1} min={0} max={2} value={formData.temperature ?? 0.7} onChange={(v) => setFormData({ ...formData, temperature: v })} />
                                        <NumberField label="Max Tokens" step={256} min={256} value={formData.max_tokens ?? 4096} onChange={(v) => setFormData({ ...formData, max_tokens: v })} />
                                        <NumberField label="Top P" step={0.05} min={0} max={1} value={formData.top_p ?? 0.9} onChange={(v) => setFormData({ ...formData, top_p: v })} />
                                    </div>
                                )}
                            </div>

                            {/* 保存按钮 */}
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => { setActiveTab('list'); setEditing(null); setValidationErrors([]); }}
                                    className="flex-1 py-2.5 border border-zinc-200 dark:border-zinc-700 text-sm font-medium rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={save}
                                    className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition shadow-sm flex items-center justify-center gap-1.5"
                                >
                                    <Check size={15} />
                                    {editing ? '保存修改' : '创建配置'}
                                </button>
                            </div>
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
        try {
            const saved = localStorage.getItem('chatModelConfigs');
            return saved ? JSON.parse(saved) : DEFAULT_CONFIGS;
        } catch {
            return DEFAULT_CONFIGS;
        }
    });
    const [currentConfigId, setCurrentConfigId] = useState(() => {
        return localStorage.getItem('chatCurrentConfigId') || configs[0]?.id || '';
    });
    const [showConfigDrawer, setShowConfigDrawer] = useState(false);

    // 会话
    const [conversations, setConversations] = useState<Conversation[]>(() => {
        try {
            const saved = localStorage.getItem('chatConversations');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
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

    // 持久化 — tokens 存储到 main process 加密存储，localStorage 只存脱敏版本
    useEffect(() => {
        // Save tokens to encrypted storage via IPC
        configs.forEach((config) => {
            if (config.token && window.ai?.saveLLMToken) {
                window.ai.saveLLMToken(config.id, config.token);
            }
        });
        // Strip tokens before saving to localStorage (security)
        const stripped = configs.map(({ token: _, ...rest }) => ({ ...rest, token: '' }));
        localStorage.setItem('chatModelConfigs', JSON.stringify(stripped));
    }, [configs]);
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
        // Clean up encrypted token
        if (window.ai?.deleteLLMToken) {
            window.ai.deleteLLMToken(id);
        }
        setConfigs((prev) => prev.filter((c) => c.id !== id));
        if (currentConfigId === id) setCurrentConfigId(configs[0]?.id || '');
    };

    return (
        <div className="h-full overflow-hidden flex gap-4 surface-card">
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

                                <div className={`max-w-[75%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
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
