// src/main/model-files.ts
// 模型本地文件夹缓存：从 hf-mirror.com 下载到 userData/models/<modelId>/resolve/main/<file>
// 通过 appmodel:// 自定义协议回放给渲染进程（见 src/main/index.ts 的 protocol.handle）
import { app, net } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

const MIRROR_HOST = 'https://hf-mirror.com'

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

/** 下载单个文件；已存在则跳过；404/网络错误返回 false */
async function downloadOne(modelId: string, file: string): Promise<boolean> {
  const target = localModelPath(modelId, file)
  if (await fileExistsNonEmpty(target)) return true

  const url = `${MIRROR_HOST}/${modelId}/resolve/main/${file}`
  let resp: Response
  try {
    resp = await net.fetch(url)
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

const inflight = new Map<string, Promise<{ ok: boolean; missing: string[] }>>()

/**
 * 确保模型文件就绪：required 全部成功才算 ok；optional 失败静默忽略。
 * 同一模型并发调用会去重复用同一个下载任务。
 */
export function ensureModelFiles(
  modelId: string,
  required: string[],
  optional: string[]
): Promise<{ ok: boolean; missing: string[] }> {
  const existing = inflight.get(modelId)
  if (existing) return existing

  const task = (async () => {
    const missing: string[] = []
    for (const file of [...required, ...optional]) {
      if (!(await downloadOne(modelId, file)) && required.includes(file)) {
        missing.push(file)
      }
    }
    return { ok: missing.length === 0, missing }
  })()

  inflight.set(modelId, task)
  void task.finally(() => inflight.delete(modelId))
  return task
}
