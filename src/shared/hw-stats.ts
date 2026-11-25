/**
 * 硬件状态数据结构（主进程采集 → 渲染进程单向推送）
 * 主进程与渲染进程共用此文件，保证 IPC 负载字段一致
 */

/** 硬件状态推送 IPC 通道名（主进程 send / preload on 共用） */
export const HW_STATS_CHANNEL = 'hw-stats';

/** 强调色即时同步通道：设置页改 ui_accent 时广播，悬浮窗无需等待下个 hw-stats tick */
export const ACCENT_CHANGED_CHANNEL = 'accent-changed';

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
  bars: 0 | 1 | 2 | 3 | 4 | 5;
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
 * 由主进程每 8s 经 koffi 进程内枚举一次，只保留「当前在场」的外设。
 *
 * 口径说明：SetupDiGetClassDevs(DIGCF_PRESENT) 的官方定义是「系统中当前在场（present）的设备」，
 * 即已配对且当前可见的外设节点，**不等于 WinRT BluetoothDevice.ConnectionStatus 的「已连接」**。
 * 部分设备（如已配对但关机的耳机）可能仍驻留为在场节点；真正的实时连接态需 WinRT（koffi 难以进程内调用）。
 * 因此这里诚实表述为「在场/已配对外设」，UI 用中性量词「N 台」而非声称「已连接 N 台」。
 */
export interface BluetoothStatus {
  /** 蓝牙适配器是否存在（枚举调用是否成功） */
  available: boolean;
  /** 在场/已配对外设列表（非严格实时连接态）；battery 为 null 表示不支持电量上报 */
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
  /**
   * 系统级互联网连通性（与链路介质无关，取自 GetNetworkConnectivityHint）。
   * 这是「能否上网」的权威信号：Wi-Fi 的 hasInternet 虽同源，但挂在 wifi 上，
   * 当机器走以太网 / 无无线网卡（wifi === null）时取不到，导致悬浮窗误显「检测中」。
   * 顶层字段让「网络」行在任何介质下都能显示真实连通状态。
   * true=可上网 false=明确不可上网 null=未知（老系统 / 探测未完成）
   */
  internet: boolean | null;
  /** 以太网状态；null = 采集失败 / 非 Windows */
  ethernet: EthernetStatus | null;
  /** 蓝牙状态；null = 采集失败 / 非 Windows */
  bluetooth: BluetoothStatus | null;
  /** 系统当前外观（跟随 Windows 应用模式，供渲染层配色） */
  theme: 'light' | 'dark';
  /**
   * 桌面壁纸平均亮度 0~1（0=黑 1=白），主进程经 SystemParametersInfoW +
   * nativeImage 采集；null = 非 Windows / 纯色背景 / 读取失败。
   * 主进程已把 theme 优先按它判定（壁纸明暗 > 系统应用模式），此字段
   * 透传给渲染层，供玻璃通透度等更细的自适应微调。
   */
  wallpaperLuma: number | null;
  /** 强调色（与主窗口材质 accent 对齐的 hex，如 '#3b82f6'，供玻璃 tint 统一） */
  accent: string;
  /** 时间戳 */
  ts: number;
}
