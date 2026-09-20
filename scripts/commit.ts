/**
 * AI Agent 提交脚本
 * 接收 type 和 subject，自动匹配 emoji 并提交
 *
 * 用法：
 *   npx tsx scripts/commit.ts fix "add legacy-peer-deps to resolve peer conflict"
 *   npx tsx scripts/commit.ts feat "add idle chart component"
 */
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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

const type = process.argv[2];
const subject = process.argv[3];

if (!type || !subject) {
  console.error('用法: npx tsx scripts/commit.ts <type> "<subject>"');
  console.error(`可用 type: ${Object.keys(TYPE_EMOJI_MAP).join(', ')}`);
  process.exit(1);
}

const emoji = TYPE_EMOJI_MAP[type];
if (!emoji) {
  console.error(`未知 type: "${type}"`);
  console.error(`可用 type: ${Object.keys(TYPE_EMOJI_MAP).join(', ')}`);
  process.exit(1);
}

const commitMsg = `${emoji} ${type}: ${subject}`;

// 写入临时文件（UTF-8 无 BOM），避免 shell 编码问题
const tmpFile = join(tmpdir(), 'OPENSECODE_COMMIT_MSG');
writeFileSync(tmpFile, commitMsg, 'utf-8');

// 执行提交
try {
  execSync(`git commit -F "${tmpFile}"`, { stdio: 'inherit' });
} catch {
  process.exit(1);
}
