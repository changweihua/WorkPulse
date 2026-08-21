// src/renderer/src/lib/holiday.ts
// 中国法定节假日 + 调休数据服务
// 数据源：timor.tech API（主）→ holiday-cn via jsDelivr（备）→ 内置静态表（兜底）

import { useEffect, useState } from 'react';

export interface HolidayInfo {
    name: string;
    type: 'holiday' | 'workday'; // holiday=法定假日, workday=调休上班
}

export type HolidayMap = Record<string, HolidayInfo>;

// ---------- 内置兜底数据（2026） ----------
const BUILTIN_2026: HolidayMap = {
    '2026-01-01': { name: '元旦', type: 'holiday' },
    '2026-01-02': { name: '元旦', type: 'holiday' },
    '2026-01-03': { name: '元旦', type: 'holiday' },
    '2026-01-04': { name: '元旦', type: 'workday' },
    '2026-02-15': { name: '春节', type: 'workday' },
    '2026-02-16': { name: '春节', type: 'workday' },
    '2026-02-17': { name: '春节', type: 'holiday' },
    '2026-02-18': { name: '春节', type: 'holiday' },
    '2026-02-19': { name: '春节', type: 'holiday' },
    '2026-02-20': { name: '春节', type: 'holiday' },
    '2026-02-21': { name: '春节', type: 'holiday' },
    '2026-02-22': { name: '春节', type: 'holiday' },
    '2026-02-23': { name: '春节', type: 'holiday' },
    '2026-02-28': { name: '春节', type: 'workday' },
    '2026-04-05': { name: '清明节', type: 'holiday' },
    '2026-04-06': { name: '清明节', type: 'holiday' },
    '2026-04-26': { name: '清明节', type: 'workday' },
    '2026-05-01': { name: '劳动节', type: 'holiday' },
    '2026-05-02': { name: '劳动节', type: 'holiday' },
    '2026-05-03': { name: '劳动节', type: 'holiday' },
    '2026-05-04': { name: '劳动节', type: 'holiday' },
    '2026-05-05': { name: '劳动节', type: 'holiday' },
    '2026-05-09': { name: '劳动节', type: 'workday' },
    '2026-06-19': { name: '端午节', type: 'workday' },
    '2026-06-25': { name: '端午节', type: 'holiday' },
    '2026-06-26': { name: '端午节', type: 'holiday' },
    '2026-06-27': { name: '端午节', type: 'holiday' },
    '2026-09-27': { name: '国庆节', type: 'workday' },
    '2026-10-01': { name: '国庆节', type: 'holiday' },
    '2026-10-02': { name: '国庆节', type: 'holiday' },
    '2026-10-03': { name: '国庆节', type: 'holiday' },
    '2026-10-04': { name: '国庆节', type: 'holiday' },
    '2026-10-05': { name: '国庆节', type: 'holiday' },
    '2026-10-06': { name: '国庆节', type: 'holiday' },
    '2026-10-07': { name: '国庆节', type: 'holiday' },
    '2026-10-08': { name: '国庆节', type: 'holiday' },
    '2026-10-10': { name: '国庆节', type: 'workday' },
};

const BUILTIN_MAPS: Record<number, HolidayMap> = { 2026: BUILTIN_2026 };

// ---------- 缓存 ----------
const memoryCache = new Map<number, HolidayMap>();
const inflight = new Map<number, Promise<HolidayMap>>();

function readLocalStorage(year: number): HolidayMap | null {
    try {
        const raw = localStorage.getItem(`holidays_${year}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as HolidayMap;
        if (!parsed || typeof parsed !== 'object') return null;
        // 缓存有效期：一年后过期（国务院一般每年11月底发布次年安排）
        const cachedAt = localStorage.getItem(`holidays_${year}_at`);
        if (cachedAt && Date.now() - Number(cachedAt) > 180 * 24 * 3600 * 1000) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeLocalStorage(year: number, data: HolidayMap): void {
    try {
        localStorage.setItem(`holidays_${year}`, JSON.stringify(data));
        localStorage.setItem(`holidays_${year}_at`, String(Date.now()));
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
            const data = await fromTimor(year);
            memoryCache.set(year, data);
            writeLocalStorage(year, data);
            return data;
        } catch {
            try {
                const data = await fromHolidayCN(year);
                memoryCache.set(year, data);
                writeLocalStorage(year, data);
                return data;
            } catch {
                console.warn(`[holiday] ${year} 年节假日数据获取失败，使用内置数据`);
                return BUILTIN_MAPS[year] || {};
            }
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
    const [map, setMap] = useState<HolidayMap>(() => memoryCache.get(year) || BUILTIN_MAPS[year] || {});

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
