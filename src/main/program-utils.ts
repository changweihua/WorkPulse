/**
 * 自定义程序工具（径向菜单 / Touch Bar 共用）
 * - resolveLnkTargetPath：解析 .lnk 的 TargetPath
 * - resolveLnkIconSource：解析 .lnk 图标源路径
 * - getFileIconBase64：获取文件图标 base64 data URL
 * - launchProgramPath：启动程序（.lnk 先解析 TargetPath）
 */
import { app, shell } from 'electron';
import log from 'electron-log/main';

/** 解析 .lnk 快捷方式的 TargetPath（用于启动） */
export async function resolveLnkTargetPath(lnkPath: string): Promise<string | null> {
  try {
    const { execFile } = require('child_process') as typeof import('child_process');
    const ps = `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnkPath.replace(/'/g, "''")}')\nWrite-Output $s.TargetPath`;
    return await new Promise<string | null>((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-Command', ps],
        { timeout: 5000 },
        (err, stdout) => {
          if (err || !stdout) {
            resolve(null);
            return;
          }
          const target = stdout.trim();
          resolve(target || null);
        },
      );
    });
  } catch {
    return null;
  }
}

/** 解析 .lnk 快捷方式的图标源路径（IconLocation，否则 TargetPath） */
export async function resolveLnkIconSource(lnkPath: string): Promise<string | null> {
  try {
    const { execFile } = require('child_process') as typeof import('child_process');
    const ps = [
      `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnkPath.replace(/'/g, "''")}')`,
      `$i = $s.IconLocation`,
      `$t = $s.TargetPath`,
      `# IconLocation 格式: "path,index" 或 "path," 或 ",index" 或空`,
      `if ($i) { $parts = $i -split ','; if ($parts[0] -ne '') { Write-Output $parts[0]; exit } }`,
      `if ($t) { Write-Output $t; exit }`,
      `Write-Output ''`,
    ].join('\n');
    return await new Promise<string | null>((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-Command', ps],
        { timeout: 5000 },
        (err, stdout) => {
          if (err || !stdout) {
            resolve(null);
            return;
          }
          const result = stdout.trim();
          resolve(result || null);
        },
      );
    });
  } catch {
    return null;
  }
}

/** 获取文件图标 base64 data URL（.lnk 用 extract-file-icon，其余 app.getFileIcon） */
export async function getFileIconBase64(filePath: string): Promise<string | null> {
  try {
    if (filePath.toLowerCase().endsWith('.lnk')) {
      const extractIcon = require('extract-file-icon');
      const buffer: Buffer = extractIcon(filePath, 64) as Buffer;
      if (buffer && buffer.length > 0) {
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }
    }
    const icon = await app.getFileIcon(filePath, { size: 'normal' });
    const buffer = icon.toPNG();
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (err) {
    log.error('[program-utils] Failed to get file icon:', err);
    return null;
  }
}

/** 启动程序（.lnk 先解析 TargetPath 再打开） */
export async function launchProgramPath(programPath: string): Promise<void> {
  let launchPath = programPath;
  if (programPath.toLowerCase().endsWith('.lnk')) {
    const target = await resolveLnkTargetPath(programPath);
    if (target) launchPath = target;
  }
  await shell.openPath(launchPath);
}
