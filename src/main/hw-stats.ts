/**
 * 硬件状态采集与推送（主进程）
 * - CPU：os.cpus() 两次采样差分 + EMA 平滑
 * - 内存：process.getSystemMemoryInfo()（单位 KB）
 * - 电池：powerMonitor.isOnBatteryPower()
 * - 充电 / 节能：Windows 下每 1s 经 koffi 进程内调用 powrprof.CallNtPowerInformation +
 *   kernel32.GetSystemPowerStatus（navigator.getBattery().charging 在 Windows 上只是「插电」别名，
 *   无法区分满电断充；改用进程内调用后无 spawn、无临时文件写入，消除了 cscript/VBScript 方案的杀软误报面）
 * - 主题：每 tick 读 nativeTheme.shouldUseDarkColors（Windows 应用模式，跟随系统深浅色）
 * - Wi-Fi / 以太网 / 互联网连通性 / 蓝牙：委托 src/main/network-status.ts 采集，
 *   本模块只做异步缓存读取，绝不阻塞 1s 的 CPU/内存采样节奏
 *   （网络模块内部自带 3s / 15s / 8s 轮询缓存）
 * 每 1000ms 向目标窗口推送 'hw-stats' 事件，变化小于阈值时去抖不发送。
 */
import { BrowserWindow, nativeTheme, powerMonitor } from 'electron';
import { cpus } from 'os';
import {
  HW_STATS_CHANNEL,
  type BluetoothStatus,
  type EthernetStatus,
  type HwStats,
  type WifiStatus,
} from '../shared/hw-stats';
import { readBatteryState, readPowerSaving } from './battery';
import { getBluetoothStatus, getNetworkProbe, getWifiStatus } from './network-status';

/** 采样间隔（毫秒） */
const SAMPLE_INTERVAL_MS = 1000;
/** 充电 / 节能状态轮询间隔（毫秒）：进程内调用耗时 µs 级，贴近 1s 采样节奏以便插拔快速反馈 */
const CHARGING_POLL_INTERVAL_MS = 1000;
/**
 * EMA 平滑系数：ema = ema * 0.5 + cur * 0.5（减弱平滑以降低 1~2s 滞后）
 */
const EMA_ALPHA = 0.5;
/** 突变阈值（%）：当帧原始值与 EMA 差距达到该值时直接取原始值，快速收敛 */
const EMA_JUMP_THRESHOLD_PCT = 10;
/** 去抖阈值（%）：cpu 与内存使用率变化均小于该值时不推送 */
const DEBOUNCE_THRESHOLD_PCT = 1;
/** 推送时间兜底（毫秒）：距上次推送达到该时长即使无变化也强制推送，避免缓慢连续变化被饿死 */
const PUSH_FALLBACK_MS = 3000;

/** 推送目标窗口 */
let targetWin: BrowserWindow | null = null;
/** 采样定时器（主进程定时器，非渲染进程） */
let timer: ReturnType<typeof setInterval> | null = null;
/** suspend/resume 监听是否已注册（避免重复注册） */
let powerBound = false;

/** 上一次 CPU times 汇总（用于差分） */
let prevTimes: { total: number; idle: number } | null = null;
/** CPU 使用率 EMA 平滑值 */
let emaCpu: number | null = null;
/** 上一次实际推送的负载（用于去抖比较） */
let lastSent: {
  cpu: number | null;
  memUsedPct: number;
  charging: boolean | null;
  powerSaving: boolean | null;
  wifi: string;
  ethernet: string;
  bluetooth: string;
  theme: 'light' | 'dark';
} | null = null;
/** 上一次实际推送的时间戳（用于时间兜底强制推送） */
let lastPushAt = 0;
/** 充电 / 节能状态轮询定时器（独立于采样定时器，1s 一次） */
let chargingTimer: ReturnType<typeof setInterval> | null = null;
/** 充电状态最新值（true=充电中 false=插电未充电 null=未知/无电池/读取失败） */
let realCharging: boolean | null = null;
/** 节电模式最新值（true=已开启 false=未开启 null=未知/无电池/读取失败） */
let realPowerSaving: boolean | null = null;
/**
 * Wi-Fi / 以太网 / 蓝牙最新快照（由 network-status 异步缓存回填）。
 * 首次采样前为 null，下一帧（≤1s）即带上真实值。
 */
let wifiStatus: WifiStatus | null = null;
let ethernetStatus: EthernetStatus | null = null;
let bluetoothStatus: BluetoothStatus | null = null;

/** 汇总所有核心的 CPU times（total / idle），无 CPU 数据时返回 null */
function readCpuTimes(): { total: number; idle: number } | null {
  const list = cpus();
  if (!list || list.length === 0) return null; // os.cpus() 可能返回空数组
  let total = 0;
  let idle = 0;
  for (const core of list) {
    const t = core.times;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
    idle += t.idle;
  }
  return { total, idle };
}

/** 采样 CPU 使用率：两次采样差分 + EMA 平滑；首帧无差分数据返回 null */
function sampleCpu(): number | null {
  const cur = readCpuTimes();
  if (!cur) return null;
  const prev = prevTimes;
  prevTimes = cur;
  if (!prev) return null; // 首帧：没有上一次采样，无法差分
  const deltaTotal = cur.total - prev.total;
  if (deltaTotal <= 0) return emaCpu; // 计数器未推进：沿用上次平滑值
  const raw = (1 - (cur.idle - prev.idle) / deltaTotal) * 100;
  const clamped = Math.min(100, Math.max(0, raw));
  if (emaCpu === null) {
    emaCpu = clamped;
  } else if (Math.abs(clamped - emaCpu) >= EMA_JUMP_THRESHOLD_PCT) {
    emaCpu = clamped; // 突变：当帧直接取原始值，避免长时间爬坡
  } else {
    emaCpu = emaCpu * (1 - EMA_ALPHA) + clamped * EMA_ALPHA;
  }
  return Math.round(emaCpu * 10) / 10;
}

/**
 * 采样内存使用情况，失败返回 null。
 * 口径确认：使用 process.getSystemMemoryInfo()（非 os.freemem()），单位 KB，
 * memUsedPct = (total - free) / total * 100，与任务管理器「已用」口径一致。
 */
function sampleMem(): { memUsedPct: number; memUsedGB: number; memTotalGB: number } | null {
  try {
    const info = process.getSystemMemoryInfo();
    const totalKB = info.total;
    if (!totalKB) return null;
    const usedKB = totalKB - info.free;
    const toGB = (kb: number): number => Math.round((kb / 1024 / 1024) * 10) / 10;
    return {
      memUsedPct: Math.round((usedKB / totalKB) * 1000) / 10,
      memUsedGB: toGB(usedKB),
      memTotalGB: toGB(totalKB),
    };
  } catch {
    return null;
  }
}

/** 是否电池供电（台式机恒为 false） */
function sampleOnBattery(): boolean {
  try {
    return powerMonitor.isOnBatteryPower();
  } catch {
    return false;
  }
}

/** 当前系统外观（跟随 Windows「应用模式」，无需监听事件，每 tick 读一次开销可忽略） */
function sampleTheme(): 'light' | 'dark' {
  try {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * 读取一次电池状态刷新 realCharging / realPowerSaving。
 * 非 Windows / 调用失败 / 无电池（台式机）时 readBatteryState 返回 null → charging 沿用上一次值
 * （初始即 null，即「未知」，渲染进程回退 navigator.getBattery().charging），
 * 避免偶发读取失败把真实状态覆盖成 null 造成闪断；
 * powerSaving 此时改由 readPowerSaving 独立读取（台式机的节能模式也要能反映）。
 * 实现：koffi 进程内调用 powrprof.dll CallNtPowerInformation + kernel32.GetSystemPowerStatus。
 */
function pollCharging(): void {
  const state = readBatteryState();
  if (state) {
    realCharging = state.charging;
    // 节能位单独可能为 null（查询失败），此时保留旧值而不是覆盖成未知
    if (state.powerSaving !== null) realPowerSaving = state.powerSaving;
    return;
  }
  // 无电池（台式机）/ 电池查询失败时 readBatteryState 整体为 null，
  // 但 Win11 24H2 起台式机也有「节能模式」，故单独读一次 SystemStatusFlag，
  // 避免该字段在台式机上恒为未知（charging 仍保持 null，由渲染层回退）
  const powerSaving = readPowerSaving();
  if (powerSaving !== null) realPowerSaving = powerSaving;
}

/** 启动充电 / 节能状态轮询（幂等；先同步拉一次再挂定时器） */
function startChargingPoll(): void {
  if (chargingTimer) return;
  pollCharging();
  chargingTimer = setInterval(pollCharging, CHARGING_POLL_INTERVAL_MS);
}

/** 停止充电 / 节能状态轮询并复位缓存值 */
function stopChargingPoll(): void {
  if (chargingTimer) {
    clearInterval(chargingTimer);
    chargingTimer = null;
  }
  realCharging = null;
  realPowerSaving = null;
}

/**
 * 异步刷新 Wi-Fi / 以太网 / 蓝牙快照（不 await、不阻塞采样）。
 * network-status 内部按 3s / 15s / 8s 限流，每秒调用也只会命中缓存；
 * 结果回填到模块变量，供下一次 tick 组装负载，避免拖慢 1s 的 CPU/内存采样。
 */
function refreshNetworkStatus(): void {
  getWifiStatus()
    .then((value) => {
      wifiStatus = value;
    })
    .catch(() => {
      /* network-status 内部已兜底并记录日志，这里只防止未捕获的 rejection */
    });
  getNetworkProbe()
    .then((value) => {
      ethernetStatus = value.ethernet;
    })
    .catch(() => {
      /* 同上：探测失败时保留上一次以太网快照 */
    });
  getBluetoothStatus()
    .then((value) => {
      bluetoothStatus = value;
    })
    .catch(() => {
      /* 同上 */
    });
}

/**
 * 把网络 / 外观状态压成字符串签名，用于去抖比较。
 * 只取「会让 UI 变化」的字段：wifi 用 available/connected/ssid/bars/hasInternet，
 * 以太网用 connected/name，蓝牙用设备名 + 电量列表；
 * theme 与 powerSaving 也必须纳入，否则这些字段单独变化会被去抖吞掉。
 * null 与空列表需要区分，故显式拼 'null'。
 */
function networkSignature(
  stats: Pick<HwStats, 'wifi' | 'ethernet' | 'bluetooth' | 'theme' | 'powerSaving'>,
): {
  wifi: string;
  ethernet: string;
  bluetooth: string;
  theme: 'light' | 'dark';
  powerSaving: boolean | null;
} {
  const { wifi, ethernet, bluetooth, theme, powerSaving } = stats;
  return {
    wifi: wifi
      ? `${wifi.available}|${wifi.connected}|${wifi.ssid ?? ''}|${wifi.bars}|${wifi.hasInternet}`
      : 'null',
    ethernet: ethernet ? `${ethernet.connected}|${ethernet.name ?? ''}` : 'null',
    bluetooth: bluetooth
      ? `${bluetooth.available}|${bluetooth.devices.map((d) => `${d.name}:${d.battery ?? 'x'}`).join(',')}`
      : 'null',
    theme,
    powerSaving,
  };
}

/** 执行一次采样，按去抖规则推送到目标窗口 */
function tick(): void {
  const win = targetWin;
  if (!win || win.isDestroyed()) {
    // 窗口已销毁：停止采样并清理状态
    stopHwStats();
    targetWin = null;
    return;
  }
  const cpu = sampleCpu();
  const mem = sampleMem();
  if (!mem) return; // 内存采样失败，本帧跳过
  // 触发一次异步网络状态刷新（命中缓存时零系统开销），结果在下一帧生效
  refreshNetworkStatus();
  const stats: HwStats = {
    cpu,
    memUsedPct: mem.memUsedPct,
    memUsedGB: mem.memUsedGB,
    memTotalGB: mem.memTotalGB,
    onBattery: sampleOnBattery(),
    charging: realCharging,
    powerSaving: realPowerSaving,
    wifi: wifiStatus,
    ethernet: ethernetStatus,
    bluetooth: bluetoothStatus,
    theme: sampleTheme(),
    ts: Date.now(),
  };
  const signature = networkSignature(stats);
  // 去抖：首帧必发；其后 cpu 或 memUsedPct 变化 ≥1%、充电/节能/外观变化、
  // 或 Wi-Fi/以太网/蓝牙状态变化才发；
  // 距上次推送 ≥3000ms 时即使无变化也强制推送，避免缓慢连续变化被饿死
  if (lastSent) {
    const cpuChanged =
      stats.cpu === null || lastSent.cpu === null
        ? stats.cpu !== lastSent.cpu
        : Math.abs(stats.cpu - lastSent.cpu) >= DEBOUNCE_THRESHOLD_PCT;
    const memChanged = Math.abs(stats.memUsedPct - lastSent.memUsedPct) >= DEBOUNCE_THRESHOLD_PCT;
    const chargingChanged = stats.charging !== lastSent.charging;
    const powerSavingChanged = stats.powerSaving !== lastSent.powerSaving;
    const wifiChanged = signature.wifi !== lastSent.wifi;
    const ethernetChanged = signature.ethernet !== lastSent.ethernet;
    const btChanged = signature.bluetooth !== lastSent.bluetooth;
    const themeChanged = signature.theme !== lastSent.theme;
    const fallbackDue = Date.now() - lastPushAt >= PUSH_FALLBACK_MS;
    if (
      !cpuChanged &&
      !memChanged &&
      !chargingChanged &&
      !powerSavingChanged &&
      !wifiChanged &&
      !ethernetChanged &&
      !btChanged &&
      !themeChanged &&
      !fallbackDue
    ) {
      return;
    }
  }
  if (win.isDestroyed() || win.webContents.isDestroyed()) {
    stopHwStats();
    targetWin = null;
    return;
  }
  win.webContents.send(HW_STATS_CHANNEL, stats);
  lastSent = {
    cpu: stats.cpu,
    memUsedPct: stats.memUsedPct,
    charging: stats.charging,
    powerSaving: stats.powerSaving,
    theme: stats.theme,
    wifi: signature.wifi,
    ethernet: signature.ethernet,
    bluetooth: signature.bluetooth,
  };
  lastPushAt = Date.now();
}

/** 注册系统休眠/恢复监听（幂等，模块内只注册一次） */
function bindPowerListeners(): void {
  if (powerBound) return;
  powerBound = true;
  // 休眠时暂停采样
  powerMonitor.on('suspend', () => stopHwStats());
  // 恢复后重启采样（窗口仍存活才重启）
  powerMonitor.on('resume', () => {
    const win = targetWin;
    if (win && !win.isDestroyed()) startHwStats(win);
  });
}

/**
 * 启动硬件状态采样与推送。
 * 重复调用只切换目标窗口，不会叠加定时器。
 */
export function startHwStats(win: BrowserWindow): void {
  targetWin = win;
  bindPowerListeners();
  startChargingPoll(); // 充电 / 节能状态轮询（1s，独立于采样定时器，幂等）
  if (timer) return; // 已在采样中
  prevTimes = null; // 重建差分基线（新会话首帧 cpu 为 null）
  timer = setInterval(tick, SAMPLE_INTERVAL_MS);
  tick(); // 立即推送首帧，避免 UI 等待 1 秒
}

/** 停止硬件状态采样（系统休眠 / 窗口销毁时调用），并复位采样状态避免二次启动沿用旧数据 */
export function stopHwStats(): void {
  stopChargingPoll(); // 停充电 / 节能轮询并复位缓存值
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  // 复位差分基线、EMA 与去抖状态，防止二次启动用旧状态做差分或卡去抖
  prevTimes = null;
  emaCpu = null;
  lastSent = null;
  lastPushAt = 0;
}
