import * as echarts from 'echarts/core';

/**
 * 全局图表字体族。
 * 必须与 `src/renderer/src/index.css` 中的 `--font-sans` 保持完全一致，
 * 修改时两处需同步。
 */
export const FONT_FAMILY =
  '"JetBrains Maple Mono", "Maple Mono NF CN", "Source Han Serif SC", "思源宋体", sans-serif';

/** 自定义主题名，供 `echarts.init(dom, CHART_THEME)` 使用 */
export const CHART_THEME = 'workpulse';

/** 生成坐标轴通用文字样式（参照 echarts 内置 dark 主题的 axisCommon 写法） */
function axisCommon(): Record<string, unknown> {
  return {
    axisLabel: { fontFamily: FONT_FAMILY },
    axisName: { fontFamily: FONT_FAMILY },
  };
}

/**
 * WorkPulse 图表主题：只统一 fontFamily，不设置任何颜色 / 字号，
 * 避免覆盖各页面现有的 isDark 配色逻辑。
 */
const theme = {
  // 根级 textStyle 会被 labelStyle 的 getFont() 回退读取，
  // 覆盖 axisLabel / series label / rich 富文本 / axisName 等所有 labelStyle 文字
  textStyle: {
    fontFamily: FONT_FAMILY,
  },
  tooltip: {
    textStyle: { fontFamily: FONT_FAMILY },
  },
  legend: {
    textStyle: { fontFamily: FONT_FAMILY },
    pageTextStyle: { fontFamily: FONT_FAMILY },
  },
  title: {
    textStyle: { fontFamily: FONT_FAMILY },
    subtextStyle: { fontFamily: FONT_FAMILY },
  },
  categoryAxis: axisCommon(),
  valueAxis: axisCommon(),
  timeAxis: axisCommon(),
  logAxis: axisCommon(),
};

// 模块顶层注册一次，所有 echarts.init 传入 CHART_THEME 即可生效
echarts.registerTheme(CHART_THEME, theme);
