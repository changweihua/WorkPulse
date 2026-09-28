// scripts/brand-dev-exe.js
// 用 rcedit 把自定义图标写入 dev 模式的 electron.exe
// 每次 npm install 后自动运行（通过 postinstall hook）
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const root = join(__dirname, '..');
const iconPath = join(root, 'resources', 'icon.ico');
const electronExe = join(root, 'node_modules', 'electron', 'dist', 'electron.exe');

if (!existsSync(iconPath)) {
  console.log('⚠️  未找到 icon.ico，跳过图标植入');
  process.exit(0);
}

if (!existsSync(electronExe)) {
  console.log('⚠️  未找到 electron.exe，跳过图标植入');
  process.exit(0);
}

try {
  // 动态 import rcedit（npm 包）
  const { default: rcedit } = await import('rcedit');
  await rcedit(electronExe, { icon: iconPath });
  console.log('✅ 已为开发版 electron.exe 植入自定义图标');
} catch (e) {
  console.error('⚠️  rcedit 执行失败:', e.message);
  // 不阻断 npm install
}
