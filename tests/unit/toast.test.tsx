import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '../../src/renderer/src/components/Toast';

function Trigger(): React.ReactNode {
  const toast = useToast();
  return <button onClick={() => toast.success('已保存')}>触发 Toast</button>;
}

describe('Toast 关闭定时器', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('重复点击关闭只排一次移除定时器，自动移除不会再触发一次', () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '触发 Toast' }));
    expect(screen.getByText('已保存')).toBeTruthy();
    setTimeoutSpy.mockClear(); // 只统计关闭动作排出的定时器

    const closeButton = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.trim() === '');
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);
    fireEvent.click(closeButton!);

    // 一次退场定时器，而不是两次；重复关掉也不再排自动移除定时器
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy.mock.calls[0][1]).toBe(250);

    act(() => {
      vi.advanceTimersByTime(260 + 2500);
    });
    expect(screen.queryByText('已保存')).toBeNull();
  });

  it('自动移除后 Toast 从 DOM 消失', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '触发 Toast' }));
    act(() => {
      vi.advanceTimersByTime(2500 + 250);
    });
    expect(screen.queryByText('已保存')).toBeNull();
  });
});
