import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bluetooth, Cpu, EthernetPort, Link, Plug, Zap } from 'lucide-react';
import type { BluetoothStatus, HwStats, WifiStatus } from '../../../shared/hw-stats';
import type { CenterScene } from './hw-scene';
import { BATTERY_INACTIVE_ALPHA, batteryRole, type BatteryRole } from './hw-colors';
import { buildCarouselScenes, buildCenterScene } from './hw-scene';

/**
 * 硬件状态显示环 —— 围绕中心圆圈的内环状态层（位于 CENTER_R 24 ~ INNER_R 38 环带内）
 *
 * 设计方法论（参考 iPhone Duo 折叠屏外屏的三合一圆形状态图标）：
 * - 电量圆点、CPU 弧、内存弧全部落在同一个圆周（R_RING=29.65）上，
 *   视觉上是「一个圆」被分成：底部电量圆点段 + 右半 CPU 段 + 左半内存段（三段之间留明显间隔）
 * - 圆点 = 计数：底部 5 颗小圆点 = 电量（每颗 20%，颗内按余数比例部分填充，点亮方向 = 逆时针）；
 *   无电量数据时常显「电源状态」
 * - 顶部 0° 顶隙（CPU / 内存两弧末端之间，电量圆点段的正上方，同在 29.65 圆周上）是「电源状态槽」：
 *   真实充电中显示静态闪电（Zap）、接着电源未充电显示静态插头（Plug）、放电中显示电量百分比数字，
 *   无电源数据时不渲染
 *
 * 布局（0°=正上方，顺时针；右半区 0~180，左半区 180~360），三段之间留明显间隔：
 * 底部 ≈144.9°~215.1°（含衬边）放电量圆点（圆心 150°~210°）；CPU 弧从 137° 逆时针生长 119° 到 20°（右半区），
 * 内存弧从 223° 顺时针生长 119° 到 340°（左半区）。三处间隔按视觉净空计（已折算弧端
 * round cap）：底部两角各 ≈5.6°（≈2.9px；告警本体加宽到 3.9 线宽后 ≈4.1°，≈2.1px，仍不相交）、
 * 顶部名义 40°（给 0° 位电源状态槽两侧各留 ≈4.2px 常态净空 / 告警时 ≈3.3px）→
 * 一眼看出是三个独立元素；两弧各 119°（≤180°）、方向相反、互为镜像、各自锁死在自己那半边，
 * 任何进度值（含 100% + 告警加宽）都不相交。
 *
 * 分层（由内到外）：中心按钮 24 → 圆点与双弧共用 29.65 → 扇区内沿 38。
 * 圆点、弧、电源状态槽全部落在 29.65 同一圆周上；电源状态槽占顶部 0° 顶隙（两弧之间、电量圆点正上方）。
 *
 * 对比策略（浅色壁纸可读，且不用阴影）——「淡晕轮廓」：轨道与未亮圆点保留一层很淡的深色衬边
 *（同路径 / 同圆，只比本体宽 RIM_PAD，透明度仅 0.35）→ 浅色壁纸上是若有似无的暗晕而非硬描边；
 * 渐变进度弧与告警弧不画衬边，靠自身饱和度（青→黄→橙→红 / 告警红）跳出来 → 整环保持轻盈通透。
 * 轨道本色用中性浅灰 0.7 半透，深色壁纸上可见、浅色壁纸上又不闷（玻璃感）。
 * 用户明确不要阴影：boxShadow / drop-shadow 在 206×206 透明悬浮窗上会合成出方形暗边，已全部移除。
 *
 * 交互：收起态纯展示，光标移动不产生任何视觉反应（数值读数条与「未悬停项变暗」已移除）——
 * 想看具体数值走主窗口 / 展开态，悬浮窗只负责一眼扫过的状态图形。
 * 因此本层不再订阅 radial:cursor，主进程也不再为读数条扩 setShape 区域。
 *
 * 安全约束（不破坏现有径向菜单）：
 * - 整层 pointer-events: none —— 不接管点击，扇区点击 / 中心按钮 / setShape 点击穿透全部照旧
 * - 环带完全落在 INNER_R(38) 之内，不与扇区（38~94）、图标（ICON_R=66）重叠
 * - 环形层 zIndex 2（高于中心按钮 1、低于扇区层 3）→ 扇区 tooltip 盖在其上，不会互相穿插
 * - 该层在 clip-path 揭示容器之外 → 展开/收起时环带始终可见
 */

/* ── 几何常量（与 RadialMenu.tsx 保持一致） ── */
const WIDGET_SIZE = 206;
const CX = WIDGET_SIZE / 2;
const CY = WIDGET_SIZE / 2;
const CENTER_R = 24; // 中心按钮半径（环带内沿）
const INNER_R = 38; // 扇区内半径（环带外沿）

/* ── 状态环缩放（v3：由主进程窗口 bounds + 页面 zoomFactor 统一承载）──
 * 收起态的视觉放大已上移到窗口层（bounds = 206 × Z、zoomFactor = Z，CSS 视口恒 206），
 * 本组件一律使用 206 画布的原始设计尺寸，不再做任何手工放大：
 * 环形 SVG 的 <g transform>、顶部插头槽位、中部徽标 zoom 全部回到 1×。
 * 这样窗口物理边界与画面同步放大（消除「边框被裁」），且 backdrop-filter 不被祖先 transform 破坏。 */

/* ── 状态环几何：电量圆点与 CPU / 内存双弧共用同一圆周（24~38 环带内、距中心圆 5.65px） ──
 * 约定：0°=正上方，顺时针递增 → 右半区 [0,180]，左半区 [180,360]。
 * 三个元素共圆周但互不相接：底部电量圆点段外缘（含衬边）144.87°~215.13°，
 * CPU 弧锁在右半区（137° 起逆时针 119° 到 20°）、内存弧锁在左半区（223° 起顺时针 119° 到 340°），
 * 方向相反、互为镜像；三处间隔：底部两角视觉净空 ≈5.6°（≈2.9px；告警本体加宽到 3.9 线宽后
 * ≈4.1° ≈2.1px，仍不相交）、顶部名义 40°（0° 位电源状态槽与两弧端两侧净空 ≈4.2px / 告警时 ≈3.3px）。 */
const TOP_GAP = 40; // 顶部名义间隔（两弧末端之间：CPU 止 20°、内存止 340°；给 0° 位电源状态槽留出两侧净空）
const R_RING = 29.65; // 圆点与双弧共用半径（中心圆 24 → 环 29.65 间距 5.65 = 原 11.3 的一半；圆点衬边外缘 32.3 仍在 INNER_R 38 之内）
const STROKE_W = 2.4; // 弧线宽（24~38 环带偏窄，压缩线宽换取双弧间距）

/* ── 主题色 token（值取自 RadialTheme.css，读不到时退回下面的兜底色）──
   本组件跑在独立透明 overlay 窗口里：该窗口不加载 index.css、也没有 .dark /
   data-accent，因此专门由 RadialTheme.css 提供一套同名语义 token（壁纸可读调校）。
   这些色值在首帧渲染时由 syncRingTheme() 统一读取一次，兜底串 = token 的默认值。 */
let RIM_COLOR = 'rgba(18,22,32,0.22)'; // 淡墨衬边：只留在圆点与图标上，勾一层「淡淡的暗晕轮廓」而非硬描边
let RIM_INK = 'rgba(12,15,24,0.5)'; // 图标类淡衬边（顶部插头 / 中部 Wi-Fi·蓝牙图标）：小尺寸图标上的轮廓提示，降透明度避免发闷
let TRACK_COLOR = 'rgba(100,109,124,0.9)'; // 轨道 / 未亮圆点本色：0.58→0.9，浅蓝壁纸上未填充段整圈连续可辨（旧值太透像「缺一段」）
let TRACK_OUTLINE = 'rgba(38,44,56,0.85)'; // 轨道实色暗边（宽 +1.4）：替代旧半透明衬边，1x 下是清晰 1.4px 轮廓而非毛边
const CPU_A = 137; // CPU 右弧起点（到圆点段外缘 144.87° 的净空 = 144.87 − 137 − 弧端 cap 2.32 ≈ 5.6° ≈ 2.9px；告警 cap 3.77 → ≈4.1° ≈ 2.1px）
const MEM_A = 360 - CPU_A; // 223° 内存左弧起点（与 CPU 关于 180° 轴严格镜像）
const ARC_SWEEP = CPU_A - TOP_GAP / 2; // 119° 每条弧扫角（≤180：末端落在 20° / 340°，三段 + 三间隔铺满整圆）
const CPU_SWEEP = -ARC_SWEEP; // 逆时针生长：137° → 20°（角度递减，锁定右半区）
const MEM_SWEEP = ARC_SWEEP; // 顺时针生长：223° → 340°（角度递增，锁定左半区）
const DOT_R = 2.3; // 圆点半径（直径 4.6；本体外缘 31.95）
const DOT_RIM = 0.35; // 圆点衬边厚度（衬边圆半径 2.65 → 外缘 32.3 仍在环带外沿 38 之内；相邻圆点外缘净空 ≈2.44px）
const DOT_COUNT = 5; // 5 档 = 每档 20%（颗内支持按余数比例部分填充 = 半颗/实际百分比）
const DOT_STEP_DEG = 15; // 相邻圆点角间距（圆心弦距 ≈7.74px；间距加大是为了让「5 颗点」与两侧弧端的净空趋近，避免点与点黏成一条）
const DOT_HALF_DEG = (Math.asin((DOT_R + DOT_RIM) / R_RING) * 180) / Math.PI; // ≈5.13° 单颗圆点角半宽（含衬边，外缘 = 衬边圆半径）
const PLUG_SIZE = 10; // 顶部电源状态槽的插头图标边长（放顶部 0° 顶隙，两侧常态净空 ≈4.2px 才不贴弧端）
/* ── 中部槽位（中心圆 CENTER_R 之内的留白）：Wi-Fi / 蓝牙状态图标 ──
   18×18 图标盒居中于 (CX, CY)：
   - 盒对角半长 = 18×√2/2 ≈ 12.7px，距 CPU/内存弧内沿（R_RING − 弧半宽 1.2 − 衬边 0.45 = 28.0）还差 ≈15.3px，
     距中心按钮内沿（CENTER_R 24）差 ≈11.3px，也完全落在可见区半径 38 之内；
   - 取 18 而非更大的尺寸：中部图标是收起态的视觉重心，但它的 ink 宽度（Wi-Fi 外弧 ≈15.9px）
     仍只占 48px 中心玻璃圆的 1/3，顶槽插头（10px）与底部圆点（直径 4.6）不被压过 → 四者配重平衡。 */
const CENTER_ICON = 18;
const ALERT_AT = 85; // 告警阈值（%）

/* ── G11 中部槽位轮播 ──
   中部 48px 留白（CENTER_R 24 直径）在「网络 / 蓝牙图标」之间轮播：
   - CAROUSEL_INTERVAL_MS：每个场景停留时长（3.2s，太快会显得焦躁，太慢信息熵低）
   - METRIC_SIZE：徽标渲染盒边长（40px，比 18px 图标盒大——Wi-Fi 文字与蓝牙圆点需要更宽的
     可读空间，但仍在中心圆 48px 直径之内，距中心按钮内沿 24px 也够放）
   - 颜色沿用状态语义（网络 / 蓝牙各走自己的语义色），与双弧 / 圆点的读数语言一致 */
const CAROUSEL_INTERVAL_MS = 3200;
const METRIC_SIZE = 40;
/**
 * Wi-Fi 信号弧的统一渲染盒边长：已连接（WifiSsidBadge）与未连接（NetworkIcon 的 bars=0
 * 空心弧）共用同一盒，保证「连上 / 没连」弧线尺寸一致，不出现「连上变小、没连变大」的跳变。
 * 26px 盒 → 弧视觉宽约 18px，与中心 48px 玻璃圆比例协调（下方还留得出 SSID 小字）。
 */
const WIFI_ARC_BOX = 26;
/**
 * 网络「替代图标」（以太网口 / 热点链环）的渲染盒边长 —— 只剩这两枚 lucide 图标用得上；
 * 「未连接 / 关闭」统一改为完整灰弧（WifiIdle），与信号弧共用 WIFI_ARC_BOX。
 * 不能用 METRIC_SIZE=40：lucide 图标路径撑满 viewBox（x 2→22）且叠 strokeWidth 4 淡墨底，
 * 视觉宽接近 40px；而正常信号弧是扇形、在 viewBox 24 里只画中间约 16.9 单位 → 视觉宽
 * 仅 28px。用 28 让「有线 / 热点」与「无线信号弧」视觉重量一致，切换不跳变。
 */
const NET_ALT_ICON_SIZE = 28;

/* ── 负载渐变色：低负载冷色 → 高负载暖色（--color-load-* 四档，兜底 = token 默认值）──
   四档语义固定（青 / 黄 / 橙 / 红），不随主窗口 accent 变化 —— 换主题也必须是同一套读数语言 */
let LOAD_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, '#22d3ee'], // 青 --color-load-low
  [0.5, '#facc15'], // 黄 --color-load-mid
  [0.8, '#fb923c'], // 橙 --color-load-high
  [1, '#f43f5e'], // 红 --color-load-critical
];
let ALERT_COLOR = '#ff2d55'; // --color-alert
let DOT_COLOR_CHARGE = '#34d399'; // 充电 / 接通电源（--color-battery-charging）：powered 角色（+ 顶部插头图标同色）
let DOT_COLOR_LOW = '#f43f5e'; // <10% 低电量临界（--color-battery-low）：critical 角色，红 + 告警
let DOT_COLOR_WARN = '#f2b900'; // 10%~20% 低电量预警（--color-battery-warn）：lowPower 角色，黄
/** 警告琥珀（--color-warn）：无互联网感叹号等「非电量」提示专用，与低电量预警同色系但语义独立 */
let WARN_COLOR = '#f2b900';
let DOT_COLOR_MID = '#fbbf24'; // 电量未知（--color-battery-unknown）：unknown 角色，琥珀，无百分比可用
let DOT_COLOR_OK = '#22c55e'; // 正常电量（--color-battery-ok）：primary 角色，绿色进度 —— 电量=绿、负载=暖色告警，与青→黄→橙→红的 CPU/内存弧语义区分

/* ── 中部槽位（中心圆内的 Wi-Fi / 蓝牙图标）── */
let WIFI_COLOR = '#22d3ee'; // Wi-Fi 五段弧（--color-ring-wifi，值同 --color-load-low：与 CPU/内存弧常规冷色一致）
let BT_COLOR = '#4da3ff'; // 蓝牙图标（--color-bluetooth，status-trio 深底色板蓝）
// 中心图标渐变端点色（深 → 亮）：让中心图标与外环弧用同一套「线性渐变、靠饱和度跳出」语言，
// 取代原来粗重的双层墨描边 + 辉光（浅色壁纸下发闷发糊，与外环轻盈通透的玻璃语言不搭）。
// Wi-Fi 改用「蓝白」渐变、与蓝牙图标同一色系（BT_GRAD_*）：网络 / 连接类图标配色统一（用户选定）。
const WIFI_GRAD_DEEP = '#2563eb';
const WIFI_GRAD_LIGHT = '#93c5fd';
const BT_GRAD_DEEP = '#2563eb';
const BT_GRAD_LIGHT = '#93c5fd';
// 断网 / 检测中时网络图标的置灰色（用户要求「无网络时 Wi-Fi 信号置灰」）。
// 语义固定（灰=没网，不随主题染成某个角色色），但**明度必须跟主题走**：
// 浅色壁纸用深灰、深色壁纸用浅灰，否则深壁纸上「灰」等于隐形（实测整枚图标看不见）。
// 值由 RadialTheme.css 的 --color-ring-offline 提供，syncRingTheme 首帧同步；这里只是兜底。
let NET_OFFLINE_COLOR = 'rgba(96,102,116,0.55)';
// 未连接 / 关闭：完整四段灰弧的本色（比空槽色实一档，才能「有形状」）。同上跟主题走。
let IDLE_COLOR = 'rgba(100,109,124,0.62)';

/* ── 顶部电源状态槽（0° 顶隙）── */
const TOP_TEXT = '#ffffff'; // 放电百分比数字的常规色（白）：外圈另描一道 RIM_INK 淡墨边，浅色壁纸上仍可读（无阴影）

/** 是否已完成首帧 token 同步（未完成则每帧重试，避免 CSS 未注入时定死兜底值） */
let ringThemeSynced = false;

/**
 * 把上面的颜色变量同步为 RadialTheme.css 里的 token 值。
 *
 * 两种调用方式：
 * - 无参（渲染体顶部）：只在首帧从 documentElement 读一次，之后每次渲染直接返回；
 * - 传作用域元素（主题切换）：从该元素读计算值 —— .hw-dark 上的 token 覆盖只有落在
 *   这个元素上才生效，读 documentElement 拿不到暗色变体。
 *
 * @returns 是否改动了颜色变量（调用方据此决定要不要补一次渲染）
 */
function syncRingTheme(scope?: Element | null): boolean {
  if (typeof document === 'undefined') return false;
  // 渲染体的无参调用：首帧之后不再重复读取（getComputedStyle 有成本）
  if (ringThemeSynced && !scope) return false;
  let cs: CSSStyleDeclaration;
  try {
    cs = getComputedStyle(scope ?? document.documentElement);
  } catch {
    return false;
  }
  const read = (name: string): string => cs.getPropertyValue(name).trim();
  // 以轨道色作为「CSS 已注入」的探针：它必然是 token 文件里的第一条玻璃色
  if (!read('--color-ring-track')) return false;

  const before = [
    RIM_COLOR,
    RIM_INK,
    TRACK_COLOR,
    TRACK_OUTLINE,
    WARN_COLOR,
    ALERT_COLOR,
    DOT_COLOR_CHARGE,
    DOT_COLOR_LOW,
    DOT_COLOR_WARN,
    DOT_COLOR_MID,
    DOT_COLOR_OK,
    WIFI_COLOR,
    BT_COLOR,
    NET_OFFLINE_COLOR,
    IDLE_COLOR,
    LOAD_STOPS.map(([, c]) => c).join(','),
  ].join('|');

  RIM_COLOR = read('--color-ring-rim') || RIM_COLOR;
  RIM_INK = read('--color-ring-rim-ink') || RIM_INK;
  TRACK_COLOR = read('--color-ring-track') || TRACK_COLOR;
  TRACK_OUTLINE = read('--color-ring-track-outline') || TRACK_OUTLINE;
  WARN_COLOR = read('--color-warn') || WARN_COLOR;
  ALERT_COLOR = read('--color-alert') || ALERT_COLOR;
  DOT_COLOR_CHARGE = read('--color-battery-charging') || DOT_COLOR_CHARGE;
  DOT_COLOR_LOW = read('--color-battery-low') || DOT_COLOR_LOW;
  DOT_COLOR_WARN = read('--color-battery-warn') || DOT_COLOR_WARN;
  DOT_COLOR_MID = read('--color-battery-unknown') || DOT_COLOR_MID;
  DOT_COLOR_OK = read('--color-battery-ok') || DOT_COLOR_OK;

  // 中部槽位：Wi-Fi 主色优先读自己的 token，退化到负载常规冷色（两者本就同值），最后兜底常量
  WIFI_COLOR =
    parseHexToken(read('--color-ring-wifi')) ||
    parseHexToken(read('--color-load-low')) ||
    WIFI_COLOR;
  BT_COLOR = read('--color-bluetooth') || BT_COLOR;
  // 中部图标两档灰：跟主题走（浅壁纸深灰 / 深壁纸浅灰），语义色本身仍不随主题变
  NET_OFFLINE_COLOR = read('--color-ring-offline') || NET_OFFLINE_COLOR;
  IDLE_COLOR = read('--color-ring-idle') || IDLE_COLOR;

  // 负载四档：必须整体可读且全部为 #rrggbb（loadColor 用 hexToRgb 做线性插值，坏值会静默变黑）
  const low = parseHexToken(read('--color-load-low'));
  const mid = parseHexToken(read('--color-load-mid'));
  const high = parseHexToken(read('--color-load-high'));
  const critical = parseHexToken(read('--color-load-critical'));
  if (low && mid && high && critical) {
    LOAD_STOPS = [
      [0, low],
      [0.5, mid],
      [0.8, high],
      [1, critical],
    ];
  }

  const after = [
    RIM_COLOR,
    RIM_INK,
    TRACK_COLOR,
    TRACK_OUTLINE,
    WARN_COLOR,
    ALERT_COLOR,
    DOT_COLOR_CHARGE,
    DOT_COLOR_LOW,
    DOT_COLOR_WARN,
    DOT_COLOR_MID,
    DOT_COLOR_OK,
    WIFI_COLOR,
    BT_COLOR,
    NET_OFFLINE_COLOR,
    IDLE_COLOR,
    LOAD_STOPS.map(([, c]) => c).join(','),
  ].join('|');

  ringThemeSynced = true;
  return before !== after;
}

/** 自测开关：URL 带 ?hwmock=1 时用本地模拟数据（仅联调预览用，正常运行走真实 onHwStats） */
const MOCK = typeof location !== 'undefined' && /[?&]hwmock=1(?:&|$)/.test(location.search);

/**
 * 中部槽位自测分支（仅在 ?hwmock=1 下生效）。
 * 优先链的每种中部场景都要能静态核对，而换真机硬件成本太高 → 用 URL 参数指定分支：
 *   ?hwmock=1                 → Wi-Fi 已连接 3 格（默认，且无蓝牙外设）
 *   ?hwmock=1&hwwifi=mid      → 已连接 2 格（验证中间弧熄灭后的空心观感）
 *   ?hwmock=1&hwwifi=weak     → 已连接 1 格（最内弧点亮）
 *   ?hwmock=1&hwwifi=noconn   → 无线已开启但未关联（完整灰弧 WifiIdle，优先链⑥，不再抢占蓝牙）
 *   ?hwmock=1&hwwifi=off      → Wi-Fi 关闭 / 不可用（同一枚完整灰弧，优先链①，轮播锁定）
 *   ?hwmock=1&hwwifi=none     → 无无线网卡 / 采集失败（wifi: null，同样走完整灰弧）
 *   ?hwmock=1&hwbt=1          → 蓝牙单设备带电量（优先链④，抢占 Wi-Fi 图标）
 *   ?hwmock=1&hwbt=multi      → 蓝牙三设备（首台无电量 → 验证「等N台」与无电量副文本）
 *
 * status-trio 对齐后新增的缺口分支：
 *   ?hwmock=1&hwinternet=0    → Wi-Fi 已连但 hasInternet=false（Wi-Fi 图标 + 琥珀感叹号，优先链②）
 *   ?hwmock=1&hweth=1         → 以太网已连接（EthernetPort 图标，优先链③）
 *   ?hwmock=1&hwhotspot=1     → 热点 SSID（链环 Link 图标，优先链⑤）
 *   ?hwmock=1&hwcharge=1      → hwStats.charging=true（顶部静态闪电 Zap）
 *   ?hwmock=1&hwplug=1        → charging=false + 插电（顶部 Plug，不显示闪电）
 *   ?hwmock=1&hwsaver=1       → 系统节能模式（电量角色转 lowPower 黄）
 *   ?hwmock=1&hwtheme=dark    → 强制暗色主题（根元素挂 .hw-dark）
 * 以上可叠加（如 `&hwwifi=off&hweth=1` 验证「Wi-Fi 关闭但有以太网 → 显示以太网」）。
 *   ?hwmock=1&hwinfo=1        → 切到完整轮播序列，静态验证三枚网络信息徽标
 *                              （Wi-Fi 信号 / 互联网连通 / 蓝牙台数）依次出现。
 *   ?hwmock=1&hwload=1        → 冻结在「首帧加载中」：永不下发 mock 数据（hw 恒为 null），
 *                              中部徽标保持三点呼吸 + 灰弧，用于核对加载态与数据到达后的位移。
 */
const MOCK_QUERY = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
/** 信息徽标自测：MOCK 下改走完整轮播（而非 buildCenterScene 单场景） */
const MOCK_INFO = MOCK_QUERY?.get('hwinfo') === '1';
/** 首帧加载态自测：卡在 hw === null */
const MOCK_LOADING = MOCK_QUERY?.get('hwload') === '1';
type MockWifiBranch = 'ok' | 'mid' | 'weak' | 'noconn' | 'off' | 'none';
const MOCK_WIFI_BRANCH: MockWifiBranch = (() => {
  const v = MOCK_QUERY?.get('hwwifi');
  return v === 'mid' || v === 'weak' || v === 'noconn' || v === 'off' || v === 'none' ? v : 'ok';
})();
const MOCK_BT_BRANCH = MOCK_QUERY?.get('hwbt') ?? '';
const MOCK_BT = MOCK_BT_BRANCH === '1' || MOCK_BT_BRANCH === 'multi';
/** Wi-Fi 已连但无互联网（G1 感叹号） */
const MOCK_NO_INTERNET = MOCK_QUERY?.get('hwinternet') === '0';
/** 以太网已连接（G6 优先链③） */
const MOCK_ETH = MOCK_QUERY?.get('hweth') === '1';
/** 热点 SSID（G10 链环图标） */
const MOCK_HOTSPOT = MOCK_QUERY?.get('hwhotspot') === '1';
/** 真实充电中（G8 闪电 Zap） */
const MOCK_CHARGING = MOCK_QUERY?.get('hwcharge') === '1';
/** 未充电但插着电（G8 插头 Plug） */
const MOCK_PLUGGED = MOCK_QUERY?.get('hwplug') === '1';
/** 系统节能模式（G3 黄色角色） */
const MOCK_POWER_SAVING = MOCK_QUERY?.get('hwsaver') === '1';
/** 暗色主题（G7 .hw-dark） */
const MOCK_DARK = MOCK_QUERY?.get('hwtheme') === 'dark';

/** 自测用 Wi-Fi 状态：覆盖「3 格 / 2 格 / 1 格 / 未关联 / 关闭 / 采集失败」六种分支 */
function mockWifi(): WifiStatus | null {
  const ssid = MOCK_HOTSPOT ? 'iPhone 的热点' : 'WorkPulse-5G';
  // 已连接分支才谈得上「有没有互联网」；未连接 / 采集失败一律 null（未知）
  const hasInternet = MOCK_NO_INTERNET ? false : true;
  switch (MOCK_WIFI_BRANCH) {
    case 'none':
      return null; // 采集失败 / 无无线网卡
    case 'off':
      return {
        available: false,
        connected: false,
        ssid: null,
        signal: null,
        bars: 0,
        hasInternet: null,
      };
    case 'noconn':
      return {
        available: true,
        connected: false,
        ssid: null,
        signal: null,
        bars: 0,
        hasInternet: null,
      };
    case 'weak':
      return { available: true, connected: true, ssid, signal: 18, bars: 1, hasInternet };
    case 'mid':
      return { available: true, connected: true, ssid, signal: 42, bars: 2, hasInternet };
    default:
      return { available: true, connected: true, ssid, signal: 78, bars: 3, hasInternet };
  }
}

/** 自测用以太网状态：hweth=1 时已连接；默认「采集成功但未连接」（≠ null 采集失败） */
function mockEthernet(): HwStats['ethernet'] {
  return { connected: MOCK_ETH, name: MOCK_ETH ? '以太网' : null };
}

/**
 * 系统节能模式（BatteryInfo.powerSaving 已随 HwStats 顶层展开）。
 * null = 未知 / 查询失败 → 按「未节能」处理（不能让未知状态把电量刷成黄色）。
 * MOCK 用 &hwsaver=1 固定为 true。
 */
function readPowerSaving(hw: HwStats | null): boolean | null {
  return hw?.powerSaving ?? null;
}

/** 自测用蓝牙状态：单台外设带电量；hwbt=multi 时给三台、首台不带电量。
 *  读数条已移除 → 这份数据现在只用来确认优先链（蓝牙抢占 Wi-Fi 图标）； */
function mockBluetooth(): BluetoothStatus | null {
  if (MOCK_BT_BRANCH === 'multi') {
    return {
      available: true,
      devices: [
        { name: 'MX Master 3S', battery: null },
        { name: 'XM4 耳机', battery: 86 },
        { name: 'Keychron K3', battery: 64 },
      ],
    };
  }
  return MOCK_BT
    ? { available: true, devices: [{ name: 'XM4 耳机', battery: 86 }] }
    : { available: true, devices: [] };
}

/** navigator.getBattery() 的最小结构（避免依赖 DOM 实验性类型） */
interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener(type: 'levelchange' | 'chargingchange', cb: () => void): void;
  removeEventListener(type: 'levelchange' | 'chargingchange', cb: () => void): void;
}

/**
 * 底部圆点的四种电源表达 —— 保证圆点在任何机器上都常显：
 * - level：拿到电量 → 填充 = 电量（每颗 20%，颗内按余数比例部分填充，逆时针点亮）；颜色表状态：充电呼吸绿 / ≤20% 红脉冲 / 其余绿色进度
 * - mains：台式机 / 接通电源（level=1 && charging 持续，或 hwStats.onBattery=false）→ 5 颗全亮（电源绿）
 * - battery-unknown：无电量数据但 hwStats 显示电池供电 → 5 颗全亮（琥珀，电量未知）
 * - unknown：既无电量也无 hwStats → 5 颗全亮（中性白）
 */
type PowerMode = 'level' | 'mains' | 'battery-unknown' | 'unknown';

/**
 * 顶部电源状态槽（0° 顶隙）的渲染描述：
 * - percent：放电中显示电量百分比数字（颜色按 batteryRole）
 * - zap：真实充电中（charging === true）→ 静态闪电，**禁止任何闪烁 / 呼吸动画**
 * - plug：未在充电但接着电源（pluggedIn / mains）→ 静态插头
 * - null：电池供电但电量未知 / 无任何电源数据 → 不渲染（圆点保持琥珀色逻辑）
 */
type TopSlot =
  | { kind: 'percent'; text: string; color: string }
  | { kind: 'zap'; color: string }
  | { kind: 'plug'; color: string };

/* ────────────────────────── 工具函数 ────────────────────────── */

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** 校验 token 值是否为 `#rrggbb` 形式并返回原值；格式不符（rgb()/3位hex/含alpha）返回 null，
 *  避免 hexToRgb 里 parseInt 得 NaN 后负载弧静默变黑 */
function parseHexToken(value: string): string | null {
  const v = value.trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** 按 0~1 刻度取负载颜色（青 → 黄 → 橙 → 红，线性插值） */
function loadColor(t: number): string {
  const x = clamp01(t);
  for (let i = 0; i < LOAD_STOPS.length - 1; i++) {
    const [p0, c0] = LOAD_STOPS[i];
    const [p1, c1] = LOAD_STOPS[i + 1];
    if (x <= p1) {
      const k = p1 === p0 ? 0 : (x - p0) / (p1 - p0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(
        a[1] + (b[1] - a[1]) * k,
      )},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
    }
  }
  return LOAD_STOPS[LOAD_STOPS.length - 1][1];
}

/** 角度转坐标（0=上方，顺时针）——与 RadialMenu.tsx 的约定一致 */
function angleToXY(deg: number, radius: number, cx: number, cy: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
}

/** 生成一段圆弧的 SVG path（支持正/负方向，round caps 由 stroke 属性控制） */
function arcPathD(r: number, startDeg: number, endDeg: number): string {
  const span = endDeg - startDeg;
  const s = angleToXY(startDeg, r, CX, CY);
  const e = angleToXY(endDeg, r, CX, CY);
  const large = Math.abs(span) > 180 ? 1 : 0;
  const dir = span > 0 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} ${dir} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

/**
 * 圆点部分填充路径（局部坐标系，+x = 该圆点处逆时针前进方向）：
 * 按 f（0~1）从「先进入侧」（局部 -x）向 +x 推进一条弦，取弦后方的圆缺。
 * f=0.5 即半颗（弦过圆心），f→1 铺满整颗；配合外层 rotate(角度-180) 与逆时针点亮方向一致。
 */
function dotFillPathD(f: number, r: number): string {
  const t = clamp01(f);
  const d = r * (2 * t - 1); // 弦相对圆心的偏移（-r → +r）
  const h = Math.sqrt(Math.max(0, r * r - d * d)); // 弦半长
  const large = d > 0 ? 1 : 0;
  const y0 = h.toFixed(3);
  const y1 = (-h).toFixed(3);
  return `M ${d.toFixed(3)} ${y0} A ${r} ${r} 0 ${large} 1 ${d.toFixed(3)} ${y1} Z`;
}

interface GradDef {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: { o: number; c: string }[];
}

/**
 * 沿弧生成线性渐变：把「弧上位置 → 刻度色」通过到弦的投影换算成 SVG stop。
 * sweepDeg 可为负（CPU 弧逆角度方向），投影数学对方向不敏感。
 * 效果：弧起点永远是冷色，弧末端（当前值）就是该负载对应的颜色。
 */
function buildGradient(r: number, startDeg: number, sweepDeg: number): GradDef | null {
  const S = angleToXY(startDeg, r, CX, CY);
  const T = angleToXY(startDeg + sweepDeg, r, CX, CY);
  const len = Math.hypot(T.x - S.x, T.y - S.y);
  if (len < 6) return null;
  const ux = (T.x - S.x) / len;
  const uy = (T.y - S.y) / len;

  const K = 16;
  const raw: { p: number; c: string }[] = [];
  for (let i = 0; i <= K; i++) {
    const f = i / K;
    const P = angleToXY(startDeg + sweepDeg * f, r, CX, CY);
    raw.push({ p: (P.x - S.x) * ux + (P.y - S.y) * uy, c: loadColor(f) });
  }
  let min = Infinity;
  let max = -Infinity;
  for (const s of raw) {
    if (s.p < min) min = s.p;
    if (s.p > max) max = s.p;
  }
  if (max - min < 6) return null;

  // 投影在弧首尾有轻微回折，强制单调递增，避免渐变反向
  let prev = 0;
  const stops = raw.map((s) => {
    let o = (s.p - min) / (max - min);
    if (o < prev) o = prev;
    if (o > 1) o = 1;
    prev = o;
    return { o, c: s.c };
  });

  // 渐变向量两端沿弦方向外推到 min/max，与归一化后的 offset 保持一致
  return {
    x1: S.x + ux * min,
    y1: S.y + uy * min,
    x2: S.x + ux * max,
    y2: S.y + uy * max,
    stops,
  };
}

/** 数值平滑：把突变的采样值缓动到目标值，弧长随之平滑过渡 */
function useSmoothed(target: number | null, tau = 260): number | null {
  const [shown, setShown] = useState<number | null>(target);
  const stateRef = useRef<{ cur: number | null; raf: number }>({ cur: target, raf: 0 });

  useEffect(() => {
    const st = stateRef.current;
    cancelAnimationFrame(st.raf);
    if (target === null) {
      st.cur = null;
      // 不在 effect 内同步 setState：清空由下方渲染期派生完成
      return;
    }
    if (st.cur === null) {
      st.cur = target;
      setShown(target);
      return;
    }
    let cur = st.cur;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(80, now - last);
      last = now;
      cur += (target - cur) * (1 - Math.exp(-dt / tau));
      st.cur = cur;
      if (Math.abs(target - cur) < 0.2) {
        st.cur = target;
        setShown(target);
        return;
      }
      setShown(cur);
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(st.raf);
  }, [target, tau]);

  // 渲染期派生：目标为空立即清空（替代 effect 内同步 setState）
  return target === null ? null : shown;
}

/* ────────────────────────── 主组件 ────────────────────────── */

export function HardwareStatusRing({ expanded }: { expanded: boolean }): ReactNode {
  // 首帧把颜色变量同步为 RadialTheme.css 的 token（组件里所有色值都读这些变量）
  syncRingTheme();

  const [hw, setHw] = useState<HwStats | null>(null);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [noBattery, setNoBattery] = useState(false);
  // ── G11 轮播：当前展示的场景下标（网络错误级锁定 / 单场景时不走定时器）──
  const [carouselIndex, setCarouselIndex] = useState(0);

  // ─── 展开卡顿修复：进出场动画窗口内挂起数据 setState ───
  // RadialMenu 的揭示弹簧（SPRING_SPRING stiffness 180 / damping 28）实际收尾 ~600-700ms，
  // 旧 500ms 固定窗口会在动画尾段漏放 1s 硬件推送 / 700ms 电量模拟 → 整张 SVG 重建（双弧
  // 2×17 个渐变 stop 全部重算）打断动画尾段。这里与 RadialMenu 同步放宽到 900ms 兜底
  // （环无法直接订阅菜单的 onAnimationComplete）；窗口外照常更新，数据时效性不受影响。
  const transitionUntilRef = useRef(0);
  const prevExpandedRef = useRef(expanded);
  useEffect(() => {
    if (prevExpandedRef.current !== expanded) {
      prevExpandedRef.current = expanded;
      transitionUntilRef.current = Date.now() + 900;
    }
  }, [expanded]);
  const inTransition = (): boolean => Date.now() < transitionUntilRef.current;

  // ─── G7 主题：主进程给的 theme 只在根元素挂 .hw-dark 类 ───
  // 暗色变体是一组 CSS 变量覆盖，必须从「带类的根元素」读计算值（读 documentElement 拿不到）；
  // 读到的值真变化了才 forceRender —— 颜色存于模块变量，SVG / 图标的 inline style 需要一次重渲染才更新。
  const theme: 'light' | 'dark' = hw?.theme === 'dark' ? 'dark' : 'light';
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  useLayoutEffect(() => {
    if (syncRingTheme(rootRef.current)) forceRender();
  }, [theme]);

  // ref：供光标轮询回调读取最新数据（渲染期间不写 ref）
  const hwRef = useRef<HwStats | null>(null);
  useEffect(() => {
    hwRef.current = hw;
  }, [hw]);

  const hasHw = hw !== null;

  // ─── 数据源①：window.radialApi.onHwStats（共享类型 HwStats，返回退订函数） ───
  useEffect(() => {
    if (MOCK) {
      // 加载态自测：不产生任何 mock 数据 → hw 恒为 null，中部停在「三点呼吸」
      if (MOCK_LOADING) return;
      const id = window.setInterval(() => {
        if (inTransition()) return; // 动画窗口内挂起（卡顿修复）
        const t = Date.now() / 1000;
        const cpu = clamp01((45 + 52 * Math.sin(t / 3.5)) / 100) * 100; // 0~97，会触发告警
        const memUsedPct = clamp01((50 + 42 * Math.sin(t / 7)) / 100) * 100; // 8~92
        const memTotalGB = 32;
        setHw({
          cpu,
          memUsedPct,
          memUsedGB: Math.round((memTotalGB * memUsedPct) / 100) / 10,
          memTotalGB,
          onBattery: false,
          // 未知 → 回退 MOCK 的 battery.charging；hwcharge / hwplug 用来固定顶槽分支
          charging: MOCK_CHARGING ? true : MOCK_PLUGGED ? false : null,
          powerSaving: MOCK_POWER_SAVING ? true : null,
          wifi: mockWifi(), // 中部槽位 Wi-Fi 分支（见 MOCK_WIFI_BRANCH）
          // 系统级联网状态：与 wifi.hasInternet 同源，MOCK 下跟随 hwinternet 参数
          internet: MOCK_NO_INTERNET ? false : true,
          bluetooth: mockBluetooth(), // 中部槽位蓝牙分支（?hwbt=1 时单设备带电量）
          ethernet: mockEthernet(), // 有线分支（?hweth=1）
          theme: MOCK_DARK ? 'dark' : 'light', // G7 主题应用
          wallpaperLuma: MOCK_DARK ? 0.2 : 0.8, // G11：配合 MOCK_DARK 模拟深/浅壁纸亮度
          accent: '#3b82f6', // 默认蓝强调色（与主进程推送字段对齐）
          ts: Date.now(),
        });
      }, 900);
      return () => window.clearInterval(id);
    }

    const off = window.radialApi.onHwStats((s) => {
      if (inTransition()) return; // 动画窗口内挂起（卡顿修复）
      if (s && typeof s === 'object') setHw(s);
    });
    return () => off();
  }, []);

  // ─── 数据源②：navigator.getBattery()（渲染进程自行获取，不依赖 IPC） ───
  useEffect(() => {
    if (MOCK) {
      const id = window.setInterval(() => {
        if (inTransition()) return; // 动画窗口内挂起（卡顿修复）
        if (MOCK_PLUGGED) {
          // 插着电但不在充电：顶槽必须落在 Plug 分支（不是 Zap）
          setBattery({ level: 0.62, charging: true });
          return;
        }
        if (MOCK_CHARGING) {
          // 真实充电中：顶槽落在 Zap 分支
          setBattery({ level: 0.62, charging: true });
          return;
        }
        const t = Date.now() / 1000;
        setBattery({ level: 0.5 + 0.5 * Math.sin(t / 5), charging: Math.sin(t / 8) > 0.3 });
      }, 700);
      return () => window.clearInterval(id);
    }

    const getBattery = (navigator as unknown as { getBattery?: () => Promise<BatteryLike> })
      .getBattery;
    if (typeof getBattery !== 'function') return; // 不支持 → 走「电源状态」常显模式

    let bat: BatteryLike | null = null;
    let dead = false;
    const push = (): void => {
      if (inTransition()) return; // 动画窗口内挂起（卡顿修复）
      if (bat && !dead) setBattery({ level: bat.level, charging: bat.charging });
    };
    getBattery
      .call(navigator)
      .then((b) => {
        if (dead) return;
        bat = b;
        b.addEventListener('levelchange', push);
        b.addEventListener('chargingchange', push);
        push();
      })
      .catch(() => {
        /* 被拒绝 → 走「电源状态」常显模式 */
      });
    return () => {
      dead = true;
      if (bat) {
        bat.removeEventListener('levelchange', push);
        bat.removeEventListener('chargingchange', push);
      }
    };
  }, []);

  // ─── 台式机识别（台式机恒为 level=1 & charging=true）：只用于切换「电量」→「接通电源」
  // 表达，不再隐藏圆点 —— 圆点在任何机器上都常显
  // 主判据：满电 + 充电 + hwStats.onBattery === false 持续 3s；兜底：满电 + 充电持续 8s
  useEffect(() => {
    if (MOCK || !battery) return;
    // 判定与重置均在定时器回调内（异步 setState，避免 effect 内同步 setState）
    let started = Date.now();
    const id = window.setInterval(() => {
      const full = battery.level >= 0.999 && battery.charging;
      if (!full) {
        started = Date.now();
        setNoBattery(false);
        return;
      }
      const h = hwRef.current;
      if (h?.onBattery) {
        setNoBattery(false); // 正在电池供电 → 不是台式机
        return;
      }
      const need = h ? 3000 : 8000;
      if (Date.now() - started >= need) setNoBattery(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, [battery, hasHw]);

  // ─── 数值平滑（弧长平滑过渡） ───
  // 注意：cpu / memUsedPct 都是 0–100 的百分比，必须先 /100 归一化再 clamp01。
  // 若直接 clamp01(hw.memUsedPct)，任何 ≥1% 的真实占用都会被夹成 1 → memS 恒为 100 → 内存弧永远画满。
  const cpuS = useSmoothed(hw && hw.cpu !== null ? clamp01(hw.cpu / 100) * 100 : null);
  const memS = useSmoothed(hw ? clamp01(hw.memUsedPct / 100) * 100 : null);

  const level = battery && !noBattery ? clamp01(battery.level) : null;
  // 插电判定（Windows 上 navigator.charging 等价于「AC 在线」，无法区分满电断充）：决定顶部槽位是否显示插头
  const plugged = !!battery?.charging;
  // 真实充电状态：优先主进程 WMI BatteryStatus（hw.charging，可区分满电断充），
  // 未知（非 Windows / 查询失败 / 无电池）时回退 navigator.charging；控制顶部槽位与圆点角色色
  const charging = hw?.charging ?? plugged;
  // 系统节能模式：主进程 BatteryInfo.powerSaving（读不到 = 未知/null；MOCK 用 &hwsaver=1 固定）
  const powerSaving = MOCK_POWER_SAVING ? true : readPowerSaving(hw);

  // ─── 电源表达判定（圆点常显） ───
  const powerMode: PowerMode =
    level !== null
      ? 'level'
      : noBattery || (hasHw && !hw?.onBattery) || (battery?.charging && battery.level >= 0.999)
        ? 'mains'
        : hasHw
          ? 'battery-unknown'
          : 'unknown';

  // ─── 电池颜色角色（底部圆点 / 顶部数字 · 闪电 · 插头共用同一套语义）───
  // 判定顺序见 hw-colors.ts：低电量临界 > 节能模式 > 低电量预警 > 充电/接电 > 未知 > 常规
  const role = batteryRole(level, charging, powerSaving, powerMode);
  /** 角色 → 具体色值（色值来自 RadialTheme.css token，syncRingTheme 已写入下列变量） */
  const roleColor = (r: BatteryRole): string => {
    switch (r) {
      case 'critical':
        return DOT_COLOR_LOW;
      case 'lowPower':
        return DOT_COLOR_WARN;
      case 'powered':
        return DOT_COLOR_CHARGE;
      case 'unknown':
        return DOT_COLOR_MID;
      default:
        return DOT_COLOR_OK;
    }
  };

  // ─── 电量点亮（逆时针：底部自左向右 = 圆心角 210° → 150°）───
  // dotTotal ∈ [0, 5]：整数部分 = 整颗数，小数部分 = 下一颗的填充比例
  //（如 47% → 2.35 = 2 整颗 + 第 3 颗 35%；57% → 2.85 = 2 整颗 + 第 3 颗 85%）
  let dotTotal = DOT_COUNT;
  if (powerMode === 'level' && level !== null) {
    dotTotal = clamp01(level) * DOT_COUNT;
    // 低电告警可见性保底：≤20% 且填充不足半颗（含 0%）时按半颗显示，
    // 保证红色 / 黄色警示不消失；>20% 起严格按实际百分比，单调不回退
    if (level <= 0.2 && dotTotal < 0.5) dotTotal = 0.5;
  }
  // 颜色只区分状态、不区分档位：填充比例表达百分比，颜色表达角色
  //（圆点不做呼吸/闪动动画，静态色即可；未点亮的圆点 = 同角色色 alpha 0.22 的轨道）
  const dotColor = roleColor(role);

  // ─── 顶部电源状态槽（0° 顶隙）：充电中 → 闪电；接着电源未充电 → 插头；放电 → 百分比；无数据 → 不渲染 ───
  // G8 拆分支：charging（主进程 WMI，能区分「满电断充」）为 true 才是真充电 → 闪电；
  // charging === false 但 navigator 插电 / mains → 插头。两者都是静态图标，禁止闪烁动画。
  const mains = powerMode === 'mains';
  const topSlot: TopSlot | null =
    charging === true
      ? { kind: 'zap', color: roleColor(role) }
      : plugged || mains
        ? { kind: 'plug', color: roleColor(role) }
        : powerMode === 'level' && level !== null
          ? {
              kind: 'percent',
              text: `${Math.round(level * 100)}`,
              // 数字颜色按角色：<10% 红、节能 / <20% 黄、其余白
              color:
                role === 'critical'
                  ? DOT_COLOR_LOW
                  : role === 'lowPower'
                    ? DOT_COLOR_WARN
                    : TOP_TEXT,
            }
          : null;
  // G9「100」三位数：14px 环内径放不下 10px 的三位数 → 缩到 8.5 并用 textLength 锁死宽度（tabular-nums 保居中）
  const topText = topSlot?.kind === 'percent' ? topSlot.text : '';
  const topFontSize = topText.length >= 3 ? 8.5 : 10;
  const topTextLength = topText.length >= 3 ? 14 : undefined;

  // ─── 中部槽位场景（G11 轮播）：网络永远第一，其后蓝牙 ───
  // 正常模式：buildCarouselScenes 生成轮播序列；网络错误级（斜杠 / 无互联网）时
  // 序列只留网络场景 → 轮播锁定，异常必须一眼可见；首帧无数据返回空 → 中心留白。
  // MOCK 模式（?hwmock=1）：仍走 buildCenterScene 单一出口，逐个分支静态验证不受轮播干扰。
  const scenes =
    MOCK && !MOCK_INFO
      ? (() => {
          const single = buildCenterScene(hw);
          return single ? [single] : [];
        })()
      : buildCarouselScenes(hw, level);
  // 轮播签名：只含「场景类型序列」，不含数值 —— CPU 从 32%→33% 不应打断轮播节奏，
  // 只有场景集合本身变化（如断网锁定 / 蓝牙接入 / 电量数据消失）才从头播。
  const scenesKey = scenes
    .map((s) =>
      s.kind === 'wifi'
        ? `wifi:${s.off ? 1 : 0}:${s.hotspot ? 1 : 0}:${s.noInternet ? 1 : 0}`
        : s.kind === 'network'
          ? // 统一网络图标：只按「介质 / 斜杠 / 热点」参与轮播 key；
            // 在线↔离线（置灰）、信号格数变化都不打断轮播节奏
            `network:${s.medium}:${s.off ? 1 : 0}:${s.hotspot ? 1 : 0}`
          : s.kind === 'bluetooth'
            ? 'bluetooth'
            : s.kind,
    )
    .join('|');
  const sceneCount = scenes.length;

  // 场景集合变化（含网络错误级锁定 / 解除）→ 轮播从头开始。
  // 用 React 官方推荐的「render 期间派生重置」：比较上一次的 scenesKey，
  // 变化时同步重写 index（不放在 effect 里，避免 effect 内同步 setState 级联重渲染）。
  const [carouselKey, setCarouselKey] = useState(scenesKey);
  if (carouselKey !== scenesKey) {
    setCarouselKey(scenesKey);
    setCarouselIndex(0);
  }

  // 轮播定时器：单场景（含网络错误级锁定）不启动，停留在唯一场景上；
  // 展开态整环淡出（expanded 时 opacity 0）也暂停轮播，避免动画期间无谓的 setState 重渲染
  useEffect(() => {
    if (sceneCount <= 1 || expanded) return;
    const timer = window.setInterval(() => {
      setCarouselIndex((i) => (i + 1) % sceneCount);
    }, CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [scenesKey, sceneCount, expanded]);

  const center = scenes[Math.min(carouselIndex, sceneCount - 1)] ?? null;
  // 入场键只按「场景类型 + 斜杠 / 热点」区分：信号格数 3→2 时图标不重放整段淡入淡出，
  // 只让各自弧的点亮/熄灭色平滑过渡（见 WifiSignal 的 .hw-wifi-bar）；无互联网感叹号也不触发重挂载
  const centerKey = (() => {
    if (center === null) return 'none';
    switch (center.kind) {
      case 'bluetooth':
        return 'bluetooth';
      case 'network':
        return `network-${center.medium}-${center.off ? 'off' : center.hotspot ? 'hotspot' : 'on'}`;
      case 'ethernet':
        return 'ethernet';
      case 'wifi':
        return center.off ? 'wifi-off' : center.hotspot ? 'wifi-hotspot' : 'wifi';
    }
  })();

  /* ── 单条进度弧（带符号 sweep，支持左右镜像生长）──
        轨道 = 淡墨衬边 + 浅灰本体；进度弧 / 告警弧不加衬边，靠渐变 / 红色自身饱和度区分 ── */
  const renderRing = (
    metric: 'cpu' | 'mem',
    r: number,
    startDeg: number,
    sweepDeg: number,
    v: number | null,
  ): ReactNode => {
    if (v === null) return null;
    const f = clamp01(v / 100);
    const alert = v >= ALERT_AT;
    const grad = f > 0.02 ? buildGradient(r, startDeg, sweepDeg * f) : null;
    const drawn = f > 0.015; // 极小值不画进度（沿用原端点显示阈值）；进度端只靠 round cap 收口，无跟随圆点
    const gradId = `hwGrad-${metric}`;
    const trackD = arcPathD(r, startDeg, startDeg + sweepDeg); // 轨道 = 整段弧
    const progD = arcPathD(r, startDeg, startDeg + sweepDeg * f); // 进度 = 按当前值截断的弧

    return (
      <g key={metric}>
        {/* 轨道：实色暗边（宽 +1.2）+ 浅灰本色 —— 与电量圆点同圆周、同底色，
            三段是同一条环形刻度带被间隔切开。
            1x 可读性修复：旧衬边是 alpha 0.22 的半透明灰、只比本体宽 0.35，两层各自降采样后
            半透明像素不对齐 → 边缘「发虚」；现改为沿轨道本体画一条 real 实色暗边（用 paint-order
            让本体盖在上面），边缘是一圈 1.4px 清晰轮廓而非毛边。底色轨道 alpha 0.58→0.9，
            浅蓝壁纸上整条空槽连续可辨，不再像「缺一段」。 */}
        <path
          d={trackD}
          fill="none"
          stroke={TRACK_OUTLINE}
          strokeWidth={STROKE_W + 1.4}
          strokeLinecap="round"
        />
        <path
          d={trackD}
          fill="none"
          stroke={TRACK_COLOR}
          strokeWidth={STROKE_W}
          strokeLinecap="round"
        />
        {grad && drawn && (
          <>
            <defs>
              <linearGradient
                id={gradId}
                gradientUnits="userSpaceOnUse"
                x1={grad.x1}
                y1={grad.y1}
                x2={grad.x2}
                y2={grad.y2}
              >
                {grad.stops.map((s, i) => (
                  <stop key={i} offset={s.o} stopColor={s.c} />
                ))}
              </linearGradient>
            </defs>
            {/* 进度弧：不加衬边（衬边只留给轨道与圆点）——渐变本体（冷 → 暖，末端即当前负载色）
                自身饱和度足够跳出来，去掉硬描边后整环更轻盈通透 */}
            <path
              d={progD}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={STROKE_W}
              strokeLinecap="round"
            />
          </>
        )}
        {alert && drawn && (
          /* ≥85% 告警：红色脉冲覆盖（本体加宽 1.5 → 3.9，外缘仍在 38 之内）；
             不加衬边 —— 饱和红自身足够醒目，衬边只会让告警带变闷 */
          <g className="hw-alert-pulse">
            <path
              d={progD}
              fill="none"
              stroke={ALERT_COLOR}
              strokeWidth={STROKE_W + 1.5}
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    );
  };

  /* ── 电量 / 电源圆点（与双弧同圆周 R_RING 的底部刻度段，圆心 150°~210°、外缘 144.87°~215.13°，
        与两侧弧起点各留 ≈5.6°（≈2.9px）视觉净空；每颗 20%，颗内按余数比例部分填充；
        点亮方向 = 逆时针（底部自左向右，圆心角 210° → 150°，颗内弦的推进方向与之一致）；
        无电量数据时常显电源状态；
        每颗 = 淡墨衬边圆（RIM_COLOR，r = DOT_R + DOT_RIM）+ 本体圆（r = DOT_R）——
        本体直径与几何骨架不变，衬边只是一圈很淡的暗晕（0.35）；亮 / 灭靠角色色与透明度区分 ——
        未点亮 = 同角色色 alpha 0.22（status-trio 的 inactive 规则），不再用固定暗色 ── */
  const dots: ReactNode[] = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    const deg = 180 + (i - (DOT_COUNT - 1) / 2) * DOT_STEP_DEG;
    const p = angleToXY(deg, R_RING, CX, CY);
    // 逆时针点亮序：角大的左侧圆点先亮（i=4 → i=0），rank 之后按余数部分填充
    const rank = DOT_COUNT - 1 - i;
    const frac = clamp01(dotTotal - rank); // 本颗填充比例（0=未亮、<1=部分、1=整颗）
    const on = frac >= 1;
    const lit = frac > 0;
    dots.push(
      <g key={i}>
        {/* 衬边圆：实色暗边（替代旧 alpha 0.22 的半透明灰），1x 下圆点边缘是清晰轮廓而非毛边 */}
        <circle cx={p.x} cy={p.y} r={DOT_R + DOT_RIM} fill={TRACK_OUTLINE} />
        {/* 底圆：点亮 = 角色色实色；未点亮 = 轨道灰实色（空槽）。
            旧实现用「角色色 alpha 0.22」表达灭，叠上实色暗边后在浅壁纸上变成脏墨绿 —— 
            改为轨道灰本体，与灰色空槽轨道同语言，边缘同样清晰不发虚。 */}
        <circle cx={p.x} cy={p.y} r={DOT_R} fill={lit ? dotColor : TRACK_COLOR} />
        {!on && lit && (
          /* 部分填充：局部 +x = 逆时针前进方向，rotate(角度-180) 对齐后从先进入侧推进；
             弦路径与整颗填充同半径（落在衬边圆之内），纯填充区分亮灭 */
          <path
            d={dotFillPathD(frac, DOT_R)}
            transform={`translate(${p.x} ${p.y}) rotate(${deg - 180})`}
            fill={dotColor}
          />
        )}
      </g>,
    );
  }

  /* 中部徽标的设计尺寸（未放大）：不同场景用不同盒，先算一次，供容器与缩放层共用 */
  const centerDesignSize =
    center?.kind === 'bluetooth' ||
    center?.kind === 'network' ||
    // 历史 wifi 单场景也画 METRIC_SIZE(40) 的 WifiCenterBadge：容器漏算会按 18 定位，
    // 内容 zoom 后右移 14px 并溢出玻璃圆（用户截图「图标文字偏右/不协调」的根因）
    center?.kind === 'wifi'
      ? METRIC_SIZE
      : CENTER_ICON;

  return (
    <>
      {/* ═══ 环形层（zIndex 2：高于中心按钮 1、低于扇区层 3 → 扇区 tooltip 自然盖在其上） ═══ */}
      <motion.div
        key="hw-ring"
        ref={rootRef}
        className={`absolute inset-0${theme === 'dark' ? ' hw-dark' : ''}`}
        style={{ zIndex: 2, pointerEvents: 'none' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: expanded ? 0 : 1 }} // 菜单展开时隐藏整环、收起时显示（淡入淡出 0.2s）
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* 2× 超采样：透明窗口 + 非整数 DPI（125%）下，窗口内容合成时不做多重采样，
            细弧线会呈现硬边阶梯（实测：真实屏幕上弧线边缘 1px 内从背景直接跳到纯色，
            而无头不透明窗渲染有 2~3px 抗锯齿过渡）。这里把 SVG 布局尺寸放大 2 倍、
            再用 CSS 缩放回 0.5 合成 —— 等于以 2× 分辨率栅格化后做降采样，边缘恢复平滑。
            只作用在本层 SVG（不含玻璃），因此不影响 center 玻璃的 backdrop-filter。 */}
        <svg
          width={WIDGET_SIZE * 2}
          height={WIDGET_SIZE * 2}
          viewBox={`0 0 ${WIDGET_SIZE} ${WIDGET_SIZE}`}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: WIDGET_SIZE * 2,
            height: WIDGET_SIZE * 2,
            transform: 'scale(0.5)',
            transformOrigin: 'top left',
          }}
        >
          {/* 状态环本体：206 画布原始设计尺寸，缩放由主进程窗口 zoomFactor 统一承载 */}
          <g>
            {renderRing('cpu', R_RING, CPU_A, CPU_SWEEP, hw && cpuS !== null ? cpuS : null)}
            {renderRing('mem', R_RING, MEM_A, MEM_SWEEP, hw && memS !== null ? memS : null)}
            {/* 电量圆点：不参与任何悬停态，收起态光标移动不改变它们的透明度 */}
            <g>{dots}</g>

            {/* 顶部电源状态槽 · 放电中：电量百分比数字（SVG 文本居中于 0° 顶隙）。
              底层 fill=none 只描 RIM_INK 淡墨边、上层填角色色 —— 白色数字在浅色壁纸上仍可读，
              与图标同一种「淡墨衬边」手法，全程无阴影（透明窗不能有阴影合成暗边）。
              G9：三位数（100）缩字号到 8.5 并用 textLength 锁死 14px 宽度，避免溢出 14px 环内径 */}
            {topSlot?.kind === 'percent' && (
              <>
                <text
                  x={CX}
                  y={CY - R_RING}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={topFontSize}
                  fontWeight={600}
                  textLength={topTextLength}
                  lengthAdjust={topTextLength ? 'spacingAndGlyphs' : undefined}
                  fill="none"
                  stroke={RIM_INK}
                  /* 2.4 → 2.0：fontSize 10 上 24% 字号偏胖（17~20% 是这类小字的合理描边线），
                     2.0 = 20%，淡墨边仍够撑住白色字在浅壁纸上的可读性 */
                  strokeWidth={2.0}
                  strokeLinejoin="round"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                  aria-hidden
                >
                  {topSlot.text}
                </text>
                <text
                  x={CX}
                  y={CY - R_RING}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={topFontSize}
                  fontWeight={600}
                  textLength={topTextLength}
                  lengthAdjust={topTextLength ? 'spacingAndGlyphs' : undefined}
                  fill={topSlot.color}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                  aria-hidden
                >
                  {topSlot.text}
                </text>
              </>
            )}
          </g>
        </svg>

        {/* 顶部电源状态槽 · 真实充电中：静态闪电（G8）。
            颜色跟 batteryRole（低电红 / 节能黄 / 常规绿），**不加任何闪烁 / 呼吸动画** ——
            充电状态是持续数小时的稳定信息，动效只会让 206px 的透明浮窗变得焦躁。
            尺寸与插头同 10px，双层描边保证浅色壁纸可读 */}
        {topSlot?.kind === 'zap' && (
          <div className="absolute flex items-center justify-center" style={topGapBox(PLUG_SIZE)}>
            <span className="relative" style={{ width: PLUG_SIZE, height: PLUG_SIZE }}>
              <Zap
                size={PLUG_SIZE}
                strokeWidth={4}
                style={{ color: RIM_INK, position: 'absolute', left: 0, top: 0 }}
                aria-hidden
              />
              <Zap
                size={PLUG_SIZE}
                strokeWidth={2}
                style={{ color: topSlot.color, position: 'absolute', left: 0, top: 0 }}
                aria-hidden
              />
            </span>
          </div>
        )}

        {/* 顶部电源状态槽 · 接着电源但未充电（满电断充 / 台式机 mains）：静态插头（G8）。
            尺寸 10px 落在 0° 顶隙；双层描边（底层 RIM_INK 粗描 + 上层本色）保证浅色壁纸可读；
            颜色同 batteryRole；无电量数据的 battery-unknown / unknown 不渲染任何顶部内容 */}
        {topSlot?.kind === 'plug' && (
          <div className="absolute flex items-center justify-center" style={topGapBox(PLUG_SIZE)}>
            <span className="relative" style={{ width: PLUG_SIZE, height: PLUG_SIZE }}>
              <Plug
                size={PLUG_SIZE}
                strokeWidth={4}
                style={{ color: RIM_INK, position: 'absolute', left: 0, top: 0 }}
                aria-hidden
              />
              <Plug
                size={PLUG_SIZE}
                strokeWidth={2}
                style={{ color: topSlot.color, position: 'absolute', left: 0, top: 0 }}
                aria-hidden
              />
            </span>
          </div>
        )}

        {/* ═══ 中部槽位（中心圆半径内的留白）：G11 轮播，每个场景停留 3.2s ═══
             - 网络（Wi-Fi / 热点 / 以太网）永远第一；网络错误级（斜杠 / 无互联网）锁定唯一场景；
             - 蓝牙外设紧随网络之后；
             - MOCK 模式保持 buildCenterScene 单一出口，便于静态验证；
             切换时 0.2s 淡入淡出（AnimatePresence 默认 sync 模式 + 子项绝对定位叠放 = 交叉淡化）；
             收起态常显、展开态随整环一起淡出；整层 pointer-events: none。
             无场景（无任何硬件数据）时不渲染任何东西，中心保持留白 ═══ */}
        <div
          className="absolute"
          // 容器按「渲染尺寸」定位（放大后的盒仍以画布中心居中）
          style={centerBox(centerDesignSize)}
        >
          <AnimatePresence initial={false}>
            {center && (
              <motion.div
                key={centerKey}
                className="absolute flex items-center justify-center"
                // 徽标按 206 画布原始设计尺寸渲染；放大由主进程窗口 zoomFactor 统一承载，
                // 不再需要局部 zoom（去掉后 SVG/文字仍按原始尺寸清晰栅格化）
                style={{
                  left: 0,
                  top: 0,
                  width: centerDesignSize,
                  height: centerDesignSize,
                }}
                // 轮播切换动效：从「缩小 + 轻微下沉」淡入、到「放大 + 轻微上浮」淡出，
                // 比纯淡入淡出更有呼吸质感，也让 3.2s 轮播的切换一眼可辨（用户此前反馈「没轮播」）。
                // transform-origin 居中（absolute inset-0 默认 50%），缩放以图标自身中心为基点。
                initial={{ opacity: 0, scale: 0.78, y: 3 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.16, y: -3 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden
              >
                {center.kind === 'bluetooth' ? (
                  <BluetoothDots count={center.count} size={METRIC_SIZE} />
                ) : center.kind === 'network' ? (
                  /* 无线（已连接 / 未关联 / 关闭 / 首帧加载）→ 统一的「信号弧 + 名称行」徽标：
                     三态共用一套几何，弧的位置恒定；名称行 = SSID / N/A / 加载三点。
                     以太网 / 热点仍走 NetworkIcon（端口 / 链环语义不同，且没有「网络名」可写） */
                  center.medium === 'wifi' && !center.hotspot ? (
                    <WifiCenterBadge
                      bars={center.bars}
                      ssid={center.ssid}
                      online={center.online}
                      loading={center.loading === true}
                      size={METRIC_SIZE}
                    />
                  ) : (
                    <NetworkIcon
                      medium={center.medium}
                      bars={center.bars}
                      online={center.online}
                      off={center.off}
                      hotspot={center.hotspot}
                      size={METRIC_SIZE}
                    />
                  )
                ) : center.kind === 'ethernet' ? (
                  /* 有线：lucide EthernetPort，尺寸 / 描边与 Wi-Fi、蓝牙同规格（同一套图标语言） */
                  <OutlineIcon Icon={EthernetPort} size={CENTER_ICON} color={WIFI_COLOR} />
                ) : center.hotspot ? (
                  /* 手机热点：链环图标替代信号弧（热点不是「信号强弱」，是「共用一条链路」） */
                  <OutlineIcon Icon={Link} size={CENTER_ICON} color={WIFI_COLOR} />
                ) : (
                  /* 历史单场景（MOCK 静态验证）：仍用同一枚徽标，名称 / 连通态直接取自 hw ——
                     保证 MOCK 出图与真实轮播态的几何、名称行完全一致 */
                  <WifiCenterBadge
                    bars={center.bars}
                    ssid={hw?.wifi?.ssid ?? null}
                    online={hw?.internet ?? hw?.wifi?.hasInternet ?? null}
                    size={METRIC_SIZE}
                  />
                )}
                {/* G1：已连 Wi-Fi 但没有互联网 → 中心叠加琥珀色感叹号（hasInternet 为 null / true 不叠加） */}
                {center.kind === 'wifi' && center.noInternet && (
                  <NoInternetBadge size={CENTER_ICON} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

/** 顶隙方框定位（中心对齐到顶部 0°、半径 R_RING 的圆周点 → 两弧末端之间、电量圆点正上方） */
function topGapBox(designSize: number): CSSProperties {
  // 206 画布原始设计尺寸；缩放由主进程窗口 zoomFactor 统一承载（不再在此手工放大）
  const size = designSize;
  const top = CY - R_RING - size / 2; // 上沿距圆心 = R_RING + size/2
  return {
    left: CX - size / 2,
    top,
    width: size,
    height: size,
  };
}

/**
 * 中部槽位方框定位：以 (CX, CY) 为几何中心。
 * size=18 时盒子四边距中心圆内沿（R=24）还剩 ≈11.3px（对角半长 ≈12.7px），既不顶到中心按钮边缘，
 * 也完全落在可见区（R=38）之内。
 */
function centerBox(size: number): CSSProperties {
  return {
    left: CX - size / 2,
    top: CY - size / 2,
    width: size,
    height: size,
  };
}

/**
 * 无互联网徽标（G1）：已连 Wi-Fi 但 hasInternet === false 时叠加在中部图标中心。
 * 4px 量级的琥珀色感叹号（竖线 + 圆点，viewBox 24 → 实际 18px，1 单位 = 0.75px）：
 * 竖线 7.8→12.6（≈3.6px），圆点 cy=15.4 r=1（直径 ≈1.5px）。
 * 底层同形状用 RIM_INK 粗描一道淡墨边 —— 琥珀细笔画在浅色壁纸上会发虚，与 OutlineIcon 同一手法；
 * 不用 emoji / 不用圆形底衬（透明窗上任何实心块都会显脏）。
 * hasInternet 为 null（未知）或 true 时组件根本不挂载，不会误报。
 */
function NoInternetBadge({ size }: { size: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="absolute"
      // wifi 场景容器已修到 METRIC_SIZE(40)：旧 left:0/top:0 会把感叹号钉在盒左上角；
      // 改为按容器中心定位（该子树不含玻璃，局部 transform 不影响 backdrop-filter）。
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      aria-hidden
    >
      <path d="M12 7.8 V12.6" stroke={RIM_INK} strokeWidth={4.6} strokeLinecap="round" />
      <circle cx={12} cy={15.4} r={1.6} fill={RIM_INK} />
      <path d="M12 7.8 V12.6" stroke={WARN_COLOR} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={12} cy={15.4} r={1} fill={WARN_COLOR} />
    </svg>
  );
}

/**
 * 双描边图标（淡墨衬边 + 本色）：中部槽位的亮色单描边在浅色壁纸上会「发虚」。
 * 底层用 RIM_INK 粗描（透明度已压到 0.5）勾轮廓，上层保持本色细描 ——
 * 与顶部插头同一手法，全程无阴影（透明窗不能有阴影合成暗边）。
 * 描边倍数（4 / 2）与尺寸同比例放大：图标从 12 → 18 后相对粗细不变。
 */
function OutlineIcon({
  Icon,
  size,
  color,
}: {
  Icon: typeof Cpu;
  size: number;
  color: string;
}): ReactNode {
  return (
    <span className="relative" style={{ width: size, height: size }}>
      <Icon
        size={size}
        strokeWidth={4}
        style={{ color: RIM_INK, position: 'absolute', left: 0, top: 0 }}
        aria-hidden
      />
      <Icon
        size={size}
        strokeWidth={2}
        style={{ color, position: 'absolute', left: 0, top: 0 }}
        aria-hidden
      />
    </span>
  );
}

/**
 * 中部轮播 · 蓝牙场景（纯图形，无文字）：蓝牙图标 + 底部一排小圆点表达台数。
 * 圆点 = 计数（与外环电量圆点同一视觉语言）：1 台 1 点、5 台 5 点；超过 MAX_DOTS 时
 * 末点用「大半填充」示意仍有更多，避免堆太多点挤爆 48px 中心圆。0 台只画图标。
 *
 * 与 Wi-Fi 图标同一套语言（用户反馈旧图标「太丑、不搭」后重做）：
 * 去掉径向辉光、去掉浓墨双层描边，蓝牙符文改用细线性渐变（蓝 深→亮）+ 极淡衬边，
 * 圆点收敛到与外环电量圆点同款（极淡衬边 + 本色），整体轻盈通透、与状态环协调。
 */
function BluetoothDots({ count, size }: { count: number; size: number }): ReactNode {
  const MAX_DOTS = 5;
  const iconSize = 20;
  const dotR = 1.5;
  const dotGap = 5;
  const dotOffsetY = 4; // 符文框底 → 圆点中心
  const dots = Math.min(Math.max(count, 0), MAX_DOTS);
  const rowW = dots > 0 ? (dots - 1) * dotGap + dotR * 2 : 0;
  // 符文与圆点作为一组整体居中（用户要求「整体水平垂直居中」）：
  // 组合总高 = 符文 20 + 间隔 4 + 圆点直径 3 = 27，顶点 = (size − 27)/2，
  // 圆点中心 = 顶点 + 20 + 4 + 1.5。0 台时圆点行不画，但布局保持不变以免图标上下跳动。
  const groupH = iconSize + dotOffsetY + dotR * 2;
  const iconTop = (size - groupH) / 2;
  const rowY = iconTop + iconSize + dotOffsetY + dotR;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <title>{`蓝牙在场设备 ${count} 台`}</title>
      <defs>
        {/* 蓝牙符文渐变（蓝 深→亮），与 Wi-Fi 青渐变同一手法、呼应外环线性渐变弧 */}
        <linearGradient id="hwBtGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={BT_GRAD_DEEP} />
          <stop offset="100%" stopColor={BT_GRAD_LIGHT} />
        </linearGradient>
      </defs>
      <g transform={`translate(${(size - iconSize) / 2} ${iconTop})`}>
        {/* 极淡衬边（非硬墨描边）+ 细渐变本体，线宽收敛到与 Wi-Fi 弧同量级 */}
        <Bluetooth size={iconSize} strokeWidth={3} color={RIM_COLOR} x={0} y={0} aria-hidden />
        <Bluetooth
          size={iconSize}
          strokeWidth={2.3}
          color="url(#hwBtGrad)"
          x={0}
          y={0}
          aria-hidden
        />
      </g>
      {Array.from({ length: dots }, (_, i) => {
        const cx = size / 2 - rowW / 2 + dotR + i * dotGap;
        return (
          <g key={i}>
            {/* 与外环电量圆点同款：极淡衬边 + 本色实心 */}
            <circle cx={cx} cy={rowY} r={dotR + 0.35} fill={RIM_COLOR} />
            <circle cx={cx} cy={rowY} r={dotR} fill={BT_COLOR} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 中部轮播 · 统一网络图标（纯图形，无文字）：一枚图标同时表达介质 + 强度 + 连通。
 *
 * 用户要求把「Wi-Fi 信号弧」「互联网地球」「以太网」合并整合：
 * - 介质：'wifi' 画五段信号弧（格数 = 强度）/ 'ethernet' 画以太网口；
 * - 连通：online=true 用 Wi-Fi 主色（青）；false 离线、null 检测中一律置灰（NET_OFFLINE_COLOR）——
 *   这是「无网络时 Wi-Fi 信号置灰」的核心：信号弧还在，但灰掉表示没网；
 * - 异常：off=true（硬件关闭/无介质）画斜杠 Wi-Fi；hotspot=true（手机热点）画链环；
 *   两者优先级高于常规弧（与历史 buildNetworkScene 的语义一致）。
 *
 * 全部走 RIM_INK 淡墨衬边 + 本色双层描边，无阴影（透明窗规范）。
 */
function NetworkIcon({
  medium,
  bars,
  online,
  off,
  hotspot,
  size,
}: {
  medium: 'wifi' | 'ethernet';
  bars: 0 | 1 | 2 | 3 | 4 | 5;
  online: boolean | null;
  off: boolean;
  hotspot: boolean;
  size: number;
}): ReactNode {
  // 断网 / 检测中置灰；在线才上 Wi-Fi 主色
  const color = online === true ? WIFI_COLOR : NET_OFFLINE_COLOR;

  if (off) {
    // 关闭 / 无网卡：完整四段灰弧（WifiIdle），与已连接态同一套笔画、同尺寸盒。
    // 不再画斜杠：26px 下斜杠会把弧切成一堆碎线，1x 渲染像一团墨（详见 WifiIdle 注释）。
    return <WifiIdle size={WIFI_ARC_BOX} />;
  }
  if (hotspot) {
    return <OutlineIcon Icon={Link} size={NET_ALT_ICON_SIZE} color={color} />;
  }
  if (medium === 'ethernet') {
    return <OutlineIcon Icon={EthernetPort} size={NET_ALT_ICON_SIZE} color={color} />;
  }
  // 开启但未关联（bars=0，含初始加载时网卡还没连上的那几秒）→ 完整四段灰弧（WifiIdle）；
  // 旧实现画四段空槽色弧（几乎看不见），观感就是「图标没画完」。
  if (bars === 0) {
    return <WifiIdle size={WIFI_ARC_BOX} />;
  }
  // 纯 Wi-Fi 弧（已连但隐藏 SSID）：统一用 WIFI_ARC_BOX，
  // 与已连接态 WifiSsidBadge 的弧线同尺寸，避免「连上变小、没连变大」的跳变。
  return <WifiSignal bars={bars} size={WIFI_ARC_BOX} color={color} />;
}

/**
 * 中部「Wi-Fi 图标 + 名称」徽标 —— 已连接 / 未连接 / 加载中三态共用**同一套几何**。
 *
 * 为什么合并（用户反馈：① 未连接与已连接的图标位置要一致；② 名称行三态都要在）：
 * - 旧实现只有「已连接且有 SSID」才用徽标（弧在上、字在下），其余态走纯图标且**垂直居中**，
 *   于是「连上」时弧被抬高约 7px、「断开」时又落回圆心 —— 同一枚图标在两态之间上下跳。
 * - 名称行本质上不是「已连接的附加信息」，而是网络状态的一部分：没连上应当明确说
 *   「没有」（N/A），还没取到就该说「正在取」（…）。三态都画同一副骨架，图标位置自然恒定。
 *
 * 布局（40px 设计盒）：24px 信号弧盒（弧墨高约 10.8）、9px 名称行（字墨高约 9），
 * 顶 / 中 / 底三段留白各约 6.7 —— 等分分布，见 WifiCenterBadge 内常量注释（用户先要求等分，
 * 后又要求与蓝牙协调故整体放大，两次调整都保持等分不被破坏）。
 *   - 弧：连上（bars > 0）画本色 WifiSignal（在线蓝白渐变 / 离线灰）；未连接 / 加载中画
 *     完整灰弧 WifiIdle —— 两者同盒同位置，切换时只有颜色与格数变化，不位移。
 *   - 字：反色标签（深墨圆角实底 `rgb(18 22 32 / 0.88)` + 白字，宽度贴合文字），无渐变 /
 *     无描边晕 / 无外部阴影（用户要求「简单背景反色即可」）。
 *     ssid 有值 → 网络名；ssid 为空且非加载 → 固定 'N/A'；加载中 → 三点呼吸（.hw-dots）。
 *   - 弧与名称三态共用同一组 y 常量，切换只换颜色 / 内容，位置恒定不跳动。
 *
 * 长名称**静态截断 + 省略号**（CJK 算 2 / 英文数字算 1，最多 8 单位），title 保留完整名称。
 * 这里刻意不再用 marquee：旧实现把 mask 放在 translate(0 28) 的父组里，maskUnits=userSpaceOnUse
 * 的 y=0..12 在 Chromium 中按根坐标系取值，文字实际位于 y=28..40 → 整块被遮掉，
 * 长 SSID 从来就没显示过（N/A 不走 mask 才可见）。少一层遮罩也少一处透明窗合成风险。
 */
function WifiCenterBadge({
  bars,
  ssid,
  online,
  loading = false,
  size,
}: {
  bars: 0 | 1 | 2 | 3 | 4 | 5;
  /** 已连接的网络名；null = 未关联 / 关闭 / 隐藏 SSID（显示 N/A） */
  ssid: string | null;
  online: boolean | null;
  /** 硬件数据首帧尚未到达（hw === null）：名称行画加载三点 */
  loading?: boolean;
  size: number;
}): ReactNode {
  // 弧的形态：只有「真的连上且有信号格数」才画本色信号弧，其余一律完整灰弧
  const connected = !loading && bars > 0;
  const isOnline = connected && online === true;
  const color = connected ? (isOnline ? WIFI_COLOR : NET_OFFLINE_COLOR) : IDLE_COLOR;
  // ── 弧与名称的垂直布局（40px 设计盒；收起态整盒由窗口 zoomFactor 放大 1.3×）──
  // 等分分布（用户要求「Wi-Fi 图标和文字间距要等分分布」）：三段留白相等 ≈6.7 / 6.7 / 6.7。
  // 放大（用户反馈「图标和文字比蓝牙小一号」）：弧盒 20→24、字号 7→9，仍严格等分。
  // 墨迹计算：弧墨（viewBox 24 → ×24/24=1）顶 = 18.39−11.2−0.6 = 6.59、底 ≈17.42（高 10.83）；
  //   字墨（字号 9、central 基线）高 9。三段留白 = (40−10.83−9)/3 ≈ 6.72：
  //   ICON_TOP ≈ 6.72−6.59 ≈ 0.15 → 弧墨落在 6.7~17.5；
  //   TEXT_CY ≈ 6.72+10.83+6.72+4.5 ≈ 28.8 → 字墨落在 24.3~33.3；底隙 40−33.3 ≈ 6.7。
  // 放大后裁切实测口径：字墨底 33.3 设计单位 = 圆心下 13.3×1.3 ≈17.3px ≪ 玻璃半径 31.2px；
  //   最长名（7 单位 × 9px 字）半宽 ≈17.3 设计单位 < 该高度的圆内半弦 ≈20.2 → 完整落在圆内。
  const ICON_BOX = WIFI_ARC_BOX - 2; // 弧盒 26→24（徽标内比纯图标态的 20 放大一档，与蓝牙符文视觉重量对齐）
  const ICON_TOP = 0.15; // 等分：弧墨顶 = 0.15 + 6.59 ≈ 6.7（顶隙 6.7）
  const TEXT_CY = 28.8; // 等分：字墨顶 ≈24.3、底 ≈33.3（中隙 6.7 / 底隙 6.7）
  const fontSize = 9; // 原 7：比蓝牙符文/顶部图标小一号，放大到 9 才与外环读数同量级

  // 40px 盒里 9px 粗体最多约 7 个英文单位（半宽 ≈17.3 < 圆内半弦 ≈20.2）；超出保留 6 个加省略号
  const MAX_UNITS = 7;
  const widthOf = (ch: string): number => (/[\u2E80-\uFFFF]/.test(ch) ? 2 : 1);
  let label = ssid ?? 'N/A';
  if (!loading) {
    const total = Array.from(label).reduce((sum, ch) => sum + widthOf(ch), 0);
    if (total > MAX_UNITS) {
      const kept: string[] = [];
      let used = 0;
      for (const ch of label) {
        const w = widthOf(ch);
        if (used + w > MAX_UNITS - 1) break;
        kept.push(ch);
        used += w;
      }
      label = `${kept.join('')}…`;
    }
  }

  // 长名宽度硬上限：字号放大到 9 后，7 个英文单位实测宽 ≈42 设计单位 > 该高度圆内弦宽 ≈40，
  // 会横向溢出玻璃圆、压到底部圆点。用 SVG textLength 压到 34 单位（留 3 单位安全边），
  // 短名（N/A / WUX 等）不设，保持原字形比例不被拉伸。
  const estimatedTextW = Array.from(label).reduce(
    (sum, ch) => sum + (widthOf(ch) === 2 ? fontSize * 0.95 : fontSize * 0.58),
    0,
  );
  const cappedTextLength = estimatedTextW > 34 ? 34 : undefined;

  // 反色标签（用户要求：不要特殊颜色与外部阴影，简单背景反色即可）：
  // 深墨实底 + 白字，宽度贴合文字（长名被 textLength 压到 34 后按 34 算），无渐变 / 无描边晕 / 无阴影。
  const CHIP_PAD_X = 2; // 左右内边距
  const CHIP_H = fontSize + 2; // 11：字高 9 上下各留 1
  const chipW = (cappedTextLength ?? estimatedTextW) + CHIP_PAD_X * 2;
  const title = loading ? 'Wi-Fi 正在获取网络名称' : ssid ? `Wi-Fi ${ssid}` : 'Wi-Fi 未连接';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
      <title>{title}</title>
      {/* 信号弧：viewBox 24 缩到 ICON_BOX，水平居中、垂直靠上，给底部名称行让出空间。
          三态共用这一个位置 —— 未连接 / 加载中不换盒、不位移，只换笔画颜色。 */}
      <g transform={`translate(${(size - ICON_BOX) / 2} ${ICON_TOP})`}>
        {connected ? (
          <WifiSignal bars={bars} size={ICON_BOX} color={color} />
        ) : (
          <WifiIdle size={ICON_BOX} color={color} />
        )}
      </g>
      {/* 名称行：加载中 = 三点呼吸；其余 = 静态居中（长名截断），与上面弧的 x 中心严格对齐。
          两态共用 TEXT_CY 绝对中心，弧/字的垂直净空恒定，切换无位移（仅换内容）。 */}
      {loading ? (
        <g className="hw-dots" fill={IDLE_COLOR} aria-hidden>
          {[-3.4, 0, 3.4].map((dx) => (
            <circle key={dx} cx={size / 2 + dx} cy={TEXT_CY} r={1.15} />
          ))}
        </g>
      ) : (
        <>
          {/* 反色标签底：深墨实底圆角块（无阴影、无描边），文字直接压在其上 */}
          <rect
            x={size / 2 - chipW / 2}
            y={TEXT_CY - CHIP_H / 2}
            width={chipW}
            height={CHIP_H}
            rx={CHIP_H / 2}
            fill="rgb(18 22 32 / 0.88)"
          />
          <text
            x={size / 2}
            y={TEXT_CY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fontWeight={700}
            textLength={cappedTextLength}
            lengthAdjust={cappedTextLength ? 'spacingAndGlyphs' : undefined}
            fill="#ffffff"
            aria-hidden
          >
            {label}
          </text>
        </>
      )}
    </svg>
  );
}

/**
 * Wi-Fi 信号几何：纯【四段圆头描边弧】（用户要求「小圆点去除、保留弧线」），
 * 四段弧共用圆心 (12, 18.39)，各自扫 ±44.4°（总 88.8°，曲率基准 = Lucide 官方 Wi-Fi）。
 *
 * 演化路径与用户反馈对应：
 * - 五段等距扇形 → 四弧+圆点：最小段退化成横条像「漏斗」，改成工业标准的「弧+圆点」；
 * - 70.9% → 53.4%：用户反馈「太宽了」，收窄到全宽 25.7px；
 * - 实心扇形块 → 圆头描边弧：用户指出「端点太平太硬、和圆形不搭」——改成 stroke +
 *   strokeLinecap="round" 后两端是半圆，与圆润玻璃球同语言；
 * - **弧间距翻倍**：用户反馈「间距要起码 2 倍」。原半径差 2.1、线宽 1.2 → 视觉净空仅 0.9；
 *   步长拉到 3.0 → 净空 1.8，正好翻倍。
 * - **宽 / 挤 / 比例的权衡**：宽度压回 26.5px 时最内弧 r=1.5 太短、和 r=4.5 挤；
 *   试过非等距 [1.5,5.2,8,10.5]（内松外紧）用户反馈「比例不协调」；
 *   最终用四方案对比确认 **B 等距均匀**：半径 [2.2,5.2,8.2,11.2] 等差步长 3.0，
 *   最内弧加长到 5.1px 不再像点，四段长度/间距均匀，宽度 28.1px（58.6%）仍在 50-75%。
 * - **去圆点**：用户要求只留弧线 → 删掉底部圆点；信号档位从「圆点 + 4 弧 = 5 格」改为
 *   「4 弧 = 5 档」（bars=1 亮最内 1 弧，bars=5 四段全亮），弱信号仍可见。
 *
 * 圆头描边几何：半径 [2.2, 5.2, 8.2, 11.2]（等距，步长 3.0），线宽 1.2 单位 = 2px；
 * 含圆头后视觉宽 2×(11.2×sin44.4° + 0.6)×(40/24) ≈ 28.1px。
 *
 * 严格居中（去圆点后重算）：最高点 = cy − rMax − 线宽/2 = cy − 11.8（外弧圆头顶）；
 * 最低点 = cy − rMin×cos44.4° + 线宽/2 = cy − 0.972（最内弧端点圆头底）。
 * 令 (最高点 + 最低点)/2 = 12 → cy = (24 + 11.8 + 0.972)/2 ≈ 18.39。
 * 水平两端 x = 12 ± (rMax×sin44.4° + 0.6) 天然对称。
 */
const WIFI_ARC_RADII = [2.2, 5.2, 8.2, 11.2] as const;
const WIFI_ARC_CY = 18.39;
const WIFI_ARC_SWEEP_DEG = 44.4;
const WIFI_ARC_STROKE = 1.2;

/** 生成一段圆头描边弧 path（单条弧线，交给 strokeLinecap="round" 画圆头端点）。 */
function wifiArcPath(r: number): string {
  const cx = 12;
  const a = (WIFI_ARC_SWEEP_DEG * Math.PI) / 180;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const x0 = cx - r * sa;
  const y = WIFI_ARC_CY - r * ca;
  const x1 = cx + r * sa;
  return `M ${x0.toFixed(2)} ${y.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y.toFixed(2)}`;
}

/** 由内到外四段圆头弧（bars=1 起逐段点亮；bars=0 全灭；bars=5 四段全亮） */
const WIFI_ARCS: ReadonlyArray<readonly [number, string]> = WIFI_ARC_RADII.map(
  (r) => [r, wifiArcPath(r)] as const,
);

/**
 * 中部槽位 Wi-Fi 指示：四段圆头描边弧按格数点亮（0 格 = 已开启但未关联的空心态）。
 *
 * 视觉语言（用户反馈「端点太平太硬、和圆形不搭」后重做）：
 * 实心扇形块的两端是径向平切口、有棱角，与圆润玻璃球冲突；改成圆头描边弧（圆头端点）
 * 后两端是半圆，和圆形容器同语言。曲率取官方 88.8°（半角 44.4°），弯而不圆、两端向内收拢。
 * 底部圆点已按用户要求去除，只留四段弧线。
 *
 * 尺寸折算：本组件 viewBox 24 缩放到 40px（1 单位 ≈ 1.667px），蓝牙是 viewBox 40（1 单位 = 1px）；
 * 圆头描边弧线宽 1.2 单位 = 2px、等距半径步长 3.0（四段长度/间距均匀），
 * 全宽 ≈28.1px = 玻璃圆 48px 的 58.6%，仍在 50-75% 区间——比例协调的最佳折中。
 *
 * 亮 / 灭：点亮弧走青渐变，熄灭弧画浅灰空槽（同外环 TRACK_COLOR），
 * 「有信号 vs 空槽」一眼可辨，深壁纸上也不会融进背景。
 * 档位语义（去圆点后重映射）：bars=0 全灭 / =1 亮最内弧 / =2 亮 2 段 / =3 亮 3 段 /
 * =4..5 四段全亮。置灰语义不变（断网 / 检测中颜色置灰）。
 */
function WifiSignal({
  bars,
  size,
  color = WIFI_COLOR,
}: {
  bars: 0 | 1 | 2 | 3 | 4 | 5;
  size: number;
  /** 亮弧本色，默认 Wi-Fi 主色；断网 / 检测中传 NET_OFFLINE_COLOR 置灰 */
  color?: string;
}): ReactNode {
  // 渐变 id 按色值区分：轮播切换期可能同时存在新旧两个实例，在线（青）/ 离线（灰）各用自己的 def。
  // 离线时 color 是 rgba 灰，渐变端点回退为同色（无深浅），保证「置灰」语义纯粹。
  const gid = `hwWifiGrad-${color.replace(/[^a-z0-9]/gi, '')}`;
  const online = color === WIFI_COLOR;
  const deep = online ? WIFI_GRAD_DEEP : color;
  const light = online ? WIFI_GRAD_LIGHT : color;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={deep} />
          <stop offset="100%" stopColor={light} />
        </linearGradient>
      </defs>
      {WIFI_ARCS.map(([r, d], i) => {
        // 去圆点后四段弧独立承载 5 档：bars=1 亮最内弧(i=0)，bars=4..5 四段全亮。
        const lit = bars >= i + 1;
        return (
          <path
            key={r}
            className="hw-wifi-bar"
            d={d}
            fill="none"
            stroke={lit ? `url(#${gid})` : TRACK_COLOR}
            strokeWidth={WIFI_ARC_STROKE}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

/**
 * 「无连接」Wi-Fi 图标（未关联 / 关闭 / 不可用 / 初始加载网卡还没连上）：
 * 完整四段圆头弧、全部用断网灰画实 —— **与已连接态同一套几何与线宽，只换颜色、不加任何附加笔画**。
 *
 * 两次走过的弯路（均实测否决，别再回头）：
 * ① lucide `WifiOff`（斜杠 + 圆点）：路径撑满 viewBox、线宽 2 单位（≈2.3px）再叠 4 单位淡墨衬边，
 *    26px 槽里糊成一团墨线；与四段细弧不是一套笔画语言，切换时粗细 / 比例一起跳变。
 * ② 复用 `WifiSignal bars={0}`：画的是空槽色（浅壁纸 0.42 透明度的灰），几乎看不见 ——
 *    用户看到的「图标残缺 / 不完整」就是它。
 * 另外试过「弧 + 自绘 45° 斜杠」的三版（细斜杠 / 粗斜杠 + 断口 / 只切外三段弧）：
 * 26px 下斜杠与弧的交叉点必然挤在一起，1x 渲染出来像一只虫子（弧被切成一堆碎线），
 * 斜杠越粗越像「一条线加几根碎弧」。结论：这个尺寸下**任何斜杠都会毁掉可读性**，只保留完整灰弧。
 *
 * 「关闭 / 不可用」与「未连接」最终用同一枚图标：26px 中心槽里两者的差别（关硬件 vs 没关联）
 * 不值得牺牲可读性；语义差异仍在数据层保留 —— 关闭会让轮播锁定（一直显示这枚图标），
 * 展开态的菜单 / 主窗口仍有明确文案。
 * `color` 可覆盖本色（徽标里让弧与名称行同色时传入）。
 */
function WifiIdle({ size, color = IDLE_COLOR }: { size: number; color?: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g stroke={color} strokeWidth={WIFI_ARC_STROKE} strokeLinecap="round" fill="none">
        {WIFI_ARCS.map(([r, d]) => (
          <path key={r} d={d} />
        ))}
      </g>
    </svg>
  );
}
