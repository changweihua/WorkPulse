/**
 * 硬件状态采集与推送（主进程）
 * - CPU：os.cpus() 两次采样差分 + EMA 平滑
 * - 内存：process.getSystemMemoryInfo()（单位 KB）
 * - 电池：powerMonitor.isOnBatteryPower()
 * 每 1000ms 向目标窗口推送 'hw-stats' 事件，变化小于阈值时去抖不发送。
 */
import { BrowserWindow, powerMonitor } from 'electron';
import { cpus } from 'os';
import { HW_STATS_CHANNEL, type HwStats } from '../shared/hw-stats';

/** 采样间隔（毫秒） */
const SAMPLE_INTERVAL_MS = 1000;
/** EMA 平滑系数：ema = ema * 0.5 + cur * 0.5（减弱平滑以降低 1~2s 滞后） */
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
let lastSent: { cpu: number | null; memUsedPct: number } | null = null;
/** 上一次实际推送的时间戳（用于时间兜底强制推送） */
let lastPushAt = 0;

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
  const stats: HwStats = {
    cpu,
    memUsedPct: mem.memUsedPct,
    memUsedGB: mem.memUsedGB,
    memTotalGB: mem.memTotalGB,
    onBattery: sampleOnBattery(),
    ts: Date.now(),
  };
  // 去抖：首帧必发；其后 cpu 或 memUsedPct 变化 ≥1% 才发；
  // 距上次推送 ≥3000ms 时即使无变化也强制推送，避免缓慢连续变化被饿死
  if (lastSent) {
    const cpuChanged =
      stats.cpu === null || lastSent.cpu === null
        ? stats.cpu !== lastSent.cpu
        : Math.abs(stats.cpu - lastSent.cpu) >= DEBOUNCE_THRESHOLD_PCT;
    const memChanged = Math.abs(stats.memUsedPct - lastSent.memUsedPct) >= DEBOUNCE_THRESHOLD_PCT;
    const fallbackDue = Date.now() - lastPushAt >= PUSH_FALLBACK_MS;
    if (!cpuChanged && !memChanged && !fallbackDue) return;
  }
  if (win.isDestroyed() || win.webContents.isDestroyed()) {
    stopHwStats();
    targetWin = null;
    return;
  }
  win.webContents.send(HW_STATS_CHANNEL, stats);
  lastSent = { cpu: stats.cpu, memUsedPct: stats.memUsedPct };
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
  if (timer) return; // 已在采样中
  prevTimes = null; // 重建差分基线（新会话首帧 cpu 为 null）
  timer = setInterval(tick, SAMPLE_INTERVAL_MS);
  tick(); // 立即推送首帧，避免 UI 等待 1 秒
}

/** 停止硬件状态采样（系统休眠 / 窗口销毁时调用），并复位采样状态避免二次启动沿用旧数据 */
export function stopHwStats(): void {
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
