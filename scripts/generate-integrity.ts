/**
 * generate-integrity.ts
 *
 * 构建后脚本：读取刚构建的 `app.asar`，计算其 SHA-256 哈希，
 * 并写入 `dist/integrity.txt`。
 *
 * 用法（由 `npm run postbuild` 自动调用）：
 *   npx tsx scripts/generate-integrity.ts
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const ASAR_PATH = join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');
const OUT_DIR = join(ROOT, 'dist');
const OUT_FILE = join(OUT_DIR, 'integrity.txt');

function main(): void {
  if (!existsSync(ASAR_PATH)) {
    console.warn(`[integrity] 未找到 app.asar：${ASAR_PATH} — 跳过`);
    process.exit(0);
  }

  const data = readFileSync(ASAR_PATH);
  const hash = createHash('sha256').update(data).digest('hex');

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, hash, 'utf-8');

  console.log(`[integrity] SHA-256 已写入 ${OUT_FILE}`);
  console.log(`[integrity] 哈希值：${hash}`);
}

main();
