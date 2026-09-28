import { createHash } from 'crypto';
// 必须用 original-fs（Electron 注入的未打 asar 补丁的原生 fs）：
// 普通 fs 会把以 .asar 结尾的路径当作归档内部路径解析，
// 直接读 .../app.asar 本身会抛「ENOENT, <空> not found in ...app.asar」。
// 类型声明来自 Electron 自带的 electron.d.ts（declare module 'original-fs'），无需额外处理。
import { readFileSync, writeFileSync, existsSync } from 'original-fs';
import { join } from 'path';
import { app, dialog } from 'electron';
import log from 'electron-log/main';

/**
 * 启动时校验打包产物 app.asar 的完整性（检测运行文件是否被篡改）。
 *
 * 基准记录存储在 `app.getPath('userData')/app.integrity`，JSON 格式：
 *   { "version": "<app.getVersion()>", "buildId": "<构建期注入的 __BUILD_ID__>", "hash": "<app.asar 的 SHA-256>" }
 * 兼容旧格式：旧版 JSON 无 buildId 字段、更早版本只存纯哈希文本（两者均按「无构建 ID」处理）。
 *
 * 流程：
 *  1. dev 模式（!app.isPackaged）静默跳过。
 *  2. 用 original-fs 读取 app.asar，计算当前 SHA-256。
 *  3. 读取存储的基准记录并按以下顺序判定：
 *     - 无记录（首次运行 / 记录被清除）→ 写入「当前版本 + 当前构建 ID + 当前哈希」，info 日志。
 *     - 记录的 buildId 与当前 __BUILD_ID__ 不一致 → 源码改动后重新构建（每次构建都会生成
 *       新的构建 ID），视为重新构建/升级，刷新基准记录，info 日志，不弹窗。
 *     - 记录无 buildId（旧格式）或存储版本 ≠ 当前 app.getVersion() → 同样视为升级/重装，
 *       刷新基准记录，info 日志，不弹窗。
 *     - buildId 与版本均一致但哈希不同 → 才判定为篡改，error 日志 + 非阻塞中文警告弹窗
 *       （应用继续运行）。
 *     - 三者均一致 → 校验通过，info 日志。
 *
 * 说明：
 *  - 本机制只信任本地 userData 里的基准记录，不读取构建期产物
 *    （如 scripts/generate-integrity.ts 写出的 dist/integrity.txt）——安装包内文件
 *    不随运行环境分发，因此以「构建 ID/版本变动 = 重新构建或升级、同一次构建产物
 *    哈希变动 = 篡改」区分语义。
 *  - 基准记录存在 userData（用户可写目录）里，攻击者可同时改写 app.asar 与该记录，
 *    因此只能防「有限对抗」（误改/半吊子篡改），防不住能写 userData 的强对抗攻击者。
 */

/** userData 中的完整性基准记录 */
interface IntegrityRecord {
  /** 记录时的应用版本（app.getVersion()）；旧版文件无此字段时为空串 */
  version: string;
  /** 记录时的构建 ID（构建期注入的 __BUILD_ID__）；旧格式记录无此字段时为空串 */
  buildId: string;
  /** 记录时 app.asar 的 SHA-256 十六进制哈希 */
  hash: string;
}

/**
 * 读取构建期注入的构建 ID。
 * define 未生效的异常场景下取不到该变量，用 typeof 兜底返回空串
 * （随后按「无构建 ID」路径刷新基准，不会抛错）。
 */
function getBuildId(): string {
  return typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '';
}

/** 将基准记录写入 userData */
function writeStoredRecord(hashFile: string, record: IntegrityRecord): void {
  writeFileSync(hashFile, JSON.stringify(record, null, 2), 'utf-8');
}

/**
 * 读取基准记录。
 * - 文件不存在或内容为空 → null
 * - JSON 格式（新版）→ 解析出 version + buildId + hash（缺失字段补空串）
 * - 非 JSON（旧版纯哈希文本）→ 返回 version/buildId 均为空串的记录，由调用方按「无构建 ID」刷新
 */
function readStoredRecord(hashFile: string): IntegrityRecord | null {
  if (!existsSync(hashFile)) return null;
  const raw = readFileSync(hashFile, 'utf-8').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<IntegrityRecord>;
    if (typeof parsed.hash === 'string' && parsed.hash.length > 0) {
      return {
        version: typeof parsed.version === 'string' ? parsed.version : '',
        buildId: typeof parsed.buildId === 'string' ? parsed.buildId : '',
        hash: parsed.hash,
      };
    }
    return null;
  } catch {
    // 旧版文件内容就是纯哈希，JSON 解析失败时原样返回（version/buildId 留空）
    return { version: '', buildId: '', hash: raw };
  }
}

export function verifyIntegrity(): void {
  try {
    // dev 模式下没有 app.asar —— 静默跳过
    if (!app.isPackaged) {
      log.info('[Integrity] Development mode — skipping check');
      return;
    }

    const asarPath = join(process.resourcesPath, 'app.asar');

    // 存在性判断同样必须走 original-fs（patched existsSync 对该路径返回 true 才没走到 skip 分支）
    if (!existsSync(asarPath)) {
      log.warn('[Integrity] app.asar not found, skipping check');
      return;
    }

    // --- 计算当前哈希（用 original-fs 直读归档文件本体） ---
    const data = readFileSync(asarPath);
    const currentHash = createHash('sha256').update(data).digest('hex');
    const currentVersion = app.getVersion();
    const currentBuildId = getBuildId();

    const hashFile = join(app.getPath('userData'), 'app.integrity');
    const stored = readStoredRecord(hashFile);

    // 无记录 → 首次运行（或记录被清除），直接建立基准
    if (!stored) {
      writeStoredRecord(hashFile, {
        version: currentVersion,
        buildId: currentBuildId,
        hash: currentHash,
      });
      log.info(
        `[Integrity] Initial hash stored: ${currentHash.slice(0, 16)}… (v${currentVersion}, build ${currentBuildId || '无'})`,
      );
      return;
    }

    // 构建 ID 变化（每次构建都会生成新的 __BUILD_ID__，源码改动后重新打包必然命中）
    // 或版本变化（升级/重装/降级）或记录无 buildId（旧格式）→ 刷新基准，不弹警告
    const buildIdChanged = stored.buildId !== currentBuildId;
    const versionChanged = stored.version !== currentVersion;
    if (buildIdChanged || versionChanged) {
      if (buildIdChanged) {
        log.info(
          `[Integrity] 构建 ID 变化（${stored.buildId || '无'} → ${currentBuildId || '无'}）— 视为重新构建/升级，刷新基准哈希`,
        );
      } else {
        log.info(
          `[Integrity] Version changed (${stored.version || '未知'} → ${currentVersion}) — 视为升级/重装，刷新基准哈希`,
        );
      }
      writeStoredRecord(hashFile, {
        version: currentVersion,
        buildId: currentBuildId,
        hash: currentHash,
      });
      log.info(
        `[Integrity] Initial hash stored: ${currentHash.slice(0, 16)}… (v${currentVersion}, build ${currentBuildId || '无'})`,
      );
      return;
    }

    // 构建 ID 与版本均一致 → 同一次构建产物，才进入篡改判定
    if (stored.hash !== currentHash) {
      log.error('[Integrity] Hash mismatch — app may be tampered with');
      log.error(`[Integrity] Expected : ${stored.hash}`);
      log.error(`[Integrity] Actual   : ${currentHash}`);

      // 非阻塞警告 —— 应用继续运行
      // 改为异步弹窗：不阻塞启动关键路径（主进程不再同步冻结等待用户点击），日志与语义不变
      void dialog
        .showMessageBox({
          type: 'warning',
          title: '安全警告',
          message: '应用完整性校验失败，文件可能被篡改。',
          detail: `Expected: ${stored.hash.slice(0, 16)}…\nGot:      ${currentHash.slice(0, 16)}…`,
        })
        .catch((err) => {
          log.error('[Integrity] 警告弹窗显示失败:', err);
        });
    } else {
      log.info('[Integrity] Hash verified OK');
    }
  } catch (error) {
    log.error('[Integrity] Check failed:', error);
  }
}
