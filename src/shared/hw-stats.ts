/**
 * 硬件状态数据结构（主进程采集 → 渲染进程单向推送）
 * 主进程与渲染进程共用此文件，保证 IPC 负载字段一致
 */

/** 硬件状态推送 IPC 通道名（主进程 send / preload on 共用） */
export const HW_STATS_CHANNEL = 'hw-stats';

/**
 * Wi-Fi 状态（null = 不可用/无无线网卡/采集失败）
 * 由主进程每 2s 轮询 netsh 得到，渲染进程只读
 */
export interface WifiStatus {
  /** 无线接口是否存在 */
  available: boolean;
  /** 是否已关联（连接到某个 SSID） */
  connected: boolean;
  /** 已连接的 SSID；未连接或隐藏网络时为 null */
  ssid: string | null;
  /** 信号强度 0–100；未连接/无数据时为 null */
  signal: number | null;
  /** 信号格数（按信号映射：>=60→3、30–59→2、1–29→1、无→0） */
  bars: 0 | 1 | 2 | 3;
}

/**
 * 蓝牙状态（null = 采集失败/非 Windows）
 * 由主进程每 8s 经 koffi 进程内枚举一次，只保留「当前在场」的外设
 */
export interface BluetoothStatus {
  /** 蓝牙适配器是否存在（枚举调用是否成功） */
  available: boolean;
  /** 已连接外设列表；battery 为 null 表示该设备不支持电量上报 */
  devices: Array<{ name: string; battery: number | null }>;
}

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
  /**
   * 是否正在充电（Windows 下来自主进程经 koffi 读取的 CallNtPowerInformation 真实电池状态，
   * 可区分「满电断充」；null = 未知（非 Windows / 无电池 / 查询失败），
   * 此时渲染进程回退 navigator.getBattery().charging（其在 Windows 上等价于「插电」）
   */
  charging: boolean | null;
  /** Wi-Fi 状态；null = 无无线网卡 / 采集失败 / 非 Windows */
  wifi: WifiStatus | null;
  /** 蓝牙状态；null = 采集失败 / 非 Windows */
  bluetooth: BluetoothStatus | null;
  /** 时间戳 */
  ts: number;
}
