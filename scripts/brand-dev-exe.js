// scripts/brand-dev-exe.js
// 用 rcedit 把自定义图标写入 dev 模式的 electron.exe
// 每次 npm install 后自动运行（通过 postinstall hook）
// 如果 electron 正在运行，会跳过（需手动关闭后运行）
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { execSync } = require('node:child_process');

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

// 检查 electron 是否在运行
let isRunning = false;
try {
  const out = execSync('tasklist /FI "IMAGENAME eq electron.exe" /NH', {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  isRunning = out.includes('electron.exe');
} catch {
  // tasklist 命令失败，假设没运行
}

if (isRunning) {
  console.log('⚠️  Electron 正在运行 —— 请先关闭它，再执行：node scripts/brand-dev-exe.js');
  console.log('   （本次跳过图标植入，npm install 照常继续）');
  process.exit(0);
}

try {
  const { rcedit } = require('rcedit');
  rcedit(electronExe, { icon: iconPath })
    .then(() => console.log('✅ 已为开发版 electron.exe 植入自定义图标'))
    .catch((e) => {
      console.error('⚠️  rcedit 执行失败:', e.message);
    });
} catch (e) {
  console.error('⚠️  rcedit 执行失败:', e.message);
}
