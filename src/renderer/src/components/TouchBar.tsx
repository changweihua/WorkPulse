/**
 * Touch Bar 悬浮窗组件（参考 macOS Touch Bar）
 *
 * 布局：
 * - 底栏（56px 高）：系统状态/快捷控制项（时钟/Wi-Fi/蓝牙/电池/CPU/内存/音量/亮度）+ 别针/展开按钮
 * - 展开面板（72px 高，向上生长）：WorkPulse 功能入口（日志/任务/会议/AI/截图/设置）+ 自定义程序，按窗口宽度等分
 *
 * 圆角：主面板与卡片共用 20px 外圆角，内容四边统一 10px 留白，
 * 内部控件 10px 圆角，弧线严格同心（见 touchbar-only.css）。
 *
 * 悬停：底栏系统项鼠标移入即向上弹出详情卡片（见 TouchBarPopover.tsx），
 * 展示当前连接的设备 / 实时数值并提供快捷操作；移出整个悬浮窗后淡出收起。
 * 只有首次展开才通知主进程扩窗，图标间切换只换内容，避免反复 setBounds 造成卡顿。
 *
 * 主题：复用 RadialTheme.css 的 token（hw-dark / --wallpaper-luma / --color-radial-accent），
 * 背景按设置页的窗口材质（data-material）切换同一套预设。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BatteryCharging,
  ChevronDown,
  ChevronUp,
  EthernetPort,
  Loader2,
  Pin,
  PinOff,
  Volume1,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import './RadialTheme.css';
import TouchBarPopover from './TouchBarPopover';
import WidgetIcon, { WIDGET_ICON_META, getWidgetIcon } from './WidgetIcon';
import type { HwStats } from '../../../shared/hw-stats';
import type { DeviceDetails, TouchbarItem, WindowMaterial } from '../../../shared/touchbar';
import {
  TOUCHBAR_APP_KEYS,
  TOUCHBAR_BAR_H,
  TOUCHBAR_EXPANDED_H,
  TOUCHBAR_PANEL_H,
  TOUCHBAR_POPOVER_H,
  TOUCHBAR_SYSTEM_KEYS,
  TOUCHBAR_W,
} from '../../../shared/touchbar';

interface ToggleFeedback {
  text: string;
  tone: 'ok' | 'warn';
}

/** 悬停卡片状态：三个字段合并，避免一次 hover 触发三次 setState / 三次重渲染 */
interface HoverState {
  key: string;
  left: number;
  arrow: number;
}

/**
 * 交互口径：鼠标移入图标立即显示，移出整个悬浮窗才关闭。
 * 卡顿的根因不是「显示太快」，而是扫过 8 个图标时反复扩窗/收窗；
 * 已由「只在首次展开发一次 setPopover(true)」+ 主进程几何去重 + 单次 setState 解决，
 * 因此这里不再加 hover-intent 延迟（等 2 秒反而容易与扩窗重排撞在一起）。
 */
/** 卡片已展开时在系统项之间切换的节流窗口：合并连续 mouseenter */
const HOVER_SWITCH_DELAY = 90;
/** 鼠标离开窗口后的关闭宽限，期满再用浏览器真实 :hover 复核 */
const HOVER_CLOSE_DELAY = 120;
/** 关闭前连续复核 :hover 的次数与间隔：过滤透明窗重排造成的瞬时假离开 */
const HOVER_CLOSE_CONFIRMS = 3;
const HOVER_CONFIRM_GAP = 60;
/** 关闭前的淡出时长，必须与 CSS touchbar-popover-out 一致 */
const HOVER_EXIT_MS = 160;
/** 系统开启「减少动态效果」时不等待动画，避免留一段没有内容的透明扩窗区 */
function popoverExitMs(): number {
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduced ? 0 : HOVER_EXIT_MS;
}

function clearHoverTimer(ref: { current: ReturnType<typeof setTimeout> | null }): void {
  if (ref.current !== null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

/** navigator.getBattery() 的最小结构（避免依赖 DOM 实验性类型） */
interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener(type: 'levelchange' | 'chargingchange', cb: () => void): void;
  removeEventListener(type: 'levelchange' | 'chargingchange', cb: () => void): void;
}

const SYS_ROUTE: Record<string, string> = {
  battery: 'ms-settings:batterysaver',
  brightness: 'ms-settings:display',
  wifi: 'ms-settings:network-wifi',
  bluetooth: 'ms-settings:bluetooth',
  volume: 'ms-settings:sound',
  cpu: 'ms-settings:taskbar',
  memory: 'ms-settings:taskbar',
};

/**
 * 图标统一走 components/WidgetIcon.tsx 的共享元数据：
 * 底栏系统项、展开面板快捷入口、径向菜单扇区、设置页列表是同一套图标与主题色。
 * 底栏只取基础图形，动态状态（WifiOff / BatteryCharging / VolumeX / Loader2）在此叠加。
 */
const sysIcon = (key: string, size = 15, className?: string): React.JSX.Element => {
  const Icon = getWidgetIcon(key).icon;
  return <Icon size={size} strokeWidth={2} className={className} />;
};

export default function TouchBar(): React.JSX.Element {
  const [items, setItems] = useState<TouchbarItem[]>([]);
  const [programs, setPrograms] = useState<TouchbarItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [hwStats, setHwStats] = useState<HwStats | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [volume, setVolume] = useState<number | null>(null);
  const [togglingWifi, setTogglingWifi] = useState(false);
  const [togglingBt, setTogglingBt] = useState(false);
  const [feedback, setFeedback] = useState<ToggleFeedback | null>(null);
  const [brightnessBusy, setBrightnessBusy] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  // 与设置页「窗口材质」共用取值；默认 mica 与 Win11 22H2+ 的 defaultWindowMaterial 一致
  const [material, setMaterial] = useState<WindowMaterial>('mica');
  const [pinned, setPinned] = useState(true);
  // ── 悬停详情卡片：key / 位置合并成一个 state，切换卡片只触发一次重渲染 ──
  const [hover, setHover] = useState<HoverState | null>(null);
  /** 关闭淡出进行中：卡片仍挂载并占着扩窗高度，动画结束才真正收窗 */
  const [leaving, setLeaving] = useState(false);
  const [details, setDetails] = useState<DeviceDetails | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ dragging: boolean }>({ dragging: false });
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 同步保存「卡片当前是否已展开」，避免 setTimeout 回调里读到陈旧的 state */
  const hoverKeyRef = useRef<string | null>(null);
  /** 卡片已展开时，在系统项之间切换内容的短防抖计时器 */
  const hoverSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 鼠标离开窗口后的关闭宽限计时器 */
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 淡出动画计时器：动画播完再卸载卡片、通知主进程收窗 */
  const hoverExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 主题变量同步 ──
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (hwStats) {
      root.classList.toggle('hw-dark', hwStats.theme === 'dark');
      // 壁纸亮度采集失败时不再取 0.5（会把浅/深两套玻璃混成中灰），
      // 改为跟随系统主题，与主窗体的 mica 明暗保持一致
      const luma = hwStats.wallpaperLuma ?? (hwStats.theme === 'dark' ? 0.12 : 0.92);
      root.style.setProperty('--wallpaper-luma', String(luma));
      root.style.setProperty('--color-radial-accent', hwStats.accent || '#3b82f6');
    }
  }, [hwStats]);

  // ── 初始加载 ──
  useEffect(() => {
    const api = window.touchbarApi;

    // 数组兜底：preload 已 unwrap IpcResult，但任一侧回归都可能把 { ok, data }
    // 整个对象传下来，直接当数组用会让整个悬浮窗渲染崩溃（items.filter is not a function）
    const asItems = (value: unknown): TouchbarItem[] =>
      Array.isArray(value) ? (value as TouchbarItem[]) : [];

    void api
      .getConfig()
      .then((cfg) => setItems(asItems(cfg)))
      .catch((e: unknown) => console.warn('[TouchBar] 读取配置失败', e));
    void api
      .getPrograms()
      .then((progs) => setPrograms(asItems(progs)))
      .catch((e: unknown) => console.warn('[TouchBar] 读取程序列表失败', e));
    void api
      .volumeGet()
      .then((r) => setVolume(typeof r?.level === 'number' ? r.level : null))
      .catch((e: unknown) => console.warn('[TouchBar] 读取系统音量失败', e));
    void api
      .getMaterial()
      .then(setMaterial)
      .catch((e: unknown) => console.warn('[TouchBar] 读取窗口材质失败', e));
    void api
      .getPinned()
      .then(setPinned)
      .catch((e: unknown) => console.warn('[TouchBar] 读取置顶状态失败', e));
    void api
      .getDetails()
      .then(setDetails)
      .catch((e: unknown) => console.warn('[TouchBar] 读取设备详情失败', e));

    // 电池电量（navigator.getBattery 为 Chromium 实验 API，仅桌面可用）
    const nav = navigator as unknown as { getBattery?: () => Promise<BatteryLike> };
    let battery: BatteryLike | null = null;
    const syncBattery = (): void => {
      if (battery) setBatteryLevel(Math.round(battery.level * 100));
    };
    if (typeof nav.getBattery === 'function') {
      // ⚠️ 必须挂在 navigator 上调用：解构出来单独调用会丢失 this → Illegal invocation
      nav
        .getBattery()
        .then((b) => {
          battery = b;
          syncBattery();
          b.addEventListener('levelchange', syncBattery);
          b.addEventListener('chargingchange', syncBattery);
        })
        .catch((e: unknown) => console.warn('[TouchBar] 读取电池信息失败', e));
    }

    const offState = api.onState((s) => setExpanded(s.expanded));
    const offHw = api.onHwStats((stats) => setHwStats(stats as HwStats));
    const offCfg = api.onConfigChanged((cfg) => setItems(asItems(cfg)));
    const offMaterial = api.onMaterialChanged(setMaterial);
    const offPinned = api.onPinnedChanged(setPinned);
    const offDetails = api.onDetailsChanged(setDetails);
    // 主进程隐藏窗口（例如打开主窗口）时复位卡片，避免残留透明扩窗区域；
    // 同时清掉全部计时器，否则窗口重新显示后旧定时器会把卡片又关掉 / 又弹出来
    const offPopoverReset = api.onPopoverReset(() => {
      clearHoverTimer(hoverSwitchTimerRef);
      clearHoverTimer(hoverCloseTimerRef);
      clearHoverTimer(hoverExitTimerRef);
      hoverKeyRef.current = null;
      setHover(null);
      setLeaving(false);
    });

    const clockTimer = setInterval(() => setNow(new Date()), 1000);

    return () => {
      offState();
      offHw();
      offCfg();
      offMaterial();
      offPinned();
      offDetails();
      offPopoverReset();
      clearInterval(clockTimer);
      clearHoverTimer(hoverSwitchTimerRef);
      clearHoverTimer(hoverCloseTimerRef);
      clearHoverTimer(hoverExitTimerRef);
      if (battery) {
        battery.removeEventListener('levelchange', syncBattery);
        battery.removeEventListener('chargingchange', syncBattery);
      }
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // ── 展开面板项：app 入口 + 自定义程序 ──
  const appItems = useMemo(() => {
    const apps = items.filter((i) => i.type === 'app' && i.enabled);
    return [...apps, ...programs.filter((p) => p.enabled)];
  }, [items, programs]);

  const showFeedback = useCallback((text: string, tone: 'ok' | 'warn' = 'ok') => {
    setFeedback({ text, tone });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 2200);
  }, []);

  // ── 悬停详情卡片：移入即显示 + 打开 / 切换 / 关闭节流 + 多重 :hover 兜底 ──
  // 卡顿来自「扫过 8 个图标时反复扩窗/收窗」，不是显示速度：首次展开只发一次
  // setPopover(true)，切换卡片仅换内容，主进程按几何去重，因此无需再等 2 秒。
  //
  // 「显示了又自动关闭」的根因：透明窗口向上扩 196px 时 Chromium 会重新做鼠标
  // 命中测试，可能误派一次 mouseleave，而鼠标其实还停在图标上。因此关闭改为：
  //   ① 只有「离开整个 root」才请求关闭（图标间移动不再触发）
  //   ② 短宽限后连续 3 次复核浏览器自己维护的 :hover，瞬时假离开会被过滤
  //   ③ 淡出结束前再复核一次；期间鼠标折返由 cancelLeave 直接取消
  const cancelLeave = useCallback((): void => {
    clearHoverTimer(hoverCloseTimerRef);
    clearHoverTimer(hoverExitTimerRef);
    // 返回同一个值时 React 会跳过重渲染，避免鼠标每次移动都刷新
    setLeaving((v) => (v ? false : v));
  }, []);

  const showPopover = useCallback((key: string, fallbackEl: HTMLElement): void => {
    // 切换防抖期间 hw-stats 可能重渲染；按 data-key 重新取节点，位置不会算错
    const slot = rootRef.current?.querySelector<HTMLElement>(
      `.touchbar-hover-slot[data-key="${key}"]`,
    );
    const el = slot ?? fallbackEl;
    const rootRect = rootRef.current?.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const center = rect.left + rect.width / 2 - (rootRect?.left ?? 0);
    const CARD_W = 264;
    // 卡片宽度固定，贴近窗口两端时收敛，箭头仍指向触发图标
    const left = Math.max(8, Math.min(center - CARD_W / 2, TOUCHBAR_W - CARD_W - 8));
    const arrow = Math.max(16, Math.min(center - left, CARD_W - 16));
    const wasOpen = hoverKeyRef.current !== null;
    hoverKeyRef.current = key;
    // 一次 setState 代替原来的三次；已展开时不再重复通知主进程扩窗（IPC 节流）
    setHover({ key, left, arrow });
    setLeaving(false);
    if (!wasOpen) void window.touchbarApi.setPopover(true);
  }, []);

  /** 淡出动画播完后真正卸载卡片并收窗；再复核一次 :hover 兜住动画期间的抖动 */
  const commitClose = useCallback((): void => {
    clearHoverTimer(hoverExitTimerRef);
    clearHoverTimer(hoverCloseTimerRef);
    clearHoverTimer(hoverSwitchTimerRef);
    if (rootRef.current?.matches(':hover')) {
      setLeaving(false);
      return;
    }
    if (hoverKeyRef.current === null) return;
    hoverKeyRef.current = null;
    setHover(null);
    setLeaving(false);
    void window.touchbarApi.setPopover(false);
  }, []);

  /** 鼠标离开整个悬浮窗：短宽限 → 多次 :hover 复核 → 淡出 → 收窗 */
  const requestClose = useCallback((): void => {
    clearHoverTimer(hoverSwitchTimerRef);
    clearHoverTimer(hoverCloseTimerRef);
    if (hoverKeyRef.current === null) return;
    let checks = 0;
    const confirm = (): void => {
      hoverCloseTimerRef.current = null;
      // 鼠标仍在窗口内（误派的 leave / 中途折返）就取消整条关闭链
      if (rootRef.current?.matches(':hover')) {
        setLeaving(false);
        return;
      }
      checks += 1;
      if (checks < HOVER_CLOSE_CONFIRMS) {
        hoverCloseTimerRef.current = setTimeout(confirm, HOVER_CONFIRM_GAP);
        return;
      }
      setLeaving(true);
      clearHoverTimer(hoverExitTimerRef);
      hoverExitTimerRef.current = setTimeout(commitClose, popoverExitMs());
    };
    hoverCloseTimerRef.current = setTimeout(confirm, HOVER_CLOSE_DELAY);
  }, [commitClose]);

  const scheduleOpen = useCallback(
    (key: string, el: HTMLElement): void => {
      cancelLeave();
      // 同 key 重复 enter（子元素 / 每秒重渲染后重新绑定）直接短路
      if (hoverKeyRef.current === key) return;
      clearHoverTimer(hoverSwitchTimerRef);
      if (hoverKeyRef.current !== null) {
        // 卡片已展开：只换内容不扩窗；短防抖合并「扫过多个图标」的连续 enter
        hoverSwitchTimerRef.current = setTimeout(() => showPopover(key, el), HOVER_SWITCH_DELAY);
      } else {
        // 移上去就显示
        showPopover(key, el);
      }
    },
    [cancelLeave, showPopover],
  );

  // 事件回调引用稳定：hw-stats 每秒重渲染时不会给 8 个 slot 重新绑定新闭包
  const onSlotEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      const key = e.currentTarget.dataset.key;
      if (key) scheduleOpen(key, e.currentTarget);
    },
    [scheduleOpen],
  );

  const onSlotLeave = useCallback((): void => {
    // 只取消「切换内容」的防抖；关闭统一交给 root 的 mouseleave，
    // 避免图标间移动 / 扩窗重排被误判成要收卡片
    clearHoverTimer(hoverSwitchTimerRef);
  }, []);

  const onRootEnter = useCallback((): void => {
    // 鼠标重新回到窗口（含淡出期间折返）：取消关闭，卡片原地恢复
    cancelLeave();
  }, [cancelLeave]);

  // ── 别针：置顶 / 非置顶切换（状态持久化在主进程 settings） ──
  const handleTogglePin = useCallback(async (): Promise<void> => {
    try {
      const next = await window.touchbarApi.setPinned(!pinned);
      setPinned(next);
      showFeedback(next ? '已置顶' : '已取消置顶');
    } catch (e: unknown) {
      console.warn('[TouchBar] 切换置顶失败', e);
      showFeedback('切换置顶失败', 'warn');
    }
  }, [pinned, showFeedback]);

  // ── 系统项点击 ──
  const handleToggleWifi = async (): Promise<void> => {
    if (togglingWifi) return;
    setTogglingWifi(true);
    const r = await window.touchbarApi.toggleWifi();
    setTogglingWifi(false);
    if (r.needsSettings) {
      showFeedback(r.message || '切换 Wi-Fi 需要权限', 'warn');
    } else {
      showFeedback(r.enabled ? 'Wi-Fi 已开启' : 'Wi-Fi 已关闭');
    }
  };

  const handleToggleBt = async (): Promise<void> => {
    if (togglingBt) return;
    setTogglingBt(true);
    const r = await window.touchbarApi.toggleBluetooth();
    setTogglingBt(false);
    if (r.needsSettings) {
      showFeedback(r.message || '切换蓝牙需要权限', 'warn');
    } else {
      showFeedback(r.enabled ? '蓝牙已开启' : '蓝牙已关闭');
    }
  };

  const handleVolumeStep = useCallback((delta: number) => {
    void window.touchbarApi.volumeStep(delta).then((r) => {
      if (r.level !== null) setVolume(r.level);
    });
  }, []);

  const handleBrightnessStep = useCallback(
    async (delta: number) => {
      if (brightnessBusy) return;
      setBrightnessBusy(true);
      const r = await window.touchbarApi.brightnessStep(delta);
      setBrightnessBusy(false);
      if (!r.supported) {
        showFeedback('当前显示器不支持亮度调节', 'warn');
      }
    },
    [brightnessBusy, showFeedback],
  );

  // ── 拖拽：底栏空白处 mousedown → 全局 mousemove/mouseup ──
  const onBarMouseDown = (e: React.MouseEvent): void => {
    const target = e.target as HTMLElement;
    // 卡片内的滑块 / 按钮不能触发底栏拖拽（卡片自身已 stopPropagation，这里是双保险）
    if (target.closest('.touchbar-popover')) return;
    if (target.closest('button')) return;
    if (e.button !== 0) return;
    dragStateRef.current.dragging = true;
    window.touchbarApi.dragStart();
    const onMove = (): void => window.touchbarApi.dragMove();
    const onUp = (): void => {
      dragStateRef.current.dragging = false;
      window.touchbarApi.dragEnd();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── 系统项渲染（底栏） ──
  const renderSystemItem = (item: TouchbarItem): React.JSX.Element | null => {
    const key = item.key;
    const common = 'touchbar-sys-btn';
    switch (key) {
      case 'clock':
        return (
          <div className={common} key={key}>
            {sysIcon('clock')}
            <span className="touchbar-clock">
              {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        );
      case 'wifi':
        return (
          <button className={common} key={key} onClick={() => void handleToggleWifi()}>
            {togglingWifi ? <Loader2 size={15} className="spin" /> : renderWifiIcon()}
          </button>
        );
      case 'bluetooth':
        return (
          <button className={common} key={key} onClick={() => void handleToggleBt()}>
            {togglingBt ? <Loader2 size={15} className="spin" /> : sysIcon('bluetooth')}
          </button>
        );
      case 'battery':
        return (
          <button
            className={common}
            key={key}
            onClick={() => void window.touchbarApi.openSettings(SYS_ROUTE.battery)}
          >
            {renderBatteryIcon()}
            <span className="tb-num">{batteryLevel !== null ? batteryLevel : '--'}%</span>
          </button>
        );
      case 'cpu':
        return (
          <div className={common} key={key}>
            {sysIcon('cpu')}
            <span className="tb-num">
              {hwStats?.cpu !== null && hwStats?.cpu !== undefined
                ? `${Math.round(hwStats.cpu)}%`
                : '--%'}
            </span>
          </div>
        );
      case 'memory':
        return (
          <div className={common} key={key}>
            {sysIcon('memory')}
            <span className="tb-num">{hwStats ? `${Math.round(hwStats.memUsedPct)}%` : '--%'}</span>
          </div>
        );
      case 'volume':
        return (
          <button
            className={common}
            key={key}
            onClick={() => window.touchbarApi.volumeMute()}
            onWheel={(e) => {
              if (e.deltaY === 0) return;
              handleVolumeStep(e.deltaY < 0 ? 5 : -5);
            }}
          >
            {volume === null ? (
              sysIcon('volume')
            ) : volume <= 0 ? (
              <VolumeX size={15} />
            ) : volume < 50 ? (
              <Volume1 size={15} />
            ) : (
              sysIcon('volume')
            )}
            <span className="tb-num tb-num-short">{volume ?? '--'}</span>
          </button>
        );
      case 'brightness':
        return (
          <button
            className={common}
            key={key}
            onClick={() => void window.touchbarApi.openSettings(SYS_ROUTE.brightness)}
            onWheel={(e) => {
              if (e.deltaY === 0 || brightnessBusy) return;
              void handleBrightnessStep(e.deltaY < 0 ? 10 : -10);
            }}
          >
            {/* busy 状态用图标旋转表达，不再插入 '…' 字符 —— 那会让按钮宽度突变 */}
            {sysIcon('brightness', 15, brightnessBusy ? 'spin' : undefined)}
          </button>
        );
      default:
        return null;
    }
  };

  const renderWifiIcon = (): React.JSX.Element => {
    const wifi = hwStats?.wifi;
    if (!wifi) return sysIcon('wifi', 15, 'dim');
    if (hwStats?.ethernet?.connected) return <EthernetPort size={15} />;
    if (!wifi.available) return <WifiOff size={15} />;
    if (!wifi.connected) return sysIcon('wifi', 15, 'dim');
    if (wifi.hasInternet === false) return sysIcon('wifi', 15, 'hw-alert-pulse');
    return sysIcon('wifi');
  };

  const renderBatteryIcon = (): React.JSX.Element => {
    if (!hwStats) return sysIcon('battery');
    if (hwStats.charging) return <BatteryCharging size={15} />;
    return sysIcon('battery');
  };

  // ── 底栏可见系统项 ──
  const systemItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.enabled &&
          TOUCHBAR_SYSTEM_KEYS.includes(i.key as (typeof TOUCHBAR_SYSTEM_KEYS)[number]),
      ),
    [items],
  );

  // ── 应用入口渲染（展开面板） ──
  const renderAppItem = (item: TouchbarItem): React.JSX.Element => {
    const key = item.key;
    const isProgram = item.type === 'program';
    // 内置入口用共享元数据里的短标签；自定义程序保留用户填写的名称
    const label = isProgram ? item.label : (WIDGET_ICON_META[key]?.shortLabel ?? item.label);
    return (
      <button
        className="touchbar-app-btn"
        key={key}
        aria-label={item.label}
        onClick={() => window.touchbarApi.itemClick(key, item)}
      >
        <WidgetIcon itemKey={key} isProgram={isProgram} emoji={item.emoji} variant="touchbar" />
        <span className="touchbar-app-label">{label}</span>
      </button>
    );
  };

  const shownAppItems = useMemo(() => {
    const appKeys = new Set(TOUCHBAR_APP_KEYS as readonly string[]);
    return appItems.filter((i) => appKeys.has(i.key) || i.type === 'program');
  }, [appItems]);

  const baseHeight = expanded ? TOUCHBAR_EXPANDED_H : TOUCHBAR_BAR_H;

  return (
    <div
      ref={rootRef}
      className={`touchbar-root${expanded ? ' touchbar-expanded' : ''}`}
      data-material={material}
      onMouseDown={onBarMouseDown}
      // 关闭只由「离开整个悬浮窗」触发；进入窗口则取消正在进行的淡出
      onMouseEnter={onRootEnter}
      onMouseLeave={requestClose}
      // 卡片出现时向上扩展 root 高度；主进程同步扩窗，底栏屏幕位置不变。
      // 行高作为 CSS 变量注入，控件高度由 CSS 反算，几何只有 shared/ 一个数据源
      style={
        {
          height: baseHeight + (hover ? TOUCHBAR_POPOVER_H : 0),
          '--tb-bar-h': `${TOUCHBAR_BAR_H}px`,
          '--tb-panel-h': `${TOUCHBAR_PANEL_H}px`,
        } as React.CSSProperties
      }
    >
      <div className="touchbar-panel touchbar-surface">
        {expanded && (
          <div className="touchbar-panel-row">
            {shownAppItems.length > 0 ? (
              shownAppItems.map(renderAppItem)
            ) : (
              <span className="touchbar-panel-empty">展开面板暂无入口，请在设置中开启</span>
            )}
          </div>
        )}
        <div className="touchbar-bar-row">
          {systemItems.length > 0 ? (
            systemItems.map((item) => (
              <div
                className="touchbar-hover-slot"
                key={item.key}
                data-key={item.key}
                onMouseEnter={onSlotEnter}
                onMouseLeave={onSlotLeave}
              >
                {renderSystemItem(item)}
              </div>
            ))
          ) : (
            <span className="touchbar-bar-empty">Touch Bar</span>
          )}
          <div className="touchbar-flex-spacer" />
          <button
            className={`touchbar-expand-btn touchbar-pin-btn${pinned ? ' is-pinned' : ''}`}
            aria-label={pinned ? '取消置顶' : '置顶'}
            aria-pressed={pinned}
            onClick={() => void handleTogglePin()}
          >
            {pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button
            className="touchbar-expand-btn"
            aria-label={expanded ? '收起' : '展开'}
            onClick={() => window.touchbarApi.toggleExpand()}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
      </div>
      {hover && (
        <TouchBarPopover
          itemKey={hover.key}
          left={hover.left}
          arrowLeft={hover.arrow}
          bottom={baseHeight + 10}
          hwStats={hwStats}
          volume={volume}
          batteryLevel={batteryLevel}
          details={details}
          now={now}
          busyWifi={togglingWifi}
          busyBt={togglingBt}
          busyBrightness={brightnessBusy}
          onToggleWifi={() => void handleToggleWifi()}
          onToggleBt={() => void handleToggleBt()}
          onVolumeSet={(level) => {
            setVolume(level);
            void window.touchbarApi.volumeSet(level);
          }}
          onVolumeStep={handleVolumeStep}
          onVolumeMute={() => window.touchbarApi.volumeMute()}
          onBrightnessStep={(delta) => void handleBrightnessStep(delta)}
          onOpenSettings={(uri) => void window.touchbarApi.openSettings(uri)}
          onOpenTaskManager={() => void window.touchbarApi.openTaskManager()}
          leaving={leaving}
        />
      )}
      {feedback && (
        <div className={`touchbar-toast touchbar-toast-${feedback.tone}`}>{feedback.text}</div>
      )}
    </div>
  );
}
