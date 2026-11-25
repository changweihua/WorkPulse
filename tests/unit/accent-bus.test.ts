// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ACCENT_CHANGED, appBus } from '../../src/main/event-bus';
import { ACCENT_CHANGED_CHANNEL, HW_STATS_CHANNEL } from '../../src/shared/hw-stats';

/** 强调色广播是主进程与两个悬浮窗之间的 IPC 契约，改名必须同步改三处 */
describe('强调色事件契约', () => {
  it('appBus 事件名与 IPC 通道名稳定', () => {
    expect(ACCENT_CHANGED).toBe('app:accent-changed');
    expect(ACCENT_CHANGED_CHANNEL).toBe('accent-changed');
    expect(HW_STATS_CHANNEL).toBe('hw-stats');
  });

  it('appBus 能把强调色值送达订阅者', () => {
    const listener = vi.fn();
    appBus.once(ACCENT_CHANGED, listener);
    appBus.emit(ACCENT_CHANGED, 'violet');
    expect(listener).toHaveBeenCalledWith('violet');
  });
});
