import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router', () => ({ useNavigate: () => navigateMock }));

vi.mock('../../src/renderer/src/stores/languageStore', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/renderer/src/components/LiquidGlassSurface', () => ({
  LiquidGlassSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CommandPalette } from '../../src/renderer/src/components/CommandPalette';

describe('命令面板执行锁', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('连按 Enter 只导航一次并只关闭一次', () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('重新打开后执行锁复位，可再次导航', () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
