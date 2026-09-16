/**
 * 菜单模块：应用菜单 + 右键上下文菜单
 */
import { app, Menu, BrowserWindow, shell } from 'electron'
import contextMenu from 'electron-context-menu'
import { tMain, type AppLanguage } from './i18n'
import { getSetting } from './db'
import { getFullAppVersion } from './updater'
import { safeOpenExternal } from './urlWhitelist'
import { is } from '@electron-toolkit/utils'

type SendFn = (channel: string) => void

const DEFAULT_SHORTCUT_LOG = 'CmdOrCtrl+Shift+L'
const DEFAULT_SHORTCUT_TASK = 'CmdOrCtrl+Shift+T'

export function getShortcuts(overrides: Partial<{ log: string; task: string }> = {}): { log: string; task: string } {
  const log = overrides.log ?? getSetting('shortcut_quick_log') ?? DEFAULT_SHORTCUT_LOG
  const task = overrides.task ?? getSetting('shortcut_quick_task') ?? DEFAULT_SHORTCUT_TASK
  return { log, task }
}

export function buildMenu(sendToRenderer: SendFn): void {
  const isMac = process.platform === 'darwin'
  const { log: logShortcut, task: taskShortcut } = getShortcuts()

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      }] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: tMain('create'),
      submenu: [
        { label: tMain('newLog'), accelerator: logShortcut, click: () => sendToRenderer('quick-create:log') },
        { label: tMain('newTask'), accelerator: taskShortcut, click: () => sendToRenderer('quick-create:task') }
      ]
    },
    {
      label: tMain('navigation'),
      submenu: [
        { label: tMain('logs'), accelerator: 'CmdOrCtrl+1', click: () => sendToRenderer('navigate:worklog') },
        { label: tMain('board'), accelerator: 'CmdOrCtrl+2', click: () => sendToRenderer('navigate:kanban') },
        { label: tMain('reports'), accelerator: 'CmdOrCtrl+3', click: () => sendToRenderer('navigate:report') },
        { label: tMain('stats'), accelerator: 'CmdOrCtrl+4', click: () => sendToRenderer('navigate:stats') },
        { type: 'separator' },
        { label: tMain('settings'), accelerator: 'CmdOrCtrl+,', click: () => sendToRenderer('navigate:settings') }
      ]
    },
    {
      label: tMain('edit'),
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: tMain('window'),
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }] as Electron.MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as Electron.MenuItemConstructorOptions[]))
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function setupContextMenu(window: BrowserWindow): void {
  contextMenu({
    window,
    showCopyImage: true,
    showCopyImageAddress: true,
    showSaveImage: true,
    showInspectElement: is.dev,
    showSelectAll: true,
    showCopyLink: true,
    showSaveLinkAs: true,
    showServices: process.platform === 'darwin',
    prepend: (defaultActions, parameters) => {
      const items: Electron.MenuItemConstructorOptions[] = []

      if (parameters.selectionText) {
        const text = parameters.selectionText.trim()
        if (text.length > 0) {
          items.push({
            label: `搜索 "${text.substring(0, 20)}${text.length > 20 ? '…' : ''}"`,
            click: async () => {
              await safeOpenExternal(`https://www.google.com/search?q=${encodeURIComponent(text)}`, shell)
            }
          })
          items.push({ type: 'separator' })
        }
      }

      if (parameters.linkURL) {
        items.push({
          label: '在浏览器中打开链接',
          click: async () => { await safeOpenExternal(parameters.linkURL, shell) }
        })
        items.push({ type: 'separator' })
      }

      items.push({ label: '返回工作台', click: () => { window.webContents.send('navigate:worklog') } })
      items.push({ label: '打开设置', click: () => { window.webContents.send('navigate:settings') } })

      return items
    },
    append: (defaultActions, parameters) => {
      const items: Electron.MenuItemConstructorOptions[] = []

      if (is.dev) {
        items.push({ type: 'separator' })
        items.push({ label: `开发模式 v${app.getVersion()}`, enabled: false })
        items.push({ label: '重载页面', click: () => { window.webContents.reload() } })
        items.push({ label: '打开开发者工具', click: () => { window.webContents.openDevTools() } })
      }

      items.push({ type: 'separator' })
      items.push({ label: `WorkPulse ${getFullAppVersion()}`, enabled: false })

      return items
    },
    labels: {
      cut: '剪切', copy: '复制', paste: '粘贴', copyLink: '复制链接地址',
      copyImage: '复制图片', copyImageAddress: '复制图片地址', saveImage: '保存图片…',
      saveLinkAs: '链接另存为…', selectAll: '全选', inspect: '检查元素',
    }
  })
}
