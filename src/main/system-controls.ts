/**
 * 系统快捷控制（Touch Bar 专用）
 * - 音量：winmm waveOutGetVolume / waveOutSetVolume（进程内，无需管理员）
 * - 媒体键 / 静音：user32 keybd_event 发送系统媒体键
 * - 亮度：WMI WmiMonitorBrightnessMethods（需显卡驱动支持）
 * - Wi-Fi 开关：wlanapi WlanSetInterface（进程内，无需管理员；失败回退 netsh）
 * - 蓝牙开关：PowerShell PnP Enable/Disable-PnpDevice（需管理员）
 * - 设备详情：winmm waveOutGetDevCapsW 读默认音频输出设备名、WMI 只读当前亮度
 */
import { execFile } from 'child_process';
import { shell } from 'electron';
import log from 'electron-log/main';

const PTR_BYTES = process.arch === 'x64' ? 8 : 4;

// ─── 系统音量 VK 码（媒体键 VK 已随 Touch Bar 媒体控制组一并移除） ───
export const VK_VOLUME_MUTE = 0xad;
export const VK_VOLUME_DOWN = 0xae;
export const VK_VOLUME_UP = 0xaf;

// ─── 工具：异步 PowerShell（超时 8s，失败返回空串） ───
function runPowerShell(script: string): Promise<string> {
  return new Promise<string>((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', script],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve('');
          return;
        }
        resolve((stdout || '').trim());
      },
    );
  });
}

// ─── 音量 ───

interface WinmmFns {
  get: (hwo: number, pdw: Buffer) => number;
  set: (hwo: number, dw: number) => number;
}
let winmmFns: WinmmFns | null = null;

function ensureWinmm(): WinmmFns | null {
  if (winmmFns) return winmmFns;
  try {
    const koffi = require('koffi');
    const dll = koffi.load('winmm.dll');
    winmmFns = {
      get: dll.func('uint waveOutGetVolume(intptr_t hwo, void* pdwVolume)'),
      set: dll.func('uint waveOutSetVolume(intptr_t hwo, uint dwVolume)'),
    };
  } catch (err) {
    log.warn('[system-controls] winmm 加载失败:', err);
    winmmFns = null;
  }
  return winmmFns;
}

/** 读取系统主音量（0-100），失败返回 null */
export function getSystemVolume(): number | null {
  const fns = ensureWinmm();
  if (!fns) return null;
  try {
    const buf = Buffer.alloc(4);
    const rc = fns.get(0, buf);
    if (rc !== 0) return null;
    const left = buf.readUInt32LE(0) & 0xffff;
    return Math.round((left / 0xffff) * 100);
  } catch (err) {
    log.warn('[system-controls] 读取音量失败:', err);
    return null;
  }
}

/** 设置系统主音量（0-100），返回是否成功 */
export function setSystemVolume(level: number): boolean {
  const fns = ensureWinmm();
  if (!fns) return false;
  try {
    const l = Math.max(0, Math.min(100, Math.round(level)));
    const v = Math.round((l / 100) * 0xffff);
    return fns.set(0, (v << 16) | v) === 0;
  } catch (err) {
    log.warn('[system-controls] 设置音量失败:', err);
    return false;
  }
}

/** 音量步进：读得到当前值则精确调节，否则退回系统媒体键 */
export function volumeStep(delta: number): number | null {
  const current = getSystemVolume();
  if (current === null) {
    sendVirtualKey(delta > 0 ? VK_VOLUME_UP : VK_VOLUME_DOWN);
    return null;
  }
  const next = Math.max(0, Math.min(100, current + delta));
  setSystemVolume(next);
  return next;
}

// ─── 默认音频输出设备名 ───

let audioDeviceName: string | null | undefined;

/**
 * 读取默认波形输出设备的友好名（悬停卡片里展示「当前输出设备」）。
 * WAVEOUTCAPSW 手工按字节布局：wMid(2) + wPid(2) + vDriverVersion(4)
 * + szPname[32](64) + dwFormats(4) + wChannels(2) + wReserved1(2) + dwSupport(4) = 84 字节，
 * 名称在偏移 8 的 UTF-16LE 定长字段里。结果缓存，失败不再重试。
 */
export function getDefaultAudioDeviceName(): string | null {
  if (audioDeviceName !== undefined) return audioDeviceName;
  audioDeviceName = null;
  try {
    const koffi = require('koffi');
    const dll = koffi.load('winmm.dll');
    const fn = dll.func('uint waveOutGetDevCapsW(uintptr_t uDeviceID, void* pwoc, uint cbwoc)');
    const buf = Buffer.alloc(84);
    if (fn(0, buf, 84) !== 0) return null;
    let end = 8;
    const limit = 8 + 64;
    while (end + 1 < limit && (buf[end] !== 0 || buf[end + 1] !== 0)) end += 2;
    const name = buf.toString('utf16le', 8, end).trim();
    audioDeviceName = name.length > 0 ? name : null;
  } catch (err) {
    log.warn('[system-controls] 读取默认音频设备名失败:', err);
  }
  return audioDeviceName;
}

// ─── 系统媒体键（keybd_event） ───

let keybdFn: ((vk: number, scan: number, flags: number, extra: number) => void) | null = null;

function ensureKeybd(): typeof keybdFn {
  if (keybdFn) return keybdFn;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    // ⚠️ koffi 不认 C 的 byte，必须写 uint8，否则签名解析失败导致媒体键/静音全部失效
    keybdFn = user32.func(
      'void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)',
    );
  } catch (err) {
    log.warn('[system-controls] user32 keybd_event 加载失败:', err);
    keybdFn = null;
  }
  return keybdFn;
}

/** 发送一次虚拟按键（keydown + keyup），触发系统级动作 */
export function sendVirtualKey(vk: number): void {
  const fn = ensureKeybd();
  if (!fn) return;
  try {
    fn(vk, 0, 0, 0); // KEYEVENTF_KEYDOWN
    fn(vk, 0, 2, 0); // KEYEVENTF_KEYUP
  } catch (err) {
    log.warn('[system-controls] keybd_event 调用失败:', err);
  }
}

// ─── 亮度（WMI） ───

export interface BrightnessResult {
  /** 调节后的亮度（0-100），null 表示不支持/失败 */
  current: number | null;
  supported: boolean;
}

/** 亮度步进（±），失败返回 supported:false（渲染层提示打开系统显示设置） */
export async function brightnessStep(delta: number): Promise<BrightnessResult> {
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness`,
    `if (-not $b) { Write-Output 'NO_DEVICE'; exit }`,
    `$cur = [int]$b.CurrentBrightness`,
    `$max = 100`,
    `if ($b.Levels -and $b.Levels.Length -gt 0) { $max = [int]$b.Levels[$b.Levels.Length - 1] }`,
    `$next = [Math]::Max(0, [Math]::Min($max, $cur + ${Math.round(delta)}))`,
    `$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods`,
    `if (-not $m) { Write-Output 'NO_DEVICE'; exit }`,
    `Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$next } | Out-Null`,
    `Write-Output $next`,
  ].join('\n');
  const out = await runPowerShell(script);
  const parsed = Number(out);
  if (Number.isFinite(parsed)) {
    return { current: Math.max(0, Math.min(100, parsed)), supported: true };
  }
  return { current: null, supported: false };
}

/** 只读当前显示器亮度（不改变设置）；失败返回 supported:false */
export async function getBrightness(): Promise<BrightnessResult> {
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1`,
    `if (-not $b) { Write-Output 'NO_DEVICE'; exit }`,
    `Write-Output ([int]$b.CurrentBrightness)`,
  ].join('\n');
  const out = (await runPowerShell(script)).trim();
  // 注意 Number('') === 0，空输出必须先排除，否则会被误判成「亮度 0%」
  if (out.length > 0 && Number.isFinite(Number(out))) {
    return { current: Math.max(0, Math.min(100, Number(out))), supported: true };
  }
  return { current: null, supported: false };
}

// ─── Wi-Fi 开关（wlanapi WlanSetInterface，无需管理员） ───

const WLAN_CLIENT_VERSION = 2;
const WLAN_LIST_HEAD_SIZE = 8;
const WLAN_IFACE_ITEM_SIZE = 532;
const WLAN_IFACE_OFF_GUID = 0;
const WLAN_OPCODE_RADIO_STATE = 0x104; // wlan_intf_opcode_radio_state
const DOT11_RADIO_ON = 1;
const DOT11_RADIO_OFF = 2;

interface WlanFns {
  open: (version: number, reserved: unknown, negotiated: Buffer, handle: Buffer) => number;
  enumInterfaces: (handle: number, reserved: unknown, list: Buffer) => number;
  query: (
    handle: number,
    guid: Buffer,
    opcode: number,
    reserved: unknown,
    size: Buffer,
    data: Buffer,
    opcodeType: Buffer,
  ) => number;
  set: (
    handle: number,
    guid: Buffer,
    opcode: number,
    dataSize: number,
    data: Buffer,
    reserved: unknown,
  ) => number;
  close: (handle: number, reserved: unknown) => number;
  decode: (ptr: unknown, size: number) => Buffer;
}

let wlanFns: WlanFns | null = null;
let wlanLoadFailed = false;

function ensureWlanApi(): WlanFns | null {
  if (wlanFns) return wlanFns;
  if (wlanLoadFailed) return null;
  try {
    const koffi = require('koffi');
    const dll = koffi.load('wlanapi.dll');
    wlanFns = {
      open: dll.func(
        'uint32 WlanOpenHandle(uint32 dwClientVersion, void* pReserved, void* pdwNegotiatedVersion, void* phClientHandle)',
      ),
      enumInterfaces: dll.func(
        'uint32 WlanEnumInterfaces(intptr_t hClientHandle, void* pReserved, void* ppInterfaceList)',
      ),
      query: dll.func(
        'uint32 WlanQueryInterface(intptr_t hClientHandle, void* pInterfaceGuid, uint32 OpCode, void* pReserved, void* pdwDataSize, void* ppData, void* pWlanOpcodeValueType)',
      ),
      set: dll.func(
        'uint32 WlanSetInterface(intptr_t hClientHandle, void* pInterfaceGuid, uint32 OpCode, uint32 dwDataSize, void* pData, void* pReserved)',
      ),
      close: dll.func('uint32 WlanCloseHandle(intptr_t hClientHandle, void* pReserved)'),
      decode: (ptr: unknown, size: number) => {
        const k = require('koffi');
        const buf = k.decode(ptr, 'uint8', size);
        return Buffer.from(buf);
      },
    };
  } catch (err) {
    log.warn('[system-controls] wlanapi 加载失败:', err);
    wlanLoadFailed = true;
    wlanFns = null;
  }
  return wlanFns;
}

let wlanHandle = 0;

function openWlanHandle(fns: WlanFns): number {
  if (wlanHandle) return wlanHandle;
  try {
    const negotiated = Buffer.alloc(4);
    const handleBuf = Buffer.alloc(PTR_BYTES);
    const rc = fns.open(WLAN_CLIENT_VERSION, null, negotiated, handleBuf);
    if (rc !== 0) return 0;
    wlanHandle = PTR_BYTES === 8 ? Number(handleBuf.readBigUInt64LE(0)) : handleBuf.readUInt32LE(0);
    return wlanHandle;
  } catch (err) {
    log.warn('[system-controls] WlanOpenHandle 失败:', err);
    return 0;
  }
}

function closeWlanHandle(fns: WlanFns): void {
  if (wlanHandle) {
    try {
      fns.close(wlanHandle, null);
    } catch {
      /* ignore */
    }
    wlanHandle = 0;
  }
}

function readPtr(buf: Buffer): number {
  if (PTR_BYTES === 8) return Number(buf.readBigUInt64LE(0));
  return buf.readUInt32LE(0);
}

/** 枚举第一个无线网卡并读取当前 Radio 状态（true=开） */
function getFirstWifiRadioState(
  fns: WlanFns,
  handle: number,
): { guid: Buffer; radioOn: boolean } | null {
  try {
    const listOut = Buffer.alloc(PTR_BYTES);
    const rc = fns.enumInterfaces(handle, null, listOut);
    if (rc !== 0) return null;
    const listPtr = readPtr(listOut);
    if (!listPtr) return null;
    const head = fns.decode(listPtr, WLAN_LIST_HEAD_SIZE);
    const count = head.readUInt32LE(0);
    if (count === 0) return null;
    // 第一个接口
    const first = fns.decode(listPtr, WLAN_LIST_HEAD_SIZE + WLAN_IFACE_ITEM_SIZE);
    const guid = Buffer.from(first.subarray(WLAN_IFACE_OFF_GUID, WLAN_IFACE_OFF_GUID + 16));
    // 查询 Radio 状态（DWORD：1=on 2=off）
    const sizeOut = Buffer.alloc(4);
    const dataOut = Buffer.alloc(PTR_BYTES);
    const opcodeType = Buffer.alloc(4);
    const qrc = fns.query(
      handle,
      guid,
      WLAN_OPCODE_RADIO_STATE,
      null,
      sizeOut,
      dataOut,
      opcodeType,
    );
    if (qrc !== 0) return { guid, radioOn: false };
    const dataPtr = readPtr(dataOut);
    if (!dataPtr) return { guid, radioOn: false };
    const state = fns.decode(dataPtr, 4).readUInt32LE(0);
    return { guid, radioOn: state === DOT11_RADIO_ON };
  } catch (err) {
    log.warn('[system-controls] 枚举 Wi-Fi 接口失败:', err);
    return null;
  }
}

export interface ToggleResult {
  /** 操作后的预期状态；null = 无法确定（需要用户手动处理） */
  enabled: boolean | null;
  needsSettings: boolean;
  message?: string;
}

/** Wi-Fi 开关：优先 WlanSetInterface，失败回退 netsh（需管理员） */
export async function toggleWifi(): Promise<ToggleResult> {
  try {
    const fns = ensureWlanApi();
    if (fns) {
      const handle = openWlanHandle(fns);
      if (handle) {
        const info = getFirstWifiRadioState(fns, handle);
        if (info) {
          const target = info.radioOn ? DOT11_RADIO_OFF : DOT11_RADIO_ON;
          const stateBuf = Buffer.alloc(4);
          stateBuf.writeUInt32LE(target, 0);
          const rc = fns.set(handle, info.guid, WLAN_OPCODE_RADIO_STATE, 4, stateBuf, null);
          if (rc === 0) {
            closeWlanHandle(fns);
            return { enabled: target === DOT11_RADIO_ON, needsSettings: false };
          }
          log.warn('[system-controls] WlanSetInterface 失败 rc=', rc, '，回退 netsh');
        }
      }
      closeWlanHandle(fns);
    }
  } catch (err) {
    log.warn('[system-controls] WlanSetInterface 异常:', err);
  }
  return toggleWifiViaNetsh();
}

/** netsh 回退：查询无线网卡 → 按当前状态 admin=enable/disable（需要管理员权限） */
async function toggleWifiViaNetsh(): Promise<ToggleResult> {
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$a = Get-NetAdapter | Where-Object { $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN|802.11' -or $_.Name -match 'Wi-Fi|WLAN|Wireless' } | Select-Object -First 1`,
    `if (-not $a) { Write-Output 'NO_ADAPTER'; exit }`,
    `$name = $a.Name`,
    `$wasDisabled = ($a.Status -eq 'Disabled')`,
    `if ($wasDisabled) {`,
    `  netsh interface set interface name="$name" admin=enable | Out-Null`,
    `  Start-Sleep -Milliseconds 600`,
    `  $now = Get-NetAdapter -Name $name`,
    `  if ($now.Status -ne 'Disabled') { Write-Output 'ON' } else { Write-Output 'FAILED' }`,
    `} else {`,
    `  netsh interface set interface name="$name" admin=disable | Out-Null`,
    `  Start-Sleep -Milliseconds 600`,
    `  $now = Get-NetAdapter -Name $name`,
    `  if ($now.Status -eq 'Disabled') { Write-Output 'OFF' } else { Write-Output 'FAILED' }`,
    `}`,
  ].join('\n');
  const out = await runPowerShell(script);
  if (out === 'ON') return { enabled: true, needsSettings: false };
  if (out === 'OFF') return { enabled: false, needsSettings: false };
  if (out === 'NO_ADAPTER') {
    return { enabled: null, needsSettings: true, message: '未找到无线网卡' };
  }
  return { enabled: null, needsSettings: true, message: '切换 Wi-Fi 需要管理员权限' };
}

// ─── 蓝牙开关（PowerShell PnP，需管理员） ───

export async function toggleBluetooth(): Promise<ToggleResult> {
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$d = Get-PnpDevice -Class Bluetooth -Status OK | Select-Object -First 1`,
    `if (-not $d) { $d = Get-PnpDevice -Class Bluetooth | Select-Object -First 1 }`,
    `if (-not $d) { Write-Output 'NO_DEVICE'; exit }`,
    `if ($d.Status -eq 'OK') {`,
    `  Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false | Out-Null`,
    `  Write-Output 'OFF'`,
    `} else {`,
    `  Enable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false | Out-Null`,
    `  Write-Output 'ON'`,
    `}`,
  ].join('\n');
  const out = await runPowerShell(script);
  if (out === 'OFF') return { enabled: false, needsSettings: false };
  if (out === 'ON') return { enabled: true, needsSettings: false };
  if (out === 'NO_DEVICE') {
    return { enabled: null, needsSettings: true, message: '未找到蓝牙设备' };
  }
  return { enabled: null, needsSettings: true, message: '切换蓝牙需要管理员权限' };
}

// ─── 打开系统设置页 ───

/** 打开 Windows 设置页（ms-settings URI） */
export function openSystemSettingsPage(uri: string): void {
  void shell.openExternal(uri);
}

/** 打开任务管理器（CPU / 内存悬停卡片的快捷入口） */
export function openTaskManager(): void {
  if (process.platform !== 'win32') return;
  execFile('taskmgr.exe', [], { windowsHide: false }, (err) => {
    if (err) log.warn('[system-controls] 打开任务管理器失败:', err);
  });
}
