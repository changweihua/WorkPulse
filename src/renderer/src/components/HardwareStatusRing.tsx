import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Battery, Bluetooth, Cpu, MemoryStick, Plug, Power, Wifi, WifiOff } from 'lucide-react';
import type { BluetoothStatus, HwStats, WifiStatus } from '../../../shared/hw-stats';
import { BATTERY_INACTIVE_ALPHA, batteryRole, type BatteryRole } from './hw-colors';
import { buildCenterScene } from './hw-scene';

/**
 * 硬件状态显示环 —— 围绕中心圆圈的内环状态层（位于 CENTER_R 24 ~ INNER_R 38 环带内）
 *
 * 设计方法论（参考 iPhone Duo 折叠屏外屏的三合一圆形状态图标）：
 * - 电量圆点、CPU 弧、内存弧全部落在同一个圆周（R_RING=29.65）上，
 *   视觉上是「一个圆」被分成：底部电量圆点段 + 右半 CPU 段 + 左半内存段（三段之间留明显间隔）
 * - 圆点 = 计数：底部 5 颗小圆点 = 电量（每颗 20%，颗内按余数比例部分填充，点亮方向 = 逆时针）；
 *   无电量数据时常显「电源状态」
 * - 顶部 0° 顶隙（CPU / 内存两弧末端之间，电量圆点段的正上方，同在 29.65 圆周上）是「电源状态槽」：
 *   放电中显示电量百分比数字，充电 / 已接电源显示静态插头图标，无电源数据时不渲染
 *
 * 布局（0°=正上方，顺时针；右半区 0~180，左半区 180~360），三段之间留明显间隔：
 * 底部 ≈151.7°~208.3°（含衬边）放电量圆点（圆心 156°~204°）；CPU 弧从 137° 逆时针生长 119° 到 20°（右半区），
 * 内存弧从 223° 顺时针生长 119° 到 340°（左半区）。三处间隔按视觉净空计（已折算弧端
 * round cap）：底部两角各 ≈12.7°（≈7.8px；告警本体加宽到 3.9 线宽后 ≈10.4°，≈6.4px，仍不相交）、
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
 * 交互：光标落在环带（半径 25~38）即悬停，弹出数值读数条；平时只显示图形保持紧凑。
 * 收起态窗口可见区仅 applyShape(38) 的 76×76 方形（x,y ∈ [65,141]）→ 数值气泡做成
 * 贴可见区的全宽窄读数条（垂直居中 y ∈ [96,110]，圆中线 y=103 处弦宽恰 76），完整落在可见区内，不依赖主进程扩 shape。
 *
 * 安全约束（不破坏现有径向菜单）：
 * - 整层 pointer-events: none —— 不接管点击，扇区点击 / 中心按钮 / setShape 点击穿透全部照旧
 * - 环带完全落在 INNER_R(38) 之内，不与扇区（38~94）、图标（ICON_R=66）重叠
 * - 环形层 zIndex 2（高于中心按钮 1、低于扇区层 3）→ 扇区 tooltip 盖在其上，不会互相穿插；
 *   数值读数条单独放在 zIndex 20 层（仅收起态渲染），保证浮在最上层
 * - 该层在 clip-path 揭示容器之外 → 展开/收起时环带始终可见
 */

/* ── 几何常量（与 RadialMenu.tsx 保持一致） ── */
const WIDGET_SIZE = 206;
const CX = WIDGET_SIZE / 2;
const CY = WIDGET_SIZE / 2;
const CENTER_R = 24; // 中心按钮半径（环带内沿）
const INNER_R = 38; // 扇区内半径（环带外沿）

/* ── 状态环几何：电量圆点与 CPU / 内存双弧共用同一圆周（24~38 环带内、距中心圆 5.65px） ──
 * 约定：0°=正上方，顺时针递增 → 右半区 [0,180]，左半区 [180,360]。
 * 三个元素共圆周但互不相接：底部电量圆点段外缘（含衬边）150.88°~209.12°，
 * CPU 弧锁在右半区（137° 起逆时针 119° 到 20°）、内存弧锁在左半区（223° 起顺时针 119° 到 340°），
 * 方向相反、互为镜像；三处间隔：底部两角视觉净空 ≈11.9°（告警加宽后 ≈9.5°，不相交）、
 * 顶部名义 40°（0° 位电源状态槽与两弧端两侧净空 ≈4.2px / 告警时 ≈3.3px）。 */
const TOP_GAP = 40; // 顶部名义间隔（两弧末端之间：CPU 止 20°、内存止 340°；给 0° 位电源状态槽留出两侧净空）
const R_RING = 29.65; // 圆点与双弧共用半径（中心圆 24 → 环 29.65 间距 5.65 = 原 11.3 的一半；圆点衬边外缘 32.3 仍在 INNER_R 38 之内）
const STROKE_W = 2.4; // 弧线宽（24~38 环带偏窄，压缩线宽换取双弧间距）
/* ── 主题色 token（值取自 RadialTheme.css，读不到时退回下面的兜底色）──
   本组件跑在独立透明 overlay 窗口里：该窗口不加载 index.css、也没有 .dark /
   data-accent，因此专门由 RadialTheme.css 提供一套同名语义 token（壁纸可读调校）。
   这些色值在首帧渲染时由 syncRingTheme() 统一读取一次，兜底串 = token 的默认值。 */
let RIM_COLOR = 'rgba(18,22,32,0.35)'; // 淡墨衬边：只留在轨道与圆点上，勾一层「淡淡的暗晕轮廓」而非硬描边（浅色壁纸够读即可，不求醒目）
const RIM_PAD = 0.9; // 衬边比本体宽的量（两侧各 ≈0.45px，细到只剩轮廓暗示；无阴影）
let RIM_INK = 'rgba(12,15,24,0.5)'; // 图标类淡衬边（顶部电源状态图标 / 读数条图标）：小尺寸图标上的轮廓提示，降透明度避免发闷
let TRACK_COLOR = 'rgba(222,227,236,0.7)'; // 轨道 / 未亮圆点本色：中性浅灰半透（0.7），深色壁纸可见、浅色壁纸透气，保留玻璃感
const CAP_DEG = (Math.asin(STROKE_W / 2 / R_RING) * 180) / Math.PI; // ≈2.32° 弧端 round cap 角外延（净空按它折算；告警本体 3.9 时 ≈3.77°）
const CPU_A = 137; // CPU 右弧起点（到圆点段外缘 150.88° 的净空 = 150.88 − 137 − cap ≈ 11.6°）
const MEM_A = 360 - CPU_A; // 223° 内存左弧起点（与 CPU 关于 180° 轴严格镜像）
const ARC_SWEEP = CPU_A - TOP_GAP / 2; // 119° 每条弧扫角（≤180：末端落在 20° / 340°，三段 + 三间隔铺满整圆）
const CPU_SWEEP = -ARC_SWEEP; // 逆时针生长：137° → 20°（角度递减，锁定右半区）
const MEM_SWEEP = ARC_SWEEP; // 顺时针生长：223° → 340°（角度递增，锁定左半区）
const DOT_R = 2.3; // 圆点半径（直径 4.6；本体外缘 31.95）
const DOT_RIM = 0.35; // 圆点衬边厚度（衬边圆半径 2.65 → 外缘 32.3 仍在环带外沿 38 之内；相邻圆点外缘净空 ≈1.79px；本体直径不变，几何骨架不动）
const DOT_COUNT = 5; // 5 档 = 每档 20%（颗内支持按余数比例部分填充 = 半颗/实际百分比）
const DOT_STEP_DEG = 12; // 相邻圆点角间距（圆心弧距 ≈6.21px，外缘净空 ≈1.51px）
const DOT_HALF_DEG = (Math.asin((DOT_R + DOT_RIM) / R_RING) * 180) / Math.PI; // ≈5.12° 单颗圆点角半宽（含衬边，外缘 = 衬边圆半径）
const DOT_EDGE_DEG = ((DOT_COUNT - 1) / 2) * DOT_STEP_DEG + DOT_HALF_DEG; // ≈29.12° 圆点段外缘相对 180° 的半跨（段外缘 150.88°~209.12°）
/* 三元素悬停命中边界（与视觉边界对齐；三处间隔区不命中任何元素） */
const DOT_HIT_LO = 180 - DOT_EDGE_DEG; // 150.88° 圆点段右外缘（CPU 弧一侧）
const DOT_HIT_HI = 180 + DOT_EDGE_DEG; // 209.12° 圆点段左外缘（内存弧一侧）
const CPU_HIT_LO = TOP_GAP / 2 - CAP_DEG; // 17.68° CPU 弧视觉末端
const CPU_HIT_HI = CPU_A + CAP_DEG; // 138.95° CPU 弧视觉起点（含 round cap）
const MEM_HIT_LO = MEM_A - CAP_DEG; // 221.05° 内存弧视觉起点（含 round cap）
const MEM_HIT_HI = 360 - CPU_HIT_LO; // 342.32° 内存弧视觉末端（与 CPU 关于 0° 轴镜像）
const PLUG_SIZE = 10; // 顶部电源状态槽的插头图标边长（放顶部 0° 顶隙，两侧常态净空 ≈4.2px 才不贴弧端）
/* ── 中部槽位（中心圆 CENTER_R 之内的留白）：Wi-Fi / 蓝牙状态图标 ──
   12×12 图标盒居中于 (CX, CY)：含 1.5px 描边余量（lucide 双层描边 4/2 → 12px 下外侧淡墨晕 ≈0.5px），
   盒边距中心圆内沿还剩 12px，不会顶到 24 半径的中心按钮边缘（图标只做视觉提示，不接管点击）。 */
const CENTER_ICON = 12;
const HIT_IN = CENTER_R + 1; // 悬停判定内沿 25（避开中心按钮）
const HIT_OUT = INNER_R; // 悬停判定外沿 38（与扇区悬停带 [38,94] 无缝衔接）
const ALERT_AT = 85; // 告警阈值（%）
const COLLAPSED_HALF = 38; // 收起态可见区半边长（主进程 applyShape(38) 的 76×76 方形，局部坐标 x,y ∈ [65,141]，区域外不绘制像素）
const PILL_H = 13; // 底部读数条高度（上下边框 2 + 内容区 11 ≥ 10px leading-none 文字；垂直居中于圆中线 y=103）

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
let DOT_COLOR_MID = '#fbbf24'; // 电量未知（--color-battery-unknown）：unknown 角色，琥珀，无百分比可用
let DOT_COLOR_OK = '#22c55e'; // 正常电量（--color-battery-ok）：primary 角色，绿色进度 —— 电量=绿、负载=暖色告警，与青→黄→橙→红的 CPU/内存弧语义区分

/* ── 中部槽位（中心圆内的 Wi-Fi / 蓝牙图标 + 对应读数条）── */
let WIFI_COLOR = '#22d3ee'; // Wi-Fi 三段弧 / 读数条（--color-ring-wifi，值同 --color-load-low：与 CPU/内存弧常规冷色一致）
let BT_COLOR = '#4da3ff'; // 蓝牙图标 / 读数条（--color-bluetooth，status-trio 深底色板蓝）

/* ── 底部读数条（--color-pill-*，告警态 --color-pill-alert-*）── */
let PILL_BG = 'rgba(240,242,246,0.96)';
let PILL_TEXT = '#18181b';
let PILL_BORDER = 'rgba(0,0,0,0.1)';
let PILL_ALERT_BG = 'rgba(255,241,243,0.97)';
let PILL_ALERT_TEXT = '#be123c';
let PILL_ALERT_BORDER = 'rgba(244,63,94,0.45)';

/* ── 顶部电源状态槽（0° 顶隙）── */
const TOP_TEXT = '#ffffff'; // 放电百分比数字的常规色（白）：外圈另描一道 RIM_INK 淡墨边，浅色壁纸上仍可读（无阴影）

/** 是否已从 RadialTheme.css 成功取到 token（取不到则每帧重试，避免 CSS 未注入时定死兜底值） */
let ringThemeSynced = false;

/**
 * 把上面的颜色变量同步为 RadialTheme.css 里的 token 值。
 * 在组件渲染体顶部调用（首帧之后不再读取，getComputedStyle 只付一次成本）；
 * 任一 token 读不到 = CSS 尚未生效 → 保持兜底色，下次渲染重试。
 */
function syncRingTheme(): void {
  if (ringThemeSynced || typeof document === 'undefined') return;
  let cs: CSSStyleDeclaration;
  try {
    cs = getComputedStyle(document.documentElement);
  } catch {
    return;
  }
  const read = (name: string): string => cs.getPropertyValue(name).trim();
  // 以轨道色作为「CSS 已注入」的探针：它必然是 token 文件里的第一条玻璃色
  if (!read('--color-ring-track')) return;

  RIM_COLOR = read('--color-ring-rim') || RIM_COLOR;
  RIM_INK = read('--color-ring-rim-ink') || RIM_INK;
  TRACK_COLOR = read('--color-ring-track') || TRACK_COLOR;
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

  PILL_BG = read('--color-pill-bg') || PILL_BG;
  PILL_TEXT = read('--color-pill-text') || PILL_TEXT;
  PILL_BORDER = read('--color-pill-border') || PILL_BORDER;
  PILL_ALERT_BG = read('--color-pill-alert-bg') || PILL_ALERT_BG;
  PILL_ALERT_TEXT = read('--color-pill-alert-text') || PILL_ALERT_TEXT;
  PILL_ALERT_BORDER = read('--color-pill-alert-border') || PILL_ALERT_BORDER;

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
  ringThemeSynced = true;
}

/** 自测开关：URL 带 ?hwmock=1 时用本地模拟数据（仅联调预览用，正常运行走真实 onHwStats） */
const MOCK = typeof location !== 'undefined' && /[?&]hwmock=1(?:&|$)/.test(location.search);

/**
 * 中部槽位自测分支（仅在 ?hwmock=1 下生效）。
 * 优先链的每种中部场景都要能静态核对，而换真机硬件成本太高 → 用 URL 参数指定分支：
 *   ?hwmock=1                 → Wi-Fi 已连接 3 格（默认，且无蓝牙外设）
 *   ?hwmock=1&hwwifi=mid      → 已连接 2 格（验证中间弧熄灭后的空心观感）
 *   ?hwmock=1&hwwifi=weak     → 已连接 1 格（最内弧点亮）
 *   ?hwmock=1&hwwifi=noconn   → 无线已开启但未关联（空心 Wi-Fi，三弧全 inactive）
 *   ?hwmock=1&hwwifi=off      → Wi-Fi 关闭 / 不可用（斜杠 WifiOff）
 *   ?hwmock=1&hwwifi=none     → 无无线网卡 / 采集失败（wifi: null，同样走斜杠）
 *   ?hwmock=1&hwbt=1          → 蓝牙单设备带电量（优先链②，抢占 Wi-Fi 图标）
 *   ?hwmock=1&hwbt=multi      → 蓝牙三设备（首台无电量 → 验证「等N台」与无电量副文本）
 */
const MOCK_QUERY = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
type MockWifiBranch = 'ok' | 'mid' | 'weak' | 'noconn' | 'off' | 'none';
const MOCK_WIFI_BRANCH: MockWifiBranch = (() => {
  const v = MOCK_QUERY?.get('hwwifi');
  return v === 'mid' || v === 'weak' || v === 'noconn' || v === 'off' || v === 'none' ? v : 'ok';
})();
const MOCK_BT_BRANCH = MOCK_QUERY?.get('hwbt') ?? '';
const MOCK_BT = MOCK_BT_BRANCH === '1' || MOCK_BT_BRANCH === 'multi';

/** 自测用 Wi-Fi 状态：覆盖「3 格 / 2 格 / 1 格 / 未关联 / 关闭 / 采集失败」六种分支 */
function mockWifi(): WifiStatus | null {
  switch (MOCK_WIFI_BRANCH) {
    case 'none':
      return null; // 采集失败 / 无无线网卡
    case 'off':
      return { available: false, connected: false, ssid: null, signal: null, bars: 0 };
    case 'noconn':
      return { available: true, connected: false, ssid: null, signal: null, bars: 0 };
    case 'weak':
      return { available: true, connected: true, ssid: 'WorkPulse-5G', signal: 18, bars: 1 };
    case 'mid':
      return { available: true, connected: true, ssid: 'WorkPulse-5G', signal: 42, bars: 2 };
    default:
      return { available: true, connected: true, ssid: 'WorkPulse-5G', signal: 78, bars: 3 };
  }
}

/** 自测用蓝牙状态：单台外设带电量（名称偏长，顺带验证读数条的文字截断）；
 *  hwbt=multi 时给三台，首台不带电量 → 同时验证「等N台」与「无电量不显示副文本」 */
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

/** 悬停读数条可指向的元素：环带三段（CPU 弧 / 内存弧 / 电量圆点）+ 中部槽位（Wi-Fi / 蓝牙） */
type Metric = 'cpu' | 'mem' | 'battery' | 'wifi' | 'bluetooth';

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
 * - plug：充电中 / 已接电源未充电 / 已充满 → 静态插头图标（绿）
 * - null：电池供电但电量未知 / 无任何电源数据 → 不渲染（圆点保持琥珀色逻辑）
 */
type TopSlot = { kind: 'percent'; text: string; color: string } | { kind: 'plug'; color: string };

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
  const [hover, setHover] = useState<Metric | null>(null);

  // ref：供光标轮询回调读取最新数据（渲染期间不写 ref）
  const hwRef = useRef<HwStats | null>(null);
  useEffect(() => {
    hwRef.current = hw;
  }, [hw]);

  const hasHw = hw !== null;

  // ─── 数据源①：window.radialApi.onHwStats（共享类型 HwStats，返回退订函数） ───
  useEffect(() => {
    if (MOCK) {
      const id = window.setInterval(() => {
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
          charging: null, // 未知 → 回退 MOCK 的 battery.charging
          wifi: mockWifi(), // 中部槽位 Wi-Fi 分支（见 MOCK_WIFI_BRANCH）
          bluetooth: mockBluetooth(), // 中部槽位蓝牙分支（?hwbt=1 时单设备带电量）
          ts: Date.now(),
        });
      }, 900);
      return () => window.clearInterval(id);
    }

    const off = window.radialApi.onHwStats((s) => {
      if (s && typeof s === 'object') setHw(s);
    });
    return () => off();
  }, []);

  // ─── 数据源②：navigator.getBattery()（渲染进程自行获取，不依赖 IPC） ───
  useEffect(() => {
    if (MOCK) {
      const id = window.setInterval(() => {
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

  // ─── 悬停判定：复用主进程 30ms 光标轮询，中心圆内 = 中部槽位，环带 = [25, 38] ───
  // 与几何常量对齐（由 DOT_HIT / CPU_HIT / MEM_HIT 推导，不写死角度）：
  // 圆点段 150.88°~209.12° = 电量，CPU 弧 8.05°~138.95° = CPU，
  // 内存弧 221.05°~351.95° = 内存；三处间隔区不归属任何元素（悬停也能看出是三段）
  useEffect(() => {
    const cleanup = window.radialApi.onCursor((p) => {
      const dx = p.x - CX;
      const dy = p.y - CY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 中部槽位（中心圆半径内）：直接复用中心图标的优先链，保证「看到什么图标 = 读出什么数据」；
      // 场景为空（无任何硬件数据）时中心是留白，悬停也不该冒出条目
      if (dist <= CENTER_R) {
        const scene = buildCenterScene(hwRef.current);
        setHover(scene ? scene.kind : null);
        return;
      }
      if (dist < HIT_IN || dist > HIT_OUT) {
        setHover(null);
        return;
      }
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      if (angle >= DOT_HIT_LO && angle <= DOT_HIT_HI) {
        setHover('battery'); // 底部圆点段 = 电量（与两侧弧起点各留 ≈12.7° 视觉净空）
        return;
      }
      if (!hwRef.current) {
        setHover(null); // 弧未渲染时不指向 CPU/内存
        return;
      }
      if (angle >= CPU_HIT_LO && angle <= CPU_HIT_HI) {
        setHover('cpu'); // 右半区 CPU 弧（边界含弧端 round cap 外延）
        return;
      }
      if (angle >= MEM_HIT_LO && angle <= MEM_HIT_HI) {
        setHover('mem'); // 左半区内存弧
        return;
      }
      setHover(null); // 三处间隔区（底部两角 + 顶部）不属于任何元素
    });
    return cleanup;
  }, []);

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

  // ─── 电源表达判定（圆点常显） ───
  const powerMode: PowerMode =
    level !== null
      ? 'level'
      : noBattery || (hasHw && !hw?.onBattery) || (battery?.charging && battery.level >= 0.999)
        ? 'mains'
        : hasHw
          ? 'battery-unknown'
          : 'unknown';

  // ─── 电池颜色角色（底部圆点 / 顶部百分比数字 / 悬停读数条共用同一套语义）───
  // 判定顺序见 hw-colors.ts：低电量临界 > 低电量预警 > 充电/接电 > 未知 > 常规
  const role = batteryRole(level, charging, powerMode);
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

  // ─── 电量点亮（逆时针：底部自左向右 = 圆心角 204° → 156°）───
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

  // ─── 顶部电源状态槽（0° 顶隙）：放电 → 百分比数字；充电/接电 → 插头；无数据 → 不渲染 ───
  const topSlot: TopSlot | null =
    powerMode === 'level' && level !== null && !plugged && !charging
      ? {
          kind: 'percent',
          text: `${Math.round(level * 100)}`,
          // 数字颜色按角色：<10% 红、<20% 黄、其余白
          color:
            role === 'critical' ? DOT_COLOR_LOW : role === 'lowPower' ? DOT_COLOR_WARN : TOP_TEXT,
        }
      : charging || plugged || powerMode === 'mains'
        ? { kind: 'plug', color: DOT_COLOR_CHARGE }
        : null;

  // ─── 中部槽位场景（优先链只存在于 hw-scene.buildCenterScene 一处）：Wi-Fi / 蓝牙 / 留白 ───
  const center = buildCenterScene(hw);
  // 入场键只按「场景类型 + 是否斜杠」区分：信号格数 3→2 时图标不重放整段淡入淡出，
  // 只让各自弧的 stroke-opacity 平滑过渡（见 WifiSignal）
  const centerKey =
    center === null
      ? 'none'
      : center.kind === 'wifi'
        ? center.off
          ? 'wifi-off'
          : 'wifi'
        : 'bluetooth';

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
    const dim = hover !== null && hover !== metric;
    const f = clamp01(v / 100);
    const alert = v >= ALERT_AT;
    const grad = f > 0.02 ? buildGradient(r, startDeg, sweepDeg * f) : null;
    const drawn = f > 0.015; // 极小值不画进度（沿用原端点显示阈值）；进度端只靠 round cap 收口，无跟随圆点
    const gradId = `hwGrad-${metric}`;
    const trackD = arcPathD(r, startDeg, startDeg + sweepDeg); // 轨道 = 整段弧
    const progD = arcPathD(r, startDeg, startDeg + sweepDeg * f); // 进度 = 按当前值截断的弧

    return (
      <g key={metric} style={{ opacity: dim ? 0.34 : 1, transition: 'opacity 0.25s ease' }}>
        {/* 轨道：淡墨衬边（RIM_COLOR，宽 +RIM_PAD）+ 浅灰本色 —— 与电量圆点同圆周、同底色，
            三段是同一条环形刻度带被间隔切开；衬边很淡（0.35）只作暗晕轮廓，不产生硬描边的闷感；
            无阴影（drop-shadow 会在 Windows 透明窗上合成出方形暗边） */}
        <path
          d={trackD}
          fill="none"
          stroke={RIM_COLOR}
          strokeWidth={STROKE_W + RIM_PAD}
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

  /* ── 电量 / 电源圆点（与双弧同圆周 R_RING 的底部刻度段，圆心 156°~204°、外缘 150.88°~209.12°，
        与两侧弧起点各留 ≈12.7° 视觉净空；每颗 20%，颗内按余数比例部分填充；
        点亮方向 = 逆时针（底部自左向右，圆心角 204° → 156°，颗内弦的推进方向与之一致）；
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
        {/* 衬边圆：比本体宽 DOT_RIM，浅色壁纸上勾出轮廓（深色壁纸上与背景融为一体，不产生脏边） */}
        <circle cx={p.x} cy={p.y} r={DOT_R + DOT_RIM} fill={RIM_COLOR} />
        {/* 底圆：整颗亮 = 角色色不透明；未整颗亮 = 同角色色 alpha 0.22 的轨道（部分填充在其上叠加） */}
        <circle
          cx={p.x}
          cy={p.y}
          r={DOT_R}
          fill={dotColor}
          fillOpacity={on ? 1 : BATTERY_INACTIVE_ALPHA}
        />
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

  /* ── 悬停数值读数条（收起态可见区仅 76×76 → 气泡压缩为贴底窄条 + 紧凑中文短文案） ── */
  let pill: {
    key: string;
    Icon: typeof Cpu;
    text: string;
    sub?: string;
    color: string;
    alert: boolean;
  } | null = null;
  if (hover === 'cpu' && hw) {
    pill = {
      key: 'cpu',
      Icon: Cpu,
      text: typeof hw.cpu === 'number' ? `${Math.round(hw.cpu)}%` : '…',
      color: loadColor((cpuS ?? 0) / 100),
      alert: (hw.cpu ?? 0) >= ALERT_AT,
    };
  } else if (hover === 'mem' && hw) {
    pill = {
      key: 'mem',
      Icon: MemoryStick,
      text: `${Math.round(hw.memUsedPct)}%`,
      sub: `·${hw.memUsedGB.toFixed(1)}G`, // 已用容量作副文本（总容量体现在弧比例上，条上只补精确值）
      color: loadColor((memS ?? 0) / 100),
      alert: hw.memUsedPct >= ALERT_AT,
    };
  } else if (hover === 'battery') {
    // 颜色统一走 batteryRole()：critical 红 / lowPower 黄 / powered 绿 / unknown 琥珀 / primary 绿
    const low = role === 'critical' || role === 'lowPower';
    const onPower = charging || plugged;
    pill =
      powerMode === 'level' && level !== null
        ? {
            key: 'battery',
            Icon: role === 'powered' ? Plug : Battery,
            text: `${Math.round(level * 100)}%`,
            sub: onPower ? '·充电' : '·电池',
            color: roleColor(role),
            alert: low,
          }
        : {
            key: 'power',
            Icon: powerMode === 'mains' ? Plug : Battery,
            text:
              powerMode === 'mains'
                ? '接通电源'
                : powerMode === 'battery-unknown'
                  ? '电量未知'
                  : '电源未知',
            color: roleColor(role),
            alert: false,
          };
    if (powerMode === 'unknown' && pill) pill = { ...pill, Icon: Power };
  } else if (hover === 'wifi' && hw) {
    // 与中部图标严格同一套判定（图标也同形：不可用 = WifiOff，与中心一致）：
    // null / 不可用 → 「不可用」，已开启未关联 → 「未连接」，
    // 已连接 → ssid（隐藏 SSID 时退化为「已连接」）+ 信号百分比
    const w = hw.wifi;
    const off = !w || !w.available;
    pill = {
      key: 'wifi',
      Icon: off ? WifiOff : Wifi,
      text: off ? '不可用' : w?.connected ? (w.ssid ?? '已连接') : '未连接',
      sub: w && w.connected && w.signal !== null ? `·${Math.round(w.signal)}%` : undefined,
      color: WIFI_COLOR,
      alert: false,
    };
  } else if (hover === 'bluetooth' && hw) {
    // 只有「有已连接外设」时才存在蓝牙条目（优先链②成立才可能悬停到这里；仍做防御性判空）
    const [first, ...rest] = hw.bluetooth?.devices ?? [];
    if (first) {
      pill = {
        key: 'bluetooth',
        Icon: Bluetooth,
        // 多台时「首台名 等N台」（N = 设备总数）；名称过长由 CSS 省略号截断，读数条宽度锁死 76px
        text: rest.length > 0 ? `${first.name} 等${rest.length + 1}台` : first.name,
        sub: first.battery !== null ? `·${first.battery}%` : undefined,
        color: BT_COLOR,
        alert: false,
      };
    }
  }

  const dimmed = (metric: Metric): boolean => hover !== null && hover !== metric;

  return (
    <>
      {/* ═══ 环形层（zIndex 2：高于中心按钮 1、低于扇区层 3 → 扇区 tooltip 自然盖在其上） ═══ */}
      <motion.div
        key="hw-ring"
        className="absolute inset-0"
        style={{ zIndex: 2, pointerEvents: 'none' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: expanded ? 0 : 1 }} // 菜单展开时隐藏整环、收起时显示（淡入淡出 0.2s）
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <svg width={WIDGET_SIZE} height={WIDGET_SIZE} className="absolute inset-0">
          {renderRing('cpu', R_RING, CPU_A, CPU_SWEEP, hw && cpuS !== null ? cpuS : null)}
          {renderRing('mem', R_RING, MEM_A, MEM_SWEEP, hw && memS !== null ? memS : null)}
          <g
            style={{
              opacity: dimmed('battery') ? 0.4 : 1,
              transition: 'opacity 0.25s ease',
            }}
          >
            <g>{dots}</g>
          </g>

          {/* 顶部电源状态槽 · 放电中：电量百分比数字（SVG 文本居中于 0° 顶隙）。
              底层 fill=none 只描 RIM_INK 淡墨边、上层填角色色 —— 白色数字在浅色壁纸上仍可读，
              与图标 / 读数条同一种「淡墨衬边」手法，全程无阴影（透明窗不能有阴影合成暗边） */}
          {topSlot?.kind === 'percent' && (
            <>
              <text
                x={CX}
                y={CY - R_RING}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fontWeight={600}
                fill="none"
                stroke={RIM_INK}
                strokeWidth={2.4}
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
                fontSize={10}
                fontWeight={600}
                fill={topSlot.color}
                style={{ fontVariantNumeric: 'tabular-nums' }}
                aria-hidden
              >
                {topSlot.text}
              </text>
            </>
          )}
        </svg>

        {/* 顶部电源状态槽 · 充电中 / 已接电源未充电 / 已充满：静态插头图标（绿，不闪烁）。
            尺寸 10px 落在 0° 顶隙；双层描边（底层 RIM_INK 粗描 + 上层本色）保证浅色壁纸可读；
            无电量数据的 battery-unknown / unknown 不渲染任何顶部内容 */}
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

        {/* ═══ 中部槽位（中心圆半径内的留白）：Wi-Fi / 蓝牙状态图标 ═══
            永远只有一枚，由 buildCenterScene 的优先链决定是哪个场景；切换时 0.2s 淡入淡出
            （AnimatePresence 默认 sync 模式 + 子项绝对定位叠放 = 交叉淡化，不产生位移）；
            收起态常显、展开态随整环一起淡出（由外层 motion.div 的 expanded 动画统一处理）；
            整层 pointer-events: none → 图标不接管点击，中心按钮的点击 / 拖拽 / setShape 全不受影响。
            无场景（无任何硬件数据）时不渲染任何东西，中心保持留白 ═══ */}
        <div className="absolute flex items-center justify-center" style={centerBox(CENTER_ICON)}>
          <AnimatePresence initial={false}>
            {center && (
              <motion.div
                key={centerKey}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                aria-hidden
              >
                {center.kind === 'bluetooth' ? (
                  <OutlineIcon Icon={Bluetooth} size={CENTER_ICON} color={BT_COLOR} />
                ) : center.off ? (
                  <OutlineIcon Icon={WifiOff} size={CENTER_ICON} color={WIFI_COLOR} />
                ) : (
                  <WifiSignal bars={center.bars} size={CENTER_ICON} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ═══ 数值读数条（独立 zIndex 20；收起态 OS 可见区是半径 38 的圆 →
            贴底摆放时底部弦宽不足（y=134 处半宽仅 ≈22px）会被裁角，故垂直居中显示：
            圆中线（y=103）处半宽恰为 38，76 宽窄条天然放得下；
            悬停时主进程把读数条矩形并入 setShape 兜底四角；悬停仅收起态生效）═══ */}
      <AnimatePresence>
        {!expanded && pill && (
          <motion.div
            key={pill.key}
            className="absolute flex items-center justify-center gap-1 whitespace-nowrap rounded-full
                       text-[10px] font-semibold leading-none tabular-nums"
            style={{
              left: CX - COLLAPSED_HALF, // 65：贴可见区左沿，宽度贴满 76
              top: CY - PILL_H / 2, // 96.5：垂直居中（圆中线 y=103 处弦宽最大 = 76，不被圆形可见区裁角）
              width: COLLAPSED_HALF * 2, // 76
              height: PILL_H, // 13
              zIndex: 20,
              pointerEvents: 'none',
              transformOrigin: '50% 100%', // 进出场从底边向上展开（贴边读数条的语义）
              // 配色全部走 --color-pill-* token（告警态换 --color-pill-alert-*）
              background: pill.alert ? PILL_ALERT_BG : PILL_BG,
              color: pill.alert ? PILL_ALERT_TEXT : PILL_TEXT,
              border: `1px solid ${pill.alert ? PILL_ALERT_BORDER : PILL_BORDER}`,
              // 读数条不带任何阴影：boxShadow 的大模糊会在 206×206 的透明悬浮窗上糊开一整片暗影。
              // 靠不透明底色 + 描边与背景区分即可；弧线 / 圆点 / 图标自身的对比改由「淡墨衬边」承担。
            }}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {/* 图标也描一圈淡墨轮廓（RIM_INK）露出 ≈0.3px：青 / 绿等亮色图标在近白色药丸上
                不再发虚，但降透明度后不显闷；上层保持本色描边 */}
            <span className="relative shrink-0" style={{ width: 10, height: 10 }}>
              <pill.Icon
                size={10}
                strokeWidth={4}
                style={{ color: RIM_INK, position: 'absolute', left: 0, top: 0 }}
              />
              <pill.Icon
                size={10}
                strokeWidth={2.6}
                style={{ color: pill.color, position: 'absolute', left: 0, top: 0 }}
              />
            </span>
            <span>{pill.text}</span>
            {pill.sub && <span className="font-medium opacity-55">{pill.sub}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** 顶隙方框定位（中心对齐到顶部 0°、半径 R_RING 的圆周点 → 两弧末端之间、电量圆点正上方） */
function topGapBox(size: number): CSSProperties {
  const top = CY - R_RING - size / 2; // 上沿 = 103 − 29.65 − 5 = 68.35（距圆心 34.65 < 可见 38；下沿 78.35 不压中心按钮顶 79）
  return {
    left: CX - size / 2,
    top,
    width: size,
    height: size,
  };
}

/**
 * 中部槽位方框定位：以 (CX, CY) 为几何中心。
 * 12×12 的盒子四边距中心圆内沿（R=24）还剩 12px，既不顶到中心按钮边缘，也不出可见区。
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
 * 双描边图标（淡墨衬边 + 本色）：中部槽位只有 12px，亮色单描边在浅色壁纸上会「发虚」。
 * 底层用 RIM_INK 粗描（透明度已压到 0.5）勾轮廓，上层保持本色细描 ——
 * 与顶部插头、读数条图标同一手法，全程无阴影（透明窗不能有阴影合成暗边）。
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
 * Wi-Fi 信号弧的几何：三段同心弧，共用圆心 (12,19)，各自扫 ±42°、半径 4.5 / 9 / 13.5。
 * 为什么不用 lucide 的 Wifi 图标：它的三段弧圆心并不重合（视觉是「叠起来的弧」），
 * 而这里「格数 = 点亮几段」需要严格同心，信号 3→2→1 才是「外弧渐隐」而不是整枚图标换形状。
 */
function wifiArcPath(r: number): string {
  const cx = 12;
  const cy = 19;
  const a = (42 * Math.PI) / 180;
  const x0 = cx - r * Math.sin(a);
  const y0 = cy - r * Math.cos(a);
  const x1 = cx + r * Math.sin(a);
  const y1 = cy - r * Math.cos(a);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** 由内到外三段弧（bars = 1 → 只亮最内一段；bars = 0 → 三段全灭 = 空心） */
const WIFI_ARCS: ReadonlyArray<readonly [number, string]> = ([4.5, 9, 13.5] as const).map(
  (r) => [r, wifiArcPath(r)] as const,
);

/**
 * 中部槽位 Wi-Fi 指示：三段同心弧按格数点亮（0 格 = 已开启但未关联的空心态）。
 * 亮 / 灭只切 stroke-opacity（同角色色降到 22%，沿用 status-trio 的 inactive 规则），
 * 不换颜色、不重绘图元 → radial-only.css 的 .hw-wifi-bar 过渡生效：
 * 信号 3→2→1 格是「弧渐隐」，不会整枚图标闪一下。
 * 亮弧底层同样描一道 RIM_INK 淡墨轮廓，保证浅色壁纸上 1px 细弧仍可读。
 */
function WifiSignal({ bars, size }: { bars: 0 | 1 | 2 | 3; size: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {WIFI_ARCS.map(([r, d], i) => {
        const lit = i < bars; // i=0 最内弧：1 格时只亮它
        return (
          <g key={r}>
            <path
              className="hw-wifi-bar"
              d={d}
              stroke={RIM_INK}
              strokeWidth={3.2}
              strokeLinecap="round"
              strokeOpacity={lit ? 1 : 0}
            />
            <path
              className="hw-wifi-bar"
              d={d}
              stroke={WIFI_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeOpacity={lit ? 1 : BATTERY_INACTIVE_ALPHA}
            />
          </g>
        );
      })}
    </svg>
  );
}
