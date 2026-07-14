import React, { useState, useEffect, useRef } from 'react';
import { Message } from '@fauzitech/ai-ui';
// @ts-ignore
import '@fauzitech/ai-ui/styles.css';

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
}

// ---------- 自定义加载点动画 ----------
function LoadingDots() {
    return (
        <span className="inline-flex gap-1 items-center">
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
        </span>
    );
}

// ---------- 可折叠思考面板（默认展开） ----------
function ThinkingPanel({ reasoning }: { reasoning: string }) {
    const [isExpanded, setIsExpanded] = useState(true);
    if (!reasoning) return null;

    return (
        <div className="mb-2 border border-gray-200 rounded-lg overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-sm text-gray-600 transition"
            >
                <span className="flex items-center gap-2">
                    <span>🧠</span>
                    <span>思考过程</span>
                    <span className="text-xs text-gray-400">({reasoning.length} 字符)</span>
                </span>
                <span>{isExpanded ? '▼' : '▶'}</span>
            </button>
            {isExpanded && (
                <div className="px-3 py-2 bg-gray-50/50 text-sm text-gray-700 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                    {reasoning}
                </div>
            )}
        </div>
    );
}

// ---------- 默认预设配置 ----------
const DEFAULT_CONFIGS: ModelConfig[] = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        token: '',
        headers: '',
        temperature: 0.7,
        max_tokens: 2048,
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
        max_tokens: 1024,
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

// ---------- 主组件 ----------
export default function ChatPage() {
    // 配置管理
    const [configs, setConfigs] = useState<ModelConfig[]>(() => {
        const saved = localStorage.getItem('modelConfigs');
        return saved ? JSON.parse(saved) : DEFAULT_CONFIGS;
    });
    const [currentConfigId, setCurrentConfigId] = useState(() => {
        const savedId = localStorage.getItem('currentConfigId');
        if (savedId && configs.some(c => c.id === savedId)) return savedId;
        return configs[0]?.id || '';
    });

    const [showConfigCard, setShowConfigCard] = useState(false);
    const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null);
    const [formData, setFormData] = useState<Partial<ModelConfig>>({});

    // 聊天状态
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const currentConfig = configs.find(c => c.id === currentConfigId) || configs[0];

    // 自动滚动
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 持久化配置
    useEffect(() => {
        localStorage.setItem('modelConfigs', JSON.stringify(configs));
    }, [configs]);
    useEffect(() => {
        localStorage.setItem('currentConfigId', currentConfigId);
    }, [currentConfigId]);

    // 监听流式事件
    useEffect(() => {
        if (!window.ai) {
            console.warn('Electron IPC not available');
            return;
        }

        const onReasoning = (_: any, reasoning: string) => {
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.id === 'streaming') {
                    return [
                        ...prev.slice(0, -1),
                        { ...last, reasoning: (last.reasoning || '') + reasoning },
                    ];
                }
                return prev;
            });
        };

        const onChunk = (_: any, chunk: string) => {
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.id === 'streaming') {
                    return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
                }
                return prev;
            });
        };

        const onDone = () => {
            setIsStreaming(false);
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.id === 'streaming') {
                    return [...prev.slice(0, -1), { ...last, id: crypto.randomUUID() }];
                }
                return prev;
            });
        };

        const onError = (_: any, error: string) => {
            setIsStreaming(false);
            alert(`流式错误: ${error}`);
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
    }, []);

    // 发送消息
    const handleSend = async () => {
        if (!input.trim() || isStreaming || !currentConfig) return;

        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: input.trim(),
        };
        const assistantMsg: ChatMessage = {
            id: 'streaming',
            role: 'assistant',
            content: '',
            reasoning: '',
        };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        setIsStreaming(true);
        setInput('');

        const history = messages.map(m => ({ role: m.role, content: m.content }));

        await window.ai.invoke('ai-chat-stream', {
            userMessage: userMsg.content,
            history,
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

    // ---------- 配置卡片操作 ----------
    const openNewConfig = () => {
        setEditingConfig(null);
        setFormData({
            name: '',
            baseURL: '',
            model: '',
            token: '',
            headers: '',
            temperature: 0.7,
            max_tokens: 2048,
            top_p: 0.9,
        });
        setShowConfigCard(true);
    };

    const openEditConfig = (config: ModelConfig) => {
        setEditingConfig(config);
        setFormData({ ...config });
        setShowConfigCard(true);
    };

    const saveConfig = () => {
        if (!formData.name || !formData.baseURL || !formData.model) {
            alert('请至少填写名称、API地址和模型名称');
            return;
        }
        if (formData.headers && formData.headers.trim() !== '') {
            try {
                JSON.parse(formData.headers);
            } catch (e) {
                alert('headers 格式错误，请输入合法的 JSON 对象');
                return;
            }
        }

        const newConfig: ModelConfig = {
            id: editingConfig?.id || crypto.randomUUID(),
            name: formData.name!,
            baseURL: formData.baseURL!,
            model: formData.model!,
            token: formData.token || '',
            headers: formData.headers || '',
            temperature: formData.temperature ?? 0.7,
            max_tokens: formData.max_tokens ?? 2048,
            top_p: formData.top_p ?? 0.9,
        };

        if (editingConfig) {
            setConfigs(prev => prev.map(c => c.id === editingConfig.id ? newConfig : c));
            if (currentConfigId === editingConfig.id) {
                setCurrentConfigId(newConfig.id);
            }
        } else {
            setConfigs(prev => [...prev, newConfig]);
            setCurrentConfigId(newConfig.id);
        }
        setShowConfigCard(false);
    };

    const deleteConfig = (id: string) => {
        if (configs.length <= 1) {
            alert('至少保留一个配置');
            return;
        }
        if (!confirm(`确定删除配置 "${configs.find(c => c.id === id)?.name}" 吗？`)) return;
        setConfigs(prev => prev.filter(c => c.id !== id));
        if (currentConfigId === id) {
            setCurrentConfigId(configs[0]?.id || '');
        }
    };

    // ---------- 渲染 ----------
    return (
        // 外层容器高度 = calc(100vh - 150px)，内部 flex 列布局
        <div
            className="flex flex-col bg-gray-50 font-sans overflow-hidden"
            style={{ height: 'calc(100vh - 150px)' }}
        >
            {/* 顶部栏（固定高度） */}
            <div className="shrink-0 bg-white border-b border-gray-200">
                <div className="flex items-center gap-3 px-4 py-2">
                    <label className="font-medium text-sm text-gray-700">模型：</label>
                    <select
                        value={currentConfigId}
                        onChange={(e) => setCurrentConfigId(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {configs.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.model})</option>
                        ))}
                    </select>
                    <button
                        onClick={() => setShowConfigCard(true)}
                        className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 transition"
                    >
                        ⚙️ 配置
                    </button>
                </div>
                {/* 配置信息栏 */}
                {currentConfig && (
                    <div className="px-4 py-1.5 bg-gray-100 border-t border-gray-200 text-xs text-gray-600 flex gap-4 overflow-x-auto">
                        <span>🌐 {currentConfig.baseURL}</span>
                        <span>🌡️ {currentConfig.temperature}</span>
                        <span>📏 {currentConfig.max_tokens}</span>
                        <span>🔑 {currentConfig.token ? '已设置' : '未设置'}</span>
                        <span>📋 {currentConfig.headers ? '有自定义头' : '无自定义头'}</span>
                    </div>
                )}
            </div>

            {/* 消息列表（flex-1 自动填充剩余高度，内部滚动） */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                        <div
                            key={msg.id}
                            className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                            {/* 头像 */}
                            <div
                                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${isUser ? 'bg-blue-500' : 'bg-gray-500'
                                    }`}
                            >
                                {isUser ? '我' : 'AI'}
                            </div>

                            {/* 气泡（含思考面板和消息内容） */}
                            <div className={`max-w-[80%] space-y-1 ${isUser ? 'items-end' : 'items-start'}`}>
                                {!isUser && msg.reasoning && (
                                    <ThinkingPanel reasoning={msg.reasoning} />
                                )}
                                <div
                                    className={`rounded-2xl px-4 py-2 ${isUser
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-200 text-gray-800'
                                        }`}
                                >
                                    <Message
                                        role={msg.role}
                                        content={msg.content}
                                    // 不传入 avatar，因为我们自己渲染了头像
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
                {isStreaming && (
                    <div className="flex items-start gap-3 flex-row">
                        <div className="shrink-0 w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white text-sm font-bold">
                            AI
                        </div>
                        <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-gray-200 text-gray-800">
                            <LoadingDots />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* 底部输入框（固定高度） */}
            <div className="shrink-0 p-4 bg-white border-t border-gray-200 flex gap-3">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="输入消息..."
                    disabled={isStreaming}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                />
                <button
                    onClick={handleSend}
                    disabled={isStreaming}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 transition disabled:opacity-60"
                >
                    发送
                </button>
            </div>

            {/* 配置卡片模态框 */}
            {showConfigCard && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={() => setShowConfigCard(false)}
                >
                    <div
                        className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-semibold mb-4">
                            {editingConfig ? '编辑配置' : '新增配置'}
                        </h3>
                        <div className="mb-4 max-h-40 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                            {configs.map(c => (
                                <div key={c.id} className="flex justify-between items-center px-3 py-2">
                                    <span className="text-sm font-medium">{c.name} <span className="text-gray-500 font-normal">({c.model})</span></span>
                                    <div>
                                        <button
                                            onClick={() => openEditConfig(c)}
                                            className="mr-2 text-xs bg-yellow-400 hover:bg-yellow-500 px-2 py-1 rounded"
                                        >
                                            编辑
                                        </button>
                                        <button
                                            onClick={() => deleteConfig(c.id)}
                                            className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded"
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <hr className="my-4" />
                        <div className="space-y-3">
                            <input
                                placeholder="配置名称（如 DeepSeek）"
                                value={formData.name || ''}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                                placeholder="API地址（如 https://api.deepseek.com）"
                                value={formData.baseURL || ''}
                                onChange={e => setFormData({ ...formData, baseURL: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                                placeholder="模型名称（如 deepseek-chat）"
                                value={formData.model || ''}
                                onChange={e => setFormData({ ...formData, model: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                                type="password"
                                placeholder="API Key（留空则使用环境变量）"
                                value={formData.token || ''}
                                onChange={e => setFormData({ ...formData, token: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <textarea
                                placeholder='自定义请求头（JSON 格式），如 {"X-Failover-Enabled":"true"}'
                                value={formData.headers || ''}
                                onChange={e => setFormData({ ...formData, headers: e.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            />
                            <div className="grid grid-cols-3 gap-3">
                                <label className="text-sm">
                                    Temperature
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="2"
                                        value={formData.temperature ?? 0.7}
                                        onChange={e => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                                        className="w-full mt-1 px-2 py-1 border border-gray-300 rounded-md text-sm"
                                    />
                                </label>
                                <label className="text-sm">
                                    Max Tokens
                                    <input
                                        type="number"
                                        step="1"
                                        min="1"
                                        value={formData.max_tokens ?? 2048}
                                        onChange={e => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
                                        className="w-full mt-1 px-2 py-1 border border-gray-300 rounded-md text-sm"
                                    />
                                </label>
                                <label className="text-sm">
                                    Top P
                                    <input
                                        type="number"
                                        step="0.05"
                                        min="0"
                                        max="1"
                                        value={formData.top_p ?? 0.9}
                                        onChange={e => setFormData({ ...formData, top_p: parseFloat(e.target.value) })}
                                        className="w-full mt-1 px-2 py-1 border border-gray-300 rounded-md text-sm"
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                onClick={() => setShowConfigCard(false)}
                                className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                            >
                                取消
                            </button>
                            <button
                                onClick={saveConfig}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}