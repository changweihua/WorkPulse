// src/main/model-files.ts
// 模型本地文件夹缓存：从 hf-mirror.com 下载到 userData/models/<modelId>/resolve/main/<file>
// 通过 appmodel:// 自定义协议回放给渲染进程（见 src/main/index.ts 的 protocol.handle）
import { app, net } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

const MIRROR_HOST = 'https://hf-mirror.com'

// ---------- 网络优化配置 ----------
const MAX_CONCURRENT = 3          // 最大并行下载数
const FETCH_TIMEOUT_MS = 30_000   // 单次请求超时 30s
const MAX_RETRIES = 2             // 最大重试次数
const RETRY_DELAY_MS = 1000       // 重试基础延迟

let cachedDir = ''
export function getModelsDir(): string {
  if (!cachedDir) cachedDir = path.join(app.getPath('userData'), 'models')
  return cachedDir
}

/** 本地路径与 HF URL 布局一致：<dir>/<modelId>/resolve/main/<file> */
export function localModelPath(modelId: string, file: string): string {
  return path.join(getModelsDir(), modelId, 'resolve', 'main', ...file.split('/'))
}

export interface ModelDownloadProgress {
  modelId: string
  file: string
  loaded: number
  total: number
  percent: number // -1 = 总大小未知
}

type ProgressSender = ((p: ModelDownloadProgress) => void) | null
let progressSender: ProgressSender = null
export function setModelProgressSender(fn: NonNullable<ProgressSender>): void {
  progressSender = fn
}

async function fileExistsNonEmpty(p: string): Promise<boolean> {
  try {
    const st = await fs.promises.stat(p)
    return st.isFile() && st.size > 0
  } catch {
    return false
  }
}

/** 延迟指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 带重试和超时的 fetch */
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try {
        const resp = await net.fetch(url, { signal: controller.signal as any })
        clearTimeout(timer)
        return resp
      } catch (e) {
        clearTimeout(timer)
        throw e
      }
    } catch (e) {
      lastError = e as Error
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * Math.pow(2, attempt)) // 指数退避
      }
    }
  }
  throw lastError!
}

/** 下载单个文件；已存在则跳过；支持并行 + 重试 */
async function downloadOne(modelId: string, file: string): Promise<boolean> {
  const target = localModelPath(modelId, file)
  if (await fileExistsNonEmpty(target)) return true

  const url = `${MIRROR_HOST}/${modelId}/resolve/main/${file}`
  let resp: Response
  try {
    resp = await fetchWithRetry(url)
  } catch {
    return false
  }
  if (!resp.ok || !resp.body) return false

  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.download`
  const total = Number(resp.headers.get('content-length') || 0)
  let loaded = 0
  let lastEmit = 0

  const nodeStream = Readable.fromWeb(resp.body as import('stream/web').ReadableStream)
  nodeStream.on('data', (chunk: Buffer) => {
    loaded += chunk.length
    const now = Date.now()
    if (now - lastEmit > 150) {
      lastEmit = now
      progressSender?.({
        modelId,
        file,
        loaded,
        total,
        percent: total > 0 ? Math.round((loaded / total) * 100) : -1,
      })
    }
  })

  try {
    await pipeline(nodeStream, fs.createWriteStream(tmp))
    progressSender?.({
      modelId,
      file,
      loaded,
      total: total > 0 ? total : loaded,
      percent: 100,
    })
    await fs.promises.rename(tmp, target)
    return true
  } catch {
    try {
      await fs.promises.unlink(tmp)
    } catch {
      /* ignore */
    }
    return false
  }
}

/** 并行下载多个文件，限制并发数 */
async function downloadParallel(
  modelId: string,
  files: string[],
  maxConcurrent = MAX_CONCURRENT
): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = []
  const queue = [...files]
  const running: Promise<void>[] = []

  async function runNext(): Promise<void> {
    const file = queue.shift()
    if (file === undefined) return
    const success = await downloadOne(modelId, file)
    if (!success && files.includes(file)) {
      missing.push(file)
    }
    if (queue.length > 0) {
      await runNext()
    }
  }

  // 启动 maxConcurrent 个并行 worker
  for (let i = 0; i < Math.min(maxConcurrent, queue.length); i++) {
    running.push(runNext())
  }
  await Promise.all(running)

  return { ok: missing.length === 0, missing }
}

const inflight = new Map<string, Promise<{ ok: boolean; missing: string[] }>>()

/**
 * 确保模型文件就绪：required 全部成功才算 ok；optional 失败静默忽略。
 * 同一模型并发调用会去重复用同一个下载任务。
 * 文件并行下载（最多 3 个），网络错误自动重试 2 次。
 */
export function ensureModelFiles(
  modelId: string,
  required: string[],
  optional: string[]
): Promise<{ ok: boolean; missing: string[] }> {
  const existing = inflight.get(modelId)
  if (existing) return existing

  const task = (async () => {
    // 先检查哪些文件已缓存，只下载缺失的
    const toDownload: string[] = []
    const preMissing: string[] = []

    for (const file of required) {
      if (await fileExistsNonEmpty(localModelPath(modelId, file))) continue
      toDownload.push(file)
    }
    for (const file of optional) {
      if (await fileExistsNonEmpty(localModelPath(modelId, file))) continue
      toDownload.push(file)
    }

    if (toDownload.length === 0) {
      return { ok: true, missing: [] }
    }

    // 并行下载缺失文件
    const result = await downloadParallel(modelId, toDownload)

    // 检查 required 文件是否都成功
    for (const file of required) {
      if (!await fileExistsNonEmpty(localModelPath(modelId, file))) {
        preMissing.push(file)
      }
    }

    return { ok: preMissing.length === 0, missing: preMissing }
  })()

  inflight.set(modelId, task)
  void task.finally(() => inflight.delete(modelId))
  return task
}
