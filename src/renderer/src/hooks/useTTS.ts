/**
 * useTTS — 浏览器语音合成（TTS）播报 hook
 *
 * 基于 Web Speech API（Electron/Chromium 内置 speechSynthesis），
 * 供报告页、周报页朗读报告内容使用；播报参数（音色/音量/语速/音调）
 * 由设置页写入 `tts_*` 配置项，每次播报前实时读取，改完即生效。
 *
 * 设计要点：
 * - 分句分片：Chromium 对超长单条 utterance 会中途静默截断，按句子边界切成
 *   ≤200 字的小片后依次排队朗读，规避截断并让暂停/停止更跟手
 * - 会话令牌：每次 speak/stop 递增 token，异步回调只认当前会话，
 *   避免 cancel 后残留的 onend 把状态机拉回错误状态
 * - 语音选择：用户指定音色优先，否则按内容主语言（中英自动探测）匹配本地语音，
 *   拿不到时退化为 utterance.lang 让引擎自行挑选
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type TTSStatus = 'idle' | 'speaking' | 'paused';

export interface TTSController {
  /** 当前环境是否支持语音合成 */
  supported: boolean;
  /** 播报状态：空闲 / 播报中 / 暂停 */
  status: TTSStatus;
  /** 开始播报（传入原始文本，内部自动剥离 markdown） */
  speak: (text: string) => void;
  /** 暂停播报 */
  pause: () => void;
  /** 从暂停处继续 */
  resume: () => void;
  /** 停止播报并复位 */
  stop: () => void;
}

/** 播报参数（已换算为 utterance 取值范围） */
export interface TTSConfig {
  /** 语音 voiceURI，空字符串表示自动匹配 */
  voice: string;
  /** 音量 0-1 */
  volume: number;
  /** 语速 0.5-2 */
  rate: number;
  /** 音调 0.5-2 */
  pitch: number;
}

export const TTS_DEFAULT_CONFIG: TTSConfig = { voice: '', volume: 1, rate: 1, pitch: 1 };

/** 设置页滑块范围（百分比整数，存库前的展示取值） */
export const TTS_VOLUME_RANGE = { min: 0, max: 100, default: 100 } as const;
export const TTS_RATE_RANGE = { min: 50, max: 200, default: 100 } as const;
export const TTS_PITCH_RANGE = { min: 50, max: 200, default: 100 } as const;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 把设置里的百分比字符串换算成 utterance 取值；非法值回退默认 */
function pctToRange(value: string | null, min: number, max: number, def: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return clamp(n / 100, min, max);
}

/** 从设置读取 TTS 配置（每次播报前调用，保存后立即生效） */
export async function loadTTSConfig(): Promise<TTSConfig> {
  try {
    const [voice, volume, rate, pitch] = await Promise.all([
      window.api.settings.get('tts_voice'),
      window.api.settings.get('tts_volume'),
      window.api.settings.get('tts_rate'),
      window.api.settings.get('tts_pitch'),
    ]);
    return {
      voice: voice ?? '',
      volume: pctToRange(volume, 0, 1, 1),
      rate: pctToRange(rate, 0.5, 2, 1),
      pitch: pctToRange(pitch, 0.5, 2, 1),
    };
  } catch {
    return TTS_DEFAULT_CONFIG;
  }
}

/**
 * 获取系统语音列表（处理 Chrome 首次 getVoices 为空的异步加载）。
 * 供设置页音色下拉使用。
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const current = synth.getVoices();
    if (current.length > 0) {
      resolve(current);
      return;
    }
    const onChange = (): void => {
      synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', onChange);
    // 兜底：个别环境不触发 voiceschanged，超时后直接返回当前列表
    setTimeout(() => {
      synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices());
    }, 500);
  });
}

/**
 * 剥离 markdown 标记，只留下适合朗读的纯文本。
 * 代码块直接丢弃（朗读代码没有意义且噪音大），行内代码保留内容。
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // 围栏代码块整体丢弃
    .replace(/`([^`]+)`/g, '$1') // 行内代码保留内容
    .replace(/^#{1,6}\s+/gm, '') // 标题标记
    .replace(/\*\*([^*]+)\*\*/g, '$1') // 粗体
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1') // 斜体
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1') // 删除线
    .replace(/^\s*[-*+]\s+/gm, '') // 无序列表标记
    .replace(/^\s*\d+\.\s+/gm, '') // 有序列表标记
    .replace(/^\s*>\s+/gm, '') // 引用标记
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // 图片保留 alt
    .replace(/\|/g, '，') // 表格竖线转顿号，避免朗读成“竖线”
    .replace(/^[-=]{3,}\s*$/gm, '') // 分隔线
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * 把长文本切成适合朗读的小片：优先在句子边界断开，超长句硬切。
 */
function splitForSpeech(text: string, maxLen = 200): string[] {
  // 句子断点：中英文句号、叹号、问号、分号、换行
  const sentences = text.split(/(?<=[。！？!?；;.\n])/);
  const chunks: string[] = [];
  let buf = '';
  const flush = (): void => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = '';
  };
  for (const s of sentences) {
    if (!s) continue;
    buf += s;
    // 攒够一段就吐出；单句超长则按 maxLen 硬切
    while (buf.length > maxLen) {
      chunks.push(buf.slice(0, maxLen).trim());
      buf = buf.slice(maxLen);
    }
    // 遇到句子边界且已有内容，立即成片，保证断句自然
    if (/[。！？!?；;\n]$/.test(s) && buf.trim()) {
      flush();
    }
  }
  flush();
  return chunks;
}

/**
 * 探测文本主语言：CJK 字符多于拉丁字母视为中文，朗读口音更自然。
 */
function detectLang(text: string, fallback: 'zh' | 'en'): string {
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (cjk > 0 && cjk >= latin) return 'zh-CN';
  if (latin > 0) return 'en-US';
  return fallback === 'zh' ? 'zh-CN' : 'en-US';
}

/** 挑选语音：用户指定 voiceURI 优先，否则按语言前缀匹配（如 Microsoft Huihui / Xiaoxiao） */
function pickVoice(lang: string, voiceURI: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  // 用户在设置页显式指定的音色优先（换电脑后 voiceURI 可能失效，再走自动匹配）
  if (voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  const prefix = lang.split('-')[0].toLowerCase();
  // 精确匹配 lang（如 zh-CN）优先，其次语言前缀（zh-*）
  return (
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ??
    null
  );
}

export function useTTS(): TTSController {
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window,
  );
  const [status, setStatus] = useState<TTSStatus>('idle');

  // 会话令牌：speak/stop 时递增，异步回调携带创建时的令牌，过期即丢弃
  const sessionRef = useRef(0);
  // 当前会话的分片队列与游标
  const chunksRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  /** 语言偏好（由 speak 时的文本探测，这里缓存 fallback） */
  const fallbackLangRef = useRef<'zh' | 'en'>('zh');

  const speak = useCallback(
    (text: string): void => {
      if (!supported) return;
      const plain = stripMarkdown(text);
      if (!plain) return;
      // 先占位新会话令牌：异步取配置期间若被 stop / 新 speak 作废则放弃启动
      sessionRef.current += 1;
      const session = sessionRef.current;

      void (async () => {
        // 每次播报前读取设置，音色/音量/语速/音调保存后立即生效
        const config = await loadTTSConfig();
        if (session !== sessionRef.current) return;
        const synth = window.speechSynthesis;
        synth.cancel();
        chunksRef.current = splitForSpeech(plain);
        indexRef.current = 0;
        setStatus('speaking');

        // 递归朗读下一片（命名函数表达式自引用，由 onend 驱动）
        const speakNext = function speakNext(session: number): void {
          if (session !== sessionRef.current) return;
          const chunks = chunksRef.current;
          if (indexRef.current >= chunks.length) {
            // 全部读完
            setStatus('idle');
            return;
          }
          const chunk = chunks[indexRef.current];
          indexRef.current += 1;
          const utter = new SpeechSynthesisUtterance(chunk);
          const lang = detectLang(chunk, fallbackLangRef.current);
          utter.lang = lang;
          const voice = pickVoice(lang, config.voice);
          if (voice) utter.voice = voice;
          utter.volume = config.volume;
          utter.rate = config.rate;
          utter.pitch = config.pitch;
          utter.onend = () => speakNext(session);
          utter.onerror = () => speakNext(session);
          synth.speak(utter);
        };
        speakNext(session);
      })();
    },
    [supported],
  );

  const pause = useCallback((): void => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setStatus('paused');
  }, [supported]);

  const resume = useCallback((): void => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setStatus('speaking');
  }, [supported]);

  const stop = useCallback((): void => {
    if (!supported) return;
    sessionRef.current += 1; // 作废进行中的 onend 链
    window.speechSynthesis.cancel();
    chunksRef.current = [];
    indexRef.current = 0;
    setStatus('idle');
  }, [supported]);

  // 语音列表异步加载：Chrome 首次 getVoices() 可能为空，订阅事件促发一次预热
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const warm = (): void => {
      synth.getVoices();
    };
    warm();
    synth.addEventListener('voiceschanged', warm);
    return () => {
      synth.removeEventListener('voiceschanged', warm);
    };
  }, [supported]);

  // 卸载时兜底停止，避免组件销毁后仍在朗读
  useEffect(() => {
    return () => {
      if (!supported) return;
      sessionRef.current += 1;
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { supported, status, speak, pause, resume, stop };
}
