/**
 * 硬件状态数据结构（主进程采集 → 渲染进程单向推送）
 * 主进程与渲染进程共用此文件，保证 IPC 负载字段一致
 */

/** 硬件状态推送 IPC 通道名（主进程 send / preload on 共用） */
export const HW_STATS_CHANNEL = 'hw-stats';

/** 硬件状态负载（主进程每秒推送给渲染进程） */
export interface HwStats {
  /** 系统 CPU 使用率 0–100，经 EMA 平滑；首帧无数据时为 null */
  cpu: number | null;
  /** 系统内存使用率 0–100 */
  memUsedPct: number;
  /** 已用内存 GB（保留 1 位小数） */
  memUsedGB: number;
  /** 总内存 GB（保留 1 位小数） */
  memTotalGB: number;
  /** 是否电池供电（台式机恒为 false） */
  onBattery: boolean;
  /** 时间戳 */
  ts: number;
}
