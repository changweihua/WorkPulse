/**
 * 硬件状态环 —— 中部槽位「场景构建器」（纯函数，无 React 依赖）
 *
 * 为什么单独抽出来（沿用 status-trio 的「场景 / 渲染分离」架构）：
 * - 中部槽位（中心圆半径 < CENTER_R 的区域）到底显示 Wi-Fi / 蓝牙 / 以太网 / 热点，
 *   是一条**带抢占的优先链**，而不是简单的「有哪个显示哪个」；
 * - 这条判定链只允许存在于本文件一处：组件只按返回的场景做图标映射
 *   （读数条已移除，收起态图标本身就是这份场景的唯一出口）；
 * - 纯函数 → 可在无 DOM / 无硬件环境下直接断言，后续再加新场景
 *   只需在这里扩一个场景类型，渲染层不必重算优先级。
 *
 * 优先链（前面的抢占后面的，与 status-trio 对齐、用户已拍板）：
 * 1. Wi-Fi 关闭 / 不可用（wifi === null 或 available === false）且**没有以太网**
 *    → 斜杠 Wi-Fi（这才是「错误级」网络状态）
 * 2. Wi-Fi 已连接但无互联网（hasInternet === false）→ Wi-Fi 图标 + 琥珀色感叹号
 * 3. 以太网已连接 → 以太网图标
 * 4. 蓝牙已连接外设（devices.length > 0）→ 蓝牙图标
 * 5. Wi-Fi 已连接 → 按信号格数的三段弧；SSID 命中热点关键词时改用链环图标（Link）
 * 6. Wi-Fi 已开启但未关联任何 SSID → 空心 Wi-Fi
 * 7. 兜底（无任何硬件数据）→ 斜杠 Wi-Fi
 *
 * 关键变化（G6）：**Wi-Fi 开启但未关联不再是错误级状态**，也不是「一出现就占位」——
 * 它排在蓝牙之后，蓝牙外设可以接管中部槽位；只有 Wi-Fi 关闭 / 不可用才抢占一切
 * （且以太网已连接时连这个「关机级」状态也不刷屏，改为显示有线网络）。
 *
 * 切换是「完全跟随优先链」的，不轮播、不自动循环。
 */

import type { HwStats } from '../../../shared/hw-stats';

/**
 * 手机热点 SSID 关键词（一律小写比较）。
 * 命中即认为当前 Wi-Fi 是「手机共享出来的热点」，中部槽位改用链环图标（Link）——
 * 热点关心的是「共用一条链路」，不是「信号强弱」，画信号弧会误导。
 */
export const HOTSPOT_SSID_KEYWORDS: readonly string[] = [
  'iphone',
  '个人热点',
  'personal hotspot',
  'androidap',
  'honor',
  '华为',
  'redmi',
  'xiaomi',
  'oppo',
  'vivo',
];

/** SSID 是否为手机热点（包含匹配，大小写不敏感；空 SSID 一律不算） */
export function isHotspotSsid(ssid: string | null | undefined): boolean {
  if (!ssid) return false;
  const s = ssid.toLowerCase();
  return HOTSPOT_SSID_KEYWORDS.some((k) => s.includes(k));
}

/**
 * 中部槽位的渲染场景：
 * - wifi：off = 斜杠态（关闭 / 不可用）；bars = 0 且非 off = 空心（已开启未关联）；
 *         bars = 1 | 2 | 3 = 已连接，按格数点亮同心弧；
 *         hotspot = SSID 命中热点关键词（渲染层改用链环图标）；
 *         noInternet = 已连接但无互联网（渲染层叠加琥珀色感叹号）
 * - ethernet：有线网络已连接
 * - bluetooth：蓝牙外设已连接（设备名 / 电量不在此读取，收起态只画图标）
 */
export type CenterScene =
  | { kind: 'wifi'; bars: 0 | 1 | 2 | 3; off: boolean; hotspot: boolean; noInternet: boolean }
  | { kind: 'ethernet' }
  | { kind: 'bluetooth' };

/** Wi-Fi 场景的构造助手：把不会变的三段布尔值显式写出来，避免每个分支重复六个字段 */
function wifiScene(
  bars: 0 | 1 | 2 | 3,
  off: boolean,
  hotspot = false,
  noInternet = false,
): CenterScene {
  return { kind: 'wifi', bars, off, hotspot, noInternet };
}

/**
 * 按优先链把硬件状态折叠成「中部槽位」的单一场景。
 *
 * @param hw 主进程每秒推送的硬件状态；null = 首帧尚无数据 / IPC 未就绪
 * @returns 中部槽位应渲染的场景；null = 中心留白
 */
export function buildCenterScene(hw: HwStats | null): CenterScene | null {
  // 首帧无任何数据：中心保持空白（不能把「还没采到」误报成「Wi-Fi 不可用」）
  if (!hw) return null;

  const wifi = hw.wifi;
  // ethernet === null 表示采集失败（≠ 未连接）：只有明确 connected 才算有线上网
  const ethernetOn = hw.ethernet?.connected === true;

  // ① 网络「关机级」错误抢占：Wi-Fi 关闭 / 不可用（含采集失败）且没有以太网兜底 → 斜杠 Wi-Fi。
  //    有以太网时不再刷 Wi-Fi 的错 —— 机器其实是有网的，显示有线图标才有信息量。
  if ((!wifi || !wifi.available) && !ethernetOn) return wifiScene(0, true);

  // ② 已连 Wi-Fi 却没有互联网（hasInternet === false）→ 图标 + 感叹号。
  //    明确排在以太网 / 蓝牙之前：连上了却上不了网，是最需要一眼看到的状态。
  if (wifi && wifi.connected && wifi.hasInternet === false) {
    return wifiScene(wifi.bars, false, isHotspotSsid(wifi.ssid), true);
  }

  // ③ 以太网已连接 → 以太网图标（有线优先于蓝牙 / Wi-Fi 图标：链路最稳）
  if (ethernetOn) return { kind: 'ethernet' };

  // ④ 蓝牙已连接外设（外设状态比「Wi-Fi 图标」更值得一眼看到）
  const bluetooth = hw.bluetooth;
  if (bluetooth && bluetooth.devices.length > 0) return { kind: 'bluetooth' };

  // ⑤ Wi-Fi 已连接 → 按信号格数点亮；热点 SSID 改画链环图标
  //   （bars 为 0 = 已连上但信号未知，渲染层按空心处理）
  if (wifi && wifi.connected) {
    return wifiScene(wifi.bars, false, isHotspotSsid(wifi.ssid), false);
  }

  // ⑥ Wi-Fi 已开启但未关联 → 空心 Wi-Fi（不再是错误级状态，也不抢占蓝牙）
  if (wifi && wifi.available) return wifiScene(0, false);

  // ⑦ 兜底：无任何可用数据 → 斜杠 Wi-Fi
  return wifiScene(0, true);
}
