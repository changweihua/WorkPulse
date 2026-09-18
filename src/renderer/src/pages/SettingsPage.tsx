import { useEffect, useRef, useState, ReactNode } from 'react'
import {
  Eye,
  EyeOff,
  Trash2,
  RotateCcw,
  Keyboard,
  Sun,
  Moon,
  Monitor,
  Layers,
  PanelTop,
  Droplets,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Power,
  FolderOpen,
  Plus,
  Loader2,
  Settings
} from 'lucide-react'
import { useToast } from '../components/Toast'
import { useThemeStore, ACCENTS, type Theme } from '../stores/themeStore'
import { useI18n, useLanguageStore } from '../stores/languageStore'
import type { AppLanguage, ResolvedLanguage } from '../lib/i18n'

// Convert a KeyboardEvent to an Electron-style accelerator string
function eventToAccelerator(e: KeyboardEvent): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const keyMap: Record<string, string> = {
    ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Backspace: 'Backspace', Delete: 'Delete', Escape: 'Escape', Enter: 'Return',
    Tab: 'Tab', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown'
  }
  const key = keyMap[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
  parts.push(key)
  if (parts.length < 2) return null
  return parts.join('+')
}

function ShortcutCapture({
  value,
  onChange,
  capturingLabel
}: {
  value: string
  onChange: (v: string) => void
  capturingLabel: string
}): ReactNode {
  const [capturing, setCapturing] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { setCapturing(false); return }
    const acc = eventToAccelerator(e.nativeEvent)
    if (acc) {
      onChange(acc)
      setCapturing(false)
    }
  }

  return (
    <button
      ref={ref}
      onFocus={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={capturing ? handleKeyDown : undefined}
      className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-mono transition-all outline-none
        ${capturing
          ? 'border-zinc-500 ring-2 ring-blue-500/30 dark:ring-blue-400/30 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
          : 'border-zinc-300 dark:border-zinc-600 surface-input text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 cursor-pointer'
        }`}
    >
      <Keyboard className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
      {capturing ? capturingLabel : value}
    </button>
  )
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not_available' | 'downloading' | 'downloaded' | 'error'

interface AppUpdateState {
  status: UpdateStatus
  currentVersion: string
  version?: string
  releaseUrl?: string
  downloadUrl?: string
  progress?: number
  error?: string
  canInstall?: boolean
}

const DEFAULT_SYSTEM_PROMPT = `浣犳槸涓€涓笓涓氱殑宸ヤ綔鎶ュ憡鍔╂墜銆傝鏍规嵁鐢ㄦ埛鎻愪緵鐨勫伐浣滄棩蹇楋紝鐢熸垚涓€浠界粨鏋勫寲鐨勫伐浣滄€荤粨鎶ュ憡銆?
瑕佹眰锛?- 璇█锛歿{language}}
- 椋庢牸锛歿{style}}
- 鏃堕棿鑼冨洿锛歿{dateFrom}} 鑷?{{dateTo}}
- 杈撳嚭鏍煎紡锛歁arkdown
- 鎸変富棰?椤圭洰鍒嗙被褰掔撼
- 绐佸嚭鍏抽敭鎴愭灉鍜屼骇鍑?- 绠€娲佹湁鍔涳紝閬垮厤娴佹按璐

const DEFAULT_REPORT_TEMPLATE = `## 宸ヤ綔鎬荤粨 ({{dateFrom}} - {{dateTo}})

### 涓昏浜у嚭
锛堟寜椤圭洰/涓婚鍒嗙被鍒楀嚭鍏抽敭鎴愭灉锛?
### 杩涜涓殑宸ヤ綔
锛堝皻鏈畬鎴愪絾鏈夎繘灞曠殑浜嬮」锛?
### 涓嬪懆璁″垝
锛堝熀浜庡綋鍓嶅伐浣滅殑鍚堢悊鎺ㄦ柇锛塦

const DEFAULT_SYSTEM_PROMPT_EN = `You are a professional work report assistant. Generate a structured work summary from the user's work logs.

Requirements:
- Language: {{language}}
- Style: {{style}}
- Date range: {{dateFrom}} to {{dateTo}}
- Output format: Markdown
- Group work by topic/project
- Highlight key outcomes and deliverables
- Keep it concise and useful; avoid a raw chronological dump`

const DEFAULT_REPORT_TEMPLATE_EN = `## Work Summary ({{dateFrom}} - {{dateTo}})

### Key Outcomes
(Group important outcomes by project/topic)

### Work in Progress
(Items that are not finished but have meaningful progress)

### Next Plan
(Reasonable next steps based on current work)`

function getDefaultSystemPrompt(language: ResolvedLanguage): string {
  return language === 'zh' ? DEFAULT_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT_EN
}

function getDefaultReportTemplate(language: ResolvedLanguage): string {
  return language === 'zh' ? DEFAULT_REPORT_TEMPLATE : DEFAULT_REPORT_TEMPLATE_EN
}

function SettingsPage(): ReactNode {
  const isMac = navigator.userAgent.includes('Mac')
  const modifierLabel = isMac ? 'Cmd' : 'Ctrl'
  const { language: appLanguage, resolvedLanguage, t } = useI18n()
  const setAppLanguage = useLanguageStore((s) => s.setLanguage)
  const previousLanguageRef = useRef<ResolvedLanguage>(resolvedLanguage)
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [editing, setEditing] = useState(false)
  const [reportLanguage, setReportLanguage] = useState(resolvedLanguage === 'zh' ? '涓枃' : 'English')
  const [style, setStyle] = useState(t('settings.styleConcise'))
  const [systemPrompt, setSystemPrompt] = useState(getDefaultSystemPrompt(resolvedLanguage))
  const [reportTemplate, setReportTemplate] = useState(getDefaultReportTemplate(resolvedLanguage))
  const [shortcutLog, setShortcutLog] = useState('CmdOrCtrl+Shift+L')
  const [shortcutTask, setShortcutTask] = useState('CmdOrCtrl+Shift+T')
  const [appVersion, setAppVersion] = useState('')
  const [updateState, setUpdateState] = useState<AppUpdateState>({
    status: 'idle',
    currentVersion: ''
  })
  const toast = useToast()
  const { theme, setTheme, accent, setAccent } = useThemeStore()
  const styleOptions = [
    t('settings.styleConcise'),
    t('settings.styleDetailed'),
    t('settings.styleCasual')
  ]

  // 寮€鏈哄惎鍔ㄧ姸鎬?  const [autoLaunch, setAutoLaunch] = useState(false)
  const [loadingAutoLaunch, setLoadingAutoLaunch] = useState(true)

  // 鍏抽棴琛屼负璁剧疆
  const [closeAction, setCloseAction] = useState('minimize')

  // 浼氳鎻愰啋璁剧疆
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [reminderLead, setReminderLead] = useState('10')

  // 寰勫悜鑿滃崟璁剧疆
  const [radialEnabled, setRadialEnabled] = useState(true)
  interface RadialMenuItem {
    key: string
    label: string
    emoji?: string
    icon?: string
    enabled: boolean
    type?: 'builtin' | 'program'
    programPath?: string
  }
  const [radialItems, setRadialItems] = useState<RadialMenuItem[]>([
    { key: 'log', label: '宸ヤ綔鏃ュ織', emoji: '馃摑', enabled: true, type: 'builtin' },
    { key: 'task', label: '浠诲姟绠＄悊', emoji: '馃搵', enabled: true, type: 'builtin' },
    { key: 'meeting', label: '浼氳璁板綍', emoji: '馃搮', enabled: true, type: 'builtin' },
    { key: 'ai', label: 'AI 鐢熸垚', emoji: '馃', enabled: true, type: 'builtin' },
    { key: 'screenshot', label: '鎴浘鏍囨敞', emoji: '馃摳', enabled: true, type: 'builtin' },
  ])
  const [addingProgram, setAddingProgram] = useState(false)

  useEffect(() => {
    loadSettings()

    void window.api.app.getVersion().then(setAppVersion)
    void window.api.app.getUpdateState().then(setUpdateState)
    const unsubscribeUpdateStatus = window.api.on.updateStatus(setUpdateState)

    // 鍔犺浇寮€鏈哄惎鍔ㄧ姸鎬?    void window.api.app.getAutoLaunch()
      .then((enabled: boolean) => {
        setAutoLaunch(enabled)
        setLoadingAutoLaunch(false)
      })
      .catch(() => setLoadingAutoLaunch(false))

    // 鍔犺浇鍏抽棴琛屼负璁剧疆
    void window.api.app.getCloseAction()
      .then((action: string) => setCloseAction(action))
      .catch(() => {})

    // 鍔犺浇浼氳鎻愰啋璁剧疆
    void window.api.settings.get('reminder_enabled').then((v) => {
      if (v !== null) setReminderEnabled(v === '1')
    })
    void window.api.settings.get('reminder_lead').then((v) => {
      if (v !== null) setReminderLead(v)
    })

    // 鍔犺浇寰勫悜鑿滃崟璁剧疆
    void window.api.settings.get('radial_enabled').then((v) => {
      if (v !== null) setRadialEnabled(v === '1')
    })
    void window.api.settings.get('radial_items').then((v) => {
      if (v) {
        try {
          const saved: RadialMenuItem[] = JSON.parse(v)
          // Merge: keep saved items, prepend any new builtins not in saved
          const builtinDefaults: RadialMenuItem[] = [
            { key: 'log', label: '宸ヤ綔鏃ュ織', emoji: '馃摑', enabled: true, type: 'builtin' },
            { key: 'task', label: '浠诲姟绠＄悊', emoji: '馃搵', enabled: true, type: 'builtin' },
            { key: 'meeting', label: '浼氳璁板綍', emoji: '馃搮', enabled: true, type: 'builtin' },
            { key: 'ai', label: 'AI 鐢熸垚', emoji: '馃', enabled: true, type: 'builtin' },
            { key: 'screenshot', label: '鎴浘鏍囨敞', emoji: '馃摳', enabled: true, type: 'builtin' },
          ]
          const savedKeys = new Set(saved.map(i => i.key))
          const newBuiltins = builtinDefaults.filter(d => !savedKeys.has(d.key))
          setRadialItems([...newBuiltins, ...saved])
        } catch {}
      }
    })

    return () => {
      unsubscribeUpdateStatus()
    }
  }, [])

  useEffect(() => {
    const previousLanguage = previousLanguageRef.current
    if (previousLanguage === resolvedLanguage) return

    setReportLanguage((current) => {
      const previousDefault = previousLanguage === 'zh' ? '涓枃' : 'English'
      return current === previousDefault ? (resolvedLanguage === 'zh' ? '涓枃' : 'English') : current
    })
    setStyle((current) => {
      const previousDefault = previousLanguage === 'zh' ? '绠€娲佷笓涓? : 'Concise professional'
      return current === previousDefault ? t('settings.styleConcise') : current
    })
    setSystemPrompt((current) => {
      const previousDefault = getDefaultSystemPrompt(previousLanguage)
      return current.trim() === previousDefault.trim() ? getDefaultSystemPrompt(resolvedLanguage) : current
    })
    setReportTemplate((current) => {
      const previousDefault = getDefaultReportTemplate(previousLanguage)
      return current.trim() === previousDefault.trim() ? getDefaultReportTemplate(resolvedLanguage) : current
    })

    previousLanguageRef.current = resolvedLanguage
  }, [resolvedLanguage, t])

  const loadSettings = async (): Promise<void> => {
    const key = await window.api.settings.get('api_key')
    if (key) {
      setApiKey(key)
      setHasKey(true)
    }
    // 鎶ュ憡鍋忓ソ
    const l = await window.api.settings.get('report_language')
    if (l) {
      setReportLanguage(l)
    } else {
      setReportLanguage(resolvedLanguage === 'zh' ? '涓枃' : 'English')
    }
    const s = await window.api.settings.get('report_style')
    if (s) {
      setStyle(s)
    } else {
      setStyle(t('settings.styleConcise'))
    }
    const sp = await window.api.settings.get('system_prompt')
    if (sp) setSystemPrompt(sp)
    const rt = await window.api.settings.get('report_template')
    if (rt) setReportTemplate(rt)
    const sl = await window.api.settings.get('shortcut_quick_log')
    if (sl) setShortcutLog(sl)
    const st = await window.api.settings.get('shortcut_quick_task')
    if (st) setShortcutTask(st)
  }

  const handleShortcutChange = async (
    key: 'shortcut_quick_log' | 'shortcut_quick_task',
    value: string,
    setter: (v: string) => void
  ): Promise<void> => {
    const updated = await window.api.shortcut.update(key, value)
    if (!updated) {
      toast.error(t('settings.shortcutTaken'))
      return
    }
    setter(value)
    toast.success(t('settings.shortcutSaved'))
  }

  const maskKey = (key: string): string => {
    if (key.length <= 8) return '****'
    return key.slice(0, 4) + '****' + key.slice(-4)
  }

  const handleSaveKey = async (): Promise<void> => {
    if (!apiKey.trim()) return
    await window.api.settings.set('api_key', apiKey.trim())
    setHasKey(true)
    setEditing(false)
    toast.success(t('settings.apiKeySaved'))
  }

  const handleDeleteKey = async (): Promise<void> => {
    await window.api.settings.delete('api_key')
    setApiKey('')
    setHasKey(false)
    setEditing(false)
    toast.success(t('settings.apiKeyDeleted'))
  }

  const saveSetting = async (key: string, value: string): Promise<void> => {
    if (value.trim()) {
      await window.api.settings.set(key, value.trim())
    } else {
      await window.api.settings.delete(key)
    }
  }

  const handleProviderChange = async (value: string): Promise<void> => {
    setProvider(value)
    await window.api.settings.set('ai_provider', value)
  }

  const handleBaseUrlBlur = async (): Promise<void> => {
    await saveSetting('ai_base_url', baseUrl)
  }

  const handleModelBlur = async (): Promise<void> => {
    await saveSetting('ai_model', model)
  }

  // Embedding 閰嶇疆澶勭悊鍣?  const handleEmbeddingProviderChange = async (value: string): Promise<void> => {
    setEmbeddingProvider(value)
    await window.api.settings.set('ai_embedding_provider', value)
  }

  const handleEmbeddingBaseUrlBlur = async (): Promise<void> => {
    await saveSetting('ai_embedding_baseUrl', embeddingBaseUrl)
  }

  const handleEmbeddingModelBlur = async (): Promise<void> => {
    await saveSetting('ai_embedding_model', embeddingModel)
  }

  // 鍏ㄥ眬妯″瀷閰嶇疆
  const handleLanguageChange = async (value: string): Promise<void> => {
    setReportLanguage(value)
    await window.api.settings.set('report_language', value)
  }

  const handleStyleChange = async (value: string): Promise<void> => {
    setStyle(value)
    await window.api.settings.set('report_style', value)
  }

  const handleAppLanguageChange = async (value: AppLanguage): Promise<void> => {
    await setAppLanguage(value)
  }

  const handleThemeChange = async (value: Theme): Promise<void> => {
    await setTheme(value)
    toast.success(t('settings.themeChanged'))
  }

  // ---------- 绐楀彛鏉愯川锛圡ica / Tabbed / Acrylic锛?----------
  const [material, setMaterial] = useState<string>('tabbed')

  useEffect(() => {
    window.api?.window?.getMaterial?.().then(setMaterial).catch(() => {})
  }, [])

  const handleMaterialChange = async (value: string): Promise<void> => {
    const res = await window.api?.window?.setMaterial?.(value)
    if (res?.success) {
      setMaterial(value)
      toast.success(t('settings.materialChanged'))
    }
  }

  const handleSystemPromptBlur = async (): Promise<void> => {
    if (systemPrompt.trim() === getDefaultSystemPrompt(resolvedLanguage).trim()) {
      await window.api.settings.delete('system_prompt')
    } else {
      await window.api.settings.set('system_prompt', systemPrompt)
    }
  }

  const handleReportTemplateBlur = async (): Promise<void> => {
    if (reportTemplate.trim() === getDefaultReportTemplate(resolvedLanguage).trim()) {
      await window.api.settings.delete('report_template')
    } else {
      await window.api.settings.set('report_template', reportTemplate)
    }
  }

  const resetSystemPrompt = async (): Promise<void> => {
    setSystemPrompt(getDefaultSystemPrompt(resolvedLanguage))
    await window.api.settings.delete('system_prompt')
    toast.success(t('settings.systemPromptReset'))
  }

  const resetReportTemplate = async (): Promise<void> => {
    setReportTemplate(getDefaultReportTemplate(resolvedLanguage))
    await window.api.settings.delete('report_template')
    toast.success(t('settings.templateReset'))
  }

  const handleCheckUpdates = async (): Promise<void> => {
    const state = await window.api.app.checkForUpdates()
    setUpdateState(state)

    if (state.status === 'not_available') {
      toast.success(t('settings.updateNotAvailable'))
    } else if (state.status === 'error') {
      toast.error(t('settings.updateError', { message: state.error || '' }))
    }
  }

  const handleInstallUpdate = async (): Promise<void> => {
    await window.api.app.installUpdate()
  }

  const getUpdateMessage = (): string => {
    switch (updateState.status) {
      case 'checking':
        return t('settings.checkingUpdates')
      case 'available':
        return updateState.downloadUrl
          ? t('settings.updateAvailableManual', { version: updateState.version || '' })
          : t('settings.updateAvailable', { version: updateState.version || '' })
      case 'downloading':
        return t('settings.updateDownloading', { progress: updateState.progress ?? 0 })
      case 'downloaded':
        return t('settings.updateDownloaded')
      case 'not_available':
        return t('settings.updateNotAvailable')
      case 'error':
        return t('settings.updateCheckFailed')
      case 'idle':
      default:
        return t('settings.updateIdle')
    }
  }

  // 鍒囨崲寮€鏈哄惎鍔?  const handleToggleAutoLaunch = async (): Promise<void> => {
    const newState = !autoLaunch
    setAutoLaunch(newState) // 涔愯鏇存柊
    try {
      await window.api.app.setAutoLaunch(newState)
      toast.success(newState ? '鉁?寮€鏈哄惎鍔ㄥ凡鍚敤' : '鉁?寮€鏈哄惎鍔ㄥ凡绂佺敤')
    } catch (error) {
      setAutoLaunch(!newState) // 鍥炴粴
      toast.error('鉂?鎿嶄綔澶辫触锛岃閲嶈瘯')
      console.error('Toggle auto-launch error:', error)
    }
  }

  // 鍒囨崲鍏抽棴琛屼负
  const handleCloseActionChange = async (action: string): Promise<void> => {
    const prev = closeAction
    setCloseAction(action)
    try {
      await window.api.app.setCloseAction(action)
      toast.success(action === 'quit' ? '鉁?鍏抽棴鏃跺皢閫€鍑虹▼搴? : '鉁?鍏抽棴鏃跺皢鏈€灏忓寲鍒版墭鐩?)
    } catch (error) {
      setCloseAction(prev)
      toast.error('鉂?鎿嶄綔澶辫触锛岃閲嶈瘯')
    }
  }

  // 鍒囨崲浼氳鎻愰啋
  const handleToggleReminder = async (): Promise<void> => {
    const next = !reminderEnabled
    setReminderEnabled(next)
    try {
      await window.api.settings.set('reminder_enabled', next ? '1' : '0')
      toast.success(next ? '鉁?浼氳鎻愰啋宸插紑鍚? : '鉁?浼氳鎻愰啋宸插叧闂?)
    } catch (error) {
      setReminderEnabled(!next)
      toast.error('鉂?鎿嶄綔澶辫触锛岃閲嶈瘯')
    }
  }

  // 淇敼鎻愰啋鎻愬墠閲?  const handleReminderLeadChange = async (value: string): Promise<void> => {
    const prev = reminderLead
    setReminderLead(value)
    try {
      await window.api.settings.set('reminder_lead', value)
    } catch (error) {
      setReminderLead(prev)
      toast.error('鉂?鎿嶄綔澶辫触锛岃閲嶈瘯')
    }
  }

  // 鍒囨崲寰勫悜鑿滃崟寮€鍏?  const handleSaveRadialEnabled = async (enabled: boolean): Promise<void> => {
    setRadialEnabled(enabled)
    try {
      // 閫氱煡涓昏繘绋嬪疄鏃舵樉绀?闅愯棌鎮诞绐楋紙radial:set-enabled 宸叉寔涔呭寲璁剧疆锛?      await window.api.radial?.setEnabled?.(enabled)
    } catch {
      setRadialEnabled(!enabled)
    }
  }

  // 淇濆瓨寰勫悜鑿滃崟椤归厤缃?  const handleSaveRadialItems = async (items: RadialMenuItem[]): Promise<void> => {
    try {
      await window.api.settings.set('radial_items', JSON.stringify(items))
      setRadialItems(items)
      await window.api.radial?.setConfig?.(items)
    } catch (err) {
      console.error('Failed to save radial items:', err)
    }
  }

  // 娣诲姞鑷畾涔夌▼搴?  const handleAddProgram = async (): Promise<void> => {
    if (!window.api.radial?.pickProgram) return
    setAddingProgram(true)
    try {
      const result = await window.api.radial.pickProgram()
      if (!result) return

      // 鍗曠嫭鎻愬彇鍥炬爣锛堝拰涔嬪墠涓€鏍疯蛋 getFileIcon锛?      let icon: string | undefined
      if (window.api.radial?.getFileIcon) {
        icon = (await window.api.radial.getFileIcon(result.path)) ?? undefined
      }

      const newItem: RadialMenuItem = {
        key: `program_${Date.now()}`,
        label: result.name,
        icon,
        enabled: true,
        type: 'program',
        programPath: result.path,
      }

      const next = [...radialItems, newItem]
      await handleSaveRadialItems(next)
    } finally {
      setAddingProgram(false)
    }
  }

  // 绉婚櫎鑷畾涔夌▼搴?  const handleRemoveProgram = (key: string): void => {
    const next = radialItems.filter((item) => item.key !== key)
    void handleSaveRadialItems(next)
  }

  const currentVersion = appVersion || updateState.currentVersion || '-'
  const isCheckingUpdate = updateState.status === 'checking' || updateState.status === 'downloading'

  return (
    <div className="flex flex-col bg-transparent">
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
          {/* AI 妯″瀷绠＄悊鍏ュ彛 */}
          <section className="surface-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI 妯″瀷閰嶇疆</h2>
                <p className="text-xs text-zinc-400 mt-1">绠＄悊 Chat 鍜?Embedding 妯″瀷锛岃缃粯璁ゆā鍨?/p>
              </div>
              <a href="#/model-config" className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition">
                鍓嶅線閰嶇疆
              </a>
            </div>
          </section>

          {/* Report Preferences */}
          <section className="surface-card p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{t('settings.reportPrefs')}</h2>
            <div className="h-px bg-zinc-200/50 dark:bg-zinc-700/50 mb-4" />

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('settings.reportLanguage')}</label>
                <select
                  value={reportLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 surface-input dark:text-zinc-100"
                >
                  <option value="涓枃">涓枃</option>
                  <option value="English">English</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('settings.reportStyle')}</label>
                <select
                  value={style}
                  onChange={(e) => handleStyleChange(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 surface-input dark:text-zinc-100"
                >
                  {!styleOptions.includes(style) && <option value={style}>{style}</option>}
                  {styleOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* System Prompt */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('settings.systemPrompt')}</label>
                <button
                  onClick={resetSystemPrompt}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  title={t('settings.restoreDefault')}
                >
                  <RotateCcw className="w-3 h-3" />
                  {t('settings.restoreDefault')}
                </button>
              </div>
              <p className="text-xs text-zinc-400 mb-2">
                {t('settings.promptHelp')}
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                onBlur={handleSystemPromptBlur}
                rows={8}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 surface-input dark:text-zinc-100 font-mono leading-relaxed resize-y"
              />
            </div>

            {/* Report Template */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('settings.reportTemplate')}</label>
                <button
                  onClick={resetReportTemplate}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  title={t('settings.restoreDefault')}
                >
                  <RotateCcw className="w-3 h-3" />
                  {t('settings.restoreDefault')}
                </button>
              </div>
              <p className="text-xs text-zinc-400 mb-2">
                {t('settings.templateHelp')}
              </p>
              <textarea
                value={reportTemplate}
                onChange={(e) => setReportTemplate(e.target.value)}
                onBlur={handleReportTemplateBlur}
                rows={10}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 surface-input dark:text-zinc-100 font-mono leading-relaxed resize-y"
              />
            </div>
          </section>

          {/* Shortcuts */}
          <section className="surface-card p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{t('settings.shortcuts')}</h2>
            <div className="h-px bg-zinc-200/50 dark:bg-zinc-700/50 mb-4" />
            <p className="text-xs text-zinc-400 mb-4">
              {t('settings.shortcutsHelp')}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('settings.shortcutLog')}</label>
                <ShortcutCapture
                  value={shortcutLog}
                  onChange={(v) => handleShortcutChange('shortcut_quick_log', v, setShortcutLog)}
                  capturingLabel={t('settings.capturingShortcut')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('settings.shortcutTask')}</label>
                <ShortcutCapture
                  value={shortcutTask}
                  onChange={(v) => handleShortcutChange('shortcut_quick_task', v, setShortcutTask)}
                  capturingLabel={t('settings.capturingShortcut')}
                />
              </div>
            </div>

            <div className="mt-4 p-3 surface-inset rounded-lg">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-2">{t('settings.otherShortcuts')}</p>
              <div className="space-y-1">
                {[
                  [`${modifierLabel}+1 / 2 / 3 / 4`, t('settings.navShortcuts')],
                  [`${modifierLabel}+,`, t('settings.openSettings')],
                  ['Tab', t('settings.quickModeShortcut')],
                  ['Esc', t('settings.closeShortcut')]
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between">
                    <code className="text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400">
                      {key}
                    </code>
                    <span className="text-xs text-zinc-400">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="surface-card p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{t('settings.appearance')}</h2>
            <div className="h-px bg-zinc-200/50 dark:bg-zinc-700/50 mb-4" />
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('settings.language')}</label>
              <p className="text-xs text-zinc-400 mb-2">{t('settings.languageHelp')}</p>
              <select
                value={appLanguage}
                onChange={(e) => handleAppLanguageChange(e.target.value as AppLanguage)}
                className="px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 surface-input dark:text-zinc-100"
              >
                <option value="system">{t('settings.languageSystem')}</option>
                <option value="zh">{t('settings.languageZh')}</option>
                <option value="en">{t('settings.languageEn')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('settings.theme')}</label>
              <p className="text-xs text-zinc-400 mb-2">{t('settings.themeHelp')}</p>
              <div className="flex gap-2">
                {([
                  { value: 'light', label: t('settings.themeLight'), Icon: Sun, color: 'bg-amber-400' },
                  { value: 'dark', label: t('settings.themeDark'), Icon: Moon, color: 'bg-zinc-700' },
                  { value: 'system', label: t('settings.themeSystem'), Icon: Monitor, color: 'bg-gradient-to-r from-amber-400 to-zinc-700' }
                ] as const).map(({ value, label, Icon, color }) => (
                  <button
                    key={value}
                    onClick={() => handleThemeChange(value)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors ${theme === value
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${color} ${theme === value ? 'ring-2 ring-white dark:ring-zinc-900 ring-offset-1' : ''}`} />
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('settings.accent')}</label>
              <p className="text-xs text-zinc-400 mb-2">{t('settings.accentHelp')}</p>
              <div className="flex gap-2.5 flex-wrap">
                {ACCENTS.map(({ id, color, labelKey }) => (
                  <button
                    key={id}
                    onClick={() => void setAccent(id)}
                    title={t(labelKey)}
                    aria-label={t(labelKey)}
                    className={`w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${
                      accent === id ? 'ring-2 ring-blue-600 dark:ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 scale-110' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t('settings.material')}</label>
              <p className="text-xs text-zinc-400 mb-2">{t('settings.materialHelp')}</p>
              <div className="flex gap-2">
                {([
                  { value: 'mica', label: t('settings.materialMica'), Icon: Layers, color: 'bg-blue-400' },
                  { value: 'tabbed', label: t('settings.materialTabbed'), Icon: PanelTop, color: 'bg-indigo-400' },
                  { value: 'acrylic', label: t('settings.materialAcrylic'), Icon: Droplets, color: 'bg-cyan-400' }
                ] as const).map(({ value, label, Icon, color }) => (
                  <button
                    key={value}
                    onClick={() => handleMaterialChange(value)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors ${material === value
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${color} ${material === value ? 'ring-2 ring-white dark:ring-zinc-900 ring-offset-1' : ''}`} />
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 寮€鏈哄惎鍔?*/}
          <section className="surface-card p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">寮€鏈哄惎鍔?/h2>
            <div className="h-px bg-zinc-200/50 dark:bg-zinc-700/50 mb-4" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">鐧诲綍鏃惰嚜鍔ㄥ惎鍔?WorkPulse</p>
                <p className="text-xs text-zinc-400">鍦ㄧ郴缁熷惎鍔ㄥ悗鑷姩杩愯搴旂敤</p>
              </div>
              {loadingAutoLaunch ? (
                <div className="w-12 h-6 bg-zinc-200 dark:bg-zinc-700 rounded-full animate-pulse" />
              ) : (
                <button
                  onClick={handleToggleAutoLaunch}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${autoLaunch ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoLaunch ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              )}
            </div>

            {/* 鍏抽棴琛屼负 */}
            <div className="flex items-center justify-between mt-4">
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">鍏抽棴绐楀彛鏃?/p>
                <p className="text-xs text-zinc-400">閫夋嫨鐐瑰嚮鍏抽棴鎸夐挳鏃剁殑琛屼负</p>
              </div>
              <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                <button
                  onClick={() => handleCloseActionChange('minimize')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    closeAction === 'minimize'
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  鏈€灏忓寲鍒版墭鐩?                </button>
                <button
                  onClick={() => handleCloseActionChange('quit')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    closeAction === 'quit'
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  閫€鍑虹▼搴?                </button>
              </div>
            </div>

            {/* 浼氳鎻愰啋 */}
            <div className="flex items-center justify-between mt-4">
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">浼氳寮€濮嬫彁閱?/p>
                <p className="text-xs text-zinc-400">浼氳寮€濮嬪墠鎺ㄩ€佺郴缁熼€氱煡</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={reminderLead}
                  onChange={(e) => void handleReminderLeadChange(e.target.value)}
                  disabled={!reminderEnabled}
                  className="px-2 py-1.5 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 surface-input text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:opacity-50"
                >
                  <option value="5">鎻愬墠 5 鍒嗛挓</option>
                  <option value="10">鎻愬墠 10 鍒嗛挓</option>
                  <option value="15">鎻愬墠 15 鍒嗛挓</option>
                  <option value="30">鎻愬墠 30 鍒嗛挓</option>
                </select>
                <button
                  onClick={() => void handleToggleReminder()}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${reminderEnabled ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${reminderEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* 寰勫悜鑿滃崟 */}
          <section className="surface-card p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">寰勫悜鑿滃崟</h2>
            <div className="h-px bg-zinc-200/50 dark:bg-zinc-700/50 mb-4" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">鍚敤寰勫悜鑿滃崟</p>
                <p className="text-xs text-zinc-400">鍦ㄥ揩閫熸搷浣滃叆鍙ｆ樉绀哄緞鍚戣彍鍗?/p>
              </div>
              <button
                onClick={() => void handleSaveRadialEnabled(!radialEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${radialEnabled ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${radialEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>

            {radialEnabled && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-zinc-400 mb-2">鑿滃崟椤癸紙椤哄簭鍗虫樉绀洪『搴忥紝鍙崟鐙紑鍏筹級</p>
                {radialItems.filter(item => item.type !== 'program').map((item, index) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between px-3 py-2 surface-inset rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      {item.icon ? (
                        <img src={item.icon} alt="" className="w-5 h-5 rounded" />
                      ) : (
                        <span className="text-base leading-none">{item.emoji}</span>
                      )}
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.label}</span>
                      <span className="text-xs text-zinc-400">#{index + 1}</span>
                    </div>
                    <button
                      onClick={() => {
                        const next = radialItems.map((it) =>
                          it.key === item.key ? { ...it, enabled: !it.enabled } : it
                        )
                        void handleSaveRadialItems(next)
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${item.enabled ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </div>
                ))}

                {/* 鑷畾涔夌▼搴?*/}
                {radialItems.some(item => item.type === 'program') && (
                  <>
                    <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-3" />
                    <p className="text-xs text-zinc-400 mb-2">鑷畾涔夌▼搴?/p>
                    {radialItems.filter(item => item.type === 'program').map((item, index) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between px-3 py-2 surface-inset rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          {item.icon ? (
                            <img src={item.icon} alt="" className="w-5 h-5 rounded" />
                          ) : (
                            <span className="text-base leading-none">馃摝</span>
                          )}
                          <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.label}</span>
                          <span className="text-xs text-zinc-400">#{radialItems.filter(i => i.type !== 'program').length + index + 1}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRemoveProgram(item.key)}
                            className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                            title="绉婚櫎"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const next = radialItems.map((it) =>
                                it.key === item.key ? { ...it, enabled: !it.enabled } : it
                              )
                              void handleSaveRadialItems(next)
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${item.enabled ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'
                              }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.enabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* 娣诲姞绋嬪簭鎸夐挳 */}
                <button
                  onClick={handleAddProgram}
                  disabled={addingProgram}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  {addingProgram ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span className="text-sm">{addingProgram ? '姝ｅ湪娣诲姞...' : '娣诲姞绋嬪簭'}</span>
                </button>
              </div>
            )}
          </section>

          <section className="surface-card p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{t('settings.updates')}</h2>
            <div className="h-px bg-zinc-200/50 dark:bg-zinc-700/50 mb-4" />
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="min-w-0">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  {t('settings.currentVersion', { version: currentVersion })}
                </p>
                <p className={`text-xs mt-1 flex items-center gap-1.5 ${updateState.status === 'error'
                    ? 'text-red-500'
                    : updateState.status === 'downloaded' || updateState.status === 'not_available'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-zinc-400'
                  }`}
                >
                  {updateState.status === 'downloaded' || updateState.status === 'not_available' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : updateState.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Download className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{getUpdateMessage()}</span>
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdate}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md surface-card text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  {isCheckingUpdate ? t('settings.checkingUpdates') : t('settings.checkUpdates')}
                </button>
                {updateState.status === 'downloaded' && (
                  <button
                    onClick={handleInstallUpdate}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    {t('settings.restartInstall')}
                  </button>
                )}
                {updateState.releaseUrl && (
                  <button
                    onClick={() => window.open(updateState.releaseUrl, '_blank')}
                    className="px-3 py-2 text-sm rounded-md surface-card text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {t('settings.openRelease')}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="surface-card p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{t('settings.about')}</h2>
            <div className="h-px bg-zinc-200/50 dark:bg-zinc-700/50 mb-4" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">WorkPulse {currentVersion}</p>
            <p className="text-xs text-zinc-400 mt-1">{t('settings.aboutText')}</p>
            <button
              onClick={async () => {
                await window.api.app.openBackupDir()
              }}
              className="flex items-center gap-1.5 mt-3 px-3 py-2 text-sm rounded-md surface-card text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              {t('settings.openBackupDir')}
            </button>
          </section>
        </div>
      </main>

    </div>
  )
}

export default SettingsPage
