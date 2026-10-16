/**
 * 电池充电状态读取（Windows / koffi 进程内 FFI）
 *
 * 解决 Windows 上 `navigator.getBattery().charging` 只是「插电」别名、无法区分满电断充的问题。
 * 进程内直接调用 powrprof.dll 的 CallNtPowerInformation(SystemBatteryState)，
 * 与 WMI `BatteryStatus.Charging` 同源（底层均为 ACPI 电池状态），但无需 spawn cscript/powershell，
 * 无临时文件写入、无进程启动开销，调用耗时 µs 级。
 *
 * koffi 使用注意事项（实测坑，务必遵守）：
 * 1. 出参传入 Buffer（void *outBuf）由本模块手动按字节偏移解析，
 *    直接传 JS 对象会被 koffi 拒绝或字段不回填（「Unexpected Object value」）。
 * 2. 禁止使用 koffi.decode（实测触发 node 原生崩溃 Check failed: IsJSReceiver）。
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

/** powrprof.dll 模块句柄（懒加载） */
let powrprof: any = null;
/** CallNtPowerInformation 函数句柄（懒加载） */
let callNtPowerInformation: any = null;

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
 * 读取一次电池状态。
 * 非 win32 / powrprof 加载失败 / 调用失败 / 无电池（台式机）均返回 null（未知）。
 * 成功时返回：
 *   acOnline 是否接通交流电源
 *   charging 是否正在充电（可区分满电断充）
 *   percent  电量百分比（0–100，MaxCapacity 为 0 时返回 null）
 */
export function readBatteryState(): {
  acOnline: boolean;
  charging: boolean;
  percent: number | null;
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
    const percent =
      maxCapacity > 0 ? Math.round((remainingCapacity / maxCapacity) * 100) : null;
    return { acOnline, charging, percent };
  } catch (err) {
    log.warn('[battery] readBatteryState failed:', err);
    return null;
  }
}
