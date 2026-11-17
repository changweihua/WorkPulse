// src/renderer/src/lib/holiday.ts
// 中国法定节假日 + 调休数据服务（多源合并）
// 数据源：timor.tech API / holiday-cn via jsDelivr / NewLife.Holiday(.NET 离线库) / 内置静态表
// 四个源并行拉取，按优先级合并互补并标注每条记录的来源。

import { useEffect, useState } from 'react';

/** 节假日数据来源。优先级从高到低：timor > holiday-cn > newlife > builtin */
export type HolidaySource = 'timor' | 'holiday-cn' | 'newlife' | 'builtin';

export interface HolidayInfo {
  name: string;
  type: 'holiday' | 'workday'; // holiday=法定假日, workday=调休上班
  source: HolidaySource; // 该条数据来自哪个源
}

export type HolidayMap = Record<string, HolidayInfo>;

/** 数据源优先级：数值越小优先级越高，冲突时高优先级胜出 */
const SOURCE_PRIORITY: Record<HolidaySource, number> = {
  timor: 0,
  'holiday-cn': 1,
  newlife: 2,
  builtin: 3,
};

/** 来源中文标签，供 UI 展示 */
export const HOLIDAY_SOURCE_LABEL: Record<HolidaySource, string> = {
  timor: 'Timor',
  'holiday-cn': 'Holiday-CN',
  newlife: 'NewLife 离线库',
  builtin: '内置数据',
};

/** 取某条日期的来源标签；无数据返回空串 */
export function getHolidaySourceLabel(map: HolidayMap, dateStr: string): string {
  const info = map[dateStr];
  return info ? HOLIDAY_SOURCE_LABEL[info.source] || info.source : '';
}

// ---------- 内置兜底数据（2026） ----------
const BUILTIN_2026: HolidayMap = {
  '2026-01-01': { name: '元旦', type: 'holiday', source: 'builtin' },
  '2026-01-02': { name: '元旦', type: 'holiday', source: 'builtin' },
  '2026-01-03': { name: '元旦', type: 'holiday', source: 'builtin' },
  '2026-01-04': { name: '元旦', type: 'workday', source: 'builtin' },
  '2026-02-15': { name: '春节', type: 'workday', source: 'builtin' },
  '2026-02-16': { name: '春节', type: 'workday', source: 'builtin' },
  '2026-02-17': { name: '春节', type: 'holiday', source: 'builtin' },
  '2026-02-18': { name: '春节', type: 'holiday', source: 'builtin' },
  '2026-02-19': { name: '春节', type: 'holiday', source: 'builtin' },
  '2026-02-20': { name: '春节', type: 'holiday', source: 'builtin' },
  '2026-02-21': { name: '春节', type: 'holiday', source: 'builtin' },
  '2026-02-22': { name: '春节', type: 'holiday', source: 'builtin' },
  '2026-02-23': { name: '春节', type: 'holiday', source: 'builtin' },
  '2026-02-28': { name: '春节', type: 'workday', source: 'builtin' },
  '2026-04-05': { name: '清明节', type: 'holiday', source: 'builtin' },
  '2026-04-06': { name: '清明节', type: 'holiday', source: 'builtin' },
  '2026-04-26': { name: '清明节', type: 'workday', source: 'builtin' },
  '2026-05-01': { name: '劳动节', type: 'holiday', source: 'builtin' },
  '2026-05-02': { name: '劳动节', type: 'holiday', source: 'builtin' },
  '2026-05-03': { name: '劳动节', type: 'holiday', source: 'builtin' },
  '2026-05-04': { name: '劳动节', type: 'holiday', source: 'builtin' },
  '2026-05-05': { name: '劳动节', type: 'holiday', source: 'builtin' },
  '2026-05-09': { name: '劳动节', type: 'workday', source: 'builtin' },
  '2026-06-19': { name: '端午节', type: 'workday', source: 'builtin' },
  '2026-06-25': { name: '端午节', type: 'holiday', source: 'builtin' },
  '2026-06-26': { name: '端午节', type: 'holiday', source: 'builtin' },
  '2026-06-27': { name: '端午节', type: 'holiday', source: 'builtin' },
  '2026-09-27': { name: '国庆节', type: 'workday', source: 'builtin' },
  '2026-10-01': { name: '国庆节', type: 'holiday', source: 'builtin' },
  '2026-10-02': { name: '国庆节', type: 'holiday', source: 'builtin' },
  '2026-10-03': { name: '国庆节', type: 'holiday', source: 'builtin' },
  '2026-10-04': { name: '国庆节', type: 'holiday', source: 'builtin' },
  '2026-10-05': { name: '国庆节', type: 'holiday', source: 'builtin' },
  '2026-10-06': { name: '国庆节', type: 'holiday', source: 'builtin' },
  '2026-10-07': { name: '国庆节', type: 'holiday', source: 'builtin' },
  '2026-10-08': { name: '国庆节', type: 'holiday', source: 'builtin' },
  '2026-10-10': { name: '国庆节', type: 'workday', source: 'builtin' },
};

const BUILTIN_MAPS: Record<number, HolidayMap> = { 2026: BUILTIN_2026 };

// ---------- 缓存 ----------
// 缓存键带版本：旧格式（无 source 字段）不会被复用，避免合并结果缺来源标注
const CACHE_VERSION = 'v2';
const memoryCache = new Map<number, HolidayMap>();
const inflight = new Map<number, Promise<HolidayMap>>();

function cacheKey(year: number): string {
  return `holidays_${CACHE_VERSION}_${year}`;
}

function readLocalStorage(year: number): HolidayMap | null {
  try {
    const raw = localStorage.getItem(cacheKey(year));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HolidayMap;
    if (!parsed || typeof parsed !== 'object') return null;
    // 缓存有效期：180 天（国务院一般每年 11 月底发布次年安排）
    const cachedAt = localStorage.getItem(`${cacheKey(year)}_at`);
    if (cachedAt && Date.now() - Number(cachedAt) > 180 * 24 * 3600 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalStorage(year: number, data: HolidayMap): void {
  try {
    localStorage.setItem(cacheKey(year), JSON.stringify(data));
    localStorage.setItem(`${cacheKey(year)}_at`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

// ---------- 数据源 1：timor.tech ----------
interface TimorEntry {
  holiday: boolean;
  name: string;
  date: string;
}

async function fromTimor(year: number): Promise<HolidayMap> {
  const resp = await fetch(`https://timor.tech/api/holiday/year/${year}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`timor HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.code !== 0 || !json.holiday) throw new Error('timor 响应异常');
  const map: HolidayMap = {};
  for (const entry of Object.values(json.holiday) as TimorEntry[]) {
    if (!entry?.date || !entry?.name) continue;
    map[entry.date] = {
      name: entry.name,
      type: entry.holiday ? 'holiday' : 'workday',
      source: 'timor',
    };
  }
  if (Object.keys(map).length === 0) throw new Error('timor 空数据');
  return map;
}

// ---------- 数据源 2：holiday-cn via jsDelivr ----------
interface HolidayCNDay {
  name: string;
  date: string;
  isOffDay: boolean;
}

async function fromHolidayCN(year: number): Promise<HolidayMap> {
  const urls = [
    `https://cdn.jsdelivr.net/gh/NateScarlett/holiday-cn@master/${year}.json`,
    `https://fastly.jsdelivr.net/gh/NateScarlett/holiday-cn@master/${year}.json`,
  ];
  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!Array.isArray(json.days)) throw new Error('格式异常');
      const map: HolidayMap = {};
      for (const day of json.days as HolidayCNDay[]) {
        if (!day?.date || !day?.name) continue;
        map[day.date] = {
          name: day.name,
          type: day.isOffDay ? 'holiday' : 'workday',
          source: 'holiday-cn',
        };
      }
      if (Object.keys(map).length === 0) throw new Error('空数据');
      return map;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr || new Error('holiday-cn 全部失败');
}

// ---------- 数据源 3：NewLife.Holiday（.NET 离线库） ----------
interface DotnetHolidayEntry {
  name: string;
  type: string;
}

async function fromNewLife(year: number): Promise<HolidayMap> {
  // .NET Bridge 未就绪（如目标机缺 .NET 运行时）时，dotnet.invoke 会 reject，由调用方降级
  if (!window.api?.dotnet?.invoke) throw new Error('dotnet bridge 不可用');
  const raw = await window.api.dotnet.invoke('getChinaHolidays', year);
  const parsed = JSON.parse(String(raw)) as Record<string, DotnetHolidayEntry>;
  const map: HolidayMap = {};
  for (const [date, entry] of Object.entries(parsed)) {
    if (!date || !entry?.name) continue;
    map[date] = {
      name: entry.name,
      type: entry.type === 'workday' ? 'workday' : 'holiday',
      source: 'newlife',
    };
  }
  if (Object.keys(map).length === 0) throw new Error('NewLife 空数据');
  return map;
}

// ---------- 多源合并 ----------
/**
 * 按优先级合并多个来源：低优先级源先铺底，高优先级源覆盖同日期记录；
 * 每个来源只补充自己有而别人没有的日期，实现互补。
 * sources 每项带 source 标记，按 SOURCE_PRIORITY 从低到高铺，保证高优先级最终胜出。
 */
function mergeSources(sources: Array<{ map: HolidayMap; source: HolidaySource }>): HolidayMap {
  const ordered = [...sources].sort(
    (a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source],
  );
  const merged: HolidayMap = {};
  for (const { map } of ordered) Object.assign(merged, map);
  return merged;
}

// ---------- 对外接口 ----------
export async function getYearHolidays(year: number): Promise<HolidayMap> {
  // 内存缓存
  const mem = memoryCache.get(year);
  if (mem) return mem;

  // 本地缓存
  const local = readLocalStorage(year);
  if (local) {
    memoryCache.set(year, local);
    return local;
  }

  // 去重并发请求
  const pending = inflight.get(year);
  if (pending) return pending;

  const task = (async (): Promise<HolidayMap> => {
    try {
      // 四个源并行拉取，各自失败不影响其它源（allSettled）
      const [timor, cn, newlife] = await Promise.allSettled([
        fromTimor(year),
        fromHolidayCN(year),
        fromNewLife(year),
      ]);

      const sources: Array<{ map: HolidayMap; source: HolidaySource }> = [];
      const builtin = BUILTIN_MAPS[year];
      if (builtin) sources.push({ map: builtin, source: 'builtin' });
      if (newlife.status === 'fulfilled') sources.push({ map: newlife.value, source: 'newlife' });
      if (cn.status === 'fulfilled') sources.push({ map: cn.value, source: 'holiday-cn' });
      if (timor.status === 'fulfilled') sources.push({ map: timor.value, source: 'timor' });

      const merged = mergeSources(sources);
      if (Object.keys(merged).length > 0) {
        memoryCache.set(year, merged);
        writeLocalStorage(year, merged);
        return merged;
      }
      console.warn(`[holiday] ${year} 年所有数据源均失败，返回空数据`);
      return {};
    } finally {
      inflight.delete(year);
    }
  })();

  inflight.set(year, task);
  return task;
}

// ---------- 查询工具 ----------
export function isHolidayDate(map: HolidayMap, dateStr: string): boolean {
  return map[dateStr]?.type === 'holiday';
}

export function isWorkdaySwap(map: HolidayMap, dateStr: string): boolean {
  return map[dateStr]?.type === 'workday';
}

export function getHolidayName(map: HolidayMap, dateStr: string): string {
  const info = map[dateStr];
  return info?.type === 'holiday' ? info.name : '';
}

// ---------- React Hook ----------
/**
 * 订阅某年的节假日数据。返回 {} 表示尚未加载完成（内置 2026 数据可同步返回）。
 * 同一年份的多个组件共享同一请求（inflight 去重）。
 */
export function useHolidays(year: number): HolidayMap {
  const [map, setMap] = useState<HolidayMap>(
    () => memoryCache.get(year) || BUILTIN_MAPS[year] || {},
  );

  useEffect(() => {
    let active = true;
    getYearHolidays(year).then((data) => {
      if (active) setMap(data);
    });
    return () => {
      active = false;
    };
  }, [year]);

  return map;
}

// 模块加载时预取当年数据
const currentYear = new Date().getFullYear();
void getYearHolidays(currentYear);
void getYearHolidays(currentYear + 1);
