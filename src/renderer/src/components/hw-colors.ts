/**
 * 硬件状态环 —— 电池颜色角色状态机
 *
 * 为什么单独抽一个模块：
 * - 底部 5 颗电量圆点、顶部电源状态槽（放电百分比数字）、悬停读数条的电池条目
 *   需要同一套「电量 + 充电 + 电源模式」→ 颜色语义的映射，散落在组件里必然漂移；
 * - 本模块只产出语义角色（红 / 黄 / 绿 / 琥珀 / 常规绿），具体色值仍由调用方
 *   从 RadialTheme.css 的 token 里取（读不到时用组件内的兜底常量）→ 双轨配色不变。
 */

/** 电池颜色角色（判定顺序：低电量临界 > 低电量预警 > 充电/接电 > 未知 > 常规） */
export type BatteryRole = 'critical' | 'lowPower' | 'powered' | 'unknown' | 'primary';

/** 低电量临界阈值（%）：低于此值 = 红色告警（critical） */
export const BATTERY_CRITICAL_AT = 10;
/** 低电量预警阈值（%）：低于此值且不低于临界值 = 黄色预警（lowPower） */
export const BATTERY_WARN_AT = 20;
/** 未点亮轨道圆点的透明度（status-trio 的 inactive 规则：同角色色降到 22%，替换固定暗色） */
export const BATTERY_INACTIVE_ALPHA = 0.22;

/**
 * 判定电池颜色角色。
 *
 * 判定顺序（前面的优先，充电中的极低电量仍然是红色，不能被「充电绿」盖掉）：
 * 1. 低电量临界（<10%）
 * 2. 低电量预警（<20%）
 * 3. 充电中 / 已接电源（含台式机 mains）
 * 4. 未知（无电量数据 / 电池供电但读数未知 / 无任何硬件数据）
 * 5. 常规（有电量、未接电、≥20%）
 *
 * @param level 电量 0~1（null = 无电量数据）
 * @param charging 是否充电中 / 接通电源（hw.charging 优先，回退 navigator.charging）
 * @param powerMode 电源表达：'level' | 'mains' | 'battery-unknown' | 'unknown'
 */
export function batteryRole(
  level: number | null,
  charging: boolean,
  powerMode: string,
): BatteryRole {
  const pct = level === null ? null : level * 100;

  if (powerMode === 'level' && pct !== null) {
    if (pct < BATTERY_CRITICAL_AT) return 'critical';
    if (pct < BATTERY_WARN_AT) return 'lowPower';
  }
  if (charging || powerMode === 'mains') return 'powered';
  if (pct === null || powerMode === 'battery-unknown' || powerMode === 'unknown') return 'unknown';
  return 'primary';
}
