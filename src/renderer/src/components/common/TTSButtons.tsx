/**
 * TTSButtons — 语音播报控制按钮组
 *
 * 根据播报状态渲染「播报 / 暂停·继续 / 停止」按钮，
 * 供报告页工具栏与周报页概览卡复用，视觉与各页既有描边按钮一致。
 */
import type { ReactNode } from 'react';
import { Pause, Play, Square, Volume2 } from 'lucide-react';
import type { TTSController } from '../../hooks/useTTS';
import { useI18n } from '../../stores/languageStore';

interface TTSButtonsProps {
  /** useTTS 返回的控制器 */
  tts: TTSController;
  /** 待播报文本（原始内容即可，内部剥离 markdown） */
  text: string;
  /** 容器额外样式 */
  className?: string;
}

function TTSButtons({ tts, text, className }: TTSButtonsProps): ReactNode {
  const { t } = useI18n();

  // 不支持语音合成时给出禁用按钮 + 悬停说明，而不是凭空消失
  if (!tts.supported) {
    return (
      <button
        type="button"
        disabled
        title={t('tts.unsupported')}
        className={`flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-400 dark:text-zinc-500 text-sm rounded-lg cursor-not-allowed ${className ?? ''}`}
      >
        <Volume2 className="w-4 h-4" />
        {t('tts.play')}
      </button>
    );
  }

  const hasText = text.trim().length > 0;

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      {tts.status === 'idle' && (
        <button
          type="button"
          onClick={() => tts.speak(text)}
          disabled={!hasText}
          className="flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Volume2 className="w-4 h-4" />
          {t('tts.play')}
        </button>
      )}
      {tts.status === 'speaking' && (
        <>
          <button
            type="button"
            onClick={tts.pause}
            className="flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <Pause className="w-4 h-4 animate-pulse-soft" />
            {t('tts.pause')}
          </button>
          <button
            type="button"
            onClick={tts.stop}
            className="flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <Square className="w-4 h-4" />
            {t('tts.stop')}
          </button>
        </>
      )}
      {tts.status === 'paused' && (
        <>
          <button
            type="button"
            onClick={tts.resume}
            className="flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <Play className="w-4 h-4" />
            {t('tts.resume')}
          </button>
          <button
            type="button"
            onClick={tts.stop}
            className="flex items-center gap-2 px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 text-sm rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <Square className="w-4 h-4" />
            {t('tts.stop')}
          </button>
        </>
      )}
    </div>
  );
}

export default TTSButtons;
