/**
 * ModelConfigPage — AI 模型统一配置页面
 * Chat 模型和 Embedding 模型分别管理，支持 CRUD + 默认选择
 */
import React, { useState, useEffect, ReactNode } from 'react'
import { Plus, Trash2, Settings } from 'lucide-react'
import { useToast } from '../components/Toast'

interface ChatModel {
  id: string; name: string; baseURL: string; model: string; token: string;
  headers: string; temperature: number; max_tokens: number; top_p: number;
  top_k: number; prompt: string; stream: boolean;
}
interface EmbeddingModel {
  id: string; name: string; baseURL: string;
  model: string; dimension: number; headers: string; token: string;
}
interface GlobalConfig {
  chatConfigs: ChatModel[]; activeChatConfigId: string;
  embeddingConfigs: EmbeddingModel[]; activeEmbeddingConfigId: string;
}

const EMPTY_CHAT: ChatModel = { id: '', name: '', baseURL: '', model: '', token: '', headers: '', temperature: 0.7, max_tokens: 4096, top_p: 0.9, top_k: 50, prompt: '', stream: true }
const EMPTY_EMBED: EmbeddingModel = { id: '', name: '', baseURL: 'https://api.openai.com/v1', model: '', dimension: 1536, headers: '', token: '' }

const CHAT_PRESETS = [
  { name: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'Anthropic', baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  { name: '智谱AI', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: 'Gitee AI', baseURL: 'https://ai.gitee.com/v1', model: 'Qwen3-8B' },
  { name: 'Ollama', baseURL: 'http://localhost:11434/v1', model: '' },
  { name: '自定义', baseURL: '', model: '' },
]
const EMBED_PRESETS = [
  { name: 'OpenAI Small', baseURL: 'https://api.openai.com/v1', model: 'text-embedding-3-small', dimension: 1536 },
  { name: 'OpenAI Large', baseURL: 'https://api.openai.com/v1', model: 'text-embedding-3-large', dimension: 3072 },
  { name: 'Ollama (本地)', baseURL: 'http://localhost:11434/v1', model: 'nomic-embed-text', dimension: 768 },
  { name: '自定义', baseURL: '', model: '', dimension: 1536 },
]

function ChatEditForm({ editing, isNew, onChange, onSave, onCancel, inputCls, monoCls }: {
  editing: ChatModel; isNew: boolean;
  onChange: (v: ChatModel | null) => void; onSave: () => void; onCancel: () => void;
  inputCls: string; monoCls: string;
}) {
  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/30 dark:bg-blue-900/10 mb-1.5 ml-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{isNew ? '添加 Chat 模型' : '编辑 Chat 模型'}</h3>
        <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600">取消</button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">名称</label>
          <input value={editing.name} onChange={e => onChange({ ...editing, name: e.target.value })} placeholder="如 DeepSeek" className={inputCls} /></div>
        <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">模型名称</label>
          <input value={editing.model} onChange={e => onChange({ ...editing, model: e.target.value })} placeholder="deepseek-chat" className={monoCls} /></div>
      </div>
      <div className="mb-3"><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">API 地址</label>
        <input value={editing.baseURL} onChange={e => onChange({ ...editing, baseURL: e.target.value })} placeholder="https://api.deepseek.com" className={monoCls} /></div>
      <div className="mb-3"><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">API Key</label>
        <input type="password" value={editing.token} onChange={e => onChange({ ...editing, token: e.target.value })} placeholder="sk-..." className={monoCls} /></div>
      <div className="mb-3"><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">自定义 Headers (JSON)</label>
        <textarea value={editing.headers} onChange={e => onChange({ ...editing, headers: e.target.value })} placeholder='{"X-Custom": "value"}' rows={2} className={`${monoCls} resize-none`} /></div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Temperature</label>
          <input type="number" step={0.1} min={0} max={2} value={editing.temperature} onChange={e => onChange({ ...editing, temperature: parseFloat(e.target.value) || 0.7 })} className={monoCls} /></div>
        <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Max Tokens</label>
          <input type="number" step={256} min={256} value={editing.max_tokens} onChange={e => onChange({ ...editing, max_tokens: parseInt(e.target.value) || 4096 })} className={monoCls} /></div>
        <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Top P</label>
          <input type="number" step={0.05} min={0} max={1} value={editing.top_p} onChange={e => onChange({ ...editing, top_p: parseFloat(e.target.value) || 0.9 })} className={monoCls} /></div>
        <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Top K</label>
          <input type="number" step={1} min={0} value={editing.top_k} onChange={e => onChange({ ...editing, top_k: parseInt(e.target.value) || 50 })} className={monoCls} /></div>
      </div>
      <div className="mb-3"><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">系统提示词 (System Prompt)</label>
        <textarea value={editing.prompt} onChange={e => onChange({ ...editing, prompt: e.target.value })} placeholder="留空使用默认提示词" rows={3} className={`${monoCls} resize-none`} /></div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">流式输出 (Stream)</label>
        <button onClick={() => onChange({ ...editing, stream: !editing.stream })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editing.stream ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${editing.stream ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
        </button>
        <span className="text-xs text-zinc-400">{editing.stream ? '开启' : '关闭'}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">取消</button>
        <button onClick={onSave} disabled={!editing.name || !editing.baseURL || !editing.model || !editing.token}
          className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-md transition">
          {isNew ? '添加' : '保存'}
        </button>
      </div>
    </div>
  )
}

function EmbedEditForm({ editing, isNew, onChange, onSave, onCancel, inputCls, monoCls }: {
  editing: EmbeddingModel; isNew: boolean;
  onChange: (v: EmbeddingModel | null) => void; onSave: () => void; onCancel: () => void;
  inputCls: string; monoCls: string;
}) {
  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/30 dark:bg-blue-900/10 mb-1.5 ml-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{isNew ? '添加 Embedding 模型' : '编辑 Embedding 模型'}</h3>
        <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600">取消</button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">名称</label>
          <input value={editing.name} onChange={e => onChange({ ...editing, name: e.target.value })} placeholder="如 OpenAI Embedding" className={inputCls} /></div>
        <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">模型名称</label>
          <input value={editing.model} onChange={e => onChange({ ...editing, model: e.target.value })} placeholder="text-embedding-3-small" className={monoCls} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">向量维度</label>
          <input type="number" value={editing.dimension} onChange={e => onChange({ ...editing, dimension: parseInt(e.target.value) || 1536 })} placeholder="1536" className={monoCls} /></div>
      </div>
      <div className="mb-3"><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">API 地址</label>
        <input value={editing.baseURL} onChange={e => onChange({ ...editing, baseURL: e.target.value })} placeholder="https://api.openai.com/v1" className={monoCls} /></div>
      <div className="mb-3"><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">自定义 Headers (JSON)</label>
        <textarea value={editing.headers} onChange={e => onChange({ ...editing, headers: e.target.value })} placeholder='{"X-Custom": "value"}' rows={2} className={`${monoCls} resize-none`} /></div>
      <div className="mb-3"><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">API Key</label>
        <input type="password" value={editing.token} onChange={e => onChange({ ...editing, token: e.target.value })} placeholder="sk-..." className={monoCls} /></div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">取消</button>
        <button onClick={onSave} disabled={!editing.name || !editing.baseURL || !editing.model || !editing.token}
          className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-md transition">
          {isNew ? '添加' : '保存'}
        </button>
      </div>
    </div>
  )
}

export default function ModelConfigPage(): ReactNode {
  const toast = useToast()
  const [tab, setTab] = useState<'chat' | 'embedding'>('chat')
  const [chatConfigs, setChatConfigs] = useState<ChatModel[]>([])
  const [activeChatId, setActiveChatId] = useState('')
  const [editingChat, setEditingChat] = useState<ChatModel | null>(null)
  const [chatIsNew, setChatIsNew] = useState(false)
  const [embedConfigs, setEmbedConfigs] = useState<EmbeddingModel[]>([])
  const [activeEmbedId, setActiveEmbedId] = useState('')
  const [editingEmbed, setEditingEmbed] = useState<EmbeddingModel | null>(null)
  const [embedIsNew, setEmbedIsNew] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const cfg = await (window as any).api?.models?.getGlobalConfig?.()
      if (cfg?.chatConfigs?.length) {
        setChatConfigs(cfg.chatConfigs)
        setActiveChatId(cfg.activeChatConfigId || cfg.chatConfigs[0]?.id || '')
      }
      if (cfg?.embeddingConfigs?.length) {
        setEmbedConfigs(cfg.embeddingConfigs)
        setActiveEmbedId(cfg.activeEmbeddingConfigId || cfg.embeddingConfigs[0]?.id || '')
      }
    } catch { /* ignore */ }

    // 全局配置为空时，从 IndexedDB 恢复
    if (chatConfigs.length === 0) {
      try {
        const { recoverConfigs, loadGlobalModelConfigFromIDB } = await import('../lib/chat-storage')

        // 先尝试从 IndexedDB 备份恢复完整配置
        const backup = await loadGlobalModelConfigFromIDB()
        if (backup?.chatConfigs?.length) {
          const withTokens = await Promise.all(
            backup.chatConfigs.map(async (c: any) => {
              try { const token = await (window as any).ai?.getLLMToken?.(c.id); return { ...c, token: token || '' } }
              catch { return { ...c, token: '' } }
            })
          )
          const embWithTokens = await Promise.all(
            (backup.embeddingConfigs || []).map(async (e: any) => {
              try {
                const token = await (window as any).ai?.getLLMToken?.(`emb_${e.id}`)
                return { ...e, token: token || '' }
              } catch {
                return { ...e, token: '' }
              }
            })
          )
          setChatConfigs(withTokens)
          setActiveChatId(backup.activeChatConfigId || withTokens[0].id)
          setEmbedConfigs(embWithTokens.length > 0 ? embWithTokens : [{ id: 'openai-embedding', name: 'OpenAI Embedding', provider: 'openai', baseURL: 'https://api.openai.com/v1', model: 'text-embedding-3-small', dimension: 1536, token: '' }])
          setActiveEmbedId(backup.activeEmbeddingConfigId || embWithTokens[0]?.id || 'openai-embedding')
          return
        }

        // 再尝试从旧的 IndexedDB configs 恢复 Chat
        const savedChat = await recoverConfigs('chat')
        const savedPanel = await recoverConfigs('chatPanel')
        const allSaved = [...savedChat]
        const ids = new Set(savedChat.map((c: any) => c.id))
        for (const c of savedPanel) { if (!ids.has(c.id)) { allSaved.push(c); ids.add(c.id) } }

        const [oldEmbProvider, oldEmbUrl, oldEmbModel] = await Promise.all([
          (window as any).api?.settings?.get?.('ai_embedding_provider'),
          (window as any).api?.settings?.get?.('ai_embedding_baseUrl'),
          (window as any).api?.settings?.get?.('ai_embedding_model'),
        ])

        const withTokens = allSaved.length > 0 ? await Promise.all(
          allSaved.map(async (c: any) => {
            try { const token = await (window as any).ai?.getLLMToken?.(c.id); return { ...c, token: token || '' } }
            catch { return { ...c, token: '' } }
          })
        ) : []

        const embDefault = { id: 'openai-embedding', name: 'OpenAI Embedding', provider: 'openai' as const, baseURL: 'https://api.openai.com/v1', model: 'text-embedding-3-small', dimension: 1536, token: '' }
        const embList: any[] = []
        if (oldEmbProvider || oldEmbUrl || oldEmbModel) {
          embList.push({ id: 'migrated-embedding', name: 'Embedding（旧配置）', provider: oldEmbProvider || 'openai', baseURL: oldEmbUrl || 'https://api.openai.com/v1', model: oldEmbModel || 'text-embedding-3-small', dimension: 1536, token: '' })
        }
        embList.push(embDefault)

        if (withTokens.length > 0) {
          setChatConfigs(withTokens)
          setActiveChatId(withTokens[0].id)
          setEmbedConfigs(embList)
          setActiveEmbedId(embList[0].id)
          await (window as any).api?.models?.setGlobalConfig?.({
            chatConfigs: withTokens, activeChatConfigId: withTokens[0].id,
            embeddingConfigs: embList, activeEmbeddingConfigId: embList[0].id,
          })
        }
      } catch { /* ignore */ }
    }
  }

  const saveGlobal = async (chats: ChatModel[], chatActive: string, embeds: EmbeddingModel[], embedActive: string) => {
    await (window as any).api?.models?.setGlobalConfig?.({
      chatConfigs: chats, activeChatConfigId: chatActive,
      embeddingConfigs: embeds, activeEmbeddingConfigId: embedActive,
    })
    // 同步写入 IndexedDB 备份
    try {
      const { saveGlobalModelConfig } = await import('../lib/chat-storage')
      await saveGlobalModelConfig({ chatConfigs: chats, activeChatConfigId: chatActive, embeddingConfigs: embeds, activeEmbeddingConfigId: embedActive })
    } catch { /* ignore */ }
  }

  // ── Chat CRUD ──
  const saveChat = async () => {
    if (!editingChat?.name || !editingChat?.baseURL || !editingChat?.model || !editingChat?.token) return
    const cfg = { ...editingChat, id: chatIsNew ? crypto.randomUUID() : editingChat.id }
    const next = chatIsNew ? [...chatConfigs, cfg] : chatConfigs.map(c => c.id === cfg.id ? cfg : c)
    const active = chatIsNew ? cfg.id : activeChatId
    setChatConfigs(next); setActiveChatId(active); setEditingChat(null)
    await saveGlobal(next, active, embedConfigs, activeEmbedId)
    await (window as any).api?.models?.setActiveChat?.(active)
    toast.success(chatIsNew ? 'Chat 模型已添加' : 'Chat 模型已保存')
  }
  const deleteChat = async (id: string) => {
    const next = chatConfigs.filter(c => c.id !== id)
    const active = activeChatId === id ? (next[0]?.id || '') : activeChatId
    setChatConfigs(next); setActiveChatId(active)
    await saveGlobal(next, active, embedConfigs, activeEmbedId)
    await (window as any).api?.models?.setActiveChat?.(active)
    toast.success('已删除')
  }

  // ── Embedding CRUD ──
  const saveEmbed = async () => {
    if (!editingEmbed?.name || !editingEmbed?.baseURL || !editingEmbed?.model || !editingEmbed?.token) return
    const cfg = { ...editingEmbed, id: embedIsNew ? crypto.randomUUID() : editingEmbed.id }
    const next = embedIsNew ? [...embedConfigs, cfg] : embedConfigs.map(e => e.id === cfg.id ? cfg : e)
    const active = embedIsNew ? cfg.id : activeEmbedId
    setEmbedConfigs(next); setActiveEmbedId(active); setEditingEmbed(null)
    await saveGlobal(chatConfigs, activeChatId, next, active)
    toast.success(embedIsNew ? 'Embedding 模型已添加' : 'Embedding 模型已保存')
  }
  const deleteEmbed = async (id: string) => {
    const next = embedConfigs.filter(e => e.id !== id)
    const active = activeEmbedId === id ? (next[0]?.id || '') : activeEmbedId
    setEmbedConfigs(next); setActiveEmbedId(active)
    await saveGlobal(chatConfigs, activeChatId, next, active)
    toast.success('已删除')
  }

  const inputCls = "w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-md outline-none focus:border-blue-400 surface-input dark:text-zinc-100"
  const monoCls = `${inputCls} font-mono`

  return (
    <div className="flex flex-col bg-transparent">
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <section className="surface-card p-6">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">AI 模型配置</h1>
            <p className="text-xs text-zinc-400 mb-4">统一管理 Chat 和 Embedding 模型。设置默认模型后，聊天和报告将自动使用。</p>

            {/* Tab */}
            <div className="flex gap-1 mb-5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-fit">
              {(['chat', 'embedding'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-5 py-1.5 text-xs font-medium rounded-md transition ${tab === t ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'}`}>
                  {t === 'chat' ? 'Chat 模型' : 'Embedding 模型'}
                </button>
              ))}
            </div>

            {/* ═══ Chat Tab ═══ */}
            {tab === 'chat' && (<>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">模型列表（点击设为默认）</span>
                <button onClick={() => { setEditingChat({ ...EMPTY_CHAT, id: '' }); setChatIsNew(true) }}
                  disabled={!!editingChat}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed">
                  <Plus className="w-3.5 h-3.5" /> 添加模型
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {CHAT_PRESETS.map(p => (
                  <button key={p.name} onClick={() => { setEditingChat({ ...EMPTY_CHAT, id: '', name: p.name, baseURL: p.baseURL, model: p.model }); setChatIsNew(true) }}
                    className="px-2 py-2 text-xs font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-zinc-700 dark:text-zinc-300">
                    {p.name}
                  </button>
                ))}
              </div>
              {chatConfigs.length === 0 && <p className="text-xs text-zinc-400 text-center py-4">暂无配置</p>}
              {chatConfigs.map(c => {
                const isEditing = editingChat?.id === c.id
                const isAnyEditing = !!editingChat
                return (
                <React.Fragment key={c.id}>
                <div onClick={isAnyEditing ? undefined : () => { setActiveChatId(c.id); (window as any).api?.models?.setActiveChat?.(c.id) }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1.5 border transition cursor-pointer ${activeChatId === c.id ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-200/50 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-800'} ${isEditing ? 'ring-2 ring-blue-400/50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{c.name || '未命名'}</span>
                      {activeChatId === c.id && <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-medium rounded-full">默认</span>}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate mt-0.5">{c.model} · {c.baseURL?.replace(/https?:\/\//, '').slice(0, 40)}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={e2 => { e2.stopPropagation(); setEditingChat({ ...c }); setChatIsNew(false) }} disabled={isAnyEditing && !isEditing} className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100 transition disabled:opacity-30 disabled:cursor-not-allowed" title="编辑"><Settings className="w-3.5 h-3.5" /></button>
                    {chatConfigs.length > 1 && <button onClick={e2 => { e2.stopPropagation(); if (confirm(`确定删除「${c.name}」？`)) void deleteChat(c.id) }} disabled={isAnyEditing} className="p-1.5 text-zinc-400 hover:text-red-500 rounded hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
                {isEditing && editingChat && (
                  <ChatEditForm editing={editingChat} isNew={chatIsNew} onChange={setEditingChat} onSave={saveChat} onCancel={() => setEditingChat(null)} inputCls={inputCls} monoCls={monoCls} />
                )}
                </React.Fragment>
                )
              })}
            </>)}

            {/* ═══ Embedding Tab ═══ */}
            {tab === 'embedding' && (<>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">模型列表（点击设为默认）</span>
                <button onClick={() => { setEditingEmbed({ ...EMPTY_EMBED, id: '' }); setEmbedIsNew(true) }}
                  disabled={!!editingEmbed}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed">
                  <Plus className="w-3.5 h-3.5" /> 添加模型
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {EMBED_PRESETS.map(p => (
                  <button key={p.name} onClick={() => { setEditingEmbed({ ...EMPTY_EMBED, id: '', name: p.name, baseURL: p.baseURL, model: p.model, dimension: p.dimension }); setEmbedIsNew(true) }}
                    className="px-2 py-2 text-xs font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-zinc-700 dark:text-zinc-300">
                    {p.name}
                  </button>
                ))}
              </div>
              {embedConfigs.length === 0 && <p className="text-xs text-zinc-400 text-center py-4">暂无配置</p>}
              {embedConfigs.map(e => {
                const isEditing = editingEmbed?.id === e.id
                const isAnyEditing = !!editingEmbed
                return (
                <React.Fragment key={e.id}>
                <div onClick={isAnyEditing ? undefined : () => setActiveEmbedId(e.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1.5 border transition cursor-pointer ${activeEmbedId === e.id ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-200/50 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-800'} ${isEditing ? 'ring-2 ring-blue-400/50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{e.name || '未命名'}</span>
                      {activeEmbedId === e.id && <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-medium rounded-full">默认</span>}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate mt-0.5">{e.model} · {e.baseURL?.replace(/https?:\/\//, '').slice(0, 40)} · dim={e.dimension}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={e2 => { e2.stopPropagation(); setEditingEmbed({ ...e }); setEmbedIsNew(false) }} disabled={isAnyEditing && !isEditing} className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100 transition disabled:opacity-30 disabled:cursor-not-allowed" title="编辑"><Settings className="w-3.5 h-3.5" /></button>
                    {embedConfigs.length > 1 && <button onClick={e2 => { e2.stopPropagation(); if (confirm(`确定删除「${e.name}」？`)) void deleteEmbed(e.id) }} disabled={isAnyEditing} className="p-1.5 text-zinc-400 hover:text-red-500 rounded hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
                {isEditing && editingEmbed && (
                  <EmbedEditForm editing={editingEmbed} isNew={embedIsNew} onChange={setEditingEmbed} onSave={saveEmbed} onCancel={() => setEditingEmbed(null)} inputCls={inputCls} monoCls={monoCls} />
                )}
                </React.Fragment>
                )
              })}
            </>)}
          </section>
        </div>
      </main>
    </div>
  )
}
