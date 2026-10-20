/**
 * 硬件状态数据结构（主进程采集 → 渲染进程单向推送）
 * 主进程与渲染进程共用此文件，保证 IPC 负载字段一致
 */

/** 硬件状态推送 IPC 通道名（主进程 send / preload on 共用） */
export const HW_STATS_CHANNEL = 'hw-stats';

/**
 * 有线以太网状态（null = 采集失败 / 非 Windows）
 * 判定口径：存在物理网卡、链路状态为 Up、且不是无线网卡
 */
export interface EthernetStatus {
  /** 是否有一块物理以太网卡处于 Up（链路已连接） */
  connected: boolean;
  /** 处于 Up 的以太网卡名称（如「以太网」）；未连接时为 null */
  name: string | null;
}

/**
 * Wi-Fi 状态（null = 不可用/无无线网卡/采集失败）
 * 主进程每 3s 经 WLAN API（失败回退 netsh）读取，渲染进程只读
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
  /** 信号格数（按信号映射：>=80→3、50–79→2、1–49→1、无→0） */
  bars: 0 | 1 | 2 | 3;
  /**
   * 是否能访问互联网。
   * true = 当前连接配置文件的 IPv4/IPv6 Connectivity 至少一个为 Internet；
   * false = 明确处于 Disconnected/NoTraffic/Subnet/LocalNetwork；
   * null = 未知（检测失败 / 非 Windows / 尚未完成首次探测）
   */
  hasInternet: boolean | null;
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

/** 电池相关状态（HwStats 顶层直接展开这些字段） */
export interface BatteryInfo {
  /**
   * 是否正在充电（Windows 下来自主进程经 koffi 读取的 CallNtPowerInformation 真实电池状态，
   * 可区分「满电断充」；null = 未知（非 Windows / 无电池 / 查询失败），
   * 此时渲染进程回退 navigator.getBattery().charging（其在 Windows 上等价于「插电」）
   */
  charging: boolean | null;
  /** 是否开启系统节能模式（Windows 省电模式）；null = 未知（非 Windows / 查询失败） */
  powerSaving: boolean | null;
}

/** 硬件状态负载（主进程每秒推送给渲染进程） */
export interface HwStats extends BatteryInfo {
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
  /** Wi-Fi 状态；null = 无无线网卡 / 采集失败 / 非 Windows */
  wifi: WifiStatus | null;
  /** 以太网状态；null = 采集失败 / 非 Windows */
  ethernet: EthernetStatus | null;
  /** 蓝牙状态；null = 采集失败 / 非 Windows */
  bluetooth: BluetoothStatus | null;
  /** 系统当前外观（跟随 Windows 应用模式，供渲染层配色） */
  theme: 'light' | 'dark';
  /** 时间戳 */
  ts: number;
}
