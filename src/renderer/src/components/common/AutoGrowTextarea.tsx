import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from 'react';

interface AutoGrowTextareaProps extends ComponentPropsWithoutRef<'textarea'> {
  /** 内容高度上限，超过后显示内部滚动条（默认 160px） */
  maxHeight?: number;
}

/**
 * 自适应高度的多行文本框。
 *
 * 初始只有一行高度，随内容自动增高；超过 maxHeight 后转为内部滚动，
 * 避免长日志把页面卡片撑得过高。对外透传原生 textarea 的全部属性与 ref。
 */
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(
  function AutoGrowTextarea({ maxHeight = 160, value, className = '', ...rest }, ref) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, []);

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      // 先归零再读 scrollHeight，才能在处理内容变少时正确收缩
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [value, maxHeight]);

    return (
      <textarea
        {...rest}
        ref={innerRef}
        rows={1}
        value={value}
        className={`block min-h-[34px] resize-none ${className}`}
      />
    );
  },
);

/**
 * 在光标处显式插入换行。
 *
 * Electron / 不同平台下 Alt+Enter 的 textarea 默认行为并不一致，
 * 直接更新受控 value 并回填光标位置，保证 Alt+Enter 一定能换行。
 */
export function insertLineBreak(
  event: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  setValue: (next: string) => void,
): void {
  event.preventDefault();
  const el = event.currentTarget;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? start;
  setValue(`${value.slice(0, start)}\n${value.slice(end)}`);
  // 等受控 value 提交到 DOM 后再把光标放到新插入的换行之后
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = start + 1;
  });
}

/**
 * 在 textarea 光标处插入文本（表情等），并回填光标位置。
 * 点击按钮会让输入框失焦，但 selectionStart/End 仍保留，可直接读取。
 */
export function insertTextAtCursor(
  el: HTMLTextAreaElement | null,
  value: string,
  setValue: (next: string) => void,
  text: string,
): void {
  if (!el) return;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? start;
  setValue(`${value.slice(0, start)}${text}${value.slice(end)}`);
  requestAnimationFrame(() => {
    el.focus();
    const caret = start + text.length;
    el.selectionStart = el.selectionEnd = caret;
  });
}

export default AutoGrowTextarea;
