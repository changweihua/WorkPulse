/**
 * 延迟加载的 Token 估算器。
 *
 * gpt-tokenizer 的 cl100k_base 编码表约 3.2MB，若被常驻的 AIChatPanel 静态导入，
 * 会整体进入首屏主 chunk（实测 index chunk ~3.98MB）。Token 数仅用于界面估算展示，
 * 不参与计费/扣费，因此改为按需动态加载：
 *
 * - 首次调用返回基于字符的快速估算（CJK 权重启发式）
 * - 后台动态 import 精确编码器，加载完成后后续调用自动切换到精确计数
 *
 * 这样 3.2MB 编码表被拆成独立异步 chunk，首屏体积与解析耗时显著下降。
 */

type EncodeFn = (text: string) => number[];

let encodeFn: EncodeFn | null = null;
let loadPromise: Promise<void> | null = null;

/** 触发精确编码器加载（幂等）。可在应用启动后主动调用以提前预热。 */
export function loadTokenizer(): Promise<void> {
  if (encodeFn) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = import('gpt-tokenizer/encoding/cl100k_base')
      .then((mod) => {
        encodeFn = mod.encode as EncodeFn;
      })
      .catch(() => {
        // 加载失败时保持 null，estimateTokens 会一直走字符估算兜底
      });
  }
  return loadPromise;
}

/** 字符数快速估算：CJK 按 1.5 token/字，ASCII 按 0.25，其余按 1。 */
function estimateByChars(text: string): number {
  let count = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      count += 1.5;
    } else if (code < 0x80) {
      count += 0.25;
    } else {
      count += 1;
    }
  }
  return Math.ceil(count);
}

/**
 * 估算文本 token 数。精确编码器加载前用字符估算，加载后自动切换精确值。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  if (encodeFn) {
    try {
      return encodeFn(text).length;
    } catch {
      // 编码异常时回退字符估算
    }
  }
  // 首次调用即启动后台加载，下次调用起即为精确值
  void loadTokenizer();
  return estimateByChars(text);
}
