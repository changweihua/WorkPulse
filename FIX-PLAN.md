# WorkPulse 代码审查修复方案

> 基于 4 路并行审查结果生成，按优先级排序。
> 最后更新：2026-09-22

---

## P0 严重问题（可访问性 + 规范违规）

### Fix 1：全局添加 `focus-visible` 焦点环

**问题**：40+ 可交互元素缺少焦点环，键盘导航不可用

**修复方式**：在 `index.css` 的 `@theme` 块之后、组件样式之前添加全局基础规则：

```css
/* 焦点环全局基础 — DESIGN.md §4.1 */
button:focus-visible,
a:focus-visible,
[role='button']:focus-visible,
[tabindex]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.7); /* blue-400/70 */
}
```

**影响范围**：`index.css` 1 处修改，全局生效
**验证**：用 Tab 键在页面中导航，所有按钮/链接应显示蓝色焦点环

---

### Fix 2：修复错误的焦点环颜色（4 处）

**文件与修改**：

| 文件                         | 行号 | 修改                                                                                                                                  |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `layout/NavLayout.tsx`       | 258  | `ring-sky-500/70` → `ring-blue-400/70`                                                                                                |
| `layout/NavLayout.tsx`       | 296  | `ring-sky-500/70` → `ring-blue-400/70`                                                                                                |
| `components/AIChatPanel.tsx` | 856  | `focus:ring-violet-500/20 focus:border-violet-500/30` → `focus:ring-blue-400/20 focus:border-blue-400/30`                             |
| `components/AIChatPanel.tsx` | 982  | `focus-within:ring-violet-500/20 focus-within:border-violet-500/30` → `focus-within:ring-blue-400/20 focus-within:border-blue-400/30` |

---

## P1 中等问题

### Fix 3：React Router 导入路径迁移（8 处）

将所有 `react-router-dom` 导入改为 v7 规范路径。

| 文件                            | 行号 | 当前                                                                                    | 修改为                                                                                            |
| ------------------------------- | ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `router.tsx`                    | 2    | `import { createHashRouter, Navigate } from 'react-router-dom'`                         | `import { Navigate } from 'react-router'` + `import { createHashRouter } from 'react-router/dom'` |
| `App.tsx`                       | 3    | `import { RouterProvider } from 'react-router-dom'`                                     | `import { RouterProvider } from 'react-router/dom'`                                               |
| `layout/TitleBarLayout.tsx`     | 2    | `import { Outlet } from 'react-router-dom'`                                             | `import { Outlet } from 'react-router'`                                                           |
| `layout/Layout.tsx`             | 2    | `import { Outlet, Link, useNavigate, useLocation, useMatches } from 'react-router-dom'` | `import { Outlet, Link, useNavigate, useLocation, useMatches } from 'react-router'`               |
| `layout/NavLayout.tsx`          | 2    | `import { Link, useLocation, useMatches, useNavigate } from 'react-router-dom'`         | `import { Link, useLocation, useMatches, useNavigate } from 'react-router'`                       |
| `components/AnimatedOutlet.tsx` | 2    | `import { Outlet, useLocation, useOutlet } from 'react-router-dom'`                     | `import { Outlet, useLocation, useOutlet } from 'react-router'`                                   |
| `components/DotnetFAB.tsx`      | 3    | `import { useNavigate } from 'react-router-dom'`                                        | `import { useNavigate } from 'react-router'`                                                      |
| `components/TitleBar.tsx`       | 1    | `import { useLocation } from 'react-router-dom'`                                        | `import { useLocation } from 'react-router'`                                                      |

---

### Fix 4：Toast.tsx Context.Provider 写法（1 处）

**文件**：`components/Toast.tsx:47`

```diff
- <ToastContext.Provider value={value}>
+ <ToastContext value={value}>
```

同文件末尾（约 62 行）：

```diff
- </ToastContext.Provider>
+ </ToastContext>
```

---

### Fix 5：Zustand create 双调用（6 个 store）

将所有 `create<T>(...)` 改为 `create<T>()(...)`：

| 文件                      | 行号 | 修改                                                                                |
| ------------------------- | ---- | ----------------------------------------------------------------------------------- |
| `stores/worklogStore.ts`  | 34   | `create<WorkLogStore>((set, get) => ({` → `create<WorkLogStore>()((set, get) => ({` |
| `stores/themeStore.ts`    | 47   | `create<ThemeStore>((set) => ({` → `create<ThemeStore>()((set) => ({`               |
| `stores/taskStore.ts`     | 29   | `create<TaskStore>((set, get) => ({` → `create<TaskStore>()((set, get) => ({`       |
| `stores/rssStore.ts`      | 54   | `create<RssState>((set, get) => ({` → `create<RssState>()((set, get) => ({`         |
| `stores/languageStore.ts` | 37   | `create<LanguageStore>((set) => ({` → `create<LanguageStore>()((set, get) => ({`    |
| `stores/aiPanelStore.ts`  | 14   | `create<AIPanelStore>((set) => ({` → `create<AIPanelStore>()((set, get) => ({`      |

---

### Fix 6：Zustand 裸解构添加 useShallow（~15 组件）

**高影响组件**（rssStore 6 个、taskStore 2 个、aiPanelStore 2 个、themeStore 1 个）：

修复模式：

```tsx
// ❌ 当前
const { feeds, articles, fetchFeed } = useRssStore();

// ✅ 修复（多字段）
const { feeds, articles, fetchFeed } = useRssStore(
  useShallow((s) => ({ feeds: s.feeds, articles: s.articles, fetchFeed: s.fetchFeed })),
);

// ✅ 修复（单字段 — 更优）
const addLog = useWorkLogStore((s) => s.addLog);
```

**涉及文件**（需逐个确认解构字段）：

- `components/FeedSidebar.tsx:12`
- `components/ArticleList.tsx:22`
- `components/ArticleReader.tsx:291`
- `components/AddFeedDialog.tsx:6`
- `components/OpmlImportExport.tsx:6`
- `pages/RssPage.tsx:56`
- `pages/KanbanPage.tsx:475`
- `components/QuickCreate.tsx:22-23`
- `pages/WorkLogPage.tsx:314`
- `pages/SettingsPage.tsx:200`
- `components/AIFloatingButton.tsx:78`
- `components/AIChatPanel.tsx:307`

同时需在使用 `useShallow` 的文件中添加导入：

```ts
import { useShallow } from 'zustand/react/shallow';
```

---

## P2 低风险问题

### Fix 7：TSX 硬编码 hex 颜色（3-4 处）

| 文件                         | 行号 | 当前                                   | 建议                                         |
| ---------------------------- | ---- | -------------------------------------- | -------------------------------------------- |
| `layout/Layout.tsx`          | 109  | `bg-[#eef4ff]/70 dark:bg-[#28282b]/88` | 在 `@theme` 中定义 `--color-chrome-bg` token |
| `components/AIChatPanel.tsx` | 760  | `bg-white dark:bg-[#0D0D14]`           | 使用 `surface-card` 或定义 token             |
| `pages/AiStatsPage.tsx`      | 676  | `bg-white/80 dark:bg-[#28272b]/80`     | 使用 `surface-input` 或定义 token            |

---

### Fix 8：`hover:scale` 违反动画禁令（1 处）

**文件**：`layout/Layout.tsx:97`

```diff
- className="... hover:scale-[1.02] ..."
+ className="... hover:bg-zinc-100 dark:hover:bg-zinc-800 ..."
```

---

### Fix 9：`surface-card` blur 参数对齐 DESIGN.md

**文件**：`index.css`（`.surface-card` 定义处）

```diff
- backdrop-filter: blur(24px) saturate(200%);
+ backdrop-filter: blur(16px) saturate(180%);
```

或更新 DESIGN.md 以反映当前实现（当前值更激进，效果更强）。

---

## 执行顺序建议

1. **Fix 1** — 全局 focus-visible（1 行 CSS，影响最大）
2. **Fix 2** — 焦点环颜色（4 处机械替换）
3. **Fix 3** — Router 导入路径（8 处机械替换）
4. **Fix 4** — Toast Context.Provider（2 行）
5. **Fix 5** — Zustand create 双调用（6 处机械替换）
6. **Fix 6** — useShallow（需逐个分析字段，最耗时）
7. **Fix 7-9** — 低风险优化

预估：Fix 1-5 可在 10 分钟内完成（纯机械替换），Fix 6 需 20-30 分钟（需分析每个组件的字段使用）。
