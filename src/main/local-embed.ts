/**
 * dev 专用本地 embedding（transformers.js + onnxruntime-node）
 *
 * 仅在开发模式（!app.isPackaged）下启用：模型 Xenova/bge-small-zh-v1.5（q8 量化，
 * 约 23MB，输出 512 维向量）在本机 CPU 上推理，不调用远程 Embedding API、
 * 不需要 API Key、不计额度不记账单。打包版行为完全不变（仍走远程 API）。
 *
 * 实现要点（均已实测验证）：
 * - Electron 主进程 process.release.name === 'node'，transformers.js 会走
 *   onnxruntime-node（N-API v6，Electron 44 可直接加载，无需 rebuild）。
 * - 该包位于 devDependencies，必须在 electron.vite.config.ts 中 externalize，
 *   否则内联打包会在 sharp / createRequire(import.meta.url) 处崩溃。
 * - transformers.js 不读 HF_ENDPOINT 环境变量，必须手动设置 env.remoteHost 桥接镜像源；
 *   env.cacheDir 默认路径随 bundle 位置漂移，必须显式固定到 userData 下。
 * - 推理必须 pooling: 'mean' + normalize: true，否则向量未归一化（L2 范数约 10.34），
 *   余弦相似度不可用。
 */
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main';
// 仅类型导入：类型在编译期擦除，运行时不会加载该库（加载只发生在 dev 的动态 import 处）
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

/** 本地 embedding 模型 ID（q8 量化，512 维） */
export const LOCAL_EMBED_MODEL_ID = 'Xenova/bge-small-zh-v1.5';

/** 惰性单例：缓存 pipeline 创建中的 Promise，首次调用后复用 */
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

/** env 是否已配置（pipeline 创建前只设一次） */
let envConfigured = false;

/**
 * 是否启用本地 embedding：仅 dev 模式（未打包）。
 * 打包版恒为 false，走原有远程 Embedding API，行为不变。
 */
export function isLocalEmbeddingEnabled(): boolean {
  return !app.isPackaged;
}

/**
 * 配置 transformers.js 运行环境（幂等，只执行一次，需在 pipeline 创建前调用）。
 */
function configureEnv(mod: typeof import('@huggingface/transformers')): void {
  if (envConfigured) return;
  // transformers.js 不读 HF_ENDPOINT 环境变量，必须手动桥接镜像源（hf-mirror.com 兼容 API 与 Range 请求）
  mod.env.remoteHost = `${(process.env.HF_ENDPOINT || 'https://hf-mirror.com').replace(/\/+$/, '')}/`;
  // 缓存目录固定到 userData 下，避免随 bundle 位置漂移
  mod.env.cacheDir = `${path.join(app.getPath('userData'), 'hf-models')}${path.sep}`;
  // 禁止从本地 ./models 目录查找，统一走远程镜像下载 + 本地缓存
  mod.env.allowLocalModels = false;
  envConfigured = true;
}

/**
 * 创建（或复用）feature-extraction pipeline 单例。
 * 失败时丢弃缓存的 Promise（下次调用重试），错误由调用方记录。
 */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const start = Date.now();
      // 动态 import：打包版入口已守卫，永远不会执行到这里
      const mod = await import('@huggingface/transformers');
      configureEnv(mod);
      log.info(`[LocalEmbed] 正在加载本地 embedding 模型 ${LOCAL_EMBED_MODEL_ID}（q8, cpu）...`);
      const extractor = await mod.pipeline('feature-extraction', LOCAL_EMBED_MODEL_ID, {
        dtype: 'q8',
        device: 'cpu',
      });
      log.info(`[LocalEmbed] 模型加载完成，耗时 ${Date.now() - start}ms`);
      return extractor;
    })().catch((err) => {
      // 失败时丢弃缓存的 Promise，下次调用可重试
      extractorPromise = null;
      throw err;
    });
  }
  return extractorPromise;
}

/**
 * 批量生成本地 embedding（dev 专用）。
 *
 * @param texts 待向量化文本数组
 * @returns 与 texts 一一对应的 512 维 L2 归一化向量数组（mean pooling + normalize）
 */
export async function localEmbed(texts: string[]): Promise<number[][]> {
  // 打包版守卫：打包产物不含该依赖（externalize + devDependencies），直接抛错，永不加载
  if (app.isPackaged) {
    throw new Error('本地 embedding 仅在开发模式可用，打包版请配置远程 Embedding API');
  }
  if (texts.length === 0) return [];

  const extractor = await getExtractor();
  const start = Date.now();
  // 必须 mean pooling + normalize，归一化后向量才能直接用余弦相似度
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  const vectors = output.tolist() as number[][];
  log.info(`[LocalEmbed] 本地向量化完成: 文本数 ${texts.length}, 耗时 ${Date.now() - start}ms`);
  return vectors;
}
