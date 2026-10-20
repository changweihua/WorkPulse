/**
 * Wi-Fi / 蓝牙状态采集（主进程）
 *
 * Wi-Fi：每 2s 经 child_process.execFile 调用 `netsh wlan show interfaces` 解析。
 *   - Windows 输出会本地化：中文系统字段为「状态 / 信号」，英文为「State / Signal」，
 *     因此所有字段都按「英文 + 中文」双语正则匹配；
 *   - `SSID` 字面在两种语言下都存在，用行首锚点 `^\s*SSID\s*:` 取值，
 *     可避免误匹配同一块里的 `AP BSSID`；
 *   - netsh 的 stdout 按系统 ANSI 代码页（简中为 GBK）输出，且部分 GBK 序列恰好也是合法 UTF-8，
 *     因此 UTF-8 / GBK 各解码一次，用中文字段名关键字投票选优（详见 decodeConsoleText）。
 *
 * 蓝牙：每 8s 经 koffi 进程内枚举 SetupAPI 蓝牙设备类，无 spawn、无临时文件。
 *   - SetupDiGetClassDevsW(蓝牙类 GUID, DIGCF_PRESENT) → 设备信息集
 *   - SetupDiEnumDeviceInfo 遍历 → SetupDiGetDeviceRegistryPropertyW(SPDRP_FRIENDLYNAME) 取名
 *   - CM_Get_DevNode_Status 判定设备节点是否在场（等价 IsPresent=true，见常量区注释）
 *   - SetupDiGetDevicePropertyW 读 DEVPKEY_Device_BatteryLevel 取电量（不支持则 null）
 *
 * koffi 使用约定（沿用 src/main/battery.ts 的实测结论）：
 *   1. 结构体一律用原始 Buffer 手工按字节布局，不声明 koffi.struct，规避成员类型校验坑；
 *   2. 句柄用 intptr_t 传递（x64/x86 下与 void* 的 ABI 一致），避免 koffi 指针对象语义差异；
 *   3. 出参缓冲用 Buffer，禁止 koffi.decode / koffi 数组语法；
 *   4. 任何初始化或调用异常都被捕获并降级为 null，绝不把异常抛给主进程采样循环。
 *
 * 轮询缓存：两个函数各自维护「上次采集时间 + 结果 + 进行中的请求」，
 * 未到期直接返回缓存值，多路调用不会叠加系统命令/FFI 开销。
 * Wi-Fi 侧额外区分「瞬时失败」（超时被杀 / 拿不到输出）与「确无无线接口」：
 * 前者保留上一次成功值并计数，连续 3 次才置空，避免杀软拖慢 netsh 时中心图标闪断。
 */

import { execFile } from 'child_process';
import log from 'electron-log/main';
import type { BluetoothStatus, WifiStatus } from '../shared/hw-stats';

/** Wi-Fi 轮询间隔（毫秒） */
const WIFI_POLL_INTERVAL_MS = 2000;
/** 蓝牙轮询间隔（毫秒）：FFI 枚举比 netsh 贵，放慢到 8s */
const BT_POLL_INTERVAL_MS = 8000;
/**
 * netsh 命令超时（毫秒）。
 * 本项目实测：杀软会把子进程冷启动拖到 5s+（用户日志里出现过两次「无输出」导致的误判），
 * 而 netsh 正常执行通常 <1s；取 4s 兼顾「异常环境不被一刀切」与「失败后 2s 节奏能及时重试」。
 */
const NETSH_TIMEOUT_MS = 4000;
/**
 * 连续瞬时失败多少次才放弃上一次成功值。
 * 单次超时只说明「这一轮没拿到」；3 次 ≈ 6s（2s 轮询节奏）仍拿不到，
 * 才认定采集面真的坏了——防止「永远显示旧值」把真实的 Wi-Fi 断连藏起来。
 */
const WIFI_TRANSIENT_FAIL_LIMIT = 3;

// ───────────────────────────── Wi-Fi ─────────────────────────────

/** Wi-Fi 缓存值（null = 无无线网卡 / netsh 不可用 / 连续采集失败） */
let wifiCache: WifiStatus | null = null;
/** Wi-Fi 上次实际采集时间（0 = 从未采集）——瞬时失败也刷新，保持 2s 节奏防 spawn 风暴 */
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
let wifiInFlight: Promise<WifiStatus | null> | null = null;

/**
 * 一次外部命令捕获的结果。
 * 失败时携带原因串：netsh 的失败要区分「超时被杀 / 彻底无输出」这类「瞬时」失败，
 * 不能和「netsh 正常执行但没有无线接口」混为一谈（后者是确定结论，可安全置空）。
 */
type CaptureResult = { ok: true; buf: Buffer } | { ok: false; error: string };

/**
 * 执行外部命令并把 stdout 拿成 Buffer。
 * netsh 在没有无线服务/没有无线网卡时会以非 0 退出，但 stdout/stderr 里仍有诊断文本，
 * 因此非 0 退出时只要拿到输出就继续交给解析层判断；彻底拿不到输出（超时被杀 / 启动即失败）
 * 才判为失败，并把 err.message 带出去供调用方记日志。
 */
function execCapture(file: string, args: string[]): Promise<CaptureResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        timeout: NETSH_TIMEOUT_MS,
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
 * 判断文本里是否出现了 netsh 本地化字段名的中文关键字。
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

/** 状态行是否表示「已连接」（英文 connected / 中文 已连接） */
function isConnectedState(state: string | null): boolean {
  if (!state) return false;
  return /(^|\s)connected\b/i.test(state) || state.includes('已连接');
}

/** 信号强度 → 信号格数：>=60→3、30–59→2、1–29→1、无→0 */
function signalToBars(signal: number | null): 0 | 1 | 2 | 3 {
  if (signal === null) return 0;
  if (signal >= 60) return 3;
  if (signal >= 30) return 2;
  if (signal >= 1) return 1;
  return 0;
}

/**
 * 解析 `netsh wlan show interfaces` 输出。
 * 输出按空行分成若干接口块，每块都会尝试取 State/信号/SSID；
 * 多网卡时优先返回「已连接」的那块，否则返回第一块。
 * 一个接口块都没有（无无线网卡 / 服务未启动）返回 null。
 */
function parseWlanInterfaces(text: string): WifiStatus | null {
  const blocks = text.split(/\r?\n\s*\r?\n/);
  const found: WifiStatus[] = [];
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

/**
 * 一次 Wi-Fi 采集的语义化结果——三态必须分开，否则「瞬时失败」会被当成「真无网卡」：
 * - ok：netsh 正常执行并解析出接口块（连接态 / 未连接都算确定结论）
 * - no-interface：netsh 正常执行但没有任何接口块（无无线网卡 / WLAN 服务未启动）
 * - transient：超时被杀、启动失败、彻底拿不到输出（保留上一次成功值的场景）
 */
type WifiQuery =
  | { kind: 'ok'; status: WifiStatus }
  | { kind: 'no-interface' }
  | { kind: 'transient'; reason: string };

/** 真正执行一次 Wi-Fi 采集（不含缓存判断，也不改缓存） */
async function queryWifi(): Promise<WifiQuery> {
  if (process.platform !== 'win32') return { kind: 'no-interface' };
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
function applyWifiResult(result: WifiQuery): WifiStatus | null {
  const now = Date.now();
  switch (result.kind) {
    case 'ok':
      wifiCache = result.status;
      wifiTransientFails = 0;
      wifiLastOkAt = now;
      return wifiCache;

    case 'no-interface':
      // netsh 正常执行且确实没有接口块 = 确定结论，照旧置空并清计数
      wifiCache = null;
      wifiTransientFails = 0;
      wifiLastOkAt = now;
      return wifiCache;

    default: {
      wifiTransientFails += 1;
      if (wifiTransientFails === 1) {
        // 只在这一轮连续失败的第一枪打日志，避免每 2s 刷一条同样的 warn
        log.warn(
          '[network] netsh wlan show interfaces 瞬时失败，保留当前 Wi-Fi 状态:',
          result.reason,
        );
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
 * 读取 Wi-Fi 状态（2s 缓存；到期才真正调用 netsh）。
 * 返回 null 表示无无线网卡 / 无 WLAN 服务 / 连续瞬时失败已放弃旧值。
 */
export function getWifiStatus(): Promise<WifiStatus | null> {
  if (Date.now() - wifiFetchedAt < WIFI_POLL_INTERVAL_MS) return Promise.resolve(wifiCache);
  if (wifiInFlight) return wifiInFlight;
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
  return wifiInFlight;
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
const PTR_SIZE = process.arch === 'ia32' ? 4 : 8;
/** sizeof(SP_DEVINFO_DATA) = DWORD + GUID(16) + DWORD + ULONG_PTR */
const SP_DEVINFO_DATA_SIZE = 4 + 16 + 4 + PTR_SIZE;
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
