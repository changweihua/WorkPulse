import { useEffect, useRef, useState, ReactNode } from 'react';
import { motion } from 'motion/react';
import { ClipboardList, Columns3 } from 'lucide-react';
import { Fade, MOTION_EASE } from './Motion';
import { AutoGrowTextarea, insertLineBreak, insertTextAtCursor } from './common/AutoGrowTextarea';
import { EmojiPicker } from './common/EmojiPicker';
import { useWorkLogStore } from '../stores/worklogStore';
import { useTaskStore } from '../stores/taskStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from './Toast';
import { useI18n } from '../stores/languageStore';

type Mode = 'log' | 'task';

interface Props {
  initialMode: Mode;
  onClose: () => void;
}

export function QuickCreate({ initialMode, onClose }: Props): ReactNode {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const logInputRef = useRef<HTMLTextAreaElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const addLog = useWorkLogStore((s) => s.addLog);
  const addTask = useTaskStore((s) => s.addTask);
  const toast = useToast();
  const { t } = useI18n();

  const parseCategory = (text: string): { content: string; category: string } => {
    const match = text.match(/#(\S+)\s*/);
    if (match) {
      return { content: text.replace(match[0], '').trim(), category: match[1] };
    }
    return { content: text, category: '' };
  };

  useEffect(() => {
    (mode === 'log' ? logInputRef : taskInputRef).current?.focus();
  }, [mode]);

  const handleSubmit = async (): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      if (mode === 'log') {
        const { content, category } = parseCategory(trimmed);
        await addLog(content, category);
        toast.success(t('quick.logSaved'));
      } else {
        await addTask(trimmed);
        toast.success(t('quick.taskSaved'));
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.nativeEvent.isComposing) return;
    // 与 Excel 一致：Enter 保存，Alt+Enter 换行；任务模式仍保持 Enter 直接提交
    if (e.key === 'Enter' && (mode === 'task' || !e.altKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') onClose();
    // Tab switches mode
    if (e.key === 'Tab') {
      e.preventDefault();
      setMode((m) => (m === 'log' ? 'task' : 'log'));
      setValue('');
    }
  };

  const handleLogKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && e.altKey) {
      insertLineBreak(e, value, setValue);
      return;
    }
    handleKeyDown(e);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32" onClick={onClose}>
      {/* Backdrop */}
      <Fade className="absolute inset-0 bg-black/20" />

      {/* Panel */}
      <motion.div
        className="relative w-full max-w-lg mx-4 surface-elevated backdrop-blur-sm rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: MOTION_EASE }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mode toggle */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800">
          <button
            onClick={() => {
              setMode('log');
              setValue('');
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm flex-1 transition-colors ${
              mode === 'log'
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            {t('quick.log')}
          </button>
          <button
            onClick={() => {
              setMode('task');
              setValue('');
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm flex-1 transition-colors ${
              mode === 'task'
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            <Columns3 className="w-4 h-4" />
            {t('quick.task')}
          </button>
        </div>

        {/* Input */}
        <div className="p-4">
          {mode === 'log' ? (
            <div className="relative">
              <AutoGrowTextarea
                ref={logInputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleLogKeyDown}
                placeholder={t('quick.logPlaceholder')}
                disabled={submitting}
                maxHeight={140}
                className="w-full pl-3 pr-10 py-2.5 text-base leading-6 border border-zinc-300 dark:border-zinc-600 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:focus:ring-blue-400/30 surface-input dark:text-zinc-100 disabled:opacity-50"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <EmojiPicker
                  ariaLabel={t('worklog.addEmoji')}
                  disabled={submitting}
                  onSelect={(emoji) =>
                    insertTextAtCursor(logInputRef.current, value, setValue, emoji)
                  }
                />
              </div>
            </div>
          ) : (
            <input
              ref={taskInputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('quick.taskPlaceholder')}
              disabled={submitting}
              className="w-full px-3 py-2.5 text-base border border-zinc-300 dark:border-zinc-600 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:focus:ring-blue-400/30 surface-input dark:text-zinc-100 disabled:opacity-50"
            />
          )}
          <div className="flex items-center justify-between mt-3 gap-2">
            <span className="text-xs text-zinc-400">
              {mode === 'log' ? t('quick.helpLog') : t('quick.help')}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!value.trim() || submitting}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-40 transition-all btn-bounce"
            >
              {mode === 'log' ? t('quick.submitLog') : t('common.add')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
