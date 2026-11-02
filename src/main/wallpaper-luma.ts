/**
 * 桌面壁纸平均亮度采集（Windows / koffi 进程内 FFI + Electron nativeImage）
 *
 * 悬浮窗是浮在桌面壁纸上的透明圆形 widget：玻璃配色如果只跟系统「应用模式」
 * （nativeTheme.shouldUseDarkColors）走，遇到「深色壁纸 + 浅色应用模式」或
 * 「浅色壁纸 + 深色应用模式」就会对比度翻车。这里直接读壁纸本身算平均亮度，
 * 让渲染层贴着壁纸明暗自适应玻璃通透度与描边深浅。
 *
 * 实现：
 * 1. user32.dll SystemParametersInfoW(SPI_GETDESKWALLPAPER=0x0073) 取当前壁纸
 *    绝对路径（UTF-16 出参，Buffer 手动解析，规则见 battery.ts 文件头）；
 * 2. nativeImage.createFromPath 读入壁纸，resize 到 8×8 后 toBitmap()
 *    遍历 64 像素做 Rec.709 加权平均亮度（0~1，0=黑 1=白）；
 * 3. 结果缓存：壁纸路径每 15s 才重探测一次（SystemParametersInfoW 是 µs 级
 *    调用，但图片解码 ms 级，绝不能每 tick 都做）；路径没变直接命中缓存，
 *    路径变了才重新解码。
 *
 * 返回 null 的场景（调用方回退 nativeTheme）：
 * - 非 win32（macOS/Linux）
 * - koffi / user32.dll 加载失败
 * - 壁纸路径为空（系统纯色背景）
 * - 图片无法解码（文件被占用 / 格式不支持 / 路径失效）
 */

import { nativeImage } from 'electron';
import log from 'electron-log/main';

/** SystemParametersInfoW 的 SPI_GETDESKWALLPAPER 动作码 */
const SPI_GETDESKWALLPAPER = 0x0073;
/** 壁纸路径缓冲区的 wchar 长度（MAX_PATH） */
const WALLPAPER_PATH_CHARS = 260;
/** 壁纸路径重探测间隔（毫秒）：壁纸极少切换，15s 足够及时感知 */
const RE_PROBE_INTERVAL_MS = 15_000;
/** 亮度采样尺寸：8×8 = 64 像素足够代表整张壁纸的平均明暗 */
const SAMPLE_SIZE = 8;

/** user32.dll 的 SystemParametersInfoW 函数句柄（懒加载） */
let systemParametersInfoW: any = null;

/** 已解析出的壁纸路径缓存（用于判断壁纸是否切换） */
let cachedPath: string | null | undefined;
/** 已计算的壁纸亮度缓存 */
let cachedLuma: number | null = null;
/** 上次重探测壁纸路径的时间戳 */
let lastProbeAt = 0;

/**
 * 懒加载 user32.dll 并解析 SystemParametersInfoW 符号（幂等）。
 * 非 win32、dll 缺失或 koffi 加载失败时返回 false，由调用方降级处理。
 */
function ensureInit(): boolean {
  if (systemParametersInfoW) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    // 返回 BOOL；pvParam 为出参（wchar[MAX_PATH]），由本模块手动解析
    systemParametersInfoW = user32.func(
      'uint SystemParametersInfoW(uint uiAction, uint uiParam, void* pvParam, uint fWinIni)',
    );
    return true;
  } catch (err) {
    log.warn('[wallpaper-luma] koffi/user32 load failed:', err);
    return false;
  }
}

/**
 * 读取当前壁纸绝对路径。
 * 失败 / 非 win32 返回 null；系统为纯色背景时返回空字符串（与 null 不同，
 * 由调用方决定回退行为）。路径为 UTF-16LE，出参 Buffer 手动解析到首个 NUL。
 */
function getWallpaperPath(): string | null {
  if (process.platform !== 'win32') return null;
  if (!ensureInit()) return null;
  try {
    // 出参用原始 Buffer，调用后手动解析（见 battery.ts 文件头 koffi 注意事项）
    const out = Buffer.alloc(WALLPAPER_PATH_CHARS * 2);
    const ok = systemParametersInfoW(SPI_GETDESKWALLPAPER, 0, out, 0);
    if (!ok) return null;
    // 手动定位 UTF-16LE 字符串的 NUL 结尾（避免 toString 把整段垃圾字节带进来）
    let end = 0;
    while (end + 1 < out.length && !(out[end] === 0 && out[end + 1] === 0)) end += 2;
    const path = out.toString('utf16le', 0, end);
    return path || '';
  } catch (err) {
    log.warn('[wallpaper-luma] SystemParametersInfoW failed:', err);
    return null;
  }
}

/**
 * 读取壁纸图片并计算平均亮度（Rec.709 加权，0~1）。
 * 壁纸解码失败（文件被占用 / 格式不支持）返回 null。
 *
 * 像素通道按 Windows 上 Electron toBitmap() 的 BGRA 布局处理；
 * 亮度公式 0.2126R + 0.7152G + 0.0722B 贴近人眼对明暗的感知。
 */
function computeWallpaperLuma(path: string): number | null {
  try {
    const image = nativeImage.createFromPath(path);
    if (image.isEmpty()) return null;
    const small = image.resize({ width: SAMPLE_SIZE, height: SAMPLE_SIZE });
    // toBitmap() 返回原始像素 Buffer（同步）；getSize() 返回缩放后的实际尺寸。
    // 注意：getBitmap() 在 Electron 45 已标记 deprecated（类型返回 void），不可再用。
    const size = small.getSize();
    if (size.width !== SAMPLE_SIZE || size.height !== SAMPLE_SIZE) return null;

    const data = small.toBitmap();
    const pixelCount = data.length / 4;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      // toBitmap() 在 Windows 上为 BGRA：B=data[i] G=data[i+1] R=data[i+2] A=data[i+3]
      const b = data[i];
      const g = data[i + 1];
      const r = data[i + 2];
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    return sum / pixelCount / 255;
  } catch (err) {
    log.warn('[wallpaper-luma] compute luma failed:', err);
    return null;
  }
}

/**
 * 读取当前壁纸平均亮度（0~1），带路径缓存。
 *
 * 每 RE_PROBE_INTERVAL_MS 才重新调用一次 SystemParametersInfoW；
 * 路径未变直接返回缓存的亮度，路径变化才重新解码图片。
 * 任意一步失败返回 null（调用方应回退 nativeTheme.shouldUseDarkColors）。
 */
export function getWallpaperLuma(): number | null {
  const now = Date.now();
  // 冷却期内且已探测过（cachedPath !== undefined 表示已初始化）→ 直接命中缓存
  if (now - lastProbeAt < RE_PROBE_INTERVAL_MS && cachedPath !== undefined) {
    return cachedLuma;
  }
  lastProbeAt = now;

  const path = getWallpaperPath();
  // 非 win32 / 调用失败：null（回退系统主题）
  if (path === null) {
    cachedPath = null;
    cachedLuma = null;
    return null;
  }
  // 纯色背景（无壁纸路径）：null（回退系统主题）
  if (path === '') {
    cachedPath = null;
    cachedLuma = null;
    return null;
  }
  // 壁纸未切换：直接复用缓存的亮度
  if (path === cachedPath) return cachedLuma;

  // 壁纸切换了：重新解码计算
  cachedPath = path;
  cachedLuma = computeWallpaperLuma(path);
  return cachedLuma;
}
