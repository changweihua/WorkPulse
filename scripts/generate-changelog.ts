/**
 * generate-changelog.ts
 *
 * pre-commit 钩子：从 git log 自动生成 CHANGELOG 条目。
 * 收集上个 tag 之后的所有非发布、非合并提交，
 * 并前置插入到 CHANGELOG.md 的 [未发布] 区块中。
 *
 * 用法：
 *   npx tsx scripts/generate-changelog.ts
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const CHANGELOG_PATH = resolve(__dirname, '..', 'CHANGELOG.md');

// Subject 翻译：历史英文 commit subject → 中文变更日志条目（新提交直接就是中文，无需映射）
const SUBJECT_MAP: Record<string, string> = {
  'add mermaid diagram rendering to markdown': 'Markdown 渲染支持 Mermaid 图表',
  'add github-style markdown renderer and rss error handling':
    'GitHub 风格 Markdown 渲染与 RSS 错误提示',
  'add mermaid diagram rendering to article reader': '文章阅读器支持 Mermaid 图表',
  'add code syntax highlighting': '代码语法高亮',
  'add PDF export for RSS article reader': 'RSS 文章导出 PDF',
  'fix changelog language and table auto-width': '修正变更日志语言与表格宽度自适应',
  'fix changelog for v0.3.2': '修正 v0.3.2 变更日志',
  'update changelog for v0.3.2': '更新 v0.3.2 变更日志',
  'add liquid glass effect with WebGL and CSS shimmer': '液态玻璃效果（WebGL + CSS shimmer）',
  'always show radial menu on startup regardless of launch method': '恢复启动时始终显示径向菜单',
  'add complete changelog with pre-commit auto-generation': '自动变更日志生成（pre-commit hook）',
  'use streaming rss parser to handle large feeds': 'RSS 改用 feedsmith DOM 解析修复大订阅源',
  'add chinese subject mapping to changelog generator': '变更日志生成器支持中文翻译映射',
  'fix changelog should include pending commit': '修正变更日志在 commit 前生成',
};

// emoji → 分类映射
const TYPE_MAP: Record<string, string> = {
  '✨': '新增',
  '🐞': '修复',
  '🐛': '修复',
  '🔧': '修复',
  '🦄': '变更',
  '🌈': '变更',
  '🎈': '性能',
  '📃': '文档',
  '🐳': '变更',
  '🐎': '变更',
  '🎉': '变更',
  '↩': '变更',
  '🔒': '安全',
  '📦': '依赖更新',
  '🗑️': '移除',
  '🧪': '测试',
};

// type 名兜底：emoji 缺失时把英文 type 转成中文分类
const TYPE_NAME: Record<string, string> = {
  init: '变更',
  feat: '新增',
  fix: '修复',
  docs: '文档',
  style: '样式',
  refactor: '变更',
  perf: '性能',
  test: '测试',
  build: '构建',
  ci: '变更',
  chore: '变更',
  revert: '变更',
  security: '安全',
  deps: '依赖更新',
  remove: '移除',
};

// 跳过发布提交、合并提交、WIP，以及纯"优化/更新"类信息
function shouldSkip(message: string): boolean {
  if (/^🐳 chore: (release|发布)/i.test(message)) return true;
  if (/^Merge /i.test(message)) return true;
  if (/^WIP /i.test(message)) return true;
  if (/^[0-9]+$/.test(message.trim())) return true;
  if (/^[A-Z][a-z]+ \d+/.test(message) && !message.includes(':')) return true; // "Bump release version..."
  if (/优化|更新|手动同步/.test(message) && !message.includes(':')) return true;
  if (/升级依赖|引入新的/.test(message) && !message.includes(':')) return true;
  return false;
}

function parseCommit(
  line: string,
): { hash: string; date: string; emoji: string; type: string; subject: string } | null {
  const match = line.match(/^([a-f0-9]+)\s+(\d{4}-\d{2}-\d{2})\s+(.+)/);
  if (!match) return null;

  const [, hash, date, rest] = match;
  const emojiMatch = rest.match(/^([\p{Emoji}])\s+(\w+):\s*(.+)/u);
  if (!emojiMatch) return null;

  const [, emoji, rawType, subject] = emojiMatch;
  const category = TYPE_MAP[emoji] || TYPE_NAME[rawType] || rawType;
  return { hash, date, emoji, type: category, subject: subject.trim() };
}

function parsePendingCommit(
  message: string,
): { emoji: string; type: string; subject: string } | null {
  const firstLine = message.split('\n')[0].trim();
  const emojiMatch = firstLine.match(/^([\p{Emoji}])\s+(\w+):\s*(.+)/u);
  if (!emojiMatch) return null;
  const [, emoji, rawType, subject] = emojiMatch;
  const category = TYPE_MAP[emoji] || TYPE_NAME[rawType] || rawType;
  return { emoji, type: category, subject: subject.trim() };
}

function generate(): void {
  let lastTag: string;
  try {
    lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim();
  } catch {
    // 尚无 tag —— 取全部提交
    lastTag = '';
  }

  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const log = execSync(`git log ${range} --oneline --format="%h %ad %s" --date=short --no-merges`, {
    encoding: 'utf-8',
  }).trim();

  if (!log) {
    console.log('没有新增提交，无需更新 CHANGELOG。');
    return;
  }

  const lines = log.split('\n').filter(Boolean);
  const entries: { emoji: string; type: string; subject: string }[] = [];

  for (const line of lines) {
    if (shouldSkip(line)) continue;
    const parsed = parseCommit(line);
    if (parsed) {
      entries.push({ emoji: parsed.emoji, type: parsed.type, subject: parsed.subject });
    }
  }

  // 一并纳入待提交信息（pre-commit 钩子上下文）
  try {
    const commitMsg = readFileSync(
      resolve(__dirname, '..', '.git', 'COMMIT_EDITMSG'),
      'utf-8',
    ).trim();
    if (commitMsg && !shouldSkip(commitMsg)) {
      const parsed = parsePendingCommit(commitMsg);
      if (parsed) {
        entries.push({ emoji: parsed.emoji, type: parsed.type, subject: parsed.subject });
      }
    }
  } catch {
    /* not in pre-commit context */
  }

  if (entries.length === 0) {
    console.log('没有可写入 CHANGELOG 的有效提交。');
    return;
  }

  // 按分类分组（翻译后的 subject 去重）
  const grouped: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const entry of entries) {
    const cat = entry.type;
    const translated = SUBJECT_MAP[entry.subject] || entry.subject;
    if (seen.has(translated)) continue;
    seen.add(translated);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(`- ${translated}`);
  }

  // 构建新的 [未发布] 区块
  const categoryOrder = [
    '新增',
    '修复',
    '变更',
    '性能',
    '文档',
    '依赖更新',
    '样式',
    '移除',
    '安全',
    '测试',
    '构建',
  ];
  let block = `## [未发布]\n`;
  for (const cat of categoryOrder) {
    if (grouped[cat]?.length) {
      block += `\n### ${cat}\n`;
      block += grouped[cat].join('\n') + '\n';
    }
  }
  // 其余未在固定顺序中的分类
  for (const [cat, items] of Object.entries(grouped)) {
    if (!categoryOrder.includes(cat)) {
      block += `\n### ${cat}\n`;
      block += items.join('\n') + '\n';
    }
  }

  // 读取现有 CHANGELOG
  let changelog: string;
  try {
    changelog = readFileSync(CHANGELOG_PATH, 'utf-8');
  } catch {
    changelog =
      '# 更新日志\n\n格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。\n';
  }

  // 替换或插入 [未发布] 区块
  const unreleasedPattern = /^## \[未发布\][\s\S]*?(?=\n## \[|\n# |\z)/m;
  if (unreleasedPattern.test(changelog)) {
    changelog = changelog.replace(unreleasedPattern, block.trimEnd());
  } else {
    // 插入到标题之后
    const headerEnd = changelog.indexOf('\n## [');
    if (headerEnd === -1) {
      changelog += '\n\n' + block;
    } else {
      changelog =
        changelog.slice(0, headerEnd) + '\n\n' + block + '\n' + changelog.slice(headerEnd);
    }
  }

  writeFileSync(CHANGELOG_PATH, changelog, 'utf-8');
  console.log(
    `CHANGELOG.md 已更新，从 ${lastTag || '初始提交'} 到 HEAD 共 ${entries.length} 条记录。`,
  );
}

generate();
