import { create } from 'zustand';

interface WorkLog {
  id: number;
  content: string;
  category: string;
  created_at: string;
  task_id: number | null;
}

interface WorkLogStore {
  logs: WorkLog[];
  loading: boolean;
  hasMore: boolean;
  searchKeyword: string;
  lastDeleted: WorkLog | null;
  fetchLogs: () => Promise<void>;
  loadMore: () => Promise<void>;
  prefetchNext: () => Promise<void>;
  searchLogs: (keyword: string, limit?: number) => Promise<void>;
  clearSearch: () => Promise<void>;
  addLog: (content: string, category?: string) => Promise<WorkLog>;
  deleteLog: (id: number) => Promise<void>;
  undoDelete: () => Promise<void>;
  dismissUndo: () => void;
  updateLog: (id: number, content: string, category: string, created_at?: string) => Promise<void>;
}

const PAGE_SIZE = 50;

/** 搜索结果条数上限：超过时截断展示，并在信息区提示「已显示前 N 条」 */
export const SEARCH_LIMIT = 50;

// Simple cache for prefetched work log data
let prefetchedData: WorkLog[] | null = null;

export const useWorkLogStore = create<WorkLogStore>()((set, get) => ({
  logs: [],
  loading: false,
  hasMore: true,
  searchKeyword: '',
  lastDeleted: null,

  fetchLogs: async () => {
    set({ loading: true });
    try {
      const logs = await window.api.worklog.list(PAGE_SIZE, 0);
      set({ logs, hasMore: logs.length >= PAGE_SIZE });
    } finally {
      set({ loading: false });
    }
  },

  loadMore: async () => {
    if (get().loading || !get().hasMore || get().searchKeyword) return;
    set({ loading: true });
    try {
      // Use prefetched data if available
      let more = prefetchedData;
      if (!more) {
        more = await window.api.worklog.list(PAGE_SIZE, get().logs.length);
      }
      prefetchedData = null;
      set({
        logs: [...get().logs, ...more],
        hasMore: more.length >= PAGE_SIZE,
      });
    } finally {
      set({ loading: false });
    }
  },

  prefetchNext: async () => {
    if (!get().hasMore || get().searchKeyword) return;
    const offset = get().logs.length;
    const data = await window.api.worklog.list(PAGE_SIZE, offset);
    prefetchedData = data.length > 0 ? data : null;
  },

  searchLogs: async (keyword: string, limit: number = SEARCH_LIMIT) => {
    set({ loading: true, searchKeyword: keyword });
    try {
      // limit 透传至 IPC/db 收窄查询，再在前端截断一次兜底（向量模式 topK 可能超过或少于 limit）
      const logs = await window.api.worklog.search(keyword, limit);
      set({ logs: logs.slice(0, limit) });
    } finally {
      set({ loading: false });
    }
  },

  clearSearch: async () => {
    set({ searchKeyword: '' });
    await get().fetchLogs();
  },

  addLog: async (content: string, category?: string) => {
    const log = await window.api.worklog.add(content, category);
    // If searching, re-run search; otherwise prepend
    if (get().searchKeyword) {
      await get().searchLogs(get().searchKeyword);
    } else {
      set({ logs: [log, ...get().logs] });
    }
    return log;
  },

  deleteLog: async (id: number) => {
    const deleted = get().logs.find((l) => l.id === id);
    await window.api.worklog.delete(id);
    set({ logs: get().logs.filter((l) => l.id !== id), lastDeleted: deleted || null });
  },

  undoDelete: async () => {
    const deleted = get().lastDeleted;
    if (!deleted) return;
    await window.api.worklog.restore(deleted);
    set({ lastDeleted: null });
    // Refresh to get correct ordering
    if (get().searchKeyword) {
      await get().searchLogs(get().searchKeyword);
    } else {
      await get().fetchLogs();
    }
  },

  dismissUndo: () => {
    set({ lastDeleted: null });
  },

  updateLog: async (id: number, content: string, category: string, created_at?: string) => {
    const updated = await window.api.worklog.update(id, content, category, created_at);
    if (updated) {
      set({ logs: get().logs.map((l) => (l.id === id ? updated : l)) });
    }
  },
}));
