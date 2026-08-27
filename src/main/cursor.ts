/**
 * Windows OS cursor control via user32.dll (koffi FFI)
 *
 * 解决透明 Electron 窗口拖拽时光标不跟随的问题。
 * setShape 定义了 OS 级点击穿透区域，CSS cursor 无法生效。
 * 直接调用 Windows SetCursor API 绕过此限制。
 */
import { app } from 'electron'

const IDC_ARROW = 32512
const IDC_SIZEALL = 32640 // 四向箭头（移动/拖拽）

let user32: any = null
let loadCursorW: any = null
let setCursorFn: any = null
let getCursorFn: any = null
let prevCursor: any = null

function ensureInit(): boolean {
  if (user32) return true
  try {
    // koffi 在 electron 主进程中通过 app.getPath('exe') 定位
    // 但在开发模式下直接 load 即可
    const koffi = require('koffi')
    user32 = koffi.load('user32.dll')
    loadCursorW = user32.func('void* LoadCursorW(void* hInstance, int lpCursorName)')
    setCursorFn = user32.func('void* SetCursor(void* hCursor)')
    getCursorFn = user32.func('void* GetCursor()')
    return true
  } catch (err) {
    console.warn('[cursor] koffi/user32 load failed:', err)
    return false
  }
}

export function setMoveCursor(): boolean {
  if (!ensureInit()) return false
  try {
    if (prevCursor === null) {
      prevCursor = getCursorFn()
    }
    const hCursor = loadCursorW(null, IDC_SIZEALL)
    setCursorFn(hCursor)
    return true
  } catch (err) {
    console.warn('[cursor] setMoveCursor failed:', err)
    return false
  }
}

export function restoreCursor(): boolean {
  if (!ensureInit()) return false
  try {
    if (prevCursor !== null) {
      setCursorFn(prevCursor)
      prevCursor = null
    } else {
      // 恢复默认箭头
      const hCursor = loadCursorW(null, IDC_ARROW)
      setCursorFn(hCursor)
    }
    return true
  } catch (err) {
    console.warn('[cursor] restoreCursor failed:', err)
    return false
  }
}
