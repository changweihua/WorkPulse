/**
 * .NET Bridge 单例访问层（主进程内部）
 *
 * 把「加载 Bridge.dll + 暴露 NativeBridge」从 index.ts 的 IPC 注册里抽出来，
 * 让网络采集（network-status.ts）与 dotnet:invoke IPC 共用同一个 .NET 实例，
 * 避免重复加载（node-api-dotnet 进程内只允许一份运行时）。
 *
 * 语义与原先 index.ts 里的 ensureDotNet 完全一致：
 *   - 幂等：首次调用加载，后续直接复用（含加载失败状态，失败不反复重试刷日志）
 *   - 加载失败不抛异常给调用方：返回 null，由调用方自行降级（网络采集回退 koffi）
 */
import log from 'electron-log/main';
import { loadDotNet } from './asar-dotnet-loader';

/** Bridge.dll 导出对象（保留 any：node-api-dotnet 的动态导出无静态类型） */
export type DotnetLib = Record<string, any>;

let dotnetLib: DotnetLib | null = null;
let dotnetLoaded = false;
/** 进行中的加载 Promise（并发调用复用，避免重复 loadDotNet） */
let loadInFlight: Promise<DotnetLib | null> | null = null;

async function doLoad(): Promise<DotnetLib | null> {
  try {
    const lib = await loadDotNet();
    log.info('✅ .NET 已加载');
    return lib;
  } catch (err) {
    log.error('⚠️ .NET 加载失败', err);
    return null;
  }
}

/**
 * 取得 .NET Bridge 单例；加载失败返回 null（调用方应降级）。
 * 并发安全：多次同时调用共享同一个加载 Promise。
 */
export async function ensureDotNet(): Promise<DotnetLib | null> {
  if (dotnetLoaded) return dotnetLib;
  if (!loadInFlight) {
    loadInFlight = doLoad()
      .then((lib) => {
        dotnetLib = lib;
        return lib;
      })
      .finally(() => {
        dotnetLoaded = true;
        loadInFlight = null;
      });
  }
  return loadInFlight;
}

/** 同步读取已加载的 Bridge（未加载完成返回 null）——供热点路径零等待访问 */
export function peekDotNet(): DotnetLib | null {
  return dotnetLib;
}
