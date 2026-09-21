/**
 * ModelConfigPage — AI 模型统一配置页面
 * Chat 模型和 Embedding 模型分别管理，支持：
 * - 按 Provider 筛选模型列表
 * - 选择 Provider 快速添加（自动填充 URL/模型名）
 * - 计费类型标记（按次数 / 按 Token / 无限制）
 * - 每月 Token 限额设置
 */
import React, { useState, useEffect, useMemo, ReactNode } from 'react';
import { Plus, Trash2, Settings, Zap, Coins, Hash, SlidersHorizontal } from 'lucide-react';
import { Icon } from '@iconify/react';
import defaultModelSvg from '../assets/icons/default-model.svg';
import { useToast } from '../components/Toast';
import { useThemeStore } from '../stores/themeStore';

// ── 类型 ──
interface ChatModel {
  id: string;
  name: string;
  baseURL: string;
  model: string;
  token: string;
  headers: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  top_k: number;
  prompt: string;
  stream: boolean;
  provider: string;
  billingType: 'calls' | 'tokens' | 'none';
  dailyLimit: number;
  tokenQuota: number;
  quotaGroup: string;
}
interface EmbeddingModel {
  id: string;
  name: string;
  baseURL: string;
  model: string;
  dimension: number;
  headers: string;
  token: string;
  provider: string;
  billingType: 'calls' | 'tokens' | 'none';
  dailyLimit: number;
  tokenQuota: number;
  quotaGroup: string;
}

// ── Provider 定义 ──
const CHAT_PROVIDERS = [
  {
    key: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    icon: 'thesvg-color:deepseek',
  },
  {
    key: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    icon: 'thesvg-color:openai-light',
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    icon: 'thesvg-color:anthropic-light',
  },
  {
    key: 'zhipu',
    name: '智谱AI',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    icon: 'thesvg-color:zhipu',
  },
  {
    key: 'qwen',
    name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    icon: 'thesvg-color:qwen-light',
  },
  {
    key: 'gitee',
    name: 'Gitee AI',
    baseURL: 'https://ai.gitee.com/v1',
    model: 'Qwen3-8B',
    icon: 'thesvg-color:giteeai',
  },
  {
    key: 'ollama',
    name: 'Ollama',
    baseURL: 'http://localhost:11434/v1',
    model: '',
    icon: 'thesvg-color:ollama-light',
  },
  { key: 'custom', name: '自定义', baseURL: '', model: '', icon: 'mdi:pencil' },
];
const EMBED_PROVIDERS = [
  {
    key: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-embedding',
    dimension: 4096,
    icon: 'thesvg-color:deepseek',
  },
  {
    key: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'text-embedding-3-small',
    dimension: 1536,
    icon: 'thesvg-color:openai-light',
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    model: '',
    dimension: 1024,
    icon: 'thesvg-color:anthropic-light',
  },
  {
    key: 'zhipu',
    name: '智谱AI',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'embedding-3',
    dimension: 2048,
    icon: 'thesvg-color:zhipu',
  },
  {
    key: 'qwen',
    name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'text-embedding-v3',
    dimension: 1024,
    icon: 'thesvg-color:qwen-light',
  },
  {
    key: 'gitee',
    name: 'Gitee AI',
    baseURL: 'https://ai.gitee.com/v1',
    model: 'bge-m3',
    dimension: 1024,
    icon: 'thesvg-color:giteeai',
  },
  {
    key: 'ollama',
    name: 'Ollama',
    baseURL: 'http://localhost:11434/v1',
    model: 'nomic-embed-text',
    dimension: 768,
    icon: 'thesvg-color:ollama-light',
  },
  { key: 'custom', name: '自定义', baseURL: '', model: '', dimension: 1536, icon: 'mdi:pencil' },
];

const EMPTY_CHAT: ChatModel = {
  id: '',
  name: '',
  baseURL: '',
  model: '',
  token: '',
  headers: '',
  temperature: 0.7,
  max_tokens: 4096,
  top_p: 0.9,
  top_k: 50,
  prompt: '',
  stream: true,
  provider: 'deepseek',
  billingType: 'calls',
  dailyLimit: 0,
  tokenQuota: 0,
  quotaGroup: '',
};
const EMPTY_EMBED: EmbeddingModel = {
  id: '',
  name: '',
  baseURL: '',
  model: '',
  dimension: 1536,
  token: '',
  headers: '',
  provider: 'deepseek',
  billingType: 'calls',
  dailyLimit: 0,
  tokenQuota: 0,
  quotaGroup: '',
};

const BILLING_LABELS: Record<string, string> = {
  calls: '按次数',
  tokens: '按 Token',
  none: '无限制',
};
const BILLING_ICONS: Record<string, typeof Hash> = { calls: Hash, tokens: Coins, none: Zap };

// ── 通用样式 ──
const inputCls =
  'w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md outline-none focus:border-blue-400 surface-input dark:text-zinc-100';
const monoCls = `${inputCls} font-mono`;

// ── 计费类型选择器 ──
function BillingTypeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: 'calls' | 'tokens' | 'none') => void;
}) {
  return (
    <div className="flex gap-1.5">
      {(['calls', 'tokens', 'none'] as const).map((t) => {
        const IconComp = BILLING_ICONS[t];
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition ${
              value === t
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            <IconComp className="w-3 h-3" />
            {BILLING_LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}

// ── Chat 编辑表单 ──
function ChatEditForm({
  editing,
  isNew,
  onChange,
  onSave,
  onCancel,
}: {
  editing: ChatModel;
  isNew: boolean;
  onChange: (v: ChatModel | null) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const handleProviderSelect = (p: (typeof CHAT_PROVIDERS)[number]) => {
    onChange({ ...editing, provider: p.key, baseURL: p.baseURL });
  };
  return (
    <>
      <div className="shrink-0 px-6 pt-6 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {isNew ? '添加 Chat 模型' : '编辑 Chat 模型'}
          </h3>
          <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600">
            取消
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3 min-h-0">
        {/* Provider 类型选择器 — 新增和编辑均显示，点击可切换 */}
        {true && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
              选择 Provider 类型
            </label>
            <div className="grid grid-cols-4 gap-2">
              {CHAT_PROVIDERS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handleProviderSelect(p)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition ${editing.provider === p.key ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                >
                  <Icon icon={p.icon} className="w-5 h-5 shrink-0" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              名称
            </label>
            <input
              value={editing.name}
              onChange={(e) => onChange({ ...editing, name: e.target.value })}
              placeholder="如 DeepSeek"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              模型名称
            </label>
            <input
              value={editing.model}
              onChange={(e) => onChange({ ...editing, model: e.target.value })}
              placeholder="deepseek-chat"
              className={monoCls}
            />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            API 地址
          </label>
          <input
            value={editing.baseURL}
            onChange={(e) => onChange({ ...editing, baseURL: e.target.value })}
            placeholder="https://api.deepseek.com"
            className={monoCls}
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            API Key
          </label>
          <input
            type="password"
            value={editing.token}
            onChange={(e) => onChange({ ...editing, token: e.target.value })}
            placeholder="sk-..."
            className={monoCls}
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            自定义 Headers (JSON)
          </label>
          <textarea
            value={editing.headers}
            onChange={(e) => onChange({ ...editing, headers: e.target.value })}
            placeholder='{"X-Custom": "value"}'
            rows={2}
            className={`${monoCls} resize-none`}
          />
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Temperature
            </label>
            <input
              type="number"
              step={0.1}
              min={0}
              max={2}
              value={editing.temperature}
              onChange={(e) =>
                onChange({ ...editing, temperature: parseFloat(e.target.value) || 0.7 })
              }
              className={monoCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Max Tokens
            </label>
            <input
              type="number"
              step={256}
              min={256}
              value={editing.max_tokens}
              onChange={(e) =>
                onChange({ ...editing, max_tokens: parseInt(e.target.value) || 4096 })
              }
              className={monoCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Top P
            </label>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={editing.top_p}
              onChange={(e) => onChange({ ...editing, top_p: parseFloat(e.target.value) || 0.9 })}
              className={monoCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Top K
            </label>
            <input
              type="number"
              step={1}
              min={0}
              value={editing.top_k}
              onChange={(e) => onChange({ ...editing, top_k: parseInt(e.target.value) || 50 })}
              className={monoCls}
            />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            系统提示词 (System Prompt)
          </label>
          <textarea
            value={editing.prompt}
            onChange={(e) => onChange({ ...editing, prompt: e.target.value })}
            placeholder="留空使用默认提示词"
            rows={3}
            className={`${monoCls} resize-none`}
          />
        </div>
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">流式输出</label>
          <button
            onClick={() => onChange({ ...editing, stream: !editing.stream })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editing.stream ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${editing.stream ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
            />
          </button>
          <span className="text-xs text-zinc-400">{editing.stream ? '开启' : '关闭'}</span>
        </div>

        {/* 计费类型 */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
            计费方式
          </label>
          <BillingTypeSelector
            value={editing.billingType}
            onChange={(v) => onChange({ ...editing, billingType: v })}
          />
        </div>

        {/* 配额限制 */}
        {editing.billingType === 'calls' && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              每日调用限额（0=不限）
            </label>
            <input
              type="number"
              step={100}
              min={0}
              value={editing.dailyLimit}
              onChange={(e) => onChange({ ...editing, dailyLimit: parseInt(e.target.value) || 0 })}
              placeholder="0 = 不限制"
              className={monoCls}
            />
          </div>
        )}
        {editing.billingType === 'tokens' && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              每月 Token 限额（0=不限）
            </label>
            <input
              type="number"
              step={100000}
              min={0}
              value={editing.tokenQuota}
              onChange={(e) => onChange({ ...editing, tokenQuota: parseInt(e.target.value) || 0 })}
              placeholder="0 = 不限制"
              className={monoCls}
            />
          </div>
        )}
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            额度共享组（同组共享计数）
          </label>
          <input
            value={editing.quotaGroup}
            onChange={(e) => onChange({ ...editing, quotaGroup: e.target.value })}
            placeholder="留空=独立计数"
            className={monoCls}
          />
        </div>
      </div>

      <div className="shrink-0 px-6 pb-6 pt-3 border-t border-zinc-200/50 dark:border-zinc-700/50">
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={!editing.name || !editing.baseURL || !editing.model || !editing.token}
            className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-md transition"
          >
            {isNew ? '添加' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Embedding 编辑表单 ──
function EmbedEditForm({
  editing,
  isNew,
  onChange,
  onSave,
  onCancel,
}: {
  editing: EmbeddingModel;
  isNew: boolean;
  onChange: (v: EmbeddingModel | null) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const handleProviderSelect = (p: (typeof EMBED_PROVIDERS)[number]) => {
    onChange({ ...editing, provider: p.key, baseURL: p.baseURL });
  };
  return (
    <>
      <div className="shrink-0 px-6 pt-6 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {isNew ? '添加 Embedding 模型' : '编辑 Embedding 模型'}
          </h3>
          <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600">
            取消
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3 min-h-0">
        {/* Provider 类型选择器 — 新增和编辑均显示，点击可切换 */}
        {true && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
              选择 Provider 类型
            </label>
            <div className="grid grid-cols-4 gap-2">
              {EMBED_PROVIDERS.map((p, i) => (
                <button
                  key={`${p.key}-${i}`}
                  onClick={() => handleProviderSelect(p)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition ${editing.provider === p.key ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                >
                  <Icon icon={p.icon} className="w-5 h-5 shrink-0" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              名称
            </label>
            <input
              value={editing.name}
              onChange={(e) => onChange({ ...editing, name: e.target.value })}
              placeholder="如 OpenAI Embedding"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              模型名称
            </label>
            <input
              value={editing.model}
              onChange={(e) => onChange({ ...editing, model: e.target.value })}
              placeholder="text-embedding-3-small"
              className={monoCls}
            />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            向量维度
          </label>
          <input
            type="number"
            value={editing.dimension}
            onChange={(e) => onChange({ ...editing, dimension: parseInt(e.target.value) || 1536 })}
            placeholder="1536"
            className={monoCls}
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            API 地址
          </label>
          <input
            value={editing.baseURL}
            onChange={(e) => onChange({ ...editing, baseURL: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className={monoCls}
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            自定义 Headers (JSON)
          </label>
          <textarea
            value={editing.headers}
            onChange={(e) => onChange({ ...editing, headers: e.target.value })}
            placeholder='{"X-Custom": "value"}'
            rows={2}
            className={`${monoCls} resize-none`}
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            API Key
          </label>
          <input
            type="password"
            value={editing.token}
            onChange={(e) => onChange({ ...editing, token: e.target.value })}
            placeholder="sk-..."
            className={monoCls}
          />
        </div>

        {/* 计费类型 */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
            计费方式
          </label>
          <BillingTypeSelector
            value={editing.billingType}
            onChange={(v) => onChange({ ...editing, billingType: v })}
          />
        </div>

        {editing.billingType === 'calls' && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              每日调用限额（0=不限）
            </label>
            <input
              type="number"
              step={100}
              min={0}
              value={editing.dailyLimit}
              onChange={(e) => onChange({ ...editing, dailyLimit: parseInt(e.target.value) || 0 })}
              placeholder="0 = 不限制"
              className={monoCls}
            />
          </div>
        )}
        {editing.billingType === 'tokens' && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              每月 Token 限额（0=不限）
            </label>
            <input
              type="number"
              step={100000}
              min={0}
              value={editing.tokenQuota}
              onChange={(e) => onChange({ ...editing, tokenQuota: parseInt(e.target.value) || 0 })}
              placeholder="0 = 不限制"
              className={monoCls}
            />
          </div>
        )}
        <div className="mb-3">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            额度共享组（同组共享计数）
          </label>
          <input
            value={editing.quotaGroup}
            onChange={(e) => onChange({ ...editing, quotaGroup: e.target.value })}
            placeholder="留空=独立计数"
            className={monoCls}
          />
        </div>
      </div>

      <div className="shrink-0 px-6 pb-6 pt-3 border-t border-zinc-200/50 dark:border-zinc-700/50">
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={!editing.name || !editing.baseURL || !editing.model || !editing.token}
            className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-md transition"
          >
            {isNew ? '添加' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════
// 主页面
// ══════════════════════════════════════════
export default function ModelConfigPage(): ReactNode {
  const toast = useToast();
  const isDark = useThemeStore(
    (s) =>
      s.theme === 'dark' ||
      (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches),
  );
  const [tab, setTab] = useState<'chat' | 'embedding'>('chat');
  const [chatConfigs, setChatConfigs] = useState<ChatModel[]>([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [editingChat, setEditingChat] = useState<ChatModel | null>(null);
  const [chatIsNew, setChatIsNew] = useState(false);
  const [embedConfigs, setEmbedConfigs] = useState<EmbeddingModel[]>([]);
  const [activeEmbedId, setActiveEmbedId] = useState('');
  const [editingEmbed, setEditingEmbed] = useState<EmbeddingModel | null>(null);
  const [embedIsNew, setEmbedIsNew] = useState(false);

  // ── 筛选状态 ──
  const [chatProviderFilter, setChatProviderFilter] = useState<string>('');
  const [embedProviderFilter, setEmbedProviderFilter] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    let dbChatCount = 0;
    try {
      const cfg = await (window as any).api?.models?.getGlobalConfig?.();
      if (cfg?.chatConfigs?.length) {
        dbChatCount = cfg.chatConfigs.length;
        setChatConfigs(cfg.chatConfigs);
        setActiveChatId(cfg.activeChatConfigId || cfg.chatConfigs[0]?.id || '');
      }
      if (cfg?.embeddingConfigs?.length) {
        setEmbedConfigs(cfg.embeddingConfigs);
        setActiveEmbedId(cfg.activeEmbeddingConfigId || cfg.embeddingConfigs[0]?.id || '');
      }
    } catch {
      /* ignore */
    }

    if (dbChatCount === 0) {
      try {
        const { recoverConfigs } = await import('../lib/chat-storage');
        const savedChat = await recoverConfigs('chat');
        const savedPanel = await recoverConfigs('chatPanel');
        const allSaved = [...savedChat];
        const ids = new Set(savedChat.map((c: any) => c.id));
        for (const c of savedPanel) {
          if (!ids.has(c.id)) {
            allSaved.push(c);
            ids.add(c.id);
          }
        }

        const [oldEmbProvider, oldEmbUrl, oldEmbModel] = await Promise.all([
          (window as any).api?.settings?.get?.('ai_embedding_provider'),
          (window as any).api?.settings?.get?.('ai_embedding_baseUrl'),
          (window as any).api?.settings?.get?.('ai_embedding_model'),
        ]);

        const withTokens =
          allSaved.length > 0
            ? await Promise.all(
                allSaved.map(async (c: any) => {
                  try {
                    const token = await (window as any).ai?.getLLMToken?.(c.id);
                    return { ...c, token: token || '' };
                  } catch {
                    return { ...c, token: '' };
                  }
                }),
              )
            : [];

        const embDefault: EmbeddingModel = {
          id: 'openai-embedding',
          name: 'OpenAI Embedding',
          provider: 'openai',
          baseURL: 'https://api.openai.com/v1',
          model: 'text-embedding-3-small',
          dimension: 1536,
          token: '',
          headers: '',
          billingType: 'calls',
          dailyLimit: 0,
          tokenQuota: 0,
          quotaGroup: '',
        };
        const embList: EmbeddingModel[] = [];
        if (oldEmbProvider || oldEmbUrl || oldEmbModel) {
          embList.push({
            id: crypto.randomUUID(),
            name: 'Embedding（旧配置）',
            provider: oldEmbProvider || 'openai',
            baseURL: oldEmbUrl || 'https://api.openai.com/v1',
            model: oldEmbModel || 'text-embedding-3-small',
            dimension: 1536,
            token: '',
            headers: '',
            billingType: 'calls',
            dailyLimit: 0,
            tokenQuota: 0,
            quotaGroup: '',
          });
        }
        embList.push(embDefault);

        if (withTokens.length > 0) {
          setChatConfigs(withTokens);
          setActiveChatId(withTokens[0].id);
          setEmbedConfigs(embList);
          setActiveEmbedId(embList[0].id);
          await (window as any).api?.models?.setGlobalConfig?.({
            chatConfigs: withTokens,
            activeChatConfigId: withTokens[0].id,
            embeddingConfigs: embList,
            activeEmbeddingConfigId: embList[0].id,
          });
        }
      } catch {
        /* ignore */
      }
    }
  };

  const saveGlobal = async (
    chats: ChatModel[],
    chatActive: string,
    embeds: EmbeddingModel[],
    embedActive: string,
  ) => {
    await (window as any).api?.models?.setGlobalConfig?.({
      chatConfigs: chats,
      activeChatConfigId: chatActive,
      embeddingConfigs: embeds,
      activeEmbeddingConfigId: embedActive,
    });
  };

  // ── Chat CRUD ──
  const saveChat = async () => {
    if (!editingChat?.name || !editingChat?.baseURL || !editingChat?.model || !editingChat?.token)
      return;
    const cfg = { ...editingChat, id: chatIsNew ? crypto.randomUUID() : editingChat.id };
    const next = chatIsNew
      ? [...chatConfigs, cfg]
      : chatConfigs.map((c) => (c.id === cfg.id ? cfg : c));
    const active = chatIsNew ? cfg.id : activeChatId;
    setChatConfigs(next);
    setActiveChatId(active);
    setEditingChat(null);
    await saveGlobal(next, active, embedConfigs, activeEmbedId);
    await (window as any).api?.models?.setActiveChat?.(active);
    toast.success(chatIsNew ? 'Chat 模型已添加' : 'Chat 模型已保存');
  };
  const deleteChat = async (id: string) => {
    const next = chatConfigs.filter((c) => c.id !== id);
    const active = activeChatId === id ? next[0]?.id || '' : activeChatId;
    setChatConfigs(next);
    setActiveChatId(active);
    await saveGlobal(next, active, embedConfigs, activeEmbedId);
    await (window as any).api?.models?.setActiveChat?.(active);
    toast.success('已删除');
  };

  // ── Embedding CRUD ──
  const saveEmbed = async () => {
    if (
      !editingEmbed?.name ||
      !editingEmbed?.baseURL ||
      !editingEmbed?.model ||
      !editingEmbed?.token
    )
      return;
    const cfg = { ...editingEmbed, id: embedIsNew ? crypto.randomUUID() : editingEmbed.id };
    const next = embedIsNew
      ? [...embedConfigs, cfg]
      : embedConfigs.map((e) => (e.id === cfg.id ? cfg : e));
    const active = embedIsNew ? cfg.id : activeEmbedId;
    setEmbedConfigs(next);
    setActiveEmbedId(active);
    setEditingEmbed(null);
    await saveGlobal(chatConfigs, activeChatId, next, active);
    toast.success(embedIsNew ? 'Embedding 模型已添加' : 'Embedding 模型已保存');
  };
  const deleteEmbed = async (id: string) => {
    const next = embedConfigs.filter((e) => e.id !== id);
    const active = activeEmbedId === id ? next[0]?.id || '' : activeEmbedId;
    setEmbedConfigs(next);
    setActiveEmbedId(active);
    await saveGlobal(chatConfigs, activeChatId, next, active);
    toast.success('已删除');
  };

  // ── 筛选后的列表 ──
  const filteredChat = useMemo(
    () =>
      chatProviderFilter
        ? chatConfigs.filter((c) => c.provider === chatProviderFilter)
        : chatConfigs,
    [chatConfigs, chatProviderFilter],
  );
  const filteredEmbed = useMemo(
    () =>
      embedProviderFilter
        ? embedConfigs.filter((e) => e.provider === embedProviderFilter)
        : embedConfigs,
    [embedConfigs, embedProviderFilter],
  );

  // ── 从模型列表中提取已有 provider ──
  const chatProviders = useMemo(() => {
    const fromModels = new Set(chatConfigs.map((c) => c.provider).filter(Boolean));
    const all = new Set([...fromModels, ...CHAT_PROVIDERS.map((p) => p.key)]);
    return [...all];
  }, [chatConfigs]);
  const embedProviders = useMemo(() => {
    const fromModels = new Set(embedConfigs.map((e) => e.provider).filter(Boolean));
    const all = new Set([...fromModels, ...EMBED_PROVIDERS.map((p) => p.key)]);
    return [...all];
  }, [embedConfigs]);

  const getProviderName = (key: string) =>
    CHAT_PROVIDERS.find((p) => p.key === key)?.name ||
    EMBED_PROVIDERS.find((p) => p.key === key)?.name ||
    key;

  const isAnyChatEditing = !!editingChat && !chatIsNew;
  const isAnyEmbedEditing = !!editingEmbed;

  // ── 筛选栏折叠状态（小屏幕） ──
  const [chatFilterCollapsed, setChatFilterCollapsed] = useState(true);
  const [embedFilterCollapsed, setEmbedFilterCollapsed] = useState(true);

  return (
    <div className="flex flex-col h-full px-8 py-4">
      <main className="flex-1">
        <div className="surface-card h-full p-6">
          {/* 标题和 Tab */}
          <div className="mb-4">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              AI 模型配置
            </h1>
            <p className="text-xs text-zinc-400 mb-3">
              统一管理 Chat 和 Embedding 模型。支持按 Provider 筛选、计费方式标记和 Token 限额管理。
            </p>

            {/* Tab */}
            <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-fit">
              {(['chat', 'embedding'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-5 py-1.5 text-xs font-medium rounded-md transition ${tab === t ? 'bg-zinc-50 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'}`}
                >
                  {t === 'chat' ? 'Chat 模型' : 'Embedding 模型'}
                </button>
              ))}
            </div>
          </div>

          {/* ═══ Chat Tab ═══ */}
          {tab === 'chat' && (
            <div className="flex flex-col lg:flex-row gap-4">
              {/* 左侧：筛选 + 模型列表 */}
              <div className="flex-1 min-w-0">
                {/* Provider 筛选栏 */}
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2 sm:hidden">
                    <button
                      onClick={() => setChatFilterCollapsed(!chatFilterCollapsed)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded border border-zinc-200 dark:border-zinc-700"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      {chatFilterCollapsed ? '展开筛选' : '收起筛选'}
                    </button>
                    {chatProviderFilter && (
                      <span className="text-[10px] text-blue-500">已筛选</span>
                    )}
                  </div>
                  <div
                    className={`flex items-center gap-2 flex-wrap ${chatFilterCollapsed ? 'hidden sm:flex' : 'flex'}`}
                  >
                    <span className="text-xs text-zinc-400 mr-1">筛选：</span>
                    <button
                      onClick={() => setChatProviderFilter('')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition ${
                        !chatProviderFilter
                          ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      全部
                    </button>
                    {chatProviders.map((p) => (
                      <button
                        key={p}
                        onClick={() => setChatProviderFilter(chatProviderFilter === p ? '' : p)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full border transition ${
                          chatProviderFilter === p
                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {getProviderName(p)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    模型列表（点击设为默认）
                    {chatProviderFilter && (
                      <span className="text-xs text-zinc-400 ml-2">
                        共 {filteredChat.length} 个
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => {
                      setEditingChat({ ...EMPTY_CHAT, id: crypto.randomUUID() });
                      setChatIsNew(true);
                    }}
                    disabled={isAnyChatEditing}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加模型
                  </button>
                </div>

                {filteredChat.length === 0 && !chatIsNew && (
                  <p className="text-xs text-zinc-400 text-center py-4">
                    {chatProviderFilter
                      ? `没有 ${getProviderName(chatProviderFilter)} 的模型`
                      : '暂无配置'}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
                  {filteredChat.map((c) => {
                    const isEditing = editingChat?.id === c.id && !chatIsNew;
                    return (
                      <React.Fragment key={c.id}>
                        <div
                          onClick={
                            isAnyChatEditing
                              ? undefined
                              : () => {
                                  setActiveChatId(c.id);
                                  (window as any).api?.models?.setActiveChat?.(c.id);
                                }
                          }
                          className={`relative flex items-center gap-3 px-3 py-2.5 min-h-[100px] rounded-lg border transition cursor-pointer ${activeChatId === c.id ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-200/50 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-800'} ${isEditing ? 'ring-2 ring-blue-400/50' : ''}`}
                        >
                          {activeChatId === c.id && (
                            <img
                              src={defaultModelSvg}
                              alt="默认"
                              className="absolute top-2 right-2 w-10 h-10"
                            />
                          )}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 break-all leading-tight">
                              {c.name || '未命名'}
                            </span>
                            <div className="text-[11px] text-zinc-400 truncate">
                              {c.model} · {c.baseURL?.replace(/https?:\/\//, '').slice(0, 40)}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-medium rounded-full">
                                默认
                              </span>
                              {c.provider && (
                                <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] font-medium rounded">
                                  {getProviderName(c.provider)}
                                </span>
                              )}
                              {c.billingType && c.billingType !== 'none' && (
                                <span
                                  className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${c.billingType === 'tokens' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'}`}
                                >
                                  {BILLING_LABELS[c.billingType]}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e2) => {
                                e2.stopPropagation();
                                setEditingChat({ ...c });
                                setChatIsNew(false);
                              }}
                              disabled={isAnyChatEditing && !isEditing}
                              className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
                              title="编辑"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                            {chatConfigs.length > 1 && (
                              <button
                                onClick={(e2) => {
                                  e2.stopPropagation();
                                  if (confirm(`确定删除「${c.name}」？`)) void deleteChat(c.id);
                                }}
                                disabled={isAnyChatEditing}
                                className="p-1.5 text-zinc-400 hover:text-red-500 rounded hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                title="删除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ═══ Embedding Tab ═══ */}
          {tab === 'embedding' && (
            <div className="flex flex-col lg:flex-row gap-4">
              {/* 左侧：筛选 + 模型列表 */}
              <div className="flex-1 min-w-0">
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2 sm:hidden">
                    <button
                      onClick={() => setEmbedFilterCollapsed(!embedFilterCollapsed)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded border border-zinc-200 dark:border-zinc-700"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      {embedFilterCollapsed ? '展开筛选' : '收起筛选'}
                    </button>
                    {embedProviderFilter && (
                      <span className="text-[10px] text-blue-500">已筛选</span>
                    )}
                  </div>
                  <div
                    className={`flex items-center gap-2 flex-wrap ${embedFilterCollapsed ? 'hidden sm:flex' : 'flex'}`}
                  >
                    <span className="text-xs text-zinc-400 mr-1">筛选：</span>
                    <button
                      onClick={() => setEmbedProviderFilter('')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition ${
                        !embedProviderFilter
                          ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      全部
                    </button>
                    {embedProviders.map((p) => (
                      <button
                        key={p}
                        onClick={() => setEmbedProviderFilter(embedProviderFilter === p ? '' : p)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full border transition ${
                          embedProviderFilter === p
                            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {getProviderName(p)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    模型列表（点击设为默认）
                    {embedProviderFilter && (
                      <span className="text-xs text-zinc-400 ml-2">
                        共 {filteredEmbed.length} 个
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => {
                      setEditingEmbed({ ...EMPTY_EMBED, id: crypto.randomUUID() });
                      setEmbedIsNew(true);
                    }}
                    disabled={isAnyEmbedEditing}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加模型
                  </button>
                </div>

                {filteredEmbed.length === 0 && !embedIsNew && (
                  <p className="text-xs text-zinc-400 text-center py-4">
                    {embedProviderFilter
                      ? `没有 ${getProviderName(embedProviderFilter)} 的模型`
                      : '暂无配置'}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
                  {filteredEmbed.map((e) => {
                    const isEditing = editingEmbed?.id === e.id && !embedIsNew;
                    return (
                      <React.Fragment key={e.id}>
                        <div
                          onClick={isAnyEmbedEditing ? undefined : () => setActiveEmbedId(e.id)}
                          className={`relative flex items-center gap-3 px-3 py-2.5 min-h-[100px] rounded-lg border transition cursor-pointer ${activeEmbedId === e.id ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-200/50 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-800'} ${isEditing ? 'ring-2 ring-blue-400/50' : ''}`}
                        >
                          {activeEmbedId === e.id && (
                            <img
                              src={defaultModelSvg}
                              alt="默认"
                              className="absolute top-2 right-2 w-10 h-10"
                            />
                          )}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 break-all leading-tight">
                              {e.name || '未命名'}
                            </span>
                            <div className="text-[11px] text-zinc-400 truncate">
                              {e.model} · {e.baseURL?.replace(/https?:\/\//, '').slice(0, 40)} ·
                              dim=
                              {e.dimension}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-medium rounded-full">
                                默认
                              </span>
                              {e.provider && (
                                <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] font-medium rounded">
                                  {getProviderName(e.provider)}
                                </span>
                              )}
                              {e.billingType && e.billingType !== 'none' && (
                                <span
                                  className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${e.billingType === 'tokens' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'}`}
                                >
                                  {BILLING_LABELS[e.billingType]}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e2) => {
                                e2.stopPropagation();
                                setEditingEmbed({ ...e });
                                setEmbedIsNew(false);
                              }}
                              disabled={isAnyEmbedEditing && !isEditing}
                              className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
                              title="编辑"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                            {embedConfigs.length > 1 && (
                              <button
                                onClick={(e2) => {
                                  e2.stopPropagation();
                                  if (confirm(`确定删除「${e.name}」？`)) void deleteEmbed(e.id);
                                }}
                                disabled={isAnyEmbedEditing}
                                className="p-1.5 text-zinc-400 hover:text-red-500 rounded hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                title="删除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Chat 编辑弹窗 */}
      {(editingChat || chatIsNew) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-xl"
            onClick={() => {
              setEditingChat(null);
              setChatIsNew(false);
            }}
          />
          <div className="relative bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-xl shadow-2xl border border-white/20 dark:border-white/10 w-full max-w-2xl h-full max-h-[85vh] mx-4 flex flex-col overflow-hidden">
            <ChatEditForm
              editing={editingChat!}
              isNew={chatIsNew}
              onChange={setEditingChat}
              onSave={saveChat}
              onCancel={() => {
                setEditingChat(null);
                setChatIsNew(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Embedding 编辑弹窗 */}
      {(editingEmbed || embedIsNew) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-xl"
            onClick={() => {
              setEditingEmbed(null);
              setEmbedIsNew(false);
            }}
          />
          <div className="relative bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-xl shadow-2xl border border-white/20 dark:border-white/10 w-full max-w-2xl h-full max-h-[85vh] mx-4 flex flex-col overflow-hidden">
            <EmbedEditForm
              editing={editingEmbed!}
              isNew={embedIsNew}
              onChange={setEditingEmbed}
              onSave={saveEmbed}
              onCancel={() => {
                setEditingEmbed(null);
                setEmbedIsNew(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
