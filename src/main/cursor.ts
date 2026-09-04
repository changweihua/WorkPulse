/**
 * Windows OS cursor control via user32.dll (koffi FFI)
 *
 * 解决透明 Electron 窗口拖拽时光标不跟随的问题。
 * setShape 定义了 OS 级点击穿透区域，CSS cursor 无法生效。
 * 直接调用 Windows SetCursor API 绕过此限制。
 *
 * 每次 drag-move 重新 SetCursor，因为 WM_SETCURSOR 会持续覆盖。
 */

import log from 'electron-log/main';

const IDC_ARROW = 32512
const IDC_SIZEALL = 32646 // 四向箭头（移动/拖拽）

let user32: any = null
let loadCursorW: any = null
let setCursorFn: any = null
let hArrow: any = null
let hMove: any = null

function ensureInit(): boolean {
  if (user32) return true
  try {
    const koffi = require('koffi')
    user32 = koffi.load('user32.dll')
    loadCursorW = user32.func('void* LoadCursorW(void* hInstance, int lpCursorName)')
    setCursorFn = user32.func('void* SetCursor(void* hCursor)')
    hArrow = loadCursorW(null, IDC_ARROW)
    hMove = loadCursorW(null, IDC_SIZEALL)
    return true
  } catch (err) {
    log.warn('[cursor] koffi/user32 load failed:', err)
    return false
  }
}

export function setMoveCursor(): boolean {
  if (!ensureInit()) return false
  try {
    setCursorFn(hMove)
    return true
  } catch (err) {
    log.warn('[cursor] setMoveCursor failed:', err)
    return false
  }
}

export function restoreCursor(): boolean {
  if (!ensureInit()) return false
  try {
    setCursorFn(hArrow)
    return true
  } catch (err) {
    log.warn('[cursor] restoreCursor failed:', err)
    return false
  }
}
