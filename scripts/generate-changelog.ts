/**
 * generate-changelog.ts
 *
 * Pre-commit hook: auto-generate CHANGELOG entries from git log.
 * Collects all non-release, non-merge commits since the last tag
 * and prepends them to CHANGELOG.md under [未发布].
 *
 * Usage:
 *   npx tsx scripts/generate-changelog.ts
 */
import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const CHANGELOG_PATH = resolve(__dirname, '..', 'CHANGELOG.md')

// Subject translation: English commit subjects → Chinese changelog entries
const SUBJECT_MAP: Record<string, string> = {
  'add mermaid diagram rendering to markdown': 'Markdown 渲染支持 Mermaid 图表',
  'add github-style markdown renderer and rss error handling': 'GitHub 风格 Markdown 渲染与 RSS 错误提示',
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
}

// Emoji to category mapping
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
}

// Skip release commits, merge commits, WIP, and plain "优化/更新"
function shouldSkip(message: string): boolean {
  if (/^🐳 chore: release/i.test(message)) return true
  if (/^Merge /i.test(message)) return true
  if (/^WIP /i.test(message)) return true
  if (/^[0-9]+$/.test(message.trim())) return true
  if (/^[A-Z][a-z]+ \d+/.test(message) && !message.includes(':')) return true // "Bump release version..."
  if (/优化|更新|手动同步/.test(message) && !message.includes(':')) return true
  if (/升级依赖|引入新的/.test(message) && !message.includes(':')) return true
  return false
}

function parseCommit(line: string): { hash: string; date: string; emoji: string; type: string; subject: string } | null {
  const match = line.match(/^([a-f0-9]+)\s+(\d{4}-\d{2}-\d{2})\s+(.+)/)
  if (!match) return null

  const [, hash, date, rest] = match
  const emojiMatch = rest.match(/^([\p{Emoji}])\s+(\w+):\s*(.+)/u)
  if (!emojiMatch) return null

  const [, emoji, rawType, subject] = emojiMatch
  const category = TYPE_MAP[emoji] || rawType
  return { hash, date, emoji, type: category, subject: subject.trim() }
}

function generate(): void {
  let lastTag: string
  try {
    lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim()
  } catch {
    // No tags yet — get all commits
    lastTag = ''
  }

  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
  const log = execSync(
    `git log ${range} --oneline --format="%h %ad %s" --date=short --no-merges`,
    { encoding: 'utf-8' }
  ).trim()

  if (!log) {
    console.log('No new commits to add to CHANGELOG.')
    return
  }

  const lines = log.split('\n').filter(Boolean)
  const entries: { emoji: string; type: string; subject: string }[] = []

  for (const line of lines) {
    if (shouldSkip(line)) continue
    const parsed = parseCommit(line)
    if (parsed) {
      entries.push({ emoji: parsed.emoji, type: parsed.type, subject: parsed.subject })
    }
  }

  if (entries.length === 0) {
    console.log('No meaningful commits to add to CHANGELOG.')
    return
  }

  // Group by category
  const grouped: Record<string, string[]> = {}
  for (const entry of entries) {
    const cat = entry.type
    if (!grouped[cat]) grouped[cat] = []
    const translated = SUBJECT_MAP[entry.subject] || entry.subject
    grouped[cat].push(`- ${translated}`)
  }

  // Build new [未发布] block
  const categoryOrder = ['新增', '修复', '变更', '性能', '文档']
  let block = `## [未发布]\n`
  for (const cat of categoryOrder) {
    if (grouped[cat]?.length) {
      block += `\n### ${cat}\n`
      block += grouped[cat].join('\n') + '\n'
    }
  }
  // Any remaining categories
  for (const [cat, items] of Object.entries(grouped)) {
    if (!categoryOrder.includes(cat)) {
      block += `\n### ${cat}\n`
      block += items.join('\n') + '\n'
    }
  }

  // Read existing CHANGELOG
  let changelog: string
  try {
    changelog = readFileSync(CHANGELOG_PATH, 'utf-8')
  } catch {
    changelog = '# 更新日志\n\n格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。\n'
  }

  // Replace or insert [未发布] section
  const unreleasedPattern = /^## \[未发布\][\s\S]*?(?=\n## \[|\n# |\z)/m
  if (unreleasedPattern.test(changelog)) {
    changelog = changelog.replace(unreleasedPattern, block.trimEnd())
  } else {
    // Insert after header
    const headerEnd = changelog.indexOf('\n## [')
    if (headerEnd === -1) {
      changelog += '\n\n' + block
    } else {
      changelog = changelog.slice(0, headerEnd) + '\n\n' + block + '\n' + changelog.slice(headerEnd)
    }
  }

  writeFileSync(CHANGELOG_PATH, changelog, 'utf-8')
  console.log(`CHANGELOG.md updated with ${entries.length} entries from ${lastTag || 'initial'} to HEAD.`)
}

generate()
