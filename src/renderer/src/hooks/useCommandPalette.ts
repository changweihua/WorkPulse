import { useCallback, useEffect, useState } from 'react';

/**
 * 全局命令面板快捷键提示文案：mac 显示 ⌘K，其余平台显示 Ctrl K。
 * 与 useCommandPalette 的监听按键保持一致。
 */
export const MOD_KEY_HINT: string =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';

interface UseCommandPaletteOptions {
  /** 快捷键禁用开关（如其他弹层打开时豁免） */
  disabled?: boolean;
}

/**
 * 全局命令面板状态 + 快捷键注册。
 *
 * 监听 `(metaKey || ctrlKey) + K`（preventDefault 抢占浏览器地址栏焦点），
 * 再次按下为切换（已打开则关闭）。输入法组合期间（isComposing）跳过。
 *
 * @example
 * const palette = useCommandPalette();
 * <button onClick={palette.open} /> // 入口按钮
 * <CommandPalette open={palette.isOpen} onClose={palette.close} />
 */
export function useCommandPalette({ disabled = false }: UseCommandPaletteOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return; // 输入法组词中不响应
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 'k') return;
      e.preventDefault(); // 抢占浏览器「聚焦地址栏」默认行为
      setIsOpen((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled]);

  return { isOpen, open, close };
}

export default useCommandPalette;
