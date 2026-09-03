import { create } from 'zustand'

interface AIPanelStore {
  /** AI 聊天抽屉是否打开 */
  open: boolean
  /** 打开面板 */
  openPanel: () => void
  /** 关闭面板 */
  closePanel: () => void
  /** 切换面板 */
  togglePanel: () => void
}

export const useAIPanelStore = create<AIPanelStore>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  togglePanel: () => set((s) => ({ open: !s.open })),
}))
