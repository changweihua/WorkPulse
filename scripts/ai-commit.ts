/**
 * AI Agent 提交辅助脚本
 * 读取 staged diff，自动生成符合 AGENTS.md 规范的 commit message 建议
 *
 * 用法：
 *   npx tsx scripts/ai-commit.ts          # 读取 staged diff
 *   npx tsx scripts/ai-commit.ts HEAD~1   # 指定 base commit
 */
import { execSync } from 'child_process';

// Emoji ↔ type 对照表（必须与 AGENTS.md 一致）
const TYPE_EMOJI_MAP: Record<string, string> = {
  init: '🎉',
  feat: '✨',
  fix: '🐞',
  docs: '📃',
  style: '🌈',
  refactor: '🦄',
  perf: '🎈',
  test: '🧪',
  build: '🔧',
  ci: '🐎',
  chore: '🐳',
  revert: '↩',
  security: '🔒',
  deps: '📦',
  remove: '🗑️',
};

// 文件路径 → type 推断规则
const FILE_RULES: Array<{ pattern: RegExp; type: string }> = [
  // 测试文件
  { pattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/, type: 'test' },
  // 文档
  { pattern: /\.(md|mdx)$/, type: 'docs' },
  { pattern: /^docs?\//, type: 'docs' },
  // 配置文件
  {
    pattern: /^(package|tsconfig|oxlint|oxfmt|prettier|commitlint|vite|electron-builder)\b/,
    type: 'build',
  },
  { pattern: /^(\.husky|\.github|\.gitlab-ci)/, type: 'ci' },
  { pattern: /^(scripts|tools)\//, type: 'build' },
  // 样式
  { pattern: /\.(css|scss|less|styl)$/, type: 'style' },
  // CI/CD
  { pattern: /^\.github\//, type: 'ci' },
];

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function getStagedDiff(base?: string): { files: string[]; diff: string; stat: string } {
  const range = base ? `${base}..HEAD` : '--cached';
  const files = run(`git diff ${range} --name-only`).split('\n').filter(Boolean);
  const diff = run(`git diff ${range} --stat`);
  const stat = run(`git diff ${range} --numstat`);
  return { files, diff, stat };
}

function inferType(files: string[]): string {
  const typeCounts: Record<string, number> = {};

  for (const file of files) {
    let inferred = 'chore'; // 默认
    for (const rule of FILE_RULES) {
      if (rule.pattern.test(file)) {
        inferred = rule.type;
        break;
      }
    }
    typeCounts[inferred] = (typeCounts[inferred] || 0) + 1;
  }

  // 按数量排序，取最多的
  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'chore';
}

function inferScope(files: string[]): string | null {
  const scopeCounts: Record<string, number> = {};

  for (const file of files) {
    if (file.startsWith('src/main/')) scopeCounts['main'] = (scopeCounts['main'] || 0) + 1;
    else if (file.startsWith('src/renderer/'))
      scopeCounts['renderer'] = (scopeCounts['renderer'] || 0) + 1;
    else if (file.startsWith('src/preload/'))
      scopeCounts['preload'] = (scopeCounts['preload'] || 0) + 1;
    else if (file.startsWith('src/shared/'))
      scopeCounts['shared'] = (scopeCounts['shared'] || 0) + 1;
    else if (file.startsWith('scripts/'))
      scopeCounts['scripts'] = (scopeCounts['scripts'] || 0) + 1;
  }

  const sorted = Object.entries(scopeCounts).sort((a, b) => b[1] - a[1]);
  // 如果某个 scope 占比超过 70%，使用它；否则不加 scope
  if (sorted.length === 1) return sorted[0][0];
  if (sorted.length > 1 && sorted[0][1] > files.length * 0.7) return sorted[0][0];
  return null;
}

function inferSubject(files: string[], type: string): string {
  // 基于文件变更推断 subject
  const dirChanges: Record<string, number> = {};
  for (const file of files) {
    const parts = file.split('/');
    // 取前两层目录
    const dir = parts.slice(0, Math.min(3, parts.length)).join('/');
    dirChanges[dir] = (dirChanges[dir] || 0) + 1;
  }

  const topDir = Object.entries(dirChanges).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  // 根据 type 和主要变更目录生成 subject
  const subjectMap: Record<string, (dir: string) => string> = {
    feat: (dir) => `add ${dir.split('/').pop()} feature`,
    fix: (dir) => `resolve ${dir.split('/').pop()} issue`,
    docs: () => 'update documentation',
    style: (dir) => `adjust ${dir.split('/').pop()} styles`,
    refactor: (dir) => `refactor ${dir.split('/').pop()} module`,
    perf: () => 'optimize performance',
    test: () => 'add tests',
    build: (dir) => `update ${dir.split('/').pop()} configuration`,
    ci: () => 'update CI/CD pipeline',
    chore: () => 'update dependencies',
    revert: () => 'revert changes',
    init: () => 'initialize project',
  };

  return (subjectMap[type] || subjectMap.chore)(topDir);
}

function main(): void {
  const base = process.argv[2];
  const { files, diff, stat } = getStagedDiff(base);

  if (files.length === 0) {
    console.log('⚠️  没有 staged 的变更。请先 git add 要提交的文件。');
    process.exit(0);
  }

  const type = inferType(files);
  const scope = inferScope(files);
  const subject = inferSubject(files, type);
  const emoji = TYPE_EMOJI_MAP[type] || '🐳';

  // 构建 commit message
  const scopePart = scope ? `(${scope})` : '';
  const commitMsg = `${emoji} ${type}${scopePart}: ${subject}`;

  console.log('\n📋 变更文件：');
  console.log(stat);
  console.log('\n🤖 建议的 commit message：');
  console.log(`   ${commitMsg}`);
  console.log('\n💡 使用方式：');
  console.log(`   git commit -m "${commitMsg}"`);
  console.log('   或 npm run commit 进入交互式提交\n');
}

main();
