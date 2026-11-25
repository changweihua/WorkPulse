import { describe, expect, it } from 'vitest';
import {
  MOTION_EASE,
  SPRING_SIDEBAR,
  SPRING_FAB,
  SPRING_PANEL,
  SPRING_TOOLBAR_FOLLOW,
  SPRING_TOOLBAR_POP,
  SPRING_SPRING,
} from '../../src/renderer/src/components/Motion';

/** 动效参数是跨窗口一致性的契约，改动必须是有意为之 */
describe('全局动效 token', () => {
  it('统一缓动是快出缓停曲线', () => {
    expect(MOTION_EASE).toEqual([0.16, 1, 0.3, 1]);
  });

  it('所有弹簧都声明 spring 类型且按用途区分', () => {
    const springs = [
      SPRING_SPRING,
      SPRING_SIDEBAR,
      SPRING_FAB,
      SPRING_PANEL,
      SPRING_TOOLBAR_POP,
      SPRING_TOOLBAR_FOLLOW,
    ];
    for (const spring of springs) expect(spring.type).toBe('spring');
    expect(new Set(springs.map((s) => s.stiffness)).size).toBeGreaterThan(1);
    expect(SPRING_TOOLBAR_POP.mass).toBe(0.6);
    expect(SPRING_TOOLBAR_FOLLOW.mass).toBe(0.7);
  });

  it('侧滑面板阻尼高于悬浮按钮，避免大面积位移甩过头', () => {
    expect(SPRING_PANEL.damping).toBeGreaterThan(SPRING_FAB.damping);
  });
});
