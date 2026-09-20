import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { FadeIn } from '../components/Motion';
import { Activity, Coins, Clock, Zap, Download } from 'lucide-react';
import {
  SkeletonLine,
  SkeletonRect,
  SkeletonStatCard,
  SkeletonTableRow,
} from '../components/Skeleton';
import * as echarts from 'echarts/core';
import { BarChart as EChartsBarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AxisPointerComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts } from 'echarts/core';
import { useI18n } from '../stores/languageStore';
import { useIdleCallback } from '../hooks/useIdleCallback';

echarts.use([
  EChartsBarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AxisPointerComponent,
  CanvasRenderer,
]);

const CATEGORY_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e'];

function getDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="surface-card rounded-xl p-5 h-[88px] flex items-center gap-4">
      <div className="w-10 h-10 shrink-0 rounded-lg bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-semibold text-zinc-800 dark:text-zinc-100 font-mono truncate">
          {value}
        </p>
        {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

interface DailyStats {
  date: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
  avg_latency: number;
}
interface ModelStats {
  model_id: string;
  model_name: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
}
interface TypeStats {
  usage_type: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
}
interface TrendData {
  date: string;
  model_id: string;
  model_name: string;
  tokens: number;
  cost: number;
  calls: number;
}
interface LogRow {
  id: number;
  model_id: string;
  model_name: string;
  provider: string;
  usage_type: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  success: number;
  error_msg: string | null;
  created_at: string;
}

const USAGE_TYPE_LABELS: Record<string, string> = {
  chat: 'AI 对话',
  report: 'AI 周报',
  ocr: 'OCR 识别',
  onnx: 'ONNX 推理',
  embedding: 'Embedding 向量化',
};

export default function AiStatsPage() {
  const { t } = useI18n();
  const [days, setDays] = useState(30);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [modelStats, setModelStats] = useState<ModelStats[]>([]);
  const [typeStats, setTypeStats] = useState<TypeStats[]>([]);
  const [trend, setTrend] = useState<TrendData[]>([]);
  const [recentLogs, setRecentLogs] = useState<LogRow[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalCalls, setTotalCalls] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [avgLatency, setAvgLatency] = useState(0);
  const [loading, setLoading] = useState(true);

  const trendRef = useRef<HTMLDivElement>(null);
  const modelPieRef = useRef<HTMLDivElement>(null);
  const typeBarRef = useRef<HTMLDivElement>(null);
  const trendInstance = useRef<ECharts | null>(null);
  const modelPieInstance = useRef<ECharts | null>(null);
  const typeBarInstance = useRef<ECharts | null>(null);

  const isDark = document.documentElement.classList.contains('dark');

  const loadData = useCallback(async () => {
    const { from, to } = getDateRange(days);
    setLoading(true);
    try {
      const [daily, model, type, trendData, recent, costSummary] = await Promise.all([
        window.api.aiUsage.getDailyStats(from, to),
        window.api.aiUsage.getModelStats(from, to),
        window.api.aiUsage.getTypeStats(from, to),
        window.api.aiUsage.getTrend(from, to),
        window.api.aiUsage.getRecentLogs(50),
        window.api.aiUsage.getCostSummary(from, to),
      ]);
      setDailyStats(daily);
      setModelStats(model);
      setTypeStats(type);
      setTrend(trendData);
      setRecentLogs(recent);
      setTotalCost(costSummary.total_cost);
      setTotalCalls(costSummary.total_calls);
      setTotalTokens(costSummary.total_tokens);
      const avg =
        daily.length > 0 ? daily.reduce((s, d) => s + d.avg_latency, 0) / daily.length : 0;
      setAvgLatency(Math.round(avg));
    } catch (err) {
      console.error('加载 AI 使用统计失败:', err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // loading 时销毁 echarts 实例，确保重新挂载后能重建
  useEffect(() => {
    if (loading) {
      trendInstance.current?.dispose();
      trendInstance.current = null;
      modelPieInstance.current?.dispose();
      modelPieInstance.current = null;
      typeBarInstance.current?.dispose();
      typeBarInstance.current = null;
    }
  }, [loading]);

  // 趋势折线图
  useIdleCallback(() => {
    if (!trendRef.current) return;
    if (!trendInstance.current) {
      trendInstance.current = echarts.init(trendRef.current, undefined, { renderer: 'canvas' });
    }
    const chart = trendInstance.current;

    // 生成完整日期范围（包含所有日期，无数据日补 0）
    const { from, to } = getDateRange(days);
    const dateList: string[] = [];
    const d = new Date(from);
    const end = new Date(to);
    while (d <= end) {
      dateList.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    // 预测 3 天
    const forecastDays = 3;
    const forecastDates: string[] = [];
    for (let i = 1; i <= forecastDays; i++) {
      const fd = new Date(end);
      fd.setDate(fd.getDate() + i);
      forecastDates.push(fd.toISOString().slice(0, 10));
    }
    const allDates = [...dateList, ...forecastDates];

    // 按 model_id 分组，同时记录 model_name
    const modelMap = new Map<string, { dates: string[]; tokens: number[] }>();
    const modelNameMap = new Map<string, string>();
    for (const item of trend) {
      if (!modelMap.has(item.model_id)) {
        modelMap.set(item.model_id, { dates: [], tokens: [] });
      }
      const entry = modelMap.get(item.model_id)!;
      if (!entry.dates.includes(item.date)) entry.dates.push(item.date);
      entry.tokens.push(item.tokens);
      if (item.model_name) modelNameMap.set(item.model_id, item.model_name);
    }

    // 线性回归：最小二乘法
    function linearPredict(values: number[], count: number): number[] {
      const n = values.length;
      if (n < 2) return Array(count).fill(values[0] ?? 0);
      let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
      }
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      return Array.from({ length: count }, (_, i) =>
        Math.max(0, Math.round(intercept + slope * (n + i))),
      );
    }

    const series: any[] = [];
    Array.from(modelMap.entries()).forEach(([modelId, data], idx) => {
      const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
      const displayName = modelNameMap.get(modelId) || modelId;
      // 实际数据
      const actualValues = dateList.map((dd) => {
        const i = data.dates.indexOf(dd);
        return i >= 0 ? data.tokens[i] : 0;
      });
      // 预测值（基于最后 14 个数据点做回归）
      const recentValues = actualValues.slice(-14);
      const predicted = linearPredict(recentValues, forecastDays);

      // 实际线
      series.push({
        name: displayName,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        data: [...actualValues, ...Array(forecastDays).fill(null)],
        itemStyle: { color },
        areaStyle: { opacity: 0.1 },
      });
      // 预测虚线
      series.push({
        name: `${displayName}（预测）`,
        type: 'line',
        smooth: true,
        symbol: 'diamond',
        symbolSize: 4,
        lineStyle: { type: 'dashed', width: 1.5 },
        data: [
          ...Array(dateList.length - 1).fill(null),
          actualValues[actualValues.length - 1],
          ...predicted,
        ],
        itemStyle: { color, opacity: 0.6 },
      });
    });

    chart.setOption(
      {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any[]) => {
            if (!params.length) return '';
            const date = params[0].axisValue;
            const isForecast = forecastDates.includes(date);
            let lines = [
              `<b>${date}</b>${isForecast ? ' <span style="color:#f59e0b">预测</span>' : ''}`,
            ];
            for (const p of params) {
              if (p.value == null) continue;
              lines.push(`${p.marker} ${p.seriesName}: ${Number(p.value).toLocaleString()} tokens`);
            }
            return lines.join('<br/>');
          },
        },
        legend: {
          show: modelMap.size > 1,
          textStyle: { color: isDark ? '#d4d4d8' : '#52525b', fontSize: 11 },
        },
        grid: { left: 60, right: 20, top: 40, bottom: 30 },
        xAxis: {
          type: 'category',
          data: allDates,
          axisLabel: { color: isDark ? '#a1a1aa' : '#71717a', fontSize: 10, rotate: 30 },
          // 预测区域分隔线
          markLine: forecastDates.length > 0 ? undefined : undefined,
        },
        yAxis: {
          type: 'value',
          name: 'Tokens',
          axisLabel: { color: isDark ? '#a1a1aa' : '#71717a', fontSize: 10 },
          splitLine: {
            lineStyle: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
          },
        },
        series,
      },
      true,
    );
  }, [trend, isDark, days]);

  // 模型饼图
  useIdleCallback(() => {
    if (!modelPieRef.current) return;
    if (!modelPieInstance.current) {
      modelPieInstance.current = echarts.init(modelPieRef.current, undefined, {
        renderer: 'canvas',
      });
    }
    const chart = modelPieInstance.current;
    const data = modelStats.map((m, i) => ({
      name: m.model_name || m.model_id,
      value: m.call_count,
      itemStyle: { color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] },
    }));

    chart.setOption(
      {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        series: [
          {
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 6,
              borderColor: isDark ? '#27272a' : '#ffffff',
              borderWidth: 2,
            },
            label: { show: true, color: isDark ? '#d4d4d8' : '#52525b', fontSize: 11 },
            data,
          },
        ],
      },
      true,
    );
  }, [modelStats, isDark]);

  // 用途柱状图
  useIdleCallback(() => {
    if (!typeBarRef.current) return;
    if (!typeBarInstance.current) {
      typeBarInstance.current = echarts.init(typeBarRef.current, undefined, { renderer: 'canvas' });
    }
    const chart = typeBarInstance.current;
    const cats = typeStats.map((s) => USAGE_TYPE_LABELS[s.usage_type] || s.usage_type);
    const vals = typeStats.map((s) => s.call_count);

    chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        grid: { left: 80, right: 20, top: 20, bottom: 30 },
        xAxis: {
          type: 'category',
          data: cats,
          axisLabel: { color: isDark ? '#a1a1aa' : '#71717a', fontSize: 11 },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: isDark ? '#a1a1aa' : '#71717a', fontSize: 10 },
          splitLine: {
            lineStyle: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
          },
        },
        series: [
          {
            type: 'bar',
            data: vals.map((v, i) => ({
              value: v,
              itemStyle: {
                color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                borderRadius: [4, 4, 0, 0],
              },
            })),
            barWidth: '50%',
          },
        ],
      },
      true,
    );
  }, [typeStats, isDark]);

  // 响应式
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      trendInstance.current?.resize();
      modelPieInstance.current?.resize();
      typeBarInstance.current?.resize();
    });
    if (trendRef.current) ro.observe(trendRef.current);
    if (modelPieRef.current) ro.observe(modelPieRef.current);
    if (typeBarRef.current) ro.observe(typeBarRef.current);
    return () => ro.disconnect();
  }, []);

  // 主题切换
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      trendInstance.current?.dispose();
      modelPieInstance.current?.dispose();
      typeBarInstance.current?.dispose();
      trendInstance.current = null;
      modelPieInstance.current = null;
      typeBarInstance.current = null;
      loadData();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [loadData]);

  const handleExport = async () => {
    const { from, to } = getDateRange(days);
    const csv = await window.api.aiUsage.exportCsv(from, to);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-usage-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const daysOptions = [7, 30, 90, 180];

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <SkeletonLine width="8rem" height="1.5rem" />
          <SkeletonLine width="10rem" height="2rem" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
        <SkeletonRect className="surface-card rounded-xl" height="18rem" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonRect className="surface-card rounded-xl" height="16rem" />
          <SkeletonRect className="surface-card rounded-xl" height="16rem" />
        </div>
        <div className="surface-card rounded-xl p-5 space-y-3">
          <SkeletonLine width="6rem" height="0.875rem" />
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonTableRow key={i} columns={7} />
          ))}
        </div>
        <div className="surface-card rounded-xl p-5 space-y-3">
          <SkeletonLine width="6rem" height="0.875rem" />
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonTableRow key={i} columns={7} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* 顶部栏 */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
            {t('nav.aiStats')}
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
              {daysOptions.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    days === d
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  {d}天
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="导出 CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </FadeIn>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <StatCard icon={<Activity className="w-5 h-5" />} label="总调用" value={totalCalls} />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            label="总 Token"
            value={totalTokens.toLocaleString()}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <StatCard
            icon={<Coins className="w-5 h-5" />}
            label="总费用"
            value={`$${totalCost.toFixed(4)}`}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="平均延迟"
            value={`${avgLatency}ms`}
          />
        </motion.div>
      </div>

      {/* 趋势折线图 */}
      <FadeIn delay={0.1}>
        <div className="surface-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">
            Token 用量趋势
          </h3>
          <div ref={trendRef} className="w-full h-[280px]" />
        </div>
      </FadeIn>

      {/* 模型分布 + 用途分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FadeIn delay={0.15}>
          <div className="surface-card rounded-xl p-5">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">
              模型调用分布
            </h3>
            <div ref={modelPieRef} className="w-full h-[240px]" />
          </div>
        </FadeIn>
        <FadeIn delay={0.2}>
          <div className="surface-card rounded-xl p-5">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">用途分布</h3>
            <div ref={typeBarRef} className="w-full h-[240px]" />
          </div>
        </FadeIn>
      </div>

      {/* 费用明细表 */}
      <FadeIn delay={0.25}>
        <div className="surface-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">费用明细</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    模型
                  </th>
                  <th className="text-right py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    调用次数
                  </th>
                  <th className="text-right py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    总 Token
                  </th>
                  <th className="text-right py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    费用 (USD)
                  </th>
                </tr>
              </thead>
              <tbody>
                {modelStats.map((m, idx) => (
                  <tr
                    key={m.model_id}
                    className={`border-b border-zinc-100 dark:border-zinc-800 ${idx % 2 === 1 ? 'bg-zinc-50/50 dark:bg-zinc-800/30' : ''}`}
                  >
                    <td className="py-2.5 text-zinc-800 dark:text-zinc-200">
                      {m.model_name || m.model_id}
                    </td>
                    <td className="py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-300">
                      {m.call_count}
                    </td>
                    <td className="py-2.5 text-right font-mono text-zinc-600 dark:text-zinc-300">
                      {m.total_tokens.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right font-mono text-blue-600 dark:text-blue-400">
                      ${m.total_cost.toFixed(4)}
                    </td>
                  </tr>
                ))}
                {modelStats.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-zinc-400 dark:text-zinc-500 text-xs"
                    >
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </FadeIn>

      {/* 最近调用日志 */}
      <FadeIn delay={0.3}>
        <div className="surface-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">最近调用</h3>
            {recentLogs.length > 0 && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {recentLogs.length} 条记录
              </span>
            )}
          </div>
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white/80 dark:bg-[#28272b]/80 backdrop-blur-sm z-10">
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    时间
                  </th>
                  <th className="text-left py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    模型
                  </th>
                  <th className="text-left py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    用途
                  </th>
                  <th className="text-right py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    Tokens
                  </th>
                  <th className="text-right py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    费用
                  </th>
                  <th className="text-right py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    延迟
                  </th>
                  <th className="text-center py-2.5 text-zinc-500 dark:text-zinc-400 font-medium">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className={`border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${idx % 2 === 1 ? 'bg-zinc-50/50 dark:bg-zinc-800/30' : ''}`}
                  >
                    <td className="py-2 text-zinc-500 dark:text-zinc-400 text-xs whitespace-nowrap">
                      {log.created_at}
                    </td>
                    <td className="py-2 text-zinc-800 dark:text-zinc-200 text-xs">
                      {log.model_name}
                    </td>
                    <td className="py-2 text-xs">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        {USAGE_TYPE_LABELS[log.usage_type] || log.usage_type}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-zinc-600 dark:text-zinc-300 text-xs">
                      {log.total_tokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-mono text-blue-600 dark:text-blue-400 text-xs">
                      ${log.cost_usd.toFixed(6)}
                    </td>
                    <td className="py-2 text-right font-mono text-zinc-500 dark:text-zinc-400 text-xs">
                      {log.latency_ms}ms
                    </td>
                    <td className="py-2 text-center">
                      {log.success ? (
                        <span className="inline-flex w-1.5 h-1.5 rounded-full bg-green-500" />
                      ) : (
                        <span
                          className="inline-flex w-1.5 h-1.5 rounded-full bg-red-500"
                          title={log.error_msg || '失败'}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {recentLogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center text-zinc-400 dark:text-zinc-500 text-xs"
                    >
                      暂无调用记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
