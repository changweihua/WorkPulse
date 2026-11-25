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
 * 5. Wi-Fi 已连接 → 按信号格数的五段弧；SSID 命中热点关键词时改用链环图标（Link）
 * 6. Wi-Fi 已开启但未关联任何 SSID → 空心 Wi-Fi
 * 7. 兜底（无任何硬件数据）→ 斜杠 Wi-Fi
 *
 * 关键变化（G6）：**Wi-Fi 开启但未关联不再是错误级状态**，也不是「一出现就占位」——
 * 它排在蓝牙之后，蓝牙外设可以接管中部槽位；只有 Wi-Fi 关闭 / 不可用才抢占一切
 * （且以太网已连接时连这个「关机级」状态也不刷屏，改为显示有线网络）。
 *
 * 切换是「完全跟随优先链」的，不轮播、不自动循环。
 *
 * 中部轮播（用户最终拍板：纯图标、无文字、网络合并）：
 * - buildCenterScene 仍是「优先链单一出口」，供 MOCK 静态验证使用；
 * - buildCarouselScenes 生成两项图标轮播：① 网络（network）② 蓝牙（bluetooth+圆点）；
 * - 「网络」一枚图标同时表达三件事：介质（无线画 Wi-Fi 五段弧 / 有线画以太网口）、
 *   强度（弧点亮格数 0~5）、互联网连通（在线 = 角色色 WIFI_COLOR；离线/检测中 = 置灰）。
 *   用户明确要求把此前分开的「Wi-Fi 信号弧」「互联网地球」合并，且断网时信号弧置灰。
 * - 网络处于「错误级」（斜杠 Wi-Fi / 已连无互联网）时 isNetworkAlertScene
 *   为 true，序列只留网络场景 → 组件侧锁定不轮播，网络异常必须一眼可见。
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
 *         bars = 1~5 = 已连接，按格数点亮同心弧；
 *         hotspot = SSID 命中热点关键词（渲染层改用链环图标）；
 *         noInternet = 已连接但无互联网（渲染层叠加琥珀色感叹号）
 * - network：统一网络图标（Wi-Fi 信号 + 互联网连通 + 有线/无线整合，轮播专用）：
 *            medium='wifi' 画五段弧（bars=强度格数）/ 'ethernet' 画以太网口；
 *            online=true 上角色色、false|null 置灰（用户要求断网时信号置灰）；
 *            off=斜杠（Wi-Fi 硬件不可用）、hotspot=链环（手机热点）
 * - ethernet：有线网络已连接（buildCenterScene 历史单一出口用，轮播已并入 network）
 * - bluetooth：蓝牙在场外设；count = 台数（渲染层用底部圆点数表达，不用文字）
 */
export type CenterScene =
  | {
      kind: 'wifi';
      bars: 0 | 1 | 2 | 3 | 4 | 5;
      off: boolean;
      hotspot: boolean;
      noInternet: boolean;
    }
  | { kind: 'ethernet' }
  | { kind: 'bluetooth'; count: number }
  | {
      /** 统一网络图标（轮播专用）：合并 Wi-Fi 信号 + 互联网连通 + 有线/无线介质 */
      kind: 'network';
      /** 上网介质：'wifi' 画五段信号弧 / 'ethernet' 画以太网口 */
      medium: 'wifi' | 'ethernet';
      /** Wi-Fi 信号格数 0~5；以太网场景固定 0（渲染层忽略） */
      bars: 0 | 1 | 2 | 3 | 4 | 5;
      /** 互联网连通：true 在线（角色色）/ false 离线、null 检测中（置灰） */
      online: boolean | null;
      /** Wi-Fi 关闭 / 不可用 → 斜杠图标（错误级，轮播锁定） */
      off: boolean;
      /** SSID 命中热点关键词 → 链环图标 */
      hotspot: boolean;
      /**
       * 首帧数据尚未到达（hw === null）→ 中部徽标画「加载中」三点，尚未知网络名。
       * 只有 hw 为空时才会置 true；一旦拿到真实数据就不再出现。
       */
      loading?: boolean;
      /**
       * 已连接的 Wi-Fi 名称（SSID），供「图标下方小字」常显；
       * 仅在 medium='wifi' 且已关联时才有值，以太网 / 未关联 / 关闭场景为 null。
       * 注意：热点场景（hotspot=true）虽有 SSID，但渲染层改用链环图标、不显示名称。
       */
      ssid: string | null;
    };

/** Wi-Fi 场景的构造助手：把各字段显式写出来，避免每个分支重复六个字段 */
function wifiScene(
  bars: 0 | 1 | 2 | 3 | 4 | 5,
  off: boolean,
  hotspot = false,
  noInternet = false,
): CenterScene {
  return { kind: 'wifi', bars, off, hotspot, noInternet };
}

/**
 * 首帧「加载中」网络场景（hw === null，主进程还没推过第一帧）：
 * 统一网络图标 + 名称行三点。**与真实场景共用同一枚徽标、同一套几何**，
 * 所以数据到达时只是「三点 → 名称」的内容替换，图标不位移、不闪。
 * 以前这里返回空序列 / null（中心留白），用户看到的是「中间什么都没有，一会儿突然冒出图标」。
 */
const LOADING_NETWORK_SCENE: Extract<CenterScene, { kind: 'network' }> = {
  kind: 'network',
  medium: 'wifi',
  bars: 0,
  online: null,
  off: false,
  hotspot: false,
  ssid: null,
  loading: true,
};

/**
 * 「纯网络」优先链：与 buildCenterScene 完全一致，但**不掺蓝牙分支**。
 *
 * 这是 G11 轮播的网络场景来源 —— 轮播要求「网络永远排第一」，
 * 不能让蓝牙外设把网络场景挤到第二位。buildCenterScene 则在此之上
 * 保留历史行为（网络正常图标级时允许蓝牙外设接管中部槽位）。
 *
 * 优先链（前面的抢占后面的）：
 * 1. Wi-Fi 关闭 / 不可用（wifi === null 或 available === false）且**没有以太网**
 *    → 斜杠 Wi-Fi（错误级）
 * 2. Wi-Fi 已连接但无互联网（hasInternet === false）→ Wi-Fi 图标 + 琥珀色感叹号（错误级）
 * 3. 以太网已连接 → 以太网图标
 * 4. Wi-Fi 已连接 → 按信号格数的五段弧；SSID 命中热点关键词时改用链环图标（Link）
 * 5. Wi-Fi 已开启但未关联任何 SSID → 空心 Wi-Fi
 * 6. 兜底（无任何硬件数据）→ 斜杠 Wi-Fi
 */
export function buildNetworkScene(hw: HwStats | null): CenterScene | null {
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

  // ③ 以太网已连接 → 以太网图标（链路最稳）
  if (ethernetOn) return { kind: 'ethernet' };

  // ④ Wi-Fi 已连接 → 按信号格数点亮；热点 SSID 改画链环图标
  //   （bars 为 0 = 已连上但信号未知，渲染层按空心处理）
  if (wifi && wifi.connected) {
    return wifiScene(wifi.bars, false, isHotspotSsid(wifi.ssid), false);
  }

  // ⑤ Wi-Fi 已开启但未关联 → 空心 Wi-Fi（不再是错误级状态）
  if (wifi && wifi.available) return wifiScene(0, false);

  // ⑥ 兜底：无任何可用数据 → 斜杠 Wi-Fi
  return wifiScene(0, true);
}

/**
 * 网络场景是否为「错误级」（斜杠 Wi-Fi / 已连无互联网）。
 *
 * 轮播组件用它做锁定：只要网络处于错误级，中部槽位必须一眼可见，
 * 不得被 CPU / 内存 / 电池数值轮播盖过去。
 */
export function isNetworkAlertScene(scene: CenterScene | null): boolean {
  if (!scene) return false;
  // 无线硬件不可用（斜杠 Wi-Fi）：错误级，必须锁定
  if (scene.kind === 'wifi') return scene.off || scene.noInternet;
  // 统一网络图标：仅「完全无介质」（off）算错误级；已连 Wi-Fi 但无互联网
  // （online=false）按用户新要求改为「信号弧置灰、照常轮播」，不再锁定。
  if (scene.kind === 'network') return scene.off;
  return false;
}

/**
 * 按优先链把硬件状态折叠成「中部槽位」的单一场景（历史单一出口，行为不变）：
 * 网络错误级 / 以太网直接返回；网络处于图标级时，蓝牙外设可以接管中部槽位。
 *
 * @param hw 主进程每秒推送的硬件状态；null = 首帧尚无数据 / IPC 未就绪
 * @returns 中部槽位应渲染的场景；null 已不再返回（首帧改为「加载中」网络场景）
 */
export function buildCenterScene(hw: HwStats | null): CenterScene | null {
  // 首帧无任何数据：返回「加载中」网络场景（三点呼吸），而不是留白 ——
  // 留白会让用户以为「中心不显示东西」，数据到达时又突然冒出一枚图标。
  if (!hw) return LOADING_NETWORK_SCENE;

  const net = buildNetworkScene(hw);
  if (!net) return null;

  // 网络处于错误级（斜杠 / 无互联网）或以太网已连接 → 直接返回网络场景，
  // 蓝牙外设不得抢占（错误级必须一眼可见，有线是最优链路）
  if (net.kind === 'ethernet' || (net.kind === 'wifi' && (net.off || net.noInternet))) return net;

  // 网络正常（Wi-Fi 图标级）→ 蓝牙外设可以接管中部槽位
  if (hw.bluetooth && hw.bluetooth.devices.length > 0) {
    return { kind: 'bluetooth', count: hw.bluetooth.devices.length };
  }

  return net;
}

/**
 * 构建「统一网络图标」场景（轮播第 ① 项）：Wi-Fi 信号 + 互联网连通 + 有线/无线整合到一枚图标。
 *
 * 介质判定（有线优先，与 buildNetworkScene 的链路最优原则一致）：
 * - 以太网已连接 → medium='ethernet'（图标画以太网口）；
 * - 否则 Wi-Fi 已连接 → medium='wifi'（图标画五段信号弧，bars=强度格数）；
 * - Wi-Fi 开启但未关联 → medium='wifi' + bars=0（空心弧）；
 * - Wi-Fi 关闭 / 不可用且无以太网 → off=true（斜杠 Wi-Fi，错误级锁定）。
 *
 * 连通态 online 与介质无关：顶层 internet（系统级 NLM 口径）优先，仅旧版 IPC
 * 无该字段时回退 wifi.hasInternet。渲染层据 online 决定图标本色还是置灰 ——
 * 用户明确要求「无网络时 Wi-Fi 信号置灰」，故离线 / 检测中一律走 inactive 灰。
 */
function buildNetworkIconScene(hw: HwStats): Extract<CenterScene, { kind: 'network' }> {
  const wifi = hw.wifi;
  const ethernetOn = hw.ethernet?.connected === true;
  const online = hw.internet ?? wifi?.hasInternet ?? null;

  // 有线优先：机器有更稳的有线链路时，网络图标表达「以太网 + 系统连通态」
  if (ethernetOn) {
    return {
      kind: 'network',
      medium: 'ethernet',
      bars: 0,
      online,
      off: false,
      hotspot: false,
      ssid: null,
    };
  }

  // 无线已连接：信号弧格数 = 强度；热点 SSID 改用链环图标语义
  // ssid 带上真实名称供渲染层在图标下方显示（热点场景渲染层不显示名称）
  if (wifi?.connected) {
    return {
      kind: 'network',
      medium: 'wifi',
      bars: wifi.bars,
      online,
      off: false,
      hotspot: isHotspotSsid(wifi.ssid),
      ssid: wifi.ssid ?? null,
    };
  }

  // Wi-Fi 开启但未关联：空心弧（bars=0），非错误级但信号为空
  if (wifi?.available) {
    return {
      kind: 'network',
      medium: 'wifi',
      bars: 0,
      online,
      off: false,
      hotspot: false,
      ssid: null,
    };
  }

  // 兜底：无任何可用网络介质 → 斜杠 Wi-Fi（错误级）
  return {
    kind: 'network',
    medium: 'wifi',
    bars: 0,
    online,
    off: true,
    hotspot: false,
    ssid: null,
  };
}

/**
 * 收起态中部场景序列（图标轮播）：
 * - 网络错误级（斜杠 Wi-Fi 且无任何介质）→ 只返回统一网络图标场景，异常一眼可见、轮播暂停；
 * - 其余情况 → 返回两项「纯图标」场景按顺序轮播（无文字）：
 *   ① 网络（统一图标：无线画信号弧/有线画以太网口，弧格数=强度、颜色=在线/置灰）
 *   ② 蓝牙在场（蓝牙图标 + 底部圆点 = 台数）。每项停留 CAROUSEL_INTERVAL_MS。
 *
 * 用户拍板：Wi-Fi 信号与互联网连通合并为一枚图标、断网时信号弧置灰、有线无线整合；
 * 且全程只用一个图标、不要文字（此前做过三行文字常显，用户改回图标方案）。
 * 数值信息不丢：强度看弧格数、台数看圆点数、联网看图标本色/置灰。
 * CPU / 内存 / 电量的实时量仍由环上双弧 + 顶部电量数字表达，不进中心圆。
 *
 * @param hw 主进程硬件状态（null = 首帧无数据）
 * @param batteryLevel 保留参数（兼容性）：电量已在环上表达，中心圆不再显示电量数值
 */
export function buildCarouselScenes(
  hw: HwStats | null,
  batteryLevel: number | null = null,
): CenterScene[] {
  void batteryLevel; // 电量已在环上表达，兼容旧签名保留参数
  // 首帧无任何数据：先给「加载中」网络场景（三点呼吸）占住中心，避免空白后再突然冒出图标
  if (!hw) return [LOADING_NETWORK_SCENE];

  const network = buildNetworkIconScene(hw);

  // 网络错误级锁定（仅斜杠 Wi-Fi 且无介质）：只留网络图标，轮播暂停。
  // 注意「已连 Wi-Fi 但无互联网」不再锁定 —— 改为信号弧置灰、照常与蓝牙轮播。
  if (isNetworkAlertScene(network)) return [network];

  const btCount = hw.bluetooth && hw.bluetooth.devices.length > 0 ? hw.bluetooth.devices.length : 0;

  // ① 统一网络图标（信号/介质/连通三合一） ② 蓝牙在场（图标 + 圆点台数）
  return [network, { kind: 'bluetooth', count: btCount }];
}
