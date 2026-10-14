#!/usr/bin/env node
/**
 * 玻璃预算门控审计（CI 静态扫描，无第三方依赖）
 *
 * 用途：扫描 src/renderer 下的 .tsx / .css，找出所有 backdrop-filter 声明，
 * 用保守估算读取量与每帧预算比对，命中违规规则则 exit 1。
 *
 * 违规规则（命中任一 → exit 1）：
 *   1. 单处估算读取量 > FRAME_READ_BUDGET
 *   2. 单个声明里 blur 出现次数 > 1
 *   3. blur 半径 > 24px
 * 警告规则（只打印，不失败）：
 *   4. 滤镜函数个数 > 2
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// ===== 硬约束常量（来自项目 spec，不要改） =====
const FRAME_READ_BUDGET = 3_000_000; // 设备像素/帧 @DPR2
const DPR2_PIXELS = 4; // DPR2 → 面积 ×4
const MAX_BLUR_RADIUS = 24; // px
const MAX_BLUR_PER_DECL = 1; // 单个声明里 blur 最多 1 次
const FUNC_WARN_THRESHOLD = 2; // 函数个数 > 2 只警告

// ===== 估算参数（保守假设，报告中一律标注「估算」） =====
const EST_BOX_WIDTH = 1440; // px
const EST_BOX_HEIGHT = 64; // px

const SCAN_ROOT = join(process.cwd(), 'src', 'renderer');
const SCAN_EXT = new Set(['.tsx', '.css']);

// 滤镜函数白名单（计函数个数用）
const FILTER_FUNCS = [
  'blur',
  'saturate',
  'brightness',
  'contrast',
  'sepia',
  'hue-rotate',
  'invert',
  'grayscale',
  'opacity',
  'drop-shadow',
];
const FUNC_RE = new RegExp(`(?:${FILTER_FUNCS.join('|')})\\s*\\(`, 'g');
const BLUR_RE = /blur\s*\(\s*([\d.]+)\s*([a-z%]*)\s*\)/gi;

/** 递归收集待扫描文件 */
function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      collectFiles(p, out);
    } else if (SCAN_EXT.has(extName(e.name))) {
      out.push(p);
    }
  }
  return out;
}

function extName(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i);
}

/** 把声明值里的单位折算成 px 保守估算（rem/em 按 16px） */
function toPx(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const u = (unit || '').toLowerCase();
  if (u === '' || u === 'px') return n;
  if (u === 'rem' || u === 'em') return n * 16;
  return n; // 其他单位按数值直取，报告已标注估算
}

/**
 * 扫描单个文件，返回该文件内所有 backdrop-filter 声明。
 * -webkit- 与标准属性值完全相同且紧邻时视为同一处，不重复计数。
 */
function scanFile(file, rows) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let skippedWebkit = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 只取注释外的声明：先粗暴剔除 /* */ 单行注释片段
    const code = line.replace(/\/\*.*?\*\//g, '');
    const re = /(-webkit-)?backdrop(?:-filter|Filter)\s*[:=]\s*/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const isWebkit = Boolean(m[1]);
      let value = code.slice(m.index + m[0].length).trim();
      // 值取到行尾，去掉收尾的 ; , } 与包裹引号
      value = value
        .replace(/[;,}]+$/, '')
        .replace(/^['"`]|['"`]$/g, '')
        .trim();
      // 空值（值换行书写）→ 向下最多补 3 行
      for (let k = 0; k < 3 && value === '' && i + 1 + k < lines.length; k++) {
        const next = lines[i + 1 + k].replace(/\/\*.*?\*\//g, '').trim();
        if (!next) continue;
        value = next
          .replace(/[;,}]+$/, '')
          .replace(/^['"`]|['"`]$/g, '')
          .trim();
      }

      const prev = rows[rows.length - 1];
      if (isWebkit && prev && prev.file === file && prev.line === i && prev.value === value) {
        skippedWebkit++; // 与上一行标准属性完全相同 → 同一处
        continue;
      }

      rows.push({
        file,
        line: i + 1,
        value,
        webkitOnly: isWebkit,
      });
    }
  }
  return skippedWebkit;
}

/** 解析一处声明：radius（取最大）、blur 次数、函数个数、估算读取量 */
function analyze(row) {
  const { value } = row;
  let radius = 0;
  let blurCount = 0;
  let blurMaxText = null;

  let b;
  BLUR_RE.lastIndex = 0;
  while ((b = BLUR_RE.exec(value)) !== null) {
    blurCount++;
    const px = toPx(b[1], b[2]);
    if (blurMaxText === null || px > radius) {
      radius = px;
      blurMaxText = `${b[1]}${b[2] || 'px'}`;
    }
  }

  const none = /\bnone\b/.test(value);
  const funcCount = none ? 0 : (value.match(FUNC_RE) || []).length;

  // 读取量 = (w + 6r) × (h + 6r) × 函数个数 × 4（DPR2 平方）
  const read =
    (EST_BOX_WIDTH + 6 * radius) * (EST_BOX_HEIGHT + 6 * radius) * funcCount * DPR2_PIXELS;

  const violations = [];
  if (read > FRAME_READ_BUDGET) violations.push('超预算');
  if (blurCount > MAX_BLUR_PER_DECL) violations.push(`blur×${blurCount}>1`);
  if (radius > MAX_BLUR_RADIUS) violations.push(`radius ${radius}px>24px`);

  return {
    ...row,
    none,
    radius,
    blurCount,
    blurText: none ? 'none' : (blurMaxText ?? '-'),
    funcCount,
    read: Math.round(read),
    violations,
    warn: funcCount > FUNC_WARN_THRESHOLD,
  };
}

function fmt(n) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ===== 主流程 =====
const files = collectFiles(SCAN_ROOT);
const rawRows = [];
let webkitSkipped = 0;
for (const f of files) webkitSkipped += scanFile(f, rawRows);

const rows = rawRows.map(analyze);
rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

const violations = rows.filter((r) => r.violations.length > 0);
const warns = rows.filter((r) => r.warn);

console.log('玻璃预算门控审计');
console.log(`扫描目录：${relative(process.cwd(), SCAN_ROOT)}（${files.length} 个 .tsx/.css 文件）`);
console.log(
  `预算：${fmt(FRAME_READ_BUDGET)} 设备像素/帧 @DPR2 ｜ 估算盒子：${EST_BOX_WIDTH}×${EST_BOX_HEIGHT}px（估算）× 函数个数 × ${DPR2_PIXELS}`,
);
console.log(`读取量 = (w + 6r) × (h + 6r) × 函数个数 × 4，半径 r 取声明内最大 blur（估算）`);
console.log('-'.repeat(96));

if (rows.length === 0) {
  console.log('未发现任何 backdrop-filter 声明。');
}

for (const r of rows) {
  const tag = r.violations.length ? '✘违规' : r.warn ? '⚠警告' : '✔通过';
  const rel = `${relative(process.cwd(), r.file)}:${r.line}`;
  const parts = [
    tag,
    rel,
    `radius=${r.blurText}`,
    `函数=${r.funcCount}`,
    `估算读取量=${fmt(r.read)}`,
    `超预算=${r.read > FRAME_READ_BUDGET ? '是' : '否'}`,
  ];
  if (r.violations.length) parts.push(`原因=[${r.violations.join('、')}]`);
  if (r.warn && !r.violations.length) parts.push('原因=[函数个数>2]');
  console.log(parts.join('  '));
}

console.log('-'.repeat(96));
console.log(
  `汇总：共 ${rows.length} 处声明（已合并 -webkit- 重复行 ${webkitSkipped} 行），违规 ${violations.length} 处，警告 ${warns.length} 处。`,
);
if (violations.length > 0) {
  console.log(`判定：失败 — ${violations.length} 处命中违规规则。`);
} else {
  console.log('判定：通过 — 无违规。');
}

process.exit(violations.length > 0 ? 1 : 0);
