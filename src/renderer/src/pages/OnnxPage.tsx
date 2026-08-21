// src/renderer/src/pages/OnnxPage.tsx
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
    useONNXModel,
    getModelsByGroup,
    MODEL_GROUPS,
    ModelGroupId,
} from '../hooks/useONNXModel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
    Cpu,
    Download,
    Send,
    Loader2,
    AlertTriangle,
    Copy,
    Check,
    Trash2,
    User,
    Sparkles,
    Zap,
    RotateCcw,
} from 'lucide-react';

const IS_WEBGPU_AVAILABLE = !!(navigator as any).gpu;

interface ChatMsg {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

// ---------- 左侧：模型面板 ----------
function ModelPanel({
    status,
    currentModel,
    pendingModel,
    selectedGroup,
    onGroupChange,
    onModelChange,
    isLoading,
    isGenerating,
    overallProgress,
    progressItems,
    error,
    isError,
    onRetry,
}: {
    status: string;
    currentModel: string;
    pendingModel: string | null;
    selectedGroup: ModelGroupId;
    onGroupChange: (g: ModelGroupId) => void;
    onModelChange: (m: string) => void;
    isLoading: boolean;
    isGenerating: boolean;
    overallProgress: number;
    progressItems: { file: string; progress: number }[];
    error: string | null;
    isError: boolean;
    onRetry: () => void;
}) {
    const modelsInGroup = useMemo(() => getModelsByGroup(selectedGroup), [selectedGroup]);
    const displayModel = pendingModel || currentModel;

    const statusMeta = isLoading
        ? { label: '下载中', color: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
        : isGenerating
            ? { label: '推理中', color: 'bg-blue-500 animate-pulse', text: 'text-blue-600 dark:text-blue-400' }
            : status === 'ready'
                ? { label: '就绪', color: 'bg-green-500', text: 'text-green-600 dark:text-green-400' }
                : { label: '待加载', color: 'bg-zinc-400', text: 'text-zinc-500' };

    return (
        <div className="shrink-0 w-[280px] h-full border-r border-[var(--color-border)] surface-card flex flex-col overflow-hidden">
            {/* 标题 */}
            <div className="shrink-0 px-4 py-3.5 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                        <Cpu size={16} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">本地 AI 推理</h2>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">ONNX + WebGPU</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ scrollbarGutter: 'stable' }}>
                {/* 运行状态 */}
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50/80 dark:bg-zinc-800/40 border border-[var(--color-border-subtle)]">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                        <Zap size={12} /> 运行状态
                    </span>
                    <span className={`text-xs font-medium flex items-center gap-1.5 ${statusMeta.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.color}`} />
                        {statusMeta.label}
                    </span>
                </div>

                {/* WebGPU 检测 */}
                {!IS_WEBGPU_AVAILABLE && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-800/50">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <AlertTriangle size={12} /> 未检测到 WebGPU
                        </p>
                        <p className="text-[11px] text-amber-600/80 dark:text-amber-500/80 mt-1 leading-relaxed">
                            将回退到 WASM 模式，速度较慢。建议使用 Chrome/Edge 113+。
                        </p>
                    </div>
                )}

                {/* 量级分组 */}
                <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">量级分组</label>
                    <select
                        value={selectedGroup}
                        onChange={(e) => onGroupChange(e.target.value as ModelGroupId)}
                        disabled={isLoading || isGenerating}
                        className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-violet-400 disabled:opacity-50 cursor-pointer"
                    >
                        {MODEL_GROUPS.map((g) => (
                            <option key={g.id} value={g.id}>{g.label}</option>
                        ))}
                    </select>
                </div>

                {/* 具体模型 */}
                <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">具体模型</label>
                    <select
                        value={displayModel}
                        onChange={(e) => onModelChange(e.target.value)}
                        disabled={isLoading || isGenerating}
                        className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm surface-input dark:text-zinc-100 outline-none focus:border-violet-400 disabled:opacity-50 cursor-pointer"
                    >
                        {modelsInGroup.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                    </select>
                    <p className="mt-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 truncate" title={currentModel}>
                        {currentModel}
                    </p>
                </div>

                {/* 下载进度 */}
                {isLoading && (
                    <div className="p-3 rounded-lg bg-violet-50/60 dark:bg-violet-900/15 border border-violet-100 dark:border-violet-800/40">
                        <div className="flex items-center gap-1.5 mb-2">
                            <Download size={12} className="text-violet-500" />
                            <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                                加载模型中... {Math.round(overallProgress)}%
                            </span>
                        </div>
                        <div className="w-full bg-violet-100 dark:bg-violet-900/40 rounded-full h-1.5">
                            <div
                                className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(overallProgress, 100)}%` }}
                            />
                        </div>
                        {progressItems.length > 0 && (
                            <div className="mt-2 space-y-0.5">
                                {progressItems.map((item) => (
                                    <div key={item.file} className="flex justify-between text-[10px] text-violet-500/80 dark:text-violet-400/70">
                                        <span className="truncate max-w-[160px]">{item.file.split('/').pop()}</span>
                                        <span>{Math.round(item.progress)}%</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 错误 */}
                {isError && error && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200/70 dark:border-red-800/50">
                        <p className="text-xs font-medium text-red-600 dark:text-red-400">加载失败</p>
                        <p className="text-[11px] text-red-500/90 dark:text-red-400/80 mt-1 break-all">{error}</p>
                        <p className="text-[10px] text-red-400/70 mt-1.5">可尝试切换镜像或更换模型</p>
                        <button
                            onClick={onRetry}
                            disabled={isLoading}
                            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-[11px] font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <RotateCcw size={12} />
                            重试加载
                        </button>
                    </div>
                )}
            </div>

            {/* 底部状态栏 */}
            <div className="shrink-0 px-4 py-2 border-t border-[var(--color-border)]">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center">
                    WebGPU {IS_WEBGPU_AVAILABLE ? '已启用' : '未支持'} · {status}
                </p>
            </div>
        </div>
    );
}

// ---------- 右侧：对话区 ----------
function ResultBlock({ content }: { content: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div className="group relative surface-card rounded-xl p-3.5">
            <button
                onClick={copy}
                className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 transition"
                title="复制"
            >
                {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
            </button>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 pr-6">{content}</p>
        </div>
    );
}

function OnnxPageContent() {
    const {
        status,
        error,
        progressItems,
        overallProgress,
        loadingMessage,
        currentModel,
        pendingModel,
        generate,
        switchModel,
        isLoading,
        isReady,
        isGenerating,
    isError,
    retry,
} = useONNXModel();

    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<ModelGroupId>(MODEL_GROUPS[0].id);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleGroupChange = useCallback(
        (groupId: ModelGroupId) => {
            setSelectedGroup(groupId);
            const first = getModelsByGroup(groupId)[0];
            if (first && first.id !== currentModel) {
                switchModel(first.id).catch(() => {});
            }
        },
        [currentModel, switchModel]
    );

    const handleModelChange = useCallback(
        (modelId: string) => {
            if (modelId === currentModel) return;
            switchModel(modelId).catch(() => {});
        },
        [currentModel, switchModel]
    );

    const handleSubmit = useCallback(async () => {
        if (!input.trim() || !isReady || isGenerating) return;
        const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', content: input.trim() };
        const assistantId = crypto.randomUUID();
        setMessages((prev) => [
            ...prev,
            userMsg,
            { id: assistantId, role: 'assistant', content: '' },
        ]);
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        try {
            const result = await generate(userMsg.content);
            // 模型可能把 prompt 一起返回，截掉前缀
            let text = result || '';
            if (text.startsWith(userMsg.content)) {
                text = text.slice(userMsg.content.length).trimStart();
            }
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === assistantId ? { ...m, content: text || '（模型未返回内容）' } : m
                )
            );
        } catch (err) {
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === assistantId
                        ? { ...m, content: `❌ 推理失败：${(err as Error).message}` }
                        : m
                )
            );
        }
    }, [input, isReady, isGenerating, generate]);

    const modelName = useMemo(
        () => (pendingModel || currentModel || '').split('/').pop()?.replace(/-ONNX.*$/i, '') || '',
        [pendingModel, currentModel]
    );

    return (
        <div className="h-full overflow-hidden flex bg-white/50 dark:bg-zinc-900/50">
            <ModelPanel
                status={status}
                currentModel={currentModel}
                pendingModel={pendingModel}
                selectedGroup={selectedGroup}
                onGroupChange={handleGroupChange}
                onModelChange={handleModelChange}
                isLoading={isLoading}
                isGenerating={isGenerating}
                overallProgress={overallProgress}
                progressItems={progressItems}
                error={error}
                isError={isError}
    onRetry={retry}
            />

            {/* 右侧对话区 */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
                {/* 顶栏 */}
                <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] surface-card">
                    <div className="flex items-center gap-2 min-w-0">
                        <Sparkles size={15} className="text-violet-500 shrink-0" />
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">{modelName}</span>
                        {isReady && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 text-[10px] font-medium rounded-full">
                                已就绪
                            </span>
                        )}
                    </div>
                    {messages.length > 0 && (
                        <button
                            onClick={() => setMessages([])}
                            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition shrink-0"
                            title="清空对话"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>

                {/* 消息列表 */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollbarGutter: 'stable' }}>
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/20">
                                <Cpu size={28} className="text-white" />
                            </div>
                            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 mb-1.5">本地 AI 推理</h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
                                模型完全运行在本地浏览器内（WebGPU 加速），数据不出设备。
                                在左侧选择模型，首次使用需下载权重文件。
                            </p>
                        </div>
                    ) : (
                        messages.map((msg) => {
                            const isUser = msg.role === 'user';
                            return (
                                <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${
                                        isUser
                                            ? 'bg-violet-500 text-white'
                                            : 'bg-gradient-to-br from-zinc-600 to-zinc-700 dark:from-zinc-500 dark:to-zinc-600 text-white'
                                    }`}>
                                        {isUser ? <User size={13} /> : <Sparkles size={13} />}
                                    </div>
                                    <div className={`max-w-[78%] ${isUser ? '' : 'flex-1 min-w-0'}`}>
                                        {isUser ? (
                                            <div className="rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed bg-violet-500 text-white inline-block">
                                                {msg.content}
                                            </div>
                                        ) : msg.content ? (
                                            <ResultBlock content={msg.content} />
                                        ) : (
                                            <div className="inline-flex items-center gap-2 surface-card rounded-xl px-3.5 py-2.5">
                                                <Loader2 size={14} className="animate-spin text-violet-500" />
                                                <span className="text-xs text-zinc-400">{loadingMessage || '推理中...'}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* 输入区 */}
                <div className="shrink-0 px-4 py-3 border-t border-[var(--color-border)] surface-card">
                    <div className="flex items-end gap-2 max-w-3xl mx-auto">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                            placeholder={isReady ? '输入问题... (Enter 发送)' : isLoading ? '模型加载中...' : '请先等待模型加载完成'}
                            disabled={!isReady || isGenerating}
                            rows={1}
                            className="flex-1 px-3.5 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm surface-input dark:text-zinc-100 outline-none focus:border-violet-400 resize-none disabled:opacity-50 min-h-[42px] max-h-[120px]"
                            style={{ height: 'auto' }}
                            onInput={(e) => {
                                const t = e.target as HTMLTextAreaElement;
                                t.style.height = 'auto';
                                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                            }}
                        />
                        <button
                            onClick={handleSubmit}
                            disabled={!isReady || isGenerating || !input.trim()}
                            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-violet-500 hover:bg-violet-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white transition shadow-sm"
                        >
                            {isGenerating ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function OnnxPage() {
    return (
        <ErrorBoundary>
            <OnnxPageContent />
        </ErrorBoundary>
    );
}
