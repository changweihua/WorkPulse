# WorkPulse 代码审查规则

> 基于项目依赖实际版本生成，审查时逐项核对。
> 最后更新：2026-09-22

---

## 一、技术栈版本基线

| 类别 | 依赖             | 版本              | 备注                  |
| ---- | ---------------- | ----------------- | --------------------- |
| 框架 | React            | ^19.3.0           | 已启用新特性          |
| 路由 | react-router-dom | ^7.18.4           | v7 Data 模式          |
| 状态 | Zustand          | ^5.0.15           | 命名导出 + useShallow |
| ORM  | Drizzle ORM      | ^0.45.3           | better-sqlite3 驱动   |
| 校验 | Zod              | ^4.6.5            | v4 语法               |
| 动画 | Motion           | ^13.4.0           | 原 Framer Motion      |
| 样式 | Tailwind CSS     | ^4.3.3            | CSS-first @theme      |
| 构建 | Vite             | ^8.3.0            | Rolldown 引擎         |
| 语言 | TypeScript       | ^7.0.2            | Go 原生移植           |
| 图表 | ECharts          | ^6.1.0            | —                     |
| 3D   | Three.js + R3F   | ^0.186.0 / ^9.7.0 | —                     |
| 图标 | lucide-react     | ^1.47.0           | 默认 14-16px          |

---

## 二、React 19 审查规则

### ✅ 必须使用

| 规则                             | 说明                                                             |
| -------------------------------- | ---------------------------------------------------------------- |
| **ref 直接作为 prop**            | 函数组件直接接收 `ref`，禁止 `forwardRef`（React 19 已弃用）     |
| **ref 回调用花括号**             | `ref={(el) => { instance = el }}` — 隐式返回赋值表达式是 TS 错误 |
| **Context 直接作 Provider**      | `<ThemeContext value={theme}>` 而非 `<ThemeContext.Provider>`    |
| **`use()` 读取 Promise/Context** | 可在条件分支中调用（`useContext` 不行）；Promise 必须缓存        |
| **`useActionState`**             | 替代实验期 `useFormState`，从 `react` 导入                       |
| **`useFormStatus`**              | 从 `react-dom` 导入，必须渲染在 `<form>` 内部                    |
| **`useOptimistic`**              | setter 只能在 Transition 或 Action 内调用                        |
| **`startTransition` 支持 async** | 异步函数可直接传入                                               |

### ❌ 禁止使用

| 规则                                     | 原因                             |
| ---------------------------------------- | -------------------------------- |
| `forwardRef`                             | React 19 已弃用，用 codemod 迁移 |
| 字符串 ref                               | React 19 已移除                  |
| `propTypes` / `defaultProps`（函数组件） | React 19 已移除，用 TypeScript   |
| `createFactory`                          | 已移除                           |
| Legacy Context API                       | 已移除                           |
| `react-dom/test-utils` 中的 `act`        | 改从 `react` 导入                |

### ⚠️ 注意事项

- `use()` 不能在 `try-catch` 中调用，需用 Error Boundary
- `useOptimistic` setter 禁止在渲染期间调用
- ref cleanup 函数：`ref={(el) => { /* 创建 */ return () => { /* 清理 */ } }}`

---

## 三、Zustand v5 审查规则

### ✅ 必须使用

| 规则                          | 示例                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| **命名导出**                  | `import { create, createStore, useStore } from 'zustand'`  |
| **`create<T>()(...)` 双调用** | 第一对括号传类型，第二对执行创建                           |
| **对象选择器用 `useShallow`** | `useStore(store, useShallow((s) => ({ a: s.a, b: s.b })))` |
| **中间件组合顺序**            | `devtools(persist(fn, persistOpts), devtoolsOpts)`         |
| **devtools 生产环境关闭**     | `enabled: import.meta.env.DEV`                             |

### ❌ 禁止使用

| 规则                                    | 原因                         |
| --------------------------------------- | ---------------------------- |
| `create(fn, shallow)` 第二参数          | v5 已移除，改用 `useShallow` |
| 默认导出 `import create from 'zustand'` | v5 已移除默认导出            |
| `store.setState({}, true)` 不完整状态   | `replace: true` 类型更严格   |

### ⚠️ persist 行为变更

- 创建 store 时**不再自动持久化**初始状态，需要显式 `setState` 触发
- 运行时可用 `store.persist.setOptions()` 动态修改配置

---

## 四、Drizzle ORM 审查规则

### ✅ 必须使用

| 规则                                       | 说明                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| **Schema 定义用 `sqliteTable` 第三参数**   | 索引/约束放第三参数，返回数组                               |
| **外键列建索引**                           | 一对多/一对一 JOIN 的性能关键                               |
| **热路径用 `prepare()` + `placeholder()`** | 预编译语句复用执行计划                                      |
| **批量操作用 `db.batch()`**                | 隐式事务 + 单次 IPC 往返                                    |
| **只取所需列**                             | `columns: { title: true }` 减少序列化                       |
| **自引用外键延迟类型**                     | `t.integer().references((): t.AnySQLiteColumn => users.id)` |

### ❌ 禁止使用

| 规则                              | 原因                              |
| --------------------------------- | --------------------------------- |
| 未建索引的外键列做 JOIN           | 性能问题                          |
| `db.query.*` 不提供 schema        | 关系型查询需要 schema + relations |
| 热路径重复创建 prepared statement | 应复用                            |

### SQLite PRAGMA 优化

```ts
// 推荐配置
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
```

---

## 五、Zod v4 审查规则

### ✅ 必须使用

| 规则                   | 示例                                            |
| ---------------------- | ----------------------------------------------- |
| **顶层字符串格式**     | `z.email()` 而非 `z.string().email()`           |
| **统一错误参数**       | `z.string().min(5, { error: "至少 5 个字符" })` |
| **对象构造**           | `z.strictObject()` / `z.looseObject()`          |
| **扩展用 `.extend()`** | 替代 `.merge()`（TS 性能更好）                  |
| **枚举用 `z.enum()`**  | 替代 `z.nativeEnum()`                           |
| **记录类型双参数**     | `z.record(z.string(), z.number())`              |

### ❌ 禁止使用

| 规则                                           | 原因                                        |
| ---------------------------------------------- | ------------------------------------------- |
| `z.string().email()` 方法链                    | 废弃，下个 major 删除                       |
| `.strict()` / `.passthrough()`                 | 改用 `z.strictObject()` / `z.looseObject()` |
| `.merge()`                                     | 改用 `.extend()`                            |
| `z.nativeEnum()`                               | 改用 `z.enum()`                             |
| `z.promise()` / `ZodEffects` / `ZodPreprocess` | 已删除                                      |
| `.deepPartial()`                               | 已删除                                      |
| 单参数 `z.record(val)`                         | 必须双参数                                  |

### 性能提示

- `z.compile()` 扁平化快速校验器
- `zod/mini` bundle 仅 1.88kb（-85%）

---

## 六、Tailwind CSS v4 审查规则

### ✅ 必须使用

| 规则                             | 说明                                                |
| -------------------------------- | --------------------------------------------------- |
| **CSS-first 配置**               | 无 `tailwind.config.js`，所有定制在 CSS `@theme` 中 |
| **v4 刻度**                      | `shadow-xs/sm`、`rounded-xs/sm`、`ring`（1px）语义  |
| **颜色走 `@theme` 令牌**         | 禁止硬编码十六进制（DESIGN.md :50）                 |
| **自定义工具类用 `@utility`**    | 支持变体组合                                        |
| **暗色模式用 `@custom-variant`** | `@custom-variant dark (&:where(.dark, .dark *));`   |

### ❌ 禁止使用

| 规则                                 | 原因                                   |
| ------------------------------------ | -------------------------------------- |
| `tailwind.config.js`                 | v4 已移除                              |
| `shadow` / `rounded` / `blur` 无后缀 | v4 中语义已变（`shadow` = 1px）        |
| `ring`（3px 语义）                   | v4 中 `ring` 默认 1px + `currentColor` |
| `text-opacity-*` / `flex-grow-*`     | 已移除                                 |
| 硬编码 `bg-white` / `text-gray-*`    | 必须带 `dark:` 或用 token              |

### 新能力（推荐使用）

- **容器查询**：`@container` + `@sm:` 替代视口断点（组件级响应式）
- **子网格**：`grid-cols-subgrid` 继承父网格轨道
- **`starting:` 变体**：元素首次渲染时过渡，免 JS
- **`transition-discrete`**：支持 `display`、`overlay` 属性过渡

---

## 七、Motion（Framer Motion）审查规则

### ✅ 必须使用

| 规则                          | 示例                                             |
| ----------------------------- | ------------------------------------------------ |
| **从 `motion/react` 导入**    | `import { motion, animate } from "motion/react"` |
| **`motion.create(Comp)`**     | 替代旧 `motion(Comp)` 工厂写法                   |
| **高频值用 `useMotionValue`** | 避免 React 重渲染                                |

### ❌ 禁止使用

| 规则                          | 原因                         |
| ----------------------------- | ---------------------------- |
| `import from "framer-motion"` | 包名已变更                   |
| `motion(Comp)` 工厂写法       | 改用 `motion.create(Comp)`   |
| 列表项 scale/hover 位移动画   | DESIGN.md 禁令：抖动、不稳重 |

### 性能提示

- 简单动画优先用 Web Animations API（混合引擎自动选择）
- `useMotionValue` 把高频值更新移出 React 渲染周期

---

## 八、Vite 8 审查规则

### ✅ 必须使用

| 规则                          | 说明                       |
| ----------------------------- | -------------------------- |
| **`build.rolldownOptions`**   | 替代 `build.rollupOptions` |
| **ESM only**                  | Node 20.19+ / 22.12+       |
| **`@vitejs/plugin-react` v6** | Oxc 替代 Babel             |

### ❌ 禁止使用

| 规则                             | 原因              |
| -------------------------------- | ----------------- |
| `build.rollupOptions`            | 已 deprecated     |
| `build.commonjsOptions`          | Rolldown 自动处理 |
| `resolve.alias[].customResolver` | 已移除            |

### electron-vite 注意

- 确认插件已适配 Rolldown
- 检查是否依赖 `rollupOptions` 钩子或 esbuild transform

---

## 九、TypeScript 7 审查规则

### ✅ 必须使用

| 规则                             | 说明                                |
| -------------------------------- | ----------------------------------- |
| **`strict: true`**               | TS7 默认启用                        |
| **`rootDir` 显式声明**           | 默认 `./`，src 结构项目需 `"./src"` |
| **`types` 显式声明**             | 默认 `[]`，需写 `["node"]` 等       |
| **import `with` 替代 `asserts`** | `import ... with { type: "json" }`  |

### ❌ 禁止使用

| 规则                       | 原因                         |
| -------------------------- | ---------------------------- |
| `target: "es5"`            | 已移除                       |
| `moduleResolution: "node"` | 已移除                       |
| `baseUrl`（配合 `paths`）  | `paths` 改为相对 tsconfig 根 |
| `esModuleInterop: false`   | 不可再设 false               |

### ⚠️ 工具链兼容

- `typescript-eslint` 等尚不兼容 TS7 API
- 建议：CLI 用 TS7 tsc，编辑器暂留 TS6（并排安装）

---

## 十、React Router v7 审查规则

### ✅ 必须使用

| 规则                              | 示例                                                |
| --------------------------------- | --------------------------------------------------- |
| **从 `react-router` 导入**        | `import { Link, useFetcher } from "react-router"`   |
| **DOM 入口用 `react-router/dom`** | `import { RouterProvider } from "react-router/dom"` |
| **`useFetcher<typeof loader>()`** | 类型用 `typeof` 而非泛型                            |

### ❌ 禁止使用

| 规则                         | 原因                              |
| ---------------------------- | --------------------------------- |
| `import from "@remix-run/*"` | 已合并进 `react-router`           |
| `defer()`                    | 已移除，用原生 Promise + 流式传输 |
| v6 future flags 未开启就升级 | 应先在 v6 开满 flags              |

---

## 十一、项目级审查规则（DESIGN.md / AGENTS.md）

### 设计规范

- **暗色即默认**：每个组件必须同时考虑 `dark:` 变体
- **材质层级**：基础层只铺在内容区，chrome 带直接接触材质
- **毛玻璃**：`.surface-card` / `.surface-input` 叠加 `backdrop-filter: blur(16px) saturate(180%)`
- **强调色**：主交互色 `blue-500` / `blue-600`，禁止混用 indigo/sky/violet
- **可交互元素**：必须带 `transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70`
- **Markdown 渲染**：`dark:prose-invert` 对 tw-prose 无效，依赖 `index.css` 中 `.dark .prose` 变量覆盖
- **动画禁令**：不要给列表项加 scale/hover 位移动画；不要在 useEffect 依赖里放每次渲染都变化的引用

### 代码规范

- **语言**：对话/注释/文档用中文，代码本身（变量名/函数名/类型名）用英文
- **禁止 `as any`**：严格类型
- **颜色**：禁止硬编码十六进制，用 `@theme` 令牌
- **Electron 主进程**：窗口创建用 `backgroundMaterial` 材质
- **Electron 安全**：`contextIsolation: true`，通过 `contextBridge` 暴露 API

---

## 十二、审查检查清单

每次代码审查时逐项核对：

### React

- [ ] 无 `forwardRef`（改用 ref prop）
- [ ] ref 回调使用花括号块体
- [ ] Context 直接作 Provider
- [ ] `useActionState` 从 `react` 导入
- [ ] `useFormStatus` 从 `react-dom` 导入
- [ ] `useOptimistic` setter 在 Transition/Action 内

### Zustand

- [ ] 命名导出 `import { create } from 'zustand'`
- [ ] 对象选择器用 `useShallow`
- [ ] devtools 生产环境关闭

### Drizzle

- [ ] 外键列已建索引
- [ ] 热路径用 `prepare()` + `placeholder()`
- [ ] 批量操作用 `db.batch()`

### Zod

- [ ] 字符串格式用顶层 `z.email()` 等
- [ ] 错误用 `error` 参数
- [ ] 无废弃 API（`.merge()`、`z.nativeEnum()` 等）

### Tailwind

- [ ] 无硬编码十六进制颜色
- [ ] v4 刻度正确（`shadow-xs/sm`、`ring` 1px）
- [ ] 暗色变体完整
- [ ] 自定义工具类用 `@utility`

### Motion

- [ ] 从 `motion/react` 导入
- [ ] 高频值用 `useMotionValue`

### Vite

- [ ] 使用 `rolldownOptions` 而非 `rollupOptions`

### TypeScript

- [ ] `rootDir` 已显式声明
- [ ] 无 `target: "es5"` 或 `moduleResolution: "node"`

### Router

- [ ] 从 `react-router` 导入
- [ ] `useFetcher` 类型用 `typeof loader`

### 设计

- [ ] 每个组件有 `dark:` 变体
- [ ] 无裸写 `bg-white` / `text-gray-*`
- [ ] 可交互元素有 focus-visible 环
- [ ] 无列表项 scale/hover 位移动画
