import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Battery, Cpu, MemoryStick, Plug, Power, Zap } from 'lucide-react';
import type { HwStats } from '../../../shared/hw-stats';

/**
 * 硬件状态显示环 —— 围绕中心圆圈的内环状态层（位于 CENTER_R 24 ~ INNER_R 38 环带内）
 *
 * 设计方法论（参考 iPhone Duo 折叠屏外屏的三合一圆形状态图标）：
 * - 电量圆点、CPU 弧、内存弧全部落在同一个圆周（R_RING=35.3）上，
 *   视觉上是「一个圆」被分成：底部电量圆点段 + 右半 CPU 段 + 左半内存段（三段之间留明显间隔）
 * - 圆点 = 计数：底部 5 颗小圆点 = 电量（每颗 20%，颗内按余数比例部分填充，点亮方向 = 逆时针）；
 *   无电量数据时常显「电源状态」
 * - 符号 = 身份：内层 Cpu / MemoryStick 小图标标明左右两段弧的归属（内层半径，不撞同半径的弧）
 *
 * 布局（0°=正上方，顺时针；右半区 0~180，左半区 180~360），三段之间留明显间隔：
 * 底部 151.78°~208.22° 放电量圆点（圆心 156°~204°）；CPU 弧从 137° 逆时针生长 127° 到 10°（右半区），
 * 内存弧从 223° 顺时针生长 127° 到 350°（左半区）。三处间隔按视觉净空计（已折算弧端
 * round cap 与圆点描边外延）：底部两角各 ≈12.8°（≈7.9px，告警描边加宽后 ≈11.6°，仍不相交）、
 * 顶部名义 20° / 净空 ≈16.1°（≈9.9px，计入弧端点圆点后 ≈13.5°）→
 * 一眼看出是三个独立元素；两弧各 127°（≤180°）、方向相反、互为镜像、各自锁死在自己那半边，
 * 任何进度值（含 100% + 告警加宽 + 端点圆点）都不相交。
 *
 * 分层（由内到外）：中心按钮 24 → 身份图标 28.4（内层）→ 圆点与双弧共用 35.3 → 扇区内沿 38。
 * 圆点与弧同半径同轨道，身份图标单独放内层，与弧层（≥33.35）径向分离、互不遮挡。
 *
 * 交互：光标落在环带（半径 25~38）即悬停，弹出数值读数条；平时只显示图形保持紧凑。
 * 收起态窗口可见区仅 applyShape(38) 的 76×76 方形（x,y ∈ [65,141]）→ 数值气泡做成
 * 贴可见区底边的全宽窄条（y ∈ [127.5,140.5]），完整落在可见区内，不依赖主进程扩 shape。
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

/* ── 状态环几何：电量圆点与 CPU / 内存双弧共用同一圆周（24 ~ 38 环带，围绕中心圆圈） ──
 * 约定：0°=正上方，顺时针递增 → 右半区 [0,180]，左半区 [180,360]。
 * 三个元素共圆周但互不相接：底部电量圆点段外缘 151.78°~208.22°，
 * CPU 弧锁在右半区（137° 起逆时针 127° 到 10°）、内存弧锁在左半区（223° 起顺时针 127° 到 350°），
 * 方向相反、互为镜像；三处间隔：底部两角视觉净空 ≈12.8°（告警加宽后 ≈11.6°，不相交）、
 *顶部名义 20° / 含弧端点圆点净空 ≈13.5°。 */
const TOP_GAP = 20; // 顶部名义间隔（两弧末端之间：CPU 止 10°、内存止 350°）
const R_RING = 35.3; // 圆点与双弧共用半径（圆点外缘 37.9 仍在外沿 38 之内 → 同一圆环）
const STROKE_W = 2.4; // 弧线宽（24~38 环带偏窄，压缩线宽换取双弧间距）
const CAP_DEG = (Math.asin(STROKE_W / 2 / R_RING) * 180) / Math.PI; // ≈1.95° 弧端 round cap 角外延（净空按它折算；告警加宽到 3.9 线宽时 ≈3.17°）
const CPU_A = 137; // CPU 右弧起点（到圆点段外缘 151.78° 的净空 = 151.78 − 137 − cap ≈ 12.8°）
const MEM_A = 360 - CPU_A; // 223° 内存左弧起点（与 CPU 关于 180° 轴严格镜像）
const ARC_SWEEP = CPU_A - TOP_GAP / 2; // 127° 每条弧扫角（≤180：末端落在 10° / 350°，三段 + 三间隔铺满整圆）
const CPU_SWEEP = -ARC_SWEEP; // 逆时针生长：137° → 10°（角度递减，锁定右半区）
const MEM_SWEEP = ARC_SWEEP; // 顺时针生长：223° → 350°（角度递增，锁定左半区）
const DOT_R = 2.3; // 圆点半径（直径 4.6，比上版 3.4 更饱满；外缘 2.6 不超环带外沿 38）
const DOT_COUNT = 5; // 5 档 = 每档 20%（颗内支持按余数比例部分填充 = 半颗/实际百分比）
const DOT_STROKE_W = 0.6; // 圆点描边宽（圆点外缘 = DOT_R + 描边一半，间隔与命中判定都按外缘折算）
const DOT_STEP_DEG = 12; // 相邻圆点角间距（圆心弧距 ≈7.39px，外缘净空 ≈2.19px ≥2px）
const DOT_HALF_DEG = (Math.asin((DOT_R + DOT_STROKE_W / 2) / R_RING) * 180) / Math.PI; // ≈4.22° 单颗圆点（含描边）角半宽
const DOT_EDGE_DEG = ((DOT_COUNT - 1) / 2) * DOT_STEP_DEG + DOT_HALF_DEG; // ≈28.22° 圆点段外缘相对 180° 的半跨（段外缘 151.78°~208.22°）
/* 三元素悬停命中边界（与视觉边界对齐；三处间隔区不命中任何元素） */
const DOT_HIT_LO = 180 - DOT_EDGE_DEG; // 151.78° 圆点段右外缘（CPU 弧一侧）
const DOT_HIT_HI = 180 + DOT_EDGE_DEG; // 208.22° 圆点段左外缘（内存弧一侧）
const CPU_HIT_LO = TOP_GAP / 2 - CAP_DEG; // 8.05° CPU 弧视觉末端
const CPU_HIT_HI = CPU_A + CAP_DEG; // 138.95° CPU 弧视觉起点（含 round cap）
const MEM_HIT_LO = MEM_A - CAP_DEG; // 221.05° 内存弧视觉起点（含 round cap）
const MEM_HIT_HI = 360 - CPU_HIT_LO; // 351.95° 内存弧视觉末端（与 CPU 关于 0° 轴镜像）
const ICON_CPU_DEG = 18; // 18° 内层右侧身份图标（Cpu，与同角度的外层弧径向分离）
const ICON_MEM_DEG = 342; // 342° 内层左侧身份图标（MemoryStick）
const ICON_SIZE = 8; // 身份图标边长（内层可用径向仅 ~8.7，10px 图标会顶到中心按钮与弧层）
const R_ICON = 28.4; // 身份图标所在内层半径（图标占 24.4~32.4，与圆点内缘 32.7 径向分离）
const ICON_CHARGE_DEG = 180; // 充电闪电角度：底部圆点段中央的内侧（与圆点段同心不同径，不重叠）
const HIT_IN = CENTER_R + 1; // 悬停判定内沿 25（避开中心按钮）
const HIT_OUT = INNER_R; // 悬停判定外沿 38（与扇区悬停带 [38,94] 无缝衔接）
const ALERT_AT = 85; // 告警阈值（%）
const COLLAPSED_HALF = 38; // 收起态可见区半边长（主进程 applyShape(38) 的 76×76 方形，局部坐标 x,y ∈ [65,141]，区域外不绘制像素）
const PILL_H = 13; // 底部读数条高度（上下边框 2 + 内容区 11 ≥ 10px leading-none 文字；条顶 127.5 清空中心按钮底 127）

/* ── 负载渐变色：低负载冷色 → 高负载暖色 ── */
const LOAD_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, '#22d3ee'], // 青
  [0.5, '#facc15'], // 黄
  [0.8, '#fb923c'], // 橙
  [1, '#f43f5e'], // 红
];
const ALERT_COLOR = '#ff2d55';
const DOT_COLOR_CHARGE = '#34d399'; // 充电中 / 接通电源（呼吸绿，比正常电量绿更亮一档，靠呼吸动画区分）
const DOT_COLOR_LOW = '#f43f5e'; // ≤20% 低电告警（红 + 脉冲，逻辑不变）
const DOT_COLOR_MID = '#fbbf24'; // 电量未知的电池供电（琥珀，无百分比可用）
const DOT_COLOR_OK = '#22c55e'; // 正常电量（>20%）：绿色进度 —— 电量=绿、负载=暖色告警，与青→黄→橙→红的 CPU/内存弧语义区分
const DOT_COLOR_UNKNOWN = 'rgba(255,255,255,0.72)'; // 完全无数据时的中性常显

/** 自测开关：URL 带 ?hwmock=1 时用本地模拟数据（仅联调预览用，正常运行走真实 onHwStats） */
const MOCK = typeof location !== 'undefined' && /[?&]hwmock=1(?:&|$)/.test(location.search);

/** navigator.getBattery() 的最小结构（避免依赖 DOM 实验性类型） */
interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener(type: 'levelchange' | 'chargingchange', cb: () => void): void;
  removeEventListener(type: 'levelchange' | 'chargingchange', cb: () => void): void;
}

type Metric = 'cpu' | 'mem' | 'battery';

/**
 * 底部圆点的四种电源表达 —— 保证圆点在任何机器上都常显：
 * - level：拿到电量 → 填充 = 电量（每颗 20%，颗内按余数比例部分填充，逆时针点亮）；颜色表状态：充电呼吸绿 / ≤20% 红脉冲 / 其余绿色进度
 * - mains：台式机 / 接通电源（level=1 && charging 持续，或 hwStats.onBattery=false）→ 5 颗全亮（电源绿）
 * - battery-unknown：无电量数据但 hwStats 显示电池供电 → 5 颗全亮（琥珀，电量未知）
 * - unknown：既无电量也无 hwStats → 5 颗全亮（中性白）
 */
type PowerMode = 'level' | 'mains' | 'battery-unknown' | 'unknown';

/* ────────────────────────── 工具函数 ────────────────────────── */

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
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

/** 数值平滑：把突变的采样值缓动到目标值，弧长 / 端点随之平滑过渡 */
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

  // ─── 悬停判定：复用主进程 30ms 光标轮询，环带 = [25, 38] ───
  // 与几何常量对齐（由 DOT_HIT / CPU_HIT / MEM_HIT 推导，不写死角度）：
  // 圆点段 151.78°~208.22° = 电量，CPU 弧 8.05°~138.95° = CPU，
  // 内存弧 221.05°~351.95° = 内存；三处间隔区不归属任何元素（悬停也能看出是三段）
  useEffect(() => {
    const cleanup = window.radialApi.onCursor((p) => {
      const dx = p.x - CX;
      const dy = p.y - CY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < HIT_IN || dist > HIT_OUT) {
        setHover(null);
        return;
      }
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      if (angle >= DOT_HIT_LO && angle <= DOT_HIT_HI) {
        setHover('battery'); // 底部圆点段 = 电量（与两侧弧起点各留 ≈12.8° 视觉净空）
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

  // ─── 数值平滑（弧长 / 端点平滑过渡） ───
  // 注意：cpu / memUsedPct 都是 0–100 的百分比，必须先 /100 归一化再 clamp01。
  // 若直接 clamp01(hw.memUsedPct)，任何 ≥1% 的真实占用都会被夹成 1 → memS 恒为 100 → 内存弧永远画满。
  const cpuS = useSmoothed(hw && hw.cpu !== null ? clamp01(hw.cpu / 100) * 100 : null);
  const memS = useSmoothed(hw ? clamp01(hw.memUsedPct / 100) * 100 : null);

  const level = battery && !noBattery ? clamp01(battery.level) : null;
  const charging = !!battery?.charging;

  // ─── 电源表达判定（圆点常显） ───
  const powerMode: PowerMode =
    level !== null
      ? 'level'
      : noBattery || (hasHw && !hw?.onBattery) || (battery?.charging && battery.level >= 0.999)
        ? 'mains'
        : hasHw
          ? 'battery-unknown'
          : 'unknown';

  // ─── 电量点亮（逆时针：底部自左向右 = 圆心角 204° → 156°）───
  // dotTotal ∈ [0, 5]：整数部分 = 整颗数，小数部分 = 下一颗的填充比例
  //（如 47% → 2.35 = 2 整颗 + 第 3 颗 35%；57% → 2.85 = 2 整颗 + 第 3 颗 85%）
  let dotTotal = DOT_COUNT;
  let dotColor = DOT_COLOR_OK;
  let dotPulse: string | undefined;
  if (powerMode === 'level' && level !== null) {
    dotTotal = clamp01(level) * DOT_COUNT;
    // 低电告警可见性保底：≤20% 且填充不足半颗（含 0%）时按半颗显示，
    // 保证红色脉冲警示不消失；>10% 起严格按实际百分比，单调不回退
    if (level <= 0.2 && dotTotal < 0.5) dotTotal = 0.5;
    // 颜色只区分状态，不区分档位：填充比例表达百分比，颜色表达「正常绿 / 低电红 / 充电绿呼吸」
    dotColor = charging ? DOT_COLOR_CHARGE : level <= 0.2 ? DOT_COLOR_LOW : DOT_COLOR_OK;
    dotPulse = charging ? 'hw-charge-glow' : level <= 0.2 ? 'hw-alert-pulse' : undefined;
  } else if (powerMode === 'mains') {
    dotColor = DOT_COLOR_CHARGE;
  } else if (powerMode === 'battery-unknown') {
    dotColor = DOT_COLOR_MID;
  } else {
    dotColor = DOT_COLOR_UNKNOWN;
  }

  // ─── 充电标识：充电中（battery.charging）或接通电源（mains：台式机 / 满电持续插电）时显示；
  // 电池供电不显示 ───
  const showChargeBolt = charging || powerMode === 'mains';

  /* ── 单条进度弧（带符号 sweep，支持左右镜像生长） ── */
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
    const tip = f > 0.015 ? angleToXY(startDeg + sweepDeg * f, r, CX, CY) : null;
    const gradId = `hwGrad-${metric}`;
    const darkShadow = 'drop-shadow(0 0 2px rgba(0,0,0,0.55))';

    return (
      <g key={metric} style={{ opacity: dim ? 0.34 : 1, transition: 'opacity 0.25s ease' }}>
        {/* 单色描边基底（轨道）—— 与电量圆点同圆周、同底色，三段是同一条环形刻度带被间隔切开 */}
        <path
          d={arcPathD(r, startDeg, startDeg + sweepDeg)}
          fill="none"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth={STROKE_W}
          strokeLinecap="round"
          style={{ filter: darkShadow }}
        />
        {grad && tip && (
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
            {/* 进度弧：颜色渐变（冷 → 暖，末端即当前负载色） */}
            <path
              d={arcPathD(r, startDeg, startDeg + sweepDeg * f)}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={STROKE_W}
              strokeLinecap="round"
              style={{ filter: darkShadow }}
            />
          </>
        )}
        {alert && tip && (
          /* ≥85% 告警：红色脉冲覆盖，视觉突变 */
          <path
            className="hw-alert-pulse"
            d={arcPathD(r, startDeg, startDeg + sweepDeg * f)}
            fill="none"
            stroke={ALERT_COLOR}
            strokeWidth={STROKE_W + 1.5}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 3px ${ALERT_COLOR})` }}
          />
        )}
        {/* 弧端点指示：颜色 = 当前刻度色 */}
        {tip && (
          <circle
            cx={tip.x}
            cy={tip.y}
            r={1.6}
            fill={alert ? ALERT_COLOR : loadColor(f)}
            stroke="rgba(6,9,14,0.75)"
            strokeWidth={0.8}
            style={{
              filter: alert
                ? `drop-shadow(0 0 3px ${ALERT_COLOR})`
                : 'drop-shadow(0 0 2px rgba(0,0,0,0.6))',
            }}
          />
        )}
      </g>
    );
  };

  /* ── 电量 / 电源圆点（与双弧同圆周 R_RING 的底部刻度段，圆心 156°~204°、外缘 151.78°~208.22°，
        与两侧弧起点各留 ≈12.8° 视觉净空；每颗 20%，颗内按余数比例部分填充；
        点亮方向 = 逆时针（底部自左向右，圆心角 204° → 156°，颗内弦的推进方向与之一致）；
        无电量数据时常显电源状态；未亮圆点用弧轨道同色 → 看起来是同一环形刻度带的组成部分） ── */
  const dots: ReactNode[] = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    const deg = 180 + (i - (DOT_COUNT - 1) / 2) * DOT_STEP_DEG;
    const p = angleToXY(deg, R_RING, CX, CY);
    // 逆时针点亮序：角大的左侧圆点先亮（i=4 → i=0），rank 之后按余数部分填充
    const rank = DOT_COUNT - 1 - i;
    const frac = clamp01(dotTotal - rank); // 本颗填充比例（0=未亮、<1=部分、1=整颗）
    const on = frac >= 1;
    const lit = frac > 0;
    // 已亮圆点在深色描边之外再叠一层同色柔光（drop-shadow）：
    // 亮壁纸靠深色描边压边、暗壁纸靠同色柔光浮起 → 绿色电量进度在两种壁纸上都清晰
    const glow =
      lit && dotColor.startsWith('#') ? `drop-shadow(0 0 1.6px ${dotColor}b3)` : undefined;
    dots.push(
      <g key={i} style={glow ? { filter: glow } : undefined}>
        {/* 底圆：整颗亮 = 直接填色；部分亮 = 灰底 + 下方圆缺覆盖；全灭 = 灰底 */}
        <circle
          cx={p.x}
          cy={p.y}
          r={DOT_R}
          fill={on ? dotColor : 'rgba(255,255,255,0.34)'}
          stroke={lit ? 'rgba(6,9,14,0.7)' : 'rgba(6,9,14,0.45)'}
          strokeWidth={DOT_STROKE_W}
        />
        {!on && lit && (
          /* 部分填充：局部 +x = 逆时针前进方向，rotate(角度-180) 对齐后从先进入侧推进 */
          <path
            d={dotFillPathD(frac, DOT_R)}
            transform={`translate(${p.x} ${p.y}) rotate(${deg - 180})`}
            fill={dotColor}
            stroke="rgba(6,9,14,0.7)"
            strokeWidth={DOT_STROKE_W}
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
    const low = powerMode === 'level' && level !== null && !charging && level <= 0.2;
    pill =
      powerMode === 'level' && level !== null
        ? {
            key: 'battery',
            Icon: charging ? Zap : Battery,
            text: `${Math.round(level * 100)}%`,
            sub: charging ? '·充电' : '·电池',
            color: charging ? DOT_COLOR_CHARGE : low ? DOT_COLOR_LOW : DOT_COLOR_OK,
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
            color: powerMode === 'mains' ? DOT_COLOR_CHARGE : dotColor,
            alert: false,
          };
    if (powerMode === 'unknown' && pill) pill = { ...pill, Icon: Power };
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
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            }}
          >
            <g className={dotPulse}>{dots}</g>
          </g>
        </svg>

        {/* 身份符号：内层的小图标（角度落在弧的半区内，但半径在内层 28.7，与弧/圆点同圆周 35.3 径向分离；与 ICON_R=66 的菜单图标也不同层不同半径） */}
        {hasHw && (
          <>
            <div
              className="absolute flex items-center justify-center"
              style={{ ...iconPos(ICON_CPU_DEG), color: 'rgba(240,244,250,0.95)' }}
            >
              <Cpu size={ICON_SIZE} strokeWidth={2.6} />
            </div>
            <div
              className="absolute flex items-center justify-center"
              style={{ ...iconPos(ICON_MEM_DEG), color: 'rgba(240,244,250,0.95)' }}
            >
              <MemoryStick size={ICON_SIZE} strokeWidth={2.6} />
            </div>
          </>
        )}

        {/* 充电标识：底部圆点段中央（180°）的内侧闪电，充电中 / 接通电源时常显 + 呼吸发光动画；
            内层半径 R_ICON（24.7~32.7）与圆点（内缘 33.3）径向分离、不重叠，电池供电不渲染 */}
        {showChargeBolt && (
          <div
            className="hw-charge-bolt absolute flex items-center justify-center"
            style={{ ...iconPos(ICON_CHARGE_DEG), color: DOT_COLOR_CHARGE }}
          >
            <Zap size={ICON_SIZE} strokeWidth={2.4} fill="currentColor" />
          </div>
        )}
      </motion.div>

      {/* ═══ 数值读数条（独立 zIndex 20；收起态可见区仅 76×76 方形 [65,141]² →
            做成贴可见区底边的全宽窄条：条顶 127.5 清空中心按钮（底 127）、条底 140.5 贴下沿 141，
            完整可见；两弧仅弧头约 4° + round cap 藏进条后（视觉为弧从条后穿出），
            电量圆点 / 充电闪电整段被条覆盖 → 悬停时以条上图标 + 数值自述，dim 反馈仍由弧承担）═══ */}
      <AnimatePresence>
        {!expanded && pill && (
          <motion.div
            key={pill.key}
            className="absolute flex items-center justify-center gap-1 whitespace-nowrap rounded-full
                       text-[10px] font-semibold leading-none tabular-nums"
            style={{
              left: CX - COLLAPSED_HALF, // 65：贴可见区左沿，宽度贴满 76
              top: CY + CENTER_R + 0.5, // 127.5：中心按钮底（127）之下 0.5px，不压按钮
              width: COLLAPSED_HALF * 2, // 76
              height: PILL_H, // 13
              zIndex: 20,
              pointerEvents: 'none',
              transformOrigin: '50% 100%', // 进出场从底边向上展开（贴边读数条的语义）
              background: pill.alert ? 'rgba(255,241,243,0.97)' : 'rgba(240,242,246,0.96)',
              color: pill.alert ? '#be123c' : '#18181b',
              border: pill.alert ? '1px solid rgba(244,63,94,0.45)' : '1px solid rgba(0,0,0,0.1)',
              // 读数条不带任何阴影：boxShadow 的大模糊会在 206×206 的透明悬浮窗上糊开一整片暗影。
              // 靠不透明底色 + 描边与背景区分即可；弧线/圆点自身的暗色 drop-shadow 描边可读性手法保留。
            }}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <pill.Icon size={10} strokeWidth={2.6} style={{ color: pill.color, flexShrink: 0 }} />
            <span>{pill.text}</span>
            {pill.sub && <span className="font-medium opacity-55">{pill.sub}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** 身份图标的绝对定位（中心对齐到指定角度、内层半径 R_ICON） */
function iconPos(deg: number): CSSProperties {
  const p = angleToXY(deg, R_ICON, CX, CY);
  const S = 12; // 图标容器尺寸（8px 图标 + 余量；实际图标径向约 24.7~32.7，与弧/圆点所在同圆周 33.35~37.25 分离 → 不重叠）
  return {
    left: p.x - S / 2,
    top: p.y - S / 2,
    width: S,
    height: S,
    filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9)) drop-shadow(0 1px 1px rgba(0,0,0,0.6))',
  };
}
