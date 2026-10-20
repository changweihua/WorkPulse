/**
 * 电池充电 / 节能状态读取（Windows / koffi 进程内 FFI）
 *
 * 解决 Windows 上 `navigator.getBattery().charging` 只是「插电」别名、无法区分满电断充的问题。
 * 进程内直接调用 powrprof.dll 的 CallNtPowerInformation(SystemBatteryState)，
 * 与 WMI `BatteryStatus.Charging` 同源（底层均为 ACPI 电池状态），但无需 spawn cscript/powershell，
 * 无临时文件写入、无进程启动开销，调用耗时 µs 级。
 *
 * 节能模式来自 kernel32.dll 的 GetSystemPowerStatus（同样是 Win32 API，不需要 PowerShell）：
 *   SYSTEM_POWER_STATUS.SystemStatusFlag 的 bit0 = 1 表示「节电模式（Battery Saver）已开启」。
 *   ⚠️ 该结构实测 sizeof = 12 字节，SystemStatusFlag 在偏移 3；
 *   （任务书里写的「29 字节 / 偏移 12」与 Windows SDK 定义不符，实测 GetSystemPowerStatus
 *    回填 12 字节：ACLineStatus/BatteryFlag/BatteryLifePercent/SystemStatusFlag 各 1 字节，
 *    之后两个 DWORD。以实测布局为准。）
 *
 * koffi 使用注意事项（实测坑，务必遵守）：
 * 1. 出参传入 Buffer（void *outBuf）由本模块手动按字节偏移解析，
 *    直接传 JS 对象会被 koffi 拒绝或字段不回填（「Unexpected Object value」）。
 * 2. 禁止使用 koffi.decode 到 JS 对象（实测触发 node 原生崩溃 Check failed: IsJSReceiver）。
 * 3. 禁止使用 koffi 数组语法（如 `['bool', 4]`），会报
 *    「Member specifier array must contain alignement value and type」；
 *    本模块改用原始 Buffer 解析，从根本上规避此限制。
 *
 * 参考 src/main/cursor.ts 的 koffi 加载模式（require + 懒加载，失败降级返回 null）。
 */

import log from 'electron-log/main';

/** SYSTEM_BATTERY_STATE 结构大小（字节，实测 sizeof=32） */
const BATTERY_STATE_SIZE = 32;
/**
 * POWER_INFORMATION_LEVEL 枚举中的 SystemBatteryState 等级值。
 * 对应结构 SYSTEM_BATTERY_STATE 布局（共 32 字节）：
 *   偏移 0  AcOnLine            BOOLEAN（是否接通交流电源）
 *   偏移 1  BatteryPresent      BOOLEAN（是否存在电池）
 *   偏移 2  Charging            BOOLEAN（是否正在充电）
 *   偏移 3  Discharging         BOOLEAN（是否正在放电）
 *   偏移 4  Spare1[4]           BOOLEAN ×4（保留位，共 4 字节）
 *   偏移 8  MaxCapacity         ULONG   （最大容量）
 *   偏移 12 RemainingCapacity   ULONG   （剩余容量）
 *   偏移 16 Rate                ULONG   （瞬时功率）
 *   偏移 20 EstimatedTime       ULONG   （预计剩余时间）
 *   偏移 24 DefaultAlert1       ULONG
 *   偏移 28 DefaultAlert2       ULONG
 */
const SYSTEM_BATTERY_STATE_LEVEL = 5;
/** NTSTATUS 成功码（0 = STATUS_SUCCESS） */
const STATUS_SUCCESS = 0;

/**
 * SYSTEM_POWER_STATUS 结构大小（字节，实测 sizeof=12）：
 *   偏移 0  ACLineStatus        BYTE（0=离线 1=在线 255=未知）
 *   偏移 1  BatteryFlag         BYTE（位标志）
 *   偏移 2  BatteryLifePercent  BYTE
 *   偏移 3  SystemStatusFlag    BYTE（bit0 = 节电模式开启）
 *   偏移 4  BatteryLifeTime     DWORD（秒）
 *   偏移 8  BatteryFullLifeTime DWORD（秒）
 */
const SYSTEM_POWER_STATUS_SIZE = 12;
/** SystemStatusFlag 所在偏移 */
const SPS_OFF_SYSTEM_STATUS_FLAG = 3;
/** SYSTEM_POWER_STATUS.SystemStatusFlag 的「节电模式开启」位 */
const SPS_SYSTEM_STATUS_FLAG_BATTERY_SAVER = 0x01;

/** powrprof.dll 模块句柄（懒加载） */
let powrprof: any = null;
/** CallNtPowerInformation 函数句柄（懒加载） */
let callNtPowerInformation: any = null;
/** kernel32.dll 模块句柄（懒加载） */
let kernel32: any = null;
/** GetSystemPowerStatus 函数句柄（懒加载） */
let getSystemPowerStatus: any = null;

/**
 * 懒加载 powrprof.dll 并解析 CallNtPowerInformation 符号（幂等）。
 * 非 win32、dll 缺失或 koffi 加载失败时返回 false，由调用方降级处理。
 */
function ensureInit(): boolean {
  if (callNtPowerInformation) return true;
  try {
    const koffi = require('koffi');
    powrprof = koffi.load('powrprof.dll');
    // 返回 NTSTATUS（LONG，32 位有符号）；进出参均为裸指针，由本模块手动解析
    callNtPowerInformation = powrprof.func(
      'int CallNtPowerInformation(int InformationLevel, void *InputBuffer, uint32 InputBufferLength, void *OutputBuffer, uint32 OutputBufferLength)',
    );
    return true;
  } catch (err) {
    log.warn('[battery] koffi/powrprof load failed:', err);
    return false;
  }
}

/**
 * 懒加载 kernel32.dll 的 GetSystemPowerStatus（幂等）。
 * 与电池状态分开加载：任一 dll 不可用只影响对应字段，不互相拖累。
 */
function ensurePowerStatusApi(): boolean {
  if (getSystemPowerStatus) return true;
  try {
    const koffi = require('koffi');
    kernel32 = koffi.load('kernel32.dll');
    getSystemPowerStatus = kernel32.func('int GetSystemPowerStatus(void *lpSystemPowerStatus)');
    return true;
  } catch (err) {
    log.warn('[battery] koffi/kernel32 load failed:', err);
    return false;
  }
}

/**
 * 读取「节电模式是否开启」。
 * 非 win32 / 调用失败 / API 不可用均返回 null（未知）；
 * 注意 SystemStatusFlag 的其它位（如「显示器关闭」）与节能无关，只取 bit0。
 */
export function readPowerSaving(): boolean | null {
  if (process.platform !== 'win32') return null;
  if (!ensurePowerStatusApi()) return null;
  try {
    const out = Buffer.alloc(SYSTEM_POWER_STATUS_SIZE);
    if (!getSystemPowerStatus(out)) return null;
    return (out.readUInt8(SPS_OFF_SYSTEM_STATUS_FLAG) & SPS_SYSTEM_STATUS_FLAG_BATTERY_SAVER) !== 0;
  } catch (err) {
    log.warn('[battery] readPowerSaving failed:', err);
    return null;
  }
}

/**
 * 读取一次电池状态。
 * 非 win32 / powrprof 加载失败 / 调用失败 / 无电池（台式机）均返回 null（未知）。
 * 成功时返回：
 *   acOnline   是否接通交流电源
 *   charging   是否正在充电（可区分满电断充）
 *   percent    电量百分比（0–100，MaxCapacity 为 0 时返回 null）
 *   powerSaving 节电模式是否开启（GetSystemPowerStatus 独立读取，失败为 null 但不影响其它字段）
 */
export function readBatteryState(): {
  acOnline: boolean;
  charging: boolean;
  percent: number | null;
  powerSaving: boolean | null;
} | null {
  if (process.platform !== 'win32') return null;
  if (!ensureInit()) return null;
  try {
    // 出参用原始 Buffer，调用后手动按偏移解析（见文件头 koffi 注意事项）
    const out = Buffer.alloc(BATTERY_STATE_SIZE);
    const status = callNtPowerInformation(
      SYSTEM_BATTERY_STATE_LEVEL,
      null, // InputBuffer：SystemBatteryState 不需要入参
      0, // InputBufferLength
      out, // OutputBuffer
      BATTERY_STATE_SIZE, // OutputBufferLength
    );
    if (status !== STATUS_SUCCESS) return null;
    const acOnline = out.readUInt8(0) !== 0;
    const batteryPresent = out.readUInt8(1) !== 0;
    const charging = out.readUInt8(2) !== 0;
    if (!batteryPresent) return null; // 无电池（台式机）→ 视为未知
    const maxCapacity = out.readUInt32LE(8);
    const remainingCapacity = out.readUInt32LE(12);
    const percent = maxCapacity > 0 ? Math.round((remainingCapacity / maxCapacity) * 100) : null;
    // 节能模式单独一次 Win32 调用（µs 级），失败只让该字段为 null
    const powerSaving = readPowerSaving();
    return { acOnline, charging, percent, powerSaving };
  } catch (err) {
    log.warn('[battery] readBatteryState failed:', err);
    return null;
  }
}
