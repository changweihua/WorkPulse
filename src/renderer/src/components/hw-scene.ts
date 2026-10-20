/**
 * 硬件状态环 —— 中部槽位「场景构建器」（纯函数，无 React 依赖）
 *
 * 为什么单独抽出来（沿用 status-trio 的「场景 / 渲染分离」架构）：
 * - 中部槽位（中心圆半径 < CENTER_R 的区域）到底显示 Wi-Fi 还是蓝牙，
 *   是一条**带抢占的优先链**，而不是简单的「有哪个显示哪个」；
 * - 这条判定链只允许存在于本文件一处：组件只按返回的场景做图标映射，
 *   悬停读数条也用同一份场景判断（保证「看到什么图标 = 读出什么数据」）；
 * - 纯函数 → 可在无 DOM / 无硬件环境下直接断言，后续加「热点网络 / 有线网络」等场景
 *   只需在这里扩一个场景类型，渲染层不必重算优先级。
 *
 * 优先链（前面的抢占后面的，已由用户拍板，不可更改）：
 * 1. 网络错误抢占（最高）：采集失败 / 无无线网卡 / WLAN 服务未开（wifi === null 或 available === false）
 *    → 斜杠 Wi-Fi（关闭 / 不可用）；无线已开启但未关联任何 SSID → 空心 Wi-Fi
 * 2. 蓝牙已连接外设（devices.length > 0）→ 蓝牙图标
 * 3. Wi-Fi 已连接 → 按信号格数点亮的三段弧
 * 4. 以上都不成立（无任何硬件数据）→ null（中心留白）
 *
 * 切换是「完全跟随优先链」的，不轮播、不自动循环。
 */

import type { HwStats } from '../../../shared/hw-stats';

/**
 * 中部槽位的渲染场景：
 * - wifi：off = 斜杠态（关闭 / 不可用）；bars = 0 且非 off = 空心（已开启未关联）；
 *         bars = 1 | 2 | 3 = 已连接，按格数点亮同心弧
 * - bluetooth：蓝牙外设已连接（名称 / 电量由读数条另行读取 hw.bluetooth）
 */
export type CenterScene =
  | { kind: 'wifi'; bars: 0 | 1 | 2 | 3; off: boolean }
  | { kind: 'bluetooth' };

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

  // ① 网络错误抢占：采集失败 / 无无线网卡 / WLAN 服务未开 → 斜杠 Wi-Fi
  if (!wifi || !wifi.available) return { kind: 'wifi', bars: 0, off: true };

  // ① 续：无线已开启但未关联 → 空心 Wi-Fi（三弧全 inactive）
  if (!wifi.connected) return { kind: 'wifi', bars: 0, off: false };

  // ② 蓝牙已连接外设（抢占 Wi-Fi 已连接的位置：外设状态比网络更「值得一眼看到」）
  const bluetooth = hw.bluetooth;
  if (bluetooth && bluetooth.devices.length > 0) return { kind: 'bluetooth' };

  // ③ Wi-Fi 已连接 → 按信号格数点亮（bars 为 0 = 已连上但信号未知，渲染层按空心处理）
  return { kind: 'wifi', bars: wifi.bars, off: false };
}
