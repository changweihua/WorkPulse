/**
 * Touch Bar 悬停详情卡片
 *
 * 鼠标停在底栏任意系统项上时向上弹出，展示「当前连接的设备等信息」并提供快捷操作：
 * - Wi-Fi：SSID / 信号 / 互联网 / 本机 IPv4 / 有线网，快捷开关 Wi-Fi、打开网络设置
 * - 蓝牙：已连接外设名称与电量，快捷开关蓝牙、打开蓝牙设置
 * - 音量：滑块直接设定系统主音量、静音与 ±10 步进、打开声音设置
 * - 电池 / CPU / 内存 / 亮度 / 时钟：各自的实时数值与系统设置 / 任务管理器入口
 *
 * 实时数据来自 hw-stats 推送，静态与慢字段来自 DeviceDetails（亮度异步回填）。
 * 卡片位于 .touchbar-panel 之外，避免被面板的 overflow:hidden 裁掉；
 * 窗口高度由主进程 touchbar:set-popover 同步扩展。
 */
import {
  Bluetooth,
  Clock,
  Cpu,
  Loader2,
  MemoryStick,
  Minus,
  Monitor,
  Plus,
  Power,
  Settings2,
  Sun,
  Volume2,
  Wifi,
  Battery as BatteryIcon,
} from 'lucide-react';
import type { HwStats } from '../../../shared/hw-stats';
import type { DeviceDetails } from '../../../shared/touchbar';

export interface TouchBarPopoverProps {
  itemKey: string;
  /** 卡片左边距（相对 560px 窗口，已做边界收敛） */
  left: number;
  /** 小箭头在卡片内的水平位置 */
  arrowLeft: number;
  /** 卡片底边距（底栏高度 + 间隙） */
  bottom: number;
  hwStats: HwStats | null;
  volume: number | null;
  batteryLevel: number | null;
  details: DeviceDetails | null;
  now: Date;
  busyWifi: boolean;
  busyBt: boolean;
  busyBrightness: boolean;
  onToggleWifi: () => void;
  onToggleBt: () => void;
  onVolumeSet: (level: number) => void;
  onVolumeStep: (delta: number) => void;
  onVolumeMute: () => void;
  onBrightnessStep: (delta: number) => void;
  onOpenSettings: (uri: string) => void;
  onOpenTaskManager: () => void;
  /** 关闭淡出进行中（进出动画由 TouchBar 统一驱动） */
  leaving?: boolean;
}

const SETTINGS_URI: Record<string, string> = {
  wifi: 'ms-settings:network-wifi',
  bluetooth: 'ms-settings:bluetooth',
  volume: 'ms-settings:sound',
  battery: 'ms-settings:batterysaver',
  brightness: 'ms-settings:display',
  clock: 'ms-settings:dateandtime',
};

function Row({
  label,
  value,
  title,
}: {
  label: string;
  value?: React.ReactNode;
  title?: string;
}): React.JSX.Element {
  return (
    <div className="tb-row" title={title}>
      <span className="tb-row-label">{label}</span>
      <span className="tb-row-value">{value ?? '--'}</span>
    </div>
  );
}

function Meter({ value }: { value: number }): React.JSX.Element {
  return (
    <div className="tb-meter">
      <div className="tb-meter-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function Action({
  icon,
  label,
  onClick,
  busy = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  busy?: boolean;
}): React.JSX.Element {
  return (
    <button className="tb-action" onClick={onClick} disabled={busy}>
      {busy ? <Loader2 size={12} className="spin" /> : icon}
      <span>{label}</span>
    </button>
  );
}

export default function TouchBarPopover(props: TouchBarPopoverProps): React.JSX.Element {
  const {
    itemKey,
    left,
    arrowLeft,
    bottom,
    hwStats,
    volume,
    batteryLevel,
    details,
    now,
    busyWifi,
    busyBt,
    busyBrightness,
    onToggleWifi,
    onToggleBt,
    onVolumeSet,
    onVolumeStep,
    onVolumeMute,
    onBrightnessStep,
    onOpenSettings,
    onOpenTaskManager,
    leaving = false,
  } = props;

  let title = '设备详情';
  let badge = '';
  let badgeTone: 'ok' | 'warn' | 'off' = 'off';
  let body: React.ReactNode = <div className="tb-empty">暂无可用信息</div>;
  let actions: React.ReactNode = null;

  switch (itemKey) {
    case 'wifi': {
      const wifi = hwStats?.wifi ?? null;
      const eth = hwStats?.ethernet ?? null;
      const connected = wifi?.connected === true;
      title = 'Wi-Fi 与网络';
      badge = !wifi ? '无无线网卡' : connected ? '已连接' : wifi.available ? '未连接' : '不可用';
      badgeTone = connected ? 'ok' : 'warn';
      const signalText = ['无信号', '弱', '中', '强'];
      body = (
        <>
          <Row
            label="网络名称"
            value={wifi?.ssid ?? (connected ? '隐藏网络' : '--')}
            title={wifi?.ssid ?? undefined}
          />
          <Row
            label="信号强度"
            value={
              wifi?.signal !== null && wifi?.signal !== undefined
                ? `${wifi.signal}% · ${signalText[wifi.bars]}`
                : '--'
            }
          />
          <Row
            label="互联网"
            value={
              wifi === null || wifi.hasInternet === null || wifi.hasInternet === undefined
                ? '检测中'
                : wifi.hasInternet
                  ? '可访问'
                  : '无网络'
            }
          />
          <Row label="本机 IPv4" value={details?.ipv4 ?? '读取中'} />
          <Row label="有线网络" value={eth?.connected ? (eth.name ?? '已连接') : '未连接'} />
        </>
      );
      actions = (
        <>
          <Action
            icon={<Power size={12} />}
            label="开关 Wi-Fi"
            onClick={onToggleWifi}
            busy={busyWifi}
          />
          <Action
            icon={<Settings2 size={12} />}
            label="网络设置"
            onClick={() => onOpenSettings(SETTINGS_URI.wifi)}
          />
        </>
      );
      break;
    }
    case 'bluetooth': {
      const bt = hwStats?.bluetooth ?? null;
      const devices = bt?.devices ?? [];
      title = '蓝牙';
      badge = !bt
        ? '状态未知'
        : bt.available
          ? devices.length > 0
            ? `${devices.length} 台设备`
            : '无已连接设备'
          : '适配器不可用';
      badgeTone = devices.length > 0 ? 'ok' : 'off';
      body = (
        <div className="tb-device-list">
          {devices.length > 0 ? (
            devices.slice(0, 4).map((d, i) => (
              <div className="tb-device" key={`${d.name}-${i}`}>
                <Bluetooth size={12} className="tb-device-icon" />
                <span className="tb-device-name" title={d.name}>
                  {d.name}
                </span>
                <span className="tb-device-battery">
                  {d.battery === null ? '电量未知' : `${d.battery}%`}
                </span>
              </div>
            ))
          ) : (
            <div className="tb-empty">当前没有已连接的蓝牙外设</div>
          )}
          {devices.length > 4 && <div className="tb-empty">另有 {devices.length - 4} 台设备…</div>}
        </div>
      );
      actions = (
        <>
          <Action icon={<Power size={12} />} label="开关蓝牙" onClick={onToggleBt} busy={busyBt} />
          <Action
            icon={<Settings2 size={12} />}
            label="蓝牙设置"
            onClick={() => onOpenSettings(SETTINGS_URI.bluetooth)}
          />
        </>
      );
      break;
    }
    case 'volume': {
      title = '声音';
      badge = volume === null ? '读取失败' : `${volume}%`;
      badgeTone = volume !== null ? 'ok' : 'warn';
      body = (
        <>
          <input
            className="tb-slider"
            type="range"
            min={0}
            max={100}
            value={volume ?? 0}
            aria-label="系统音量"
            onChange={(e) => onVolumeSet(Number(e.target.value))}
          />
          <Row
            label="默认输出"
            value={details?.audioDevice ?? '读取中'}
            title={details?.audioDevice ?? undefined}
          />
          <Row label="快捷调节" value="滚轮 / 下方按钮" />
        </>
      );
      actions = (
        <>
          <Action icon={<Minus size={12} />} label="−10" onClick={() => onVolumeStep(-10)} />
          <Action icon={<Plus size={12} />} label="+10" onClick={() => onVolumeStep(10)} />
          <Action icon={<Volume2 size={12} />} label="切换静音" onClick={onVolumeMute} />
          <Action
            icon={<Settings2 size={12} />}
            label="声音设置"
            onClick={() => onOpenSettings(SETTINGS_URI.volume)}
          />
        </>
      );
      break;
    }
    case 'battery': {
      const charging = hwStats?.charging ?? null;
      const powerSaving = hwStats?.powerSaving ?? null;
      title = '电池与电源';
      badge = batteryLevel === null ? '未知' : `${batteryLevel}%`;
      badgeTone = batteryLevel !== null && batteryLevel <= 20 ? 'warn' : 'ok';
      body = (
        <>
          <Meter value={batteryLevel ?? 0} />
          <Row label="供电方式" value={hwStats?.onBattery ? '电池' : '交流电源'} />
          <Row
            label="充电状态"
            value={charging === null ? '未知' : charging ? '充电中' : '未充电'}
          />
          <Row
            label="节能模式"
            value={powerSaving === null ? '未知' : powerSaving ? '已开启' : '未开启'}
          />
        </>
      );
      actions = (
        <Action
          icon={<BatteryIcon size={12} />}
          label="电源与电池设置"
          onClick={() => onOpenSettings(SETTINGS_URI.battery)}
        />
      );
      break;
    }
    case 'cpu': {
      const cpu = hwStats?.cpu ?? null;
      title = '处理器';
      badge = cpu === null ? '采样中' : `${Math.round(cpu)}%`;
      badgeTone = cpu !== null && cpu >= 80 ? 'warn' : 'ok';
      body = (
        <>
          <Meter value={cpu ?? 0} />
          <Row
            label="型号"
            value={details?.cpuModel ?? '读取中'}
            title={details?.cpuModel ?? undefined}
          />
          <Row label="逻辑核心" value={details?.cpuCores ? `${details.cpuCores} 核` : '--'} />
        </>
      );
      actions = <Action icon={<Cpu size={12} />} label="任务管理器" onClick={onOpenTaskManager} />;
      break;
    }
    case 'memory': {
      const pct = hwStats?.memUsedPct ?? 0;
      title = '内存';
      badge = hwStats ? `${Math.round(pct)}%` : '采样中';
      badgeTone = pct >= 85 ? 'warn' : 'ok';
      body = (
        <>
          <Meter value={pct} />
          <Row
            label="已用 / 总量"
            value={hwStats ? `${hwStats.memUsedGB} / ${hwStats.memTotalGB} GB` : '--'}
          />
        </>
      );
      actions = (
        <Action icon={<MemoryStick size={12} />} label="任务管理器" onClick={onOpenTaskManager} />
      );
      break;
    }
    case 'brightness': {
      const level = details?.brightness ?? null;
      title = '显示亮度';
      badge = level === null ? '读取中' : `${level}%`;
      badgeTone = 'ok';
      body = (
        <>
          <Meter value={level ?? 0} />
          <Row label="当前亮度" value={level === null ? '--' : `${level}%`} />
          <Row
            label="软件调节"
            value={
              details?.brightnessSupported === false ? '当前显示器不支持' : '可用（滚轮 / 按钮）'
            }
          />
        </>
      );
      actions = (
        <>
          <Action
            icon={<Minus size={12} />}
            label="−10%"
            onClick={() => onBrightnessStep(-10)}
            busy={busyBrightness}
          />
          <Action
            icon={<Plus size={12} />}
            label="+10%"
            onClick={() => onBrightnessStep(10)}
            busy={busyBrightness}
          />
          <Action
            icon={<Monitor size={12} />}
            label="显示设置"
            onClick={() => onOpenSettings(SETTINGS_URI.brightness)}
          />
        </>
      );
      break;
    }
    case 'clock': {
      title = '日期与时间';
      badge = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      badgeTone = 'ok';
      body = (
        <>
          <Row
            label="日期"
            value={now.toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          />
          <Row label="时间" value={now.toLocaleTimeString('zh-CN')} />
        </>
      );
      actions = (
        <Action
          icon={<Clock size={12} />}
          label="日期和时间设置"
          onClick={() => onOpenSettings(SETTINGS_URI.clock)}
        />
      );
      break;
    }
    default:
      title = '设备详情';
      badge = '无数据';
      body = <div className="tb-empty">该项目暂无详情</div>;
      break;
  }

  // 标题图标仅用于视觉锚定，与底栏图标保持同一套语义
  const titleIcon: React.ReactNode =
    itemKey === 'wifi' ? (
      <Wifi size={13} />
    ) : itemKey === 'bluetooth' ? (
      <Bluetooth size={13} />
    ) : itemKey === 'volume' ? (
      <Volume2 size={13} />
    ) : itemKey === 'battery' ? (
      <BatteryIcon size={13} />
    ) : itemKey === 'cpu' ? (
      <Cpu size={13} />
    ) : itemKey === 'memory' ? (
      <MemoryStick size={13} />
    ) : itemKey === 'brightness' ? (
      <Sun size={13} />
    ) : (
      <Clock size={13} />
    );

  return (
    <div
      className={`touchbar-popover touchbar-surface${leaving ? ' is-leaving' : ''}`}
      style={{ left, bottom }}
      // 卡片内的滑块 / 按钮不能触发底栏拖拽
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="touchbar-popover-arrow" style={{ left: arrowLeft }} />
      <div className="touchbar-popover-head">
        <span className="tb-title">
          {titleIcon}
          {title}
        </span>
        <span className={`tb-badge tb-badge-${badgeTone}`}>{badge}</span>
      </div>
      {/* key 让图标间切换时内容重新挂载，播放一次淡入；实时数值刷新不会重放 */}
      <div className="touchbar-popover-body" key={itemKey}>
        {body}
      </div>
      <div className="touchbar-popover-actions">{actions}</div>
    </div>
  );
}
