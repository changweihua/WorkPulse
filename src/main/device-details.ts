/**
 * Touch Bar 悬停卡片补充信息采集（主进程）
 *
 * 设计口径：
 * - Wi-Fi / 蓝牙 / CPU / 内存 / 电池这些实时字段走 hw-stats 每秒推送，这里不重复采集；
 * - 音频设备名、IPv4、CPU 型号是静态或近乎静态的，同步读取即可，hover 时零等待；
 * - 亮度要跑一次 PowerShell（WMI），最慢可到数秒，故采用「后台预取 + 30s 缓存 +
 *   完成后广播」：首屏卡片先显示其它字段，亮度回填后再推一次给渲染层。
 */
import { cpus, networkInterfaces } from 'os';
import log from 'electron-log/main';
import type { DeviceDetails } from '../shared/touchbar';
import { getBrightness, getDefaultAudioDeviceName } from './system-controls';

/** 亮度刷新间隔（毫秒） */
const REFRESH_INTERVAL_MS = 30_000;

let brightness: number | null = null;
let brightnessSupported = false;
/** 上次开始刷新亮度的时间（失败也刷新，避免坏环境下反复 spawn） */
let brightnessFetchedAt = 0;
/** 进行中的亮度采集（并发去重） */
let inFlight: Promise<void> | null = null;

type Listener = (details: DeviceDetails) => void;
const listeners = new Set<Listener>();

/** 取第一个非回环 IPv4（Node 18 为 'IPv4' 字符串，Node 20+ 也可能给数字 4） */
function pickIpv4(): string | null {
  try {
    for (const list of Object.values(networkInterfaces())) {
      if (!list) continue;
      for (const addr of list) {
        const isV4 = addr.family === 'IPv4' || (addr.family as unknown as number) === 4;
        if (isV4 && !addr.internal && addr.address) return addr.address;
      }
    }
  } catch (err) {
    log.warn('[device-details] 读取本机 IP 失败:', err);
  }
  return null;
}

/** CPU 型号与逻辑核心数（os.cpus() 是同步且开销可忽略） */
function cpuInfo(): { cpuModel: string | null; cpuCores: number } {
  try {
    const list = cpus();
    return { cpuModel: list[0]?.model?.trim() || null, cpuCores: list.length };
  } catch {
    return { cpuModel: null, cpuCores: 0 };
  }
}

/** 组装一份当前已知详情（亮度可能仍是上一次的缓存值） */
export function getDeviceDetails(): DeviceDetails {
  const { cpuModel, cpuCores } = cpuInfo();
  return {
    audioDevice: getDefaultAudioDeviceName(),
    ipv4: pickIpv4(),
    brightness,
    brightnessSupported,
    cpuModel,
    cpuCores,
    ts: Date.now(),
  };
}

/** 注册详情变更订阅（由 touchbar-window 转成 IPC 广播），返回取消订阅函数 */
export function onDeviceDetailsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  const details = getDeviceDetails();
  for (const listener of listeners) {
    try {
      listener(details);
    } catch (err) {
      log.warn('[device-details] 详情订阅者回调失败:', err);
    }
  }
}

/**
 * 后台刷新亮度（TTL + 并发去重），完成后广播一份新详情。
 * 调用方无需 await，也不会因采集失败收到 rejection。
 */
export function refreshDeviceDetails(force = false): void {
  if (!force && Date.now() - brightnessFetchedAt < REFRESH_INTERVAL_MS) return;
  if (inFlight) return;
  brightnessFetchedAt = Date.now();
  inFlight = getBrightness()
    .then((result) => {
      brightness = result.current;
      brightnessSupported = result.supported;
      emit();
    })
    .catch((err: unknown) => {
      log.warn('[device-details] 读取亮度失败:', err);
    })
    .finally(() => {
      inFlight = null;
    });
}
