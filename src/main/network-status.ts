/**
 * 网络状态采集（主进程）
 *
 * 三块采集面，全部进程内完成或单次外部命令完成，绝不阻塞 1s 采样循环：
 *
 * 1. 以太网 + 互联网连通性（每 15s 一次 PowerShell）
 *    - 一次 `Get-NetAdapter -Physical` + `Get-NetConnectionProfile` 合并调用：
 *        · 物理网卡里 Status=Up 且名称/描述不含 Wi-Fi 关键字的，判为以太网口 Up；
 *        · 当前连接配置文件（排除 DomainAuthenticated）的 IPv4/IPv6 Connectivity，
 *          任一为 Internet 即可上网，明确非 Internet（Disconnected/NoTraffic/Subnet/LocalNetwork）即不可上网。
 *    - PowerShell 冷启动在部分机器上会被杀软拖到数秒，因此结果缓存 15s，
 *      失败保留上一次成功值（连续 3 次才置空），15s 节奏下不会造成 spawn 风暴。
 *
 * 2. Wi-Fi（每 3s）
 *    - 首选 WLAN API（wlanapi.dll，koffi 进程内 FFI）：
 *        WlanOpenHandle(2) → WlanEnumInterfaces → WlanQueryInterface(current_connection)
 *        直接拿到 isState / dot11Ssid / wlanSignalQuality(0–100)，
 *        真实 RSSI 换算质量，比 netsh 文本解析更稳（不受本地化与编码影响）。
 *    - 任何 WlanAPI 失败（dll/服务不可用、结构校验不通过、调用返回错误码）
 *      都静默回退 netsh 路径，且只 warn 一次，避免 3s 一条日志。
 *    - netsh 回退：`netsh wlan show interfaces`，字段按「英文 + 中文」双语正则匹配；
 *        SSID 用行首锚点 `^\s*SSID\s*:` 取值，避免误匹配同块的 `AP BSSID`；
 *        stdout 按系统 ANSI 代码页（简中为 GBK）输出，UTF-8 / GBK 各解一次投票选优
 *        （详见 decodeConsoleText）。
 *
 * 3. 蓝牙（每 8s，koffi 枚举 SetupAPI 蓝牙设备类）
 *    - SetupDiGetClassDevsW(蓝牙类 GUID, DIGCF_PRESENT) → 设备信息集
 *    - SetupDiEnumDeviceInfo 遍历 → SetupDiGetDeviceRegistryPropertyW(SPDRP_FRIENDLYNAME) 取名
 *    - CM_Get_DevNode_Status 判定设备节点是否在场（等价 IsPresent=true，见常量区注释）
 *    - SetupDiGetDevicePropertyW 读 DEVPKEY_Device_BatteryLevel 取电量（不支持则 null）
 *
 * koffi 使用约定（沿用 src/main/battery.ts 的实测结论）：
 *   1. 结构体一律用原始 Buffer 手工按字节布局，不声明 koffi.struct，规避成员类型校验坑；
 *   2. 句柄用 intptr_t 传递（x64/x86 下与 void* 的 ABI 一致），避免 koffi 指针对象语义差异；
 *   3. 出参缓冲用 Buffer，禁止 koffi.decode 到 JS 对象（`decode(ptr, 'uint8', n)` 返回 Uint8Array
 *      再用 Buffer.from 包一层是安全的，本模块只走这条路）；
 *   4. 任何初始化或调用异常都被捕获并降级为 null，绝不把异常抛给主进程采样循环。
 *
 * 轮询缓存：各采集面各自维护「上次采集时间 + 结果 + 进行中的请求」，
 * 未到期直接返回缓存值，多路调用不会叠加系统命令/FFI 开销。
 * Wi-Fi / 以太网额外区分「瞬时失败」（超时被杀 / 拿不到输出）与「确定结论」：
 * 前者保留上一次成功值并计数，连续 3 次才置空，避免杀软拖慢外部命令时中心图标闪断。
 */

import { execFile } from 'child_process';
import log from 'electron-log/main';
import type { BluetoothStatus, EthernetStatus, WifiStatus } from '../shared/hw-stats';

/** Wi-Fi 轮询间隔（毫秒）；WlanAPI 虽是进程内调用，但没必要比 3s 更密 */
const WIFI_POLL_INTERVAL_MS = 3000;
/** 蓝牙轮询间隔（毫秒）：FFI 枚举比 netsh 贵，放慢到 8s */
const BT_POLL_INTERVAL_MS = 8000;
/** 以太网 + 互联网连通性轮询间隔（毫秒）：PowerShell 启动昂贵，15s 足够 */
const ETHERNET_POLL_INTERVAL_MS = 15000;
/**
 * netsh 命令超时（毫秒）。
 * 本项目实测：杀软会把子进程冷启动拖到 5s+（用户日志里出现过两次「无输出」导致的误判），
 * 而 netsh 正常执行通常 <1s；取 4s 兼顾「异常环境不被一刀切」与「失败后 3s 节奏能及时重试」。
 */
const NETSH_TIMEOUT_MS = 4000;
/**
 * PowerShell 命令超时（毫秒）。
 * ⚠️ 本机实测（Win11 / i5-8250U）：仅 Get-NetAdapter 单独一次 ≈4.7s，
 * 仅 Get-NetConnectionProfile 单独一次 ≈3.1s，两个 cmdlet 合并后整段 ≈7.3–8.1s，
 * 主要开销是 powershell.exe 冷启动 + NetAdapter/NetConnectionProfile 模块自动加载。
 * 因此 5s 会稳定超时、把三态永远卡在「瞬时失败」，取 12s（≈实测值的 1.5 倍余量）。
 * 超时仍按「瞬时失败」处理，保留上一次成功值。
 */
const POWERSHELL_TIMEOUT_MS = 12000;
/**
 * 连续瞬时失败多少次才放弃上一次成功值。
 * 单次超时只说明「这一轮没拿到」；3 次 ≈ 9s（3s 节奏 Wi-Fi）/ 45s（15s 节奏以太网）仍拿不到，
 * 才认定采集面真的坏了——防止「永远显示旧值」把真实的断连藏起来。
 */
const WIFI_TRANSIENT_FAIL_LIMIT = 3;
const ETHERNET_TRANSIENT_FAIL_LIMIT = 3;

// ───────────────────────────── 通用：外部命令 ─────────────────────────────

/**
 * 一次外部命令捕获的结果。
 * 失败时携带原因串：命令的失败要区分「超时被杀 / 彻底无输出」这类「瞬时」失败，
 * 不能和「命令正常执行但确实没有该网络接口」混为一谈（后者是确定结论，可安全置空）。
 */
type CaptureResult = { ok: true; buf: Buffer } | { ok: false; error: string };

/**
 * 执行外部命令并把 stdout 拿成 Buffer。
 * netsh 在没有无线服务/没有无线网卡时会以非 0 退出，但 stdout/stderr 里仍有诊断文本，
 * 因此非 0 退出时只要拿到输出就继续交给解析层判断；彻底拿不到输出（超时被杀 / 启动即失败）
 * 才判为失败，并把 err.message 带出去供调用方记日志。
 */
function execCapture(
  file: string,
  args: string[],
  timeoutMs: number = NETSH_TIMEOUT_MS,
): Promise<CaptureResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        timeout: timeoutMs,
        windowsHide: true,
        encoding: 'buffer',
        maxBuffer: 4 * 1024 * 1024,
      },
      (err, stdout) => {
        const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.alloc(0);
        if (err && buf.length === 0) {
          resolve({ ok: false, error: err.message || '无输出' });
          return;
        }
        resolve({ ok: true, buf });
      },
    );
  });
}

/**
 * 判断文本里是否出现了命令本地化字段名的中文关键字。
 * 用于区分「UTF-8 原文」与「GBK 字节恰好构成合法 UTF-8」的乱码。
 */
const LOCALIZED_FIELD_HINTS = ['状态', '信号', '名称', '已连接', '接口', '无线'];

/** 统计中文关键字命中次数（作为解码正确性的投票） */
function scoreChineseHints(text: string): number {
  let score = 0;
  for (const hint of LOCALIZED_FIELD_HINTS) {
    if (text.includes(hint)) score += 1;
  }
  return score;
}

/**
 * 把控制台输出字节解码成文本。
 * 不能只按「UTF-8 是否有替换字符」判断：部分 GBK 双字节序列（如 状态 = D7B4CCAC）
 * 恰好也是合法的 UTF-8 序列，会被解成无关字符（希伯来文等），
 * 导致中文系统上「状态 / 信号」字段名匹配失败。
 * 因此两种编码都解一次，用中文字段名关键字投票选优；UTF-8 出现替换字符时直接取 GBK。
 */
function decodeConsoleText(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  let gbk: string | null = null;
  try {
    gbk = new TextDecoder('gbk').decode(buf);
  } catch {
    gbk = null; // 运行时不支持 gbk（无 full-icu）时只能退回 UTF-8
  }
  if (!gbk) return utf8;
  if (utf8.includes('\uFFFD')) return gbk; // UTF-8 非法 → 必然是 ANSI 代码页
  return scoreChineseHints(gbk) > scoreChineseHints(utf8) ? gbk : utf8;
}

/** 从文本块中取某个「键 : 值」行的值（键支持英文 + 中文双语），取不到返回 null */
function pickField(block: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`^\\s*${escaped}\\s*:\\s*(.*)$`, 'im').exec(block);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * 信号强度 → 信号格数：>=80→3、50–79→2、1–49→1、无→0。
 * 阈值按 WlanAPI 质量口径（0–100）标定：80 以上满格，50 以上两格，
 * 旧的 60/30 会让「勉强可用」的 55% 显示三格，视觉上过度乐观。
 */
function signalToBars(signal: number | null): 0 | 1 | 2 | 3 {
  if (signal === null) return 0;
  if (signal >= 80) return 3;
  if (signal >= 50) return 2;
  if (signal >= 1) return 1;
  return 0;
}

// ─────────────────────── 以太网 + 互联网连通性（PowerShell） ───────────────────────

/**
 * 合并采集脚本（一次 PowerShell 同时拿以太网与连通性）。
 * 说明：
 *   - `[Console]::OutputEncoding` 强制 UTF-8，避免中文网卡名被按 OEM 代码页写出；
 *     即便被改成 GBK，decodeConsoleText 也能兜住。
 *   - 排除无线适配器：名称 + 描述同时匹配 Wi-Fi 关键字（覆盖英文/中文/常见厂商写法），
 *     `-Physical` 已排除虚拟网卡/VPN，这里只再排除 802.11 介质。
 *   - IPv4Connectivity / IPv6Connectivity 是 PowerShell 侧枚举（Disconnected/NoTraffic/
 *     Subnet/LocalNetwork/Internet），用 ToString() 输出字符串，避免枚举数值随版本漂移。
 *   - 所有变量先算再用，最后 [pscustomobject] + ConvertTo-Json -Compress 输出单行 JSON。
 */
const ETHERNET_PROBE_SCRIPT = [
  '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
  "$ErrorActionPreference='SilentlyContinue';",
  "$eth=Get-NetAdapter -Physical|Where-Object{$_.Status -eq 'Up' -and ($_.Name+' '+$_.InterfaceDescription) -notmatch 'Wi-?Fi|Wireless|WLAN|802\\.11|无线'}|Select-Object -First 1;",
  "$prof=Get-NetConnectionProfile|Where-Object{$_.NetworkCategory -ne 'DomainAuthenticated'}|Select-Object -First 1;",
  "$v4='';$v6='';",
  'if($prof){$v4=$prof.IPv4Connectivity.ToString();$v6=$prof.IPv6Connectivity.ToString()};',
  '$obj=[pscustomobject]@{up=[bool]$eth;name=$(if($eth){$eth.Name}else{$null});v4=$v4;v6=$v6};',
  '$obj|ConvertTo-Json -Compress',
].join('');

/** 一次以太网探测的语义化结果 */
export interface NetworkProbe {
  /** 以太网状态；null = 采集失败（保留旧值阶段仍可能为 null） */
  ethernet: EthernetStatus | null;
  /** 是否可访问互联网；null = 未知 */
  hasInternet: boolean | null;
}

/** 「明确可上网」的 Connectivity 取值 */
const CONNECTIVITY_INTERNET = 'Internet';
/** 「明确不可上网」的 Connectivity 取值；NoInternet 兼容旧命名 */
const CONNECTIVITY_NO_INTERNET = new Set([
  'Disconnected',
  'NoTraffic',
  'Subnet',
  'LocalNetwork',
  'NoInternet',
]);

/**
 * 把 IPv4/IPv6 Connectivity 字符串折算成三态「是否能上网」。
 * 任一为 Internet → true；两者都是明确的非 Internet → false；
 * 其余（空/未知枚举）→ null，宁可显示未知也不误报断网。
 */
function connectivityToInternet(v4: unknown, v6: unknown): boolean | null {
  const values = [v4, v6].filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (values.length === 0) return null;
  if (values.some((v) => v === CONNECTIVITY_INTERNET)) return true;
  return values.every((v) => CONNECTIVITY_NO_INTERNET.has(v)) ? false : null;
}

/**
 * 解析探测脚本的 stdout（单行 JSON）。
 * - 前置 BOM、末尾 CRLF 都清掉；
 * - 只截取第一个 `{` 到最后一个 `}`，容忍 PowerShell 在 JSON 前打印的告警文本；
 * - up=true 但 name 为空时按「已连接但未知名称」处理（name=null），不推翻 connected。
 */
function parseNetworkProbe(text: string): NetworkProbe | null {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { up?: unknown; name?: unknown; v4?: unknown; v6?: unknown };
  const connected = obj.up === true;
  const name = typeof obj.name === 'string' && obj.name.trim().length > 0 ? obj.name.trim() : null;
  return {
    ethernet: { connected, name: connected ? name : null },
    hasInternet: connectivityToInternet(obj.v4, obj.v6),
  };
}

/** 最近一次成功的探测结果（失败时保留，供 Wi-Fi 的 hasInternet 字段复用） */
let probeCache: NetworkProbe = { ethernet: null, hasInternet: null };
/** 上次实际采集时间（0 = 从未采集）——失败也刷新，保持 15s 节奏防 spawn 风暴 */
let probeFetchedAt = 0;
/** 连续瞬时失败次数 */
let probeTransientFails = 0;
/** 上次拿到确定结论的时间（仅用于日志说明旧值有多陈旧） */
let probeLastOkAt = 0;
/** 进行中的探测（并发调用复用同一 Promise） */
let probeInFlight: Promise<NetworkProbe> | null = null;
/**
 * 两个对外快照（供调用方零等待同步读取）。
 * 与 probeCache 同源、在同一次 applyProbeResult 里一起写入：
 * 单独存一份是为了让调用方不必理解 NetworkProbe 的聚合结构，
 * 将来两条采集面若拆分也能各自独立演进。
 */
let ethernetSnapshot: EthernetStatus | null = null;
let internetSnapshot: boolean | null = null;

/** 探测结果三态：成功 / 非 Windows（不需告警） / 瞬时失败 */
type ProbeQuery =
  | { kind: 'ok'; probe: NetworkProbe }
  | { kind: 'unsupported' }
  | { kind: 'transient'; reason: string };

/** 真正执行一次探测（不含缓存判断，也不改缓存） */
async function queryNetworkProbe(): Promise<ProbeQuery> {
  if (process.platform !== 'win32') return { kind: 'unsupported' };
  const captured = await execCapture(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      ETHERNET_PROBE_SCRIPT,
    ],
    POWERSHELL_TIMEOUT_MS,
  );
  if (!captured.ok) return { kind: 'transient', reason: captured.error };
  const probe = parseNetworkProbe(decodeConsoleText(captured.buf));
  if (!probe) return { kind: 'transient', reason: 'PowerShell 输出无法解析' };
  return { kind: 'ok', probe };
}

/** 探测缓存变化后同步两个对外快照（唯一写入口，保证三处口径永远一致） */
function syncProbeSnapshots(): void {
  ethernetSnapshot = probeCache.ethernet;
  internetSnapshot = probeCache.hasInternet;
}

/** 把一次探测结果应用到缓存，并维护「连续瞬时失败」状态机（与 Wi-Fi 同款） */
function applyProbeResult(result: ProbeQuery): NetworkProbe {
  const now = Date.now();
  switch (result.kind) {
    case 'ok':
      probeCache = result.probe;
      probeTransientFails = 0;
      probeLastOkAt = now;
      syncProbeSnapshots();
      return probeCache;

    case 'unsupported':
      // 非 Windows：没有可采集面，直接给空值且不记失败
      probeCache = { ethernet: null, hasInternet: null };
      probeTransientFails = 0;
      probeLastOkAt = now;
      syncProbeSnapshots();
      return probeCache;

    default: {
      probeTransientFails += 1;
      if (probeTransientFails === 1) {
        log.warn('[network] 以太网/连通性探测瞬时失败，保留当前状态:', result.reason);
      }
      if (probeTransientFails === ETHERNET_TRANSIENT_FAIL_LIMIT) {
        const stale =
          probeLastOkAt > 0
            ? `旧值已陈旧 ${Math.round((now - probeLastOkAt) / 1000)}s`
            : '此前从未成功采集';
        const hadValue = probeCache.ethernet !== null || probeCache.hasInternet !== null;
        probeCache = { ethernet: null, hasInternet: null };
        syncProbeSnapshots();
        log.warn(
          `[network] 连续瞬时失败 ${ETHERNET_TRANSIENT_FAIL_LIMIT} 次，以太网/连通性置空（${stale}；` +
            `${hadValue ? '不再沿用上一次成功值' : '此前已为空'}）`,
        );
      }
      return probeCache;
    }
  }
}

/**
 * 读取以太网 + 互联网连通性（15s 缓存；到期才真正调用 PowerShell）。
 * 返回的 hasInternet 同时被 getWifiStatus 复用，保证两处口径一致。
 */
export function getNetworkProbe(): Promise<NetworkProbe> {
  if (Date.now() - probeFetchedAt < ETHERNET_POLL_INTERVAL_MS) return Promise.resolve(probeCache);
  if (probeInFlight) return probeInFlight;
  probeInFlight = queryNetworkProbe()
    .catch((err): ProbeQuery => ({
      kind: 'transient',
      reason: err instanceof Error ? err.message : String(err),
    }))
    .then((result) => {
      const value = applyProbeResult(result);
      // 失败也刷新采集时间戳，避免坏环境下每次 tick 都重试
      probeFetchedAt = Date.now();
      return value;
    })
    .finally(() => {
      probeInFlight = null;
    });
  return probeInFlight;
}

/** 当前是否可上网（同步读缓存，供 Wi-Fi 状态拼装） */
function currentHasInternet(): boolean | null {
  return probeCache.hasInternet;
}

/** 缓存到期就在后台补一次探测；失败由探测面自己计数吞掉，调用方既不用等也不会拿到 rejection */
function refreshProbeIfStale(): void {
  if (Date.now() - probeFetchedAt >= ETHERNET_POLL_INTERVAL_MS) void getNetworkProbe();
}

/**
 * 以太网状态（同步读取最近一次探测结果，null = 采集失败 / 非 Windows）。
 * 15s 缓存到期时会顺手触发一次后台探测，因此调用方无需自己驱动刷新，
 * 但拿到的永远是「当前已知」而非「刚刚测得」，不阻塞 1s 主循环。
 */
export function getEthernetStatus(): EthernetStatus | null {
  refreshProbeIfStale();
  return ethernetSnapshot;
}

/**
 * 互联网连通性（同步读取；true=可上网 / false=明确不可上网 / null=未知）。
 * 与 getWifiStatus().hasInternet 同源，保证两处不会互相矛盾。
 */
export function getInternetStatus(): boolean | null {
  refreshProbeIfStale();
  return internetSnapshot;
}

// ───────────────────────────── Wi-Fi ─────────────────────────────

/** Wi-Fi 采集的原始结果（hasInternet 由探测面单独填充，故此处先去掉该字段） */
type WifiBase = Omit<WifiStatus, 'hasInternet'>;

/** 原生指针宽度（x64 = 8，ia32 = 4）；WlanAPI 出参指针按此宽度读出 */
const PTR_BYTES = process.arch === 'ia32' ? 4 : 8;

/** Wi-Fi 缓存值（null = 无无线网卡 / 采集面不可用 / 连续采集失败） */
let wifiCache: WifiBase | null = null;
/** Wi-Fi 上次实际采集时间（0 = 从未采集）——瞬时失败也刷新，保持 3s 节奏防 spawn 风暴 */
let wifiFetchedAt = 0;
/** 连续瞬时失败次数（成功采集或确认无无线接口时清零） */
let wifiTransientFails = 0;
/**
 * 上次拿到「确定结论」的时间（已连接态 / 确无无线接口都算；0 = 从未成功）。
 * 连续失败判定本身用 wifiTransientFails（次数已等价表达「距上次成功的失败长度」），
 * 这个时间戳只用于日志里说明保留的旧值已陈旧多久，两者刻意分开：
 * wifiFetchedAt 会因为失败而刷新，不能拿来判断「上次成功」。
 */
let wifiLastOkAt = 0;
/** 进行中的 Wi-Fi 采集（并发调用复用同一 Promise，避免重复 spawn） */
let wifiInFlight: Promise<WifiBase | null> | null = null;

/** 把缓存的原始 Wi-Fi 结果补上 hasInternet，得到对外的 WifiStatus */
function withInternet(base: WifiBase | null): WifiStatus | null {
  return base ? { ...base, hasInternet: currentHasInternet() } : null;
}

/** 状态行是否表示「已连接」（英文 connected / 中文 已连接） */
function isConnectedState(state: string | null): boolean {
  if (!state) return false;
  return /(^|\s)connected\b/i.test(state) || state.includes('已连接');
}

/**
 * 解析 `netsh wlan show interfaces` 输出（WlanAPI 不可用时的回退路径）。
 * 输出按空行分成若干接口块，每块都会尝试取 State/信号/SSID；
 * 多网卡时优先返回「已连接」的那块，否则返回第一块。
 * 一个接口块都没有（无无线网卡 / 服务未启动）返回 null。
 */
function parseWlanInterfaces(text: string): WifiBase | null {
  const blocks = text.split(/\r?\n\s*\r?\n/);
  const found: WifiBase[] = [];
  for (const block of blocks) {
    const state = pickField(block, ['State', '状态']);
    const name = pickField(block, ['Name', '名称']);
    if (state === null && name === null) continue; // 不是接口块（表头/空段）

    // SSID 行首锚点：避免命中同块的 “AP BSSID”
    const ssidMatch = /^\s*SSID\s*:\s*(.*)$/im.exec(block);
    const ssid = ssidMatch ? ssidMatch[1].trim() : '';
    const connected = isConnectedState(state);

    // 信号行（Signal / 信号）里取第一个百分比；未连接时 netsh 通常不输出该行
    const signalText = pickField(block, ['Signal', '信号']);
    const signalMatch = signalText ? /(\d+)\s*%/.exec(signalText) : null;
    const signal = signalMatch ? Math.min(100, Math.max(0, Number(signalMatch[1]))) : null;

    found.push({
      available: true,
      connected,
      ssid: connected && ssid.length > 0 ? ssid : null,
      signal: connected ? signal : null,
      bars: connected ? signalToBars(signal) : 0,
    });
  }
  if (found.length === 0) return null;
  return found.find((item) => item.connected) ?? found[0];
}

// ── WLAN API（wlanapi.dll / koffi） ──

/**
 * GUID 是否对齐到 8 字节并不影响下列偏移（所有成员都是 4 字节对齐），
 * 但结构体大小必须与真实布局一致，否则后续字段全部错位，所以解析前先做 sizeof/字段校验。
 */
/** sizeof(WLAN_INTERFACE_INFO_LIST) 固定头：DWORD dwNumberOfItems + DWORD dwIndex */
const WLAN_LIST_HEAD_SIZE = 8;
/**
 * sizeof(WLAN_INTERFACE_INFO) = 532 = GUID(16) + WCHAR[256](512) + isState(4)。
 * 实测校验：单接口时 WlanEnumInterfaces 分配的总长度为 8 + 532 = 540 字节
 * （解码 540 字节之后的字节是堆上的其它数据），且 isState=1 落在列表内绝对偏移 536（项内 528）。
 * GUID 的 Data4 为 uchar[8]、结构对齐 4 字节，因此数组步长同为 532（不会补到 536/540）。
 */
const WLAN_IFACE_ITEM_SIZE = 532;
/** 单个接口项内部偏移：GUID 0（列表内 8），描述 16（列表内 24），isState 528（列表内 536） */
const WLAN_IFACE_OFF_GUID = 0;
const WLAN_IFACE_OFF_DESC = 16;
const WLAN_IFACE_OFF_STATE = 528;
/** WLAN_INTERFACE_STATE：0=未连接 1=已连接 2=正在认证 3=正在关联 4=正在断开 5=已断开 */
const WLAN_IFACE_STATE_CONNECTED = 1;
const WLAN_IFACE_STATE_MAX = 5;
/** 一次枚举最多的接口数（超过视为结构解析错误，防止用脏数据越界读） */
const WLAN_IFACE_MAX_COUNT = 64;
/** WLAN_MAX_NAME_LENGTH：strProfileName / strInterfaceDescription 的字符数 */
const WLAN_MAX_NAME_LENGTH = 256;
/**
 * WlanQueryInterface 的 opcode：wlan_intf_opcode_current_connection = 7。
 * ⚠️ 注意不是 0x1008 —— 实测（Win11 24H2 / wlanapi.dll）传 0x1008 返回
 * ERROR_NOT_SUPPORTED(50)，因为 0x1008 落在 autoconf 段但并非已定义 opcode；
 * 传入 7 才返回 WLAN_CONNECTION_ATTRIBUTES。
 */
const WLAN_OPCODE_CURRENT_CONNECTION = 7;
/** WlanOpenHandle 客户端版本：2 = Vista 及以上 */
const WLAN_CLIENT_VERSION = 2;
/**
 * WLAN_CONNECTION_ATTRIBUTES 实测 sizeof = 604：
 *   isState(4) + wlanConnectionMode(4) + strProfileName[256](512)
 *   + WLAN_ASSOCIATION_ATTRIBUTES(68) + WLAN_SECURITY_ATTRIBUTES(16)
 * 解析所需最小长度取 588（到 ulTxRate 为止），其余字段不读。
 */
const WLAN_CA_SIZE = 604;
const WLAN_CA_MIN_SIZE = 588;
/** 连接属性内部偏移：isState 0、dot11Ssid.uSSIDLength 520、ucSSID 524、wlanSignalQuality 576 */
const WLAN_CA_OFF_IS_STATE = 0;
const WLAN_CA_OFF_SSID_LEN = 520;
const WLAN_CA_OFF_SSID = 524;
const WLAN_CA_OFF_SIGNAL_QUALITY = 576;
/** DOT11_SSID.ucSSID 的字节数 */
const DOT11_SSID_MAX_LEN = 32;

/** wlanapi.dll 函数集合（懒加载） */
interface WlanApiFns {
  open: (version: number, reserved: null, negotiated: Buffer, handle: Buffer) => number;
  enumInterfaces: (handle: number, reserved: null, list: Buffer) => number;
  query: (
    handle: number,
    guid: Buffer,
    opcode: number,
    reserved: null,
    size: Buffer,
    data: Buffer,
    opcodeType: Buffer,
  ) => number;
  free: (ptr: number) => void;
  close: (handle: number, reserved: null) => number;
  /** 把原生指针指向的原始字节拷成 Buffer（koffi.decode 返回 Uint8Array） */
  decode: (ptr: bigint, size: number) => Buffer;
}
let wlanFns: WlanApiFns | null = null;
/** WlanAPI 加载失败后不再重试（避免每个轮询周期重复 require/load 并刷日志） */
let wlanLoadFailed = false;
/** 复用的 WLAN 客户端句柄（0 = 未打开）；只在调用失败时关闭重开 */
let wlanHandle = 0;
/** WlanAPI 相关告警只打一次（3s 轮询会把日志刷爆） */
let wlanWarned = false;

/** 只在首次失败时记日志，后续静默回退 netsh */
function warnWlanOnce(message: string, detail?: unknown): void {
  if (wlanWarned) return;
  wlanWarned = true;
  log.warn(message, detail ?? '');
}

/** 懒加载 wlanapi.dll 并解析所需符号（幂等）；失败后不再重试 */
function ensureWlanApi(): WlanApiFns | null {
  if (wlanFns) return wlanFns;
  if (wlanLoadFailed || process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const dll = koffi.load('wlanapi.dll');
    wlanFns = {
      open: dll.func(
        'uint32 WlanOpenHandle(uint32 dwClientVersion, void *pReserved, void *pdwNegotiatedVersion, void *phClientHandle)',
      ),
      enumInterfaces: dll.func(
        'uint32 WlanEnumInterfaces(intptr_t hClientHandle, void *pReserved, void *ppInterfaceList)',
      ),
      query: dll.func(
        'uint32 WlanQueryInterface(intptr_t hClientHandle, void *pInterfaceGuid, uint32 OpCode, void *pReserved, void *pdwDataSize, void *ppData, void *pWlanOpcodeValueType)',
      ),
      free: dll.func('void WlanFreeMemory(intptr_t pMemory)'),
      close: dll.func('uint32 WlanCloseHandle(intptr_t hClientHandle, void *pReserved)'),
      decode: (ptr: bigint, size: number): Buffer => {
        const view = koffi.decode(ptr, 'uint8', size) as Uint8Array;
        return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
      },
    };
    return wlanFns;
  } catch (err) {
    wlanLoadFailed = true;
    log.warn('[network] koffi/wlanapi 加载失败，Wi-Fi 回退 netsh:', err);
    return null;
  }
}

/** 打开（或复用）WLAN 客户端句柄；失败返回 0 */
function openWlanHandle(fns: WlanApiFns): number {
  if (wlanHandle) return wlanHandle;
  try {
    const negotiated = Buffer.alloc(4);
    const out = Buffer.alloc(PTR_BYTES);
    const rc = fns.open(WLAN_CLIENT_VERSION, null, negotiated, out);
    const handle = readPtr(out);
    if (rc !== 0 || handle === 0) {
      warnWlanOnce(`[network] WlanOpenHandle 失败 rc=${rc}，Wi-Fi 回退 netsh`);
      return 0;
    }
    wlanHandle = handle;
    return handle;
  } catch (err) {
    warnWlanOnce('[network] WlanOpenHandle 异常，Wi-Fi 回退 netsh:', err);
    return 0;
  }
}

/** 关闭复用的 WLAN 句柄（句柄失效 / 进程退出路径） */
function closeWlanHandle(): void {
  const fns = wlanFns;
  const handle = wlanHandle;
  wlanHandle = 0;
  if (!fns || !handle) return;
  try {
    fns.close(handle, null);
  } catch {
    /* 关闭失败无补救手段，忽略 */
  }
}

/** 从出参缓冲里读原生指针并转成 Number（句柄/指针都远小于 2^53，安全） */
function readPtr(buf: Buffer): number {
  return Number(PTR_BYTES === 4 ? buf.readUInt32LE(0) : buf.readBigUInt64LE(0));
}

/**
 * 读定长 UTF-16LE 字段；必须能在 maxChars 内遇到双字节 0 终止符，
 * 否则说明结构偏移猜错了（返回 null 让调用方回退 netsh）。
 */
function readWideField(buf: Buffer, offset: number, maxChars: number): string | null {
  for (let i = 0; i < maxChars; i += 1) {
    const at = offset + i * 2;
    if (at + 1 >= buf.length) return null;
    if (buf.readUInt16LE(at) === 0) return buf.toString('utf16le', offset, at);
  }
  return null;
}

/** 解码 SSID 原始字节：绝大多数是 UTF-8/ASCII，个别中文 SSID 用 GBK 写入 */
function decodeSsidBytes(bytes: Buffer): string {
  const utf8 = bytes.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('gbk').decode(bytes);
  } catch {
    return utf8;
  }
}

/**
 * 通过 WLAN API 读取一次 Wi-Fi 状态。
 * 返回 null 表示 WlanAPI 这一路不可用（调用失败 / 结构校验不通过），由调用方回退 netsh；
 * 返回 available=true 时是确定结论（连接或未连接都算）。
 */
function queryWifiViaWlanApi(): WifiBase | null {
  const fns = ensureWlanApi();
  if (!fns) return null;
  let listPtr = 0;
  try {
    let handle = openWlanHandle(fns);
    if (!handle) return null;

    const listOut = Buffer.alloc(PTR_BYTES);
    let rc = fns.enumInterfaces(handle, null, listOut);
    if (rc !== 0) {
      // 句柄可能已失效（WLAN 服务重启 / 用户切换等）：关掉重开一次再试
      closeWlanHandle();
      handle = openWlanHandle(fns);
      if (!handle) return null;
      const retryOut = Buffer.alloc(PTR_BYTES);
      rc = fns.enumInterfaces(handle, null, retryOut);
      if (rc !== 0) {
        warnWlanOnce(`[network] WlanEnumInterfaces 失败 rc=${rc}，Wi-Fi 回退 netsh`);
        return null;
      }
      listPtr = readPtr(retryOut);
    } else {
      listPtr = readPtr(listOut);
    }
    if (!listPtr) return null;

    // 先读固定头 + 第一项，用 dwNumberOfItems 校验布局后再按需读全量
    const head = fns.decode(BigInt(listPtr), WLAN_LIST_HEAD_SIZE + WLAN_IFACE_ITEM_SIZE);
    const count = head.readUInt32LE(0);
    if (count < 1 || count > WLAN_IFACE_MAX_COUNT) {
      warnWlanOnce(`[network] WLAN_INTERFACE_INFO_LIST 项数异常(${count})，Wi-Fi 回退 netsh`);
      return null;
    }
    const list =
      count === 1
        ? head
        : fns.decode(BigInt(listPtr), WLAN_LIST_HEAD_SIZE + count * WLAN_IFACE_ITEM_SIZE);

    // 结构校验：每个接口项的 isState 与描述字符串都必须合理，否则视为布局不符
    let chosenGuid: Buffer | null = null;
    let chosenState = -1;
    for (let i = 0; i < count; i += 1) {
      const base = WLAN_LIST_HEAD_SIZE + i * WLAN_IFACE_ITEM_SIZE;
      const state = list.readUInt32LE(base + WLAN_IFACE_OFF_STATE);
      const desc = readWideField(list, base + WLAN_IFACE_OFF_DESC, WLAN_MAX_NAME_LENGTH);
      if (state > WLAN_IFACE_STATE_MAX || desc === null || desc.length === 0) {
        warnWlanOnce('[network] WLAN_INTERFACE_INFO 布局校验失败，Wi-Fi 回退 netsh');
        return null;
      }
      if (chosenGuid === null) {
        chosenGuid = Buffer.from(
          list.subarray(base + WLAN_IFACE_OFF_GUID, base + WLAN_IFACE_OFF_GUID + 16),
        );
        chosenState = state;
      }
      if (state === WLAN_IFACE_STATE_CONNECTED) {
        // 优先连接中的接口
        chosenGuid = Buffer.from(
          list.subarray(base + WLAN_IFACE_OFF_GUID, base + WLAN_IFACE_OFF_GUID + 16),
        );
        chosenState = state;
        break;
      }
    }
    if (!chosenGuid) return null;
    if (chosenState !== WLAN_IFACE_STATE_CONNECTED) {
      // 有无线网卡但未连接：这是确定结论，不必回退 netsh
      return { available: true, connected: false, ssid: null, signal: null, bars: 0 };
    }

    // 取当前连接的详细属性
    const sizeOut = Buffer.alloc(4);
    const dataOut = Buffer.alloc(PTR_BYTES);
    const opcodeType = Buffer.alloc(4);
    const qrc = fns.query(
      handle,
      chosenGuid,
      WLAN_OPCODE_CURRENT_CONNECTION,
      null,
      sizeOut,
      dataOut,
      opcodeType,
    );
    if (qrc !== 0) {
      warnWlanOnce(`[network] WlanQueryInterface 失败 rc=${qrc}，Wi-Fi 回退 netsh`);
      return null;
    }
    const dataPtr = readPtr(dataOut);
    if (!dataPtr) return null;
    try {
      const size = sizeOut.readUInt32LE(0);
      if (size < WLAN_CA_MIN_SIZE) {
        warnWlanOnce(`[network] WLAN_CONNECTION_ATTRIBUTES 尺寸异常(${size})，Wi-Fi 回退 netsh`);
        return null;
      }
      const ca = fns.decode(BigInt(dataPtr), Math.min(size, WLAN_CA_SIZE));
      const isState = ca.readUInt32LE(WLAN_CA_OFF_IS_STATE);
      const ssidLen = ca.readUInt32LE(WLAN_CA_OFF_SSID_LEN);
      const quality = ca.readUInt32LE(WLAN_CA_OFF_SIGNAL_QUALITY);
      if (isState > WLAN_IFACE_STATE_MAX || ssidLen > DOT11_SSID_MAX_LEN || quality > 100) {
        warnWlanOnce('[network] WLAN_CONNECTION_ATTRIBUTES 布局校验失败，Wi-Fi 回退 netsh');
        return null;
      }
      if (isState !== WLAN_IFACE_STATE_CONNECTED) {
        return { available: true, connected: false, ssid: null, signal: null, bars: 0 };
      }
      const ssid =
        ssidLen > 0
          ? decodeSsidBytes(ca.subarray(WLAN_CA_OFF_SSID, WLAN_CA_OFF_SSID + ssidLen)).trim()
          : '';
      const signal = Math.min(100, Math.max(0, quality));
      return {
        available: true,
        connected: true,
        ssid: ssid.length > 0 ? ssid : null,
        signal,
        bars: signalToBars(signal),
      };
    } finally {
      // WlanQueryInterface 分配的属性块必须归还
      try {
        fns.free(dataPtr);
      } catch {
        /* 同上 */
      }
    }
  } catch (err) {
    warnWlanOnce('[network] WlanAPI 采集异常，Wi-Fi 回退 netsh:', err);
    return null;
  } finally {
    if (listPtr) {
      try {
        fns.free(listPtr);
      } catch {
        /* 释放失败无补救手段，忽略 */
      }
    }
  }
}

/**
 * 一次 Wi-Fi 采集的语义化结果——三态必须分开，否则「瞬时失败」会被当成「真无网卡」：
 * - ok：拿到了确定结论（连接态 / 未连接都算确定结论）
 * - no-interface：netsh 正常执行但没有任何接口块（无无线网卡 / WLAN 服务未启动）
 * - transient：超时被杀、启动失败、彻底拿不到输出（保留上一次成功值的场景）
 */
type WifiQuery =
  | { kind: 'ok'; status: WifiBase }
  | { kind: 'no-interface' }
  | { kind: 'transient'; reason: string };

/**
 * 真正执行一次 Wi-Fi 采集（不含缓存判断，也不改缓存）。
 * 优先 WLAN API（真实 RSSI 质量，无子进程），失败才 spawn netsh。
 */
async function queryWifi(): Promise<WifiQuery> {
  if (process.platform !== 'win32') return { kind: 'no-interface' };
  const viaApi = queryWifiViaWlanApi();
  if (viaApi) return { kind: 'ok', status: viaApi };
  const captured = await execCapture('netsh', ['wlan', 'show', 'interfaces']);
  if (!captured.ok) return { kind: 'transient', reason: captured.error };
  const status = parseWlanInterfaces(decodeConsoleText(captured.buf));
  return status ? { kind: 'ok', status } : { kind: 'no-interface' };
}

/**
 * 把一次采集结果应用到缓存，并维护「连续瞬时失败」状态机。
 *
 * 为什么不能沿用「失败即置空」：netsh 被超时杀掉时 stdout 为空，与「真的没有无线网卡」
 * 的输出特征相同，只有 execCapture 的失败标记能区分二者。瞬时失败保留上一次成功值，
 * 中心图标就不会在杀软拖慢子进程时闪断成「Wi-Fi 关闭 / 不可用」。
 *
 * @returns 应用后的缓存值（瞬时失败时 = 上一次成功值）
 */
function applyWifiResult(result: WifiQuery): WifiBase | null {
  const now = Date.now();
  switch (result.kind) {
    case 'ok':
      wifiCache = result.status;
      wifiTransientFails = 0;
      wifiLastOkAt = now;
      return wifiCache;

    case 'no-interface':
      // 确实没有接口块 = 确定结论，照旧置空并清计数
      wifiCache = null;
      wifiTransientFails = 0;
      wifiLastOkAt = now;
      return wifiCache;

    default: {
      wifiTransientFails += 1;
      if (wifiTransientFails === 1) {
        // 只在这一轮连续失败的第一枪打日志，避免每 3s 刷一条同样的 warn
        log.warn('[network] Wi-Fi 采集瞬时失败，保留当前 Wi-Fi 状态:', result.reason);
      }
      if (wifiTransientFails === WIFI_TRANSIENT_FAIL_LIMIT) {
        const stale =
          wifiLastOkAt > 0
            ? `旧值已陈旧 ${Math.round((now - wifiLastOkAt) / 1000)}s`
            : '此前从未成功采集';
        const hadValue = wifiCache !== null;
        wifiCache = null;
        log.warn(
          `[network] 连续瞬时失败 ${WIFI_TRANSIENT_FAIL_LIMIT} 次，Wi-Fi 状态置空（${stale}；` +
            `${hadValue ? '不再沿用上一次成功值' : '此前已为空'}）`,
        );
      }
      return wifiCache;
    }
  }
}

/**
 * 读取 Wi-Fi 状态（3s 缓存；到期才真正调用 WLAN API / netsh）。
 * hasInternet 每次返回时从以太网探测缓存合并，保证与 ethernet.hasInternet 口径一致。
 * 返回 null 表示无无线网卡 / 无 WLAN 服务 / 连续瞬时失败已放弃旧值。
 */
export function getWifiStatus(): Promise<WifiStatus | null> {
  if (Date.now() - wifiFetchedAt < WIFI_POLL_INTERVAL_MS) {
    return Promise.resolve(withInternet(wifiCache));
  }
  if (!wifiInFlight) {
    wifiInFlight = queryWifi()
      // 采集过程中的意外异常同样按瞬时失败处理（不推翻已有缓存）
      .catch((err): WifiQuery => ({
        kind: 'transient',
        reason: err instanceof Error ? err.message : String(err),
      }))
      .then((result) => {
        const value = applyWifiResult(result);
        // 失败也刷新采集时间戳，避免坏环境下每秒重试造成进程反复 spawn；
        // 「上次成功时间」单独记在 wifiLastOkAt，不会被这里污染
        wifiFetchedAt = Date.now();
        return value;
      })
      .finally(() => {
        wifiInFlight = null;
      });
  }
  return wifiInFlight.then(withInternet);
}

// ───────────────────────────── 蓝牙（SetupAPI / koffi） ─────────────────────────────

/** 蓝牙设备类 GUID（所有蓝牙外设与本地无线电适配器都挂在该类下） */
const BLUETOOTH_CLASS_GUID = '{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}';
/** DIGCF_PRESENT：只要当前在场的设备节点 */
const DIGCF_PRESENT = 0x02;
/** SetupDiGetClassDevs 失败返回值 INVALID_HANDLE_VALUE */
const INVALID_HANDLE_VALUE = -1;
/** SPDRP_FRIENDLYNAME：设备友好名 */
const SPDRP_FRIENDLYNAME = 0x0000000c;
/**
 * 「在场」判定说明（实测结论，勿回退成 DEVPKEY_Device_IsPresent）：
 *   规格中给出的 DEVPKEY_Device_IsPresent（fmtid {4340a9d7-a049-4c54-919d-71c58d33536e} pid 12）
 *   在本机 Win11 上经 SetupDiGetDevicePropertyW 全部返回 ERROR_NOT_FOUND(1168)，
 *   经 CM_Get_DevNode_PropertyW 返回 CR_NO_SUCH_VALUE(37)，且该 fmtid 下 pid 0–60 全都读不到，
 *   说明该属性组不在 SetupAPI/CM 属性接口的可见范围内（PowerShell 能读到，说明是键字节不同或属性源不同）。
 *   改用 CM_Get_DevNode_Status：CR_SUCCESS 且无 DN_HAS_PROBLEM / DN_WILL_BE_REMOVED 即为「在场」，
 *   语义与 IsPresent=true 等价（幽灵节点 / 已移除节点都会被排除），且不需要猜测未公开的属性键。
 */
const CM_CR_SUCCESS = 0;
/** DN_HAS_PROBLEM：节点存在但有故障（含 CM_PROB_PHANTOM 幽灵节点） */
const DN_HAS_PROBLEM = 0x00000400;
/** DN_WILL_BE_REMOVED：节点即将被移除 */
const DN_WILL_BE_REMOVED = 0x00040000;
/** DEVPKEY_Device_BatteryLevel 所属属性组 GUID 与 pid */
const DEVPKEY_FMTID_BATTERY = '{104ea319-6ee2-4701-bd47-8ddbf425bbe5}';
const DEVPKEY_PID_BATTERY = 2;
/** DEVPROP_TYPE_BYTE / UINT16 / UINT32 类型码 */
const DEVPROP_TYPE_BYTE = 0x3;
const DEVPROP_TYPE_UINT16 = 0x4;
const DEVPROP_TYPE_UINT32 = 0x5;
/** SP_DEVINFO_DATA 中的 ULONG_PTR 宽度随架构变化 */
const SP_DEVINFO_DATA_PTR_SIZE = process.arch === 'ia32' ? 4 : 8;
/** sizeof(SP_DEVINFO_DATA) = DWORD + GUID(16) + DWORD + ULONG_PTR */
const SP_DEVINFO_DATA_SIZE = 4 + 16 + 4 + SP_DEVINFO_DATA_PTR_SIZE;
/** 设备属性出参缓冲大小（属性值最大几十字节，给足余量） */
const PROP_BUFFER_SIZE = 64;
/** 友好名出参缓冲大小（UTF-16，512 字符足够） */
const NAME_BUFFER_SIZE = 1024;

/**
 * 名称过滤器：明确是「本机蓝牙无线电/适配器」或系统协议栈条目的排除掉。
 * 规则刻意收紧（宁可多留外设，不可错杀），只匹配明显的适配器/厂商字样；
 * 中文本地化名称（如「英特尔(R) 无线 Bluetooth(R)」「蓝牙枚举器」）也在覆盖范围内。
 */
const HOST_DEVICE_PATTERN =
  /(bluetooth\s*(radio|adapter|module|enumerator)|wireless\s+bluetooth|无线\s*bluetooth|^microsoft\s+bluetooth|^蓝牙枚举器|蓝牙(适配器|无线电|模块|枚举器)|无线电|\bradio\b|intel|realtek|qualcomm|broadcom|mediatek|atheros|英特尔|瑞昱|高通|博通|联发科)/i;

/** setupapi.dll 模块句柄（懒加载） */
let setupapi: any = null;
/** setupapi.dll + cfgmgr32.dll 函数句柄集合（懒加载） */
interface SetupApiFns {
  getClassDevs: any;
  enumDeviceInfo: any;
  getRegistryProperty: any;
  getDeviceProperty: any;
  destroyDeviceInfoList: any;
  /** CFGMGR32 CM_Get_DevNode_Status：节点在场/故障状态判定 */
  getDevNodeStatus: any;
}
let setupFns: SetupApiFns | null = null;

/**
 * 把 "{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}" 形式的 GUID 序列化成 16 字节。
 * 布局与 Windows GUID 内存布局一致：Data1/2/3 小端，Data4 原样 8 字节。
 */
function guidToBytes(guid: string): Buffer {
  const m = /^\{?([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\}?$/i.exec(
    guid.trim(),
  );
  if (!m) throw new Error(`非法 GUID: ${guid}`);
  const buf = Buffer.alloc(16);
  buf.writeUInt32LE(parseInt(m[1], 16), 0);
  buf.writeUInt16LE(parseInt(m[2], 16), 4);
  buf.writeUInt16LE(parseInt(m[3], 16), 6);
  buf.write(m[4] + m[5], 8, 8, 'hex');
  return buf;
}

/** DEVPROPKEY 结构：16 字节 fmtid + 4 字节 pid = 20 字节 */
function devPropKey(fmtid: string, pid: number): Buffer {
  const buf = Buffer.alloc(20);
  guidToBytes(fmtid).copy(buf, 0);
  buf.writeUInt32LE(pid, 16);
  return buf;
}

/** 预构建的属性键（避免每轮重复序列化） */
const PROP_KEY_BATTERY = devPropKey(DEVPKEY_FMTID_BATTERY, DEVPKEY_PID_BATTERY);

/**
 * 懒加载 setupapi.dll / cfgmgr32.dll 并解析所需符号（幂等）。
 * 非 win32、dll 缺失或 koffi 加载失败时返回 null，由调用方降级。
 */
function ensureSetupApi(): SetupApiFns | null {
  if (setupFns) return setupFns;
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    setupapi = koffi.load('setupapi.dll');
    const cfgmgr = koffi.load('cfgmgr32.dll');
    setupFns = {
      // 句柄统一用 intptr_t 收发：与 void* 的 ABI 一致，且能直接和 -1 比较
      getClassDevs: setupapi.func(
        'intptr_t SetupDiGetClassDevsW(void *ClassGuid, void *Enumerator, void *hwndParent, uint32 Flags)',
      ),
      enumDeviceInfo: setupapi.func(
        'int SetupDiEnumDeviceInfo(intptr_t DeviceInfoSet, uint32 MemberIndex, void *DeviceInfoData)',
      ),
      // 出参一律 void*，由本模块按字节手工解析（见文件头 koffi 约定）
      getRegistryProperty: setupapi.func(
        'int SetupDiGetDeviceRegistryPropertyW(intptr_t DeviceInfoSet, void *DeviceInfoData, uint32 Property, void *PropertyRegDataType, void *PropertyBuffer, uint32 PropertyBufferSize, void *RequiredSize)',
      ),
      getDeviceProperty: setupapi.func(
        'int SetupDiGetDevicePropertyW(intptr_t DeviceInfoSet, void *DeviceInfoData, void *PropertyKey, void *PropertyType, void *PropertyBuffer, uint32 PropertyBufferSize, void *RequiredSize, uint32 Flags)',
      ),
      destroyDeviceInfoList: setupapi.func(
        'int SetupDiDestroyDeviceInfoList(intptr_t DeviceInfoSet)',
      ),
      // 在场判定：入参 DEVINST 取自 SP_DEVINFO_DATA 偏移 20，出参为两个 DWORD
      getDevNodeStatus: cfgmgr.func(
        'uint32 CM_Get_DevNode_Status(void *pulStatus, void *pulProblemNumber, uint32 dnDevInst, uint32 ulFlags)',
      ),
    };
    return setupFns;
  } catch (err) {
    log.warn('[network] koffi/setupapi 加载失败:', err);
    setupFns = null;
    return null;
  }
}

/** 读取 UTF-16LE 定长缓冲里的字符串（截到第一个双字节 0 结束符） */
function readWideString(buf: Buffer): string {
  let end = 0;
  while (end + 1 < buf.length && (buf[end] !== 0 || buf[end + 1] !== 0)) end += 2;
  return buf.toString('utf16le', 0, end);
}

/** 读取一个设备属性的原始值；属性不存在或调用失败返回 null */
function readDeviceProperty(
  fns: SetupApiFns,
  handle: number,
  devInfo: Buffer,
  propKey: Buffer,
): { type: number; data: Buffer } | null {
  const typeOut = Buffer.alloc(4);
  const sizeOut = Buffer.alloc(4);
  const data = Buffer.alloc(PROP_BUFFER_SIZE);
  const ok = fns.getDeviceProperty(
    handle,
    devInfo,
    propKey,
    typeOut,
    data,
    PROP_BUFFER_SIZE,
    sizeOut,
    0, // Flags：非网络属性
  );
  if (!ok) return null; // 含 ERROR_NOT_FOUND：设备不支持该属性
  return { type: typeOut.readUInt32LE(0), data };
}

/** 读取设备友好名（SPDRP_FRIENDLYNAME）；失败返回空串 */
function readFriendlyName(fns: SetupApiFns, handle: number, devInfo: Buffer): string {
  const regTypeOut = Buffer.alloc(4);
  const sizeOut = Buffer.alloc(4);
  const buf = Buffer.alloc(NAME_BUFFER_SIZE);
  const ok = fns.getRegistryProperty(
    handle,
    devInfo,
    SPDRP_FRIENDLYNAME,
    regTypeOut,
    buf,
    NAME_BUFFER_SIZE,
    sizeOut,
  );
  if (!ok) return '';
  return readWideString(buf);
}

/**
 * 判定设备节点当前是否「在场」（等价于 DEVPKEY_Device_IsPresent = true，见文件内常量区注释）。
 * DEVINST 位于 SP_DEVINFO_DATA 偏移 20（cbSize 4 + GUID 16）。
 */
function isDevNodePresent(fns: SetupApiFns, devInfo: Buffer): boolean {
  const status = Buffer.alloc(4);
  const problem = Buffer.alloc(4);
  const cr = fns.getDevNodeStatus(status, problem, devInfo.readUInt32LE(20), 0);
  if (cr !== CM_CR_SUCCESS) return false; // CR_NO_SUCH_DEVNODE 等：节点已不存在
  const flags = status.readUInt32LE(0);
  if ((flags & DN_HAS_PROBLEM) !== 0) return false; // 含幽灵节点（CM_PROB_PHANTOM）
  if ((flags & DN_WILL_BE_REMOVED) !== 0) return false;
  return true;
}

/** 从属性值里解析电量（0–100）；类型不支持或取值异常返回 null */
function parseBattery(prop: { type: number; data: Buffer } | null): number | null {
  if (!prop) return null;
  let value: number;
  if (prop.type === DEVPROP_TYPE_BYTE) value = prop.data.readUInt8(0);
  else if (prop.type === DEVPROP_TYPE_UINT16) value = prop.data.readUInt16LE(0);
  else if (prop.type === DEVPROP_TYPE_UINT32) value = prop.data.readUInt32LE(0);
  else return null; // 非数值类型（字符串/布尔等）→ 视为不支持
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value);
}

/** 真正执行一次蓝牙枚举（不含缓存判断） */
function queryBluetooth(): BluetoothStatus | null {
  const fns = ensureSetupApi();
  if (!fns) return null;
  let handle = INVALID_HANDLE_VALUE;
  try {
    const classGuid = guidToBytes(BLUETOOTH_CLASS_GUID);
    handle = Number(fns.getClassDevs(classGuid, null, null, DIGCF_PRESENT));
    if (!handle || handle === INVALID_HANDLE_VALUE) {
      log.warn('[network] SetupDiGetClassDevs 失败，蓝牙状态置空');
      return null;
    }

    const devices: Array<{ name: string; battery: number | null }> = [];
    const seen = new Set<string>();
    // 单个设备节点：每次枚举都要重置 cbSize，内核按该字段校验结构版本
    const devInfo = Buffer.alloc(SP_DEVINFO_DATA_SIZE);
    for (let index = 0; ; index += 1) {
      devInfo.writeUInt32LE(SP_DEVINFO_DATA_SIZE, 0);
      const ok = fns.enumDeviceInfo(handle, index, devInfo);
      if (!ok) break; // ERROR_NO_MORE_ITEMS：枚举结束
      try {
        const name = readFriendlyName(fns, handle, devInfo).trim();
        if (!name) continue;
        if (HOST_DEVICE_PATTERN.test(name)) continue; // 本机无线电/系统协议栈条目

        // 在场判定：幽灵节点/已移除节点排除（等价于 IsPresent=true）
        if (!isDevNodePresent(fns, devInfo)) continue;

        if (seen.has(name)) continue; // 同名多端点（A2DP/HFP）只留一条
        seen.add(name);
        const battery = parseBattery(readDeviceProperty(fns, handle, devInfo, PROP_KEY_BATTERY));
        devices.push({ name, battery });
      } catch (err) {
        // 单个设备解析失败不影响整轮枚举
        log.warn('[network] 蓝牙设备属性解析失败，跳过:', err);
      }
    }
    return { available: true, devices };
  } catch (err) {
    log.warn('[network] 蓝牙枚举失败:', err);
    return null;
  } finally {
    // 必须释放设备信息集，否则句柄泄漏
    if (handle && handle !== INVALID_HANDLE_VALUE) {
      try {
        fns.destroyDeviceInfoList(handle);
      } catch (err) {
        log.warn('[network] SetupDiDestroyDeviceInfoList 失败:', err);
      }
    }
  }
}

/** 蓝牙缓存值（null = 采集失败 / 非 Windows） */
let btCache: BluetoothStatus | null = null;
/** 蓝牙上次实际采集时间（0 = 从未采集） */
let btFetchedAt = 0;
/** 进行中的蓝牙采集 */
let btInFlight: Promise<BluetoothStatus | null> | null = null;

/**
 * 读取蓝牙状态（8s 缓存；到期才真正枚举）。
 * 返回 null 表示采集失败 / 非 Windows；枚举成功但无外设时 devices 为空数组。
 */
export function getBluetoothStatus(): Promise<BluetoothStatus | null> {
  if (Date.now() - btFetchedAt < BT_POLL_INTERVAL_MS) return Promise.resolve(btCache);
  if (btInFlight) return btInFlight;
  btInFlight = new Promise<BluetoothStatus | null>((resolve) => {
    // FFI 枚举是同步调用（耗时几毫秒），包进 Promise 只为了对外接口统一
    try {
      resolve(queryBluetooth());
    } catch (err) {
      log.warn('[network] 读取蓝牙状态失败:', err);
      resolve(null);
    }
  })
    .then((value) => {
      btCache = value;
      btFetchedAt = Date.now();
      return value;
    })
    .finally(() => {
      btInFlight = null;
    });
  return btInFlight;
}

// ───────────────────────────── 进程退出清理 ─────────────────────────────

/**
 * 释放复用的 WLAN 句柄（供主进程退出路径调用，避免句柄泄漏）。
 * 幂等；未打开过句柄时无副作用。
 */
export function disposeNetworkStatus(): void {
  closeWlanHandle();
}
