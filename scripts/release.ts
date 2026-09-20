/**
 * 一键发布脚本
 * 自动完成：版本更新 → 文件同步 → 提交 → 打 tag → 推送
 *
 * 用法：
 *   npx tsx scripts/release.ts          # 自动递增 patch 版本
 *   npx tsx scripts/release.ts 0.4.0    # 指定版本号
 *   npx tsx scripts/release.ts minor    # 递增 minor 版本
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const PKG_PATH = join(ROOT, 'package.json');
const ENV_PATH = join(ROOT, '.env');
const SPLASH_PATH = join(ROOT, 'resources', 'splash.html');
const TMP_MSG = join(tmpdir(), 'OPENSECODE_COMMIT_MSG');

// ─── 工具函数 ───────────────────────────────────────────
function run(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function runLive(cmd: string): void {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function replaceInFile(filePath: string, pattern: RegExp, replacement: string): void {
  let content = readFileSync(filePath, 'utf-8');
  if (!pattern.test(content)) {
    console.warn(`  ⚠ 未找到匹配: ${filePath}`);
    return;
  }
  content = content.replace(pattern, replacement);
  writeFileSync(filePath, content, 'utf-8');
}

function incrementVersion(current: string, type: 'major' | 'minor' | 'patch'): string {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

function parseVersionArg(arg: string): 'major' | 'minor' | 'patch' | string {
  if (['major', 'minor', 'patch'].includes(arg)) return arg;
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  console.error(`无效版本参数: "${arg}"`);
  console.error('用法: npx tsx scripts/release.ts [patch|minor|major|X.Y.Z]');
  process.exit(1);
}

// ─── 主流程 ─────────────────────────────────────────────
function main(): void {
  // 1. 读取当前版本
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));
  const currentVersion: string = pkg.version;
  console.log(`\n📦 当前版本: v${currentVersion}\n`);

  // 2. 计算新版本
  const arg = process.argv[2] || 'patch';
  const newVersion = parseVersionArg(arg);
  const targetVersion =
    typeof newVersion === 'string' && ['major', 'minor', 'patch'].includes(newVersion)
      ? incrementVersion(currentVersion, newVersion as 'major' | 'minor' | 'patch')
      : (newVersion as string);

  console.log(`🎯 目标版本: v${targetVersion}\n`);

  // 3. 更新 package.json
  pkg.version = targetVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  console.log('  ✅ package.json');

  // 4. 运行 npm install 更新 lock file
  console.log('  ⏳ 更新 package-lock.json...');
  runLive('npm install --ignore-scripts --legacy-peer-deps');
  console.log('  ✅ package-lock.json');

  // 5. 同步版本到其他文件
  console.log('\n📁 同步版本号...');
  replaceInFile(ENV_PATH, /^VITE_APP_VERSION=.*/m, `VITE_APP_VERSION=${targetVersion}`);
  console.log('  ✅ .env');

  replaceInFile(
    SPLASH_PATH,
    /const\s+version\s*=\s*env\.APP_VERSION\s*\|\|\s*'[\d.]+'/,
    `const version = env.APP_VERSION || '${targetVersion}'`,
  );
  console.log('  ✅ resources/splash.html');

  // 6. 暂存所有版本文件
  console.log('\n📝 暂存文件...');
  run('git add package.json package-lock.json .env resources/splash.html');
  console.log('  ✅ 已暂存 package.json, package-lock.json, .env, resources/splash.html');

  // 7. 提交（使用 Node.js 写入临时文件避免 Windows 编码问题）
  console.log('\n💾 提交...');
  const commitMsg = `🐳 chore: release v${targetVersion}`;
  writeFileSync(TMP_MSG, commitMsg, 'utf-8');
  runLive(`git commit -F "${TMP_MSG}"`);
  console.log(`  ✅ ${commitMsg}`);

  // 8. 创建 tag
  console.log('\n🏷️  创建 tag...');
  run(`git tag v${targetVersion}`);
  console.log(`  ✅ v${targetVersion}`);

  // 9. 推送
  console.log('\n🚀 推送...');
  runLive('git push');
  runLive('git push --tags');

  // 10. 完成
  console.log(`\n🎉 v${targetVersion} 发布完成！`);
  console.log('📌 GitHub Actions 将自动触发构建\n');
}

main();
