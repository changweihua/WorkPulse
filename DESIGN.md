# WorkPulse 设计规范（DESIGN.md）

> 本文档描述 WorkPulse 的视觉设计体系：色彩、材质、层级、组件规范。
> 修改任何视觉样式前请先阅读本文档，保持设计语言一致。

---

## 1. 设计原则

1. **材质优先**：Windows 11 原生 Mica / Acrylic 作为全局背景层，应用内容悬浮其上
2. **单一强调色**：全应用交互色只有一套语言 —— 蓝 = 可交互/激活，zinc = 中性，红 = 危险，绿 = 成功
3. **暗色即默认公民**：每个组件编写时必须同时考虑 `dark:` 变体，禁止只写浅色样式
4. **半透明有度**：所有表面使用低不透明度叠加，但必须保证文字对比度（WCAG AA）

---

## 2. 材质与透明度层级

窗口通过 Electron 原生 API 启用材质（`backgroundMaterial`，设置页可切换 mica / tabbed / acrylic）：

```
┌─────────────────────────────────────┐
│ DWM 材质（Mica / Tabbed / Acrylic） │  ← 窗口最底层，壁纸染色
├─────────────────────────────────────┤
│ Chrome 带（55% 色调 + 毛玻璃）       │  ← 标题栏、导航栏：直接透出材质
├─────────────────────────────────────┤
│ 内容区基础层（88% 色调）             │  ← 保证正文对比度的稳定暗底
├─────────────────────────────────────┤
│ 卡片表面（60% 色调）                │  ← surface-card 等 token
└─────────────────────────────────────┘
```

### 关键规则

| 层 | 浅色 | 暗色 | 说明 |
|---|---|---|---|
| 标题栏 / 导航栏 / 页面操作栏 | `bg-white/50 backdrop-blur-md` | `dark:bg-[#28282b]/55 backdrop-blur-md` | 直接叠在材质上，**根容器不得再铺背景** |
| 内容区基础层 | `bg-white/50` | `dark:bg-[#28282b]/88` | 只铺在 `<main>` / outlet 容器 |
| 卡片 | `--color-surface-card` | 自动切换 | 见下方 token |

> ⚠️ **历史教训**：基础层曾铺在布局根容器上，导致导航栏实际透光率仅 ~7%，Mica 完全不可见。
> 基础层必须下移到内容区容器，chrome 带直接接触材质。

---

## 3. 色彩系统

### 3.1 Design Tokens（`src/renderer/src/index.css`）

所有颜色通过 CSS 变量定义，组件通过 Tailwind 类（如 `surface-card`）或 `var(--color-*)` 消费，**禁止硬编码十六进制色值**。

#### 表面（Surface）

| Token | 浅色 | 暗色 | 用途 |
|---|---|---|---|
| `--color-surface-card` | `rgb(255 255 255 / 0.72)` | `rgb(40 40 43 / 0.72)` | 卡片（毛玻璃） |
| `--color-surface-elevated` | `rgb(255 255 255 / 0.65)` | `rgb(40 40 43 / 0.75)` | 浮层 / 下拉 |
| `--color-surface-input` | `rgb(255 255 255 / 0.72)` | `rgb(40 40 43 / 0.72)` | 输入框（毛玻璃） |
| `--color-surface-inset` | `rgb(0 0 0 / 4%)` | `rgb(255 255 255 / 5%)` | 内嵌区域 |

对应工具类：`.surface-card` `.surface-elevated` `.surface-input` `.surface-inset`

> **毛玻璃（glassmorphism）**：`.surface-card` / `.surface-input` / `.stat-card` 均叠加 `backdrop-filter: blur(16px) saturate(180%)`，背景走 `--color-surface-card` / `--color-surface-input` 半透明 token，边框走 `--glass-border`、阴影走 `--glass-shadow`（均在 `:root` / `.dark` 定义，**禁止在规则里硬编码 rgba**）。卡片暗色用 zinc-800（`rgb(40 40 43)`），须比浮层 `.surface-elevated` 更亮，以维持「浮层 > 卡片」的层级关系。

#### 文字（Text）

| Token | 浅色 | 暗色 | 用途 |
|---|---|---|---|
| `--color-text` | `rgb(9 9 11)` | `rgb(250 250 250)` | 主文字 |
| `--color-text-secondary` | `rgb(113 113 122)` | `rgb(212 212 216)` | 次级文字 |
| `--color-text-tertiary` | `rgb(161 161 170)` | `rgb(161 161 170)` | 辅助文字 |

Tailwind 等价写法：主文字 `text-zinc-800 dark:text-zinc-100`，次级 `text-zinc-500 dark:text-zinc-400`。

#### 边框（Border）

| Token | 浅色 | 暗色 |
|---|---|---|
| `--color-border` | `rgb(0 0 0 / 6%)` | `rgb(255 255 255 / 10%)` |
| `--color-border-subtle` | `rgb(0 0 0 / 5%)` | `rgb(255 255 255 / 6%)` |
| `--color-border-strong` | `rgb(0 0 0 / 12%)` | `rgb(255 255 255 / 16%)` |

#### 语义色（Semantic）

| 语义 | 主色 | 浅底 |
|---|---|---|
| 成功 | `#22c55e` (green-500) | 10%/15% 透明底 |
| 警告 | `#f59e0b` (amber-500) | 同上 |
| 错误 | `#ef4444` (red-500) | 同上 |
| 信息 | `#3b82f6` (blue-500) | 同上 |

### 3.2 强调色（Accent）

- **主交互色**：`blue-500`（`#3b82f6`）/ hover `blue-600`
- 用于：主按钮、开关开启态、焦点环（`focus:border-blue-400 focus:ring-blue-100`）、激活标签页指示条、链接
- **中性激活态**（分段选择器、导航胶囊）：浅色 `bg-zinc-900 text-white`，暗色 `dark:bg-white/15 dark:text-zinc-50`
- **禁止混用** indigo / sky / violet 作为通用交互色（violet 仅限会议预约等特定语义场景）

### 3.3 分类色板（CATEGORY_COLORS）

统计图表的分类柱条使用固定循环色板（`StatsPage.tsx`），按数据排名取色：

```
蓝 #3b82f6 → 紫 #8b5cf6 → 青 #06b6d4 → 绿 #10b981 → 琥珀 #f59e0b → 玫红 #f43f5e
```

---

## 4. 组件规范

### 4.1 按钮

| 类型 | 样式 |
|---|---|
| 主按钮 | `bg-blue-600 hover:bg-blue-700 text-white rounded-md` |
| 次按钮 | `border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800` |
| 危险按钮 | `bg-red-600 hover:bg-red-700 text-white` |
| 图标按钮 | `p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700` |
| 分段选择器激活项 | 见 3.2 中性激活态 |

所有可交互元素必须带：`transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70`。

### 4.2 开关（Toggle）

- 关闭态轨道：`bg-zinc-300 dark:bg-zinc-600`，旋钮白色
- 开启态：`bg-blue-500`（禁止用近白色轨道）
- 焦点环：`focus:ring-blue-400`

### 4.3 卡片

统一使用 `.surface-card rounded-xl p-5`；浮层（下拉、模态）用 `.surface-elevated` + `backdrop-blur-md` + `shadow-lg`。

### 4.4 空状态

居中图标 + 一句话引导（如「当天暂无待办，点击 + 添加」），文字 `text-xs text-zinc-400 dark:text-zinc-500`。

---

## 5. 图标与图形

- **图标库**：lucide-react，默认尺寸 14–16px（行内）/ 24px（空状态）
- **窗口控制按钮**（TitleBar）：macOS 式红绿灯，降饱和配色 `#f87171 / #fbbf24 / #4ade80`，hover 提亮一档
- **托盘图标**：≤32px 用满画布粗壮版，≥48px 带高光渐变精致版（`build/gen-tray-icons.js` 生成）

---

## 6. 图表

- **柱状图 / 折线图**：ECharts，堆叠柱 + `echarts.graphic.LinearGradient` 渐变填充
- **主题响应**：MutationObserver 监听 `.dark` 类切换重建图表；字体统一走 `FONT_FAMILY` 常量
- **3D 贡献图**：@react-three/fiber InstancedMesh，时间渐变色 gray→pink→yellow→green→yellow→gray
- **环形图**：SVG 手绘（teal `#2dd4bf` + yellow `#facc15`）

---

## 7. 动效

| 名称 | 规格 | 用途 |
|---|---|---|
| `animate-fade-in` | opacity 0→1 | 表单展开、下拉出现 |
| `animate-slide-up` | 上移淡入 0.35s ease-out both | 卡片入场（配合 animationDelay 阶梯延迟） |
| 路由切换 | `routeFadeIn` 300ms opacity+translateY | AnimatedOutlet |
| 进度条 | `transition-[width] duration-700 ease-out` | 数据加载 |

**禁令**：不要给列表项加 scale/hover 位移动画（历史教训：抖动、不稳重）；不要在 useEffect 依赖里放每次渲染都变化的引用（如 `useI18n()` 返回的 `t`，需用 tRef 模式，否则无限循环闪烁）。

---

## 8. 深浅色适配检查清单

新增/修改页面时逐项核对：

- [ ] 无裸写的 `bg-white` / `text-gray-*` / `border-gray-*`（必须带 `dark:` 或换 token 类）
- [ ] 彩色按钮（green/red/blue 等 600 系）确认深浅通用，无需变体
- [ ] 次级文字至少 `dark:text-zinc-400`，标签类用 `dark:text-zinc-300`
- [ ] 边框用 `dark:border-zinc-700/70` 系或 `var(--color-border)`
- [ ] 图片 / 画布区域在暗色下有中性深色底
- [ ] Markdown 内容（`prose` 类）：`dark:prose-invert` 对 tw-prose 独立包**无效**，必须依赖 `index.css` 中 `.dark .prose` 的 `--tw-prose-*` 变量覆盖（已内置，新增排版元素时检查该块是否覆盖到）
- [ ] 在亮色壁纸 + Acrylic 材质下目视检查文字对比度
- [ ] `npx tsc --noEmit -p tsconfig.web.json` 通过

---

## 9. 相关文件索引

| 文件 | 职责 |
|---|---|
| `src/renderer/src/index.css` | 全部 design tokens + 工具类 + 动画关键帧 |
| `src/renderer/src/layout/*.tsx` | 三套布局（NavLayout / TitleBarLayout / Layout）与透明度层级 |
| `src/renderer/src/components/TitleBar.tsx` | 自绘标题栏（拖拽区、红绿灯、tooltip） |
| `src/main/index.ts` | 窗口创建、`backgroundMaterial` 材质设置 |
| `resources/splash.html` | 启动屏（浅色渐变风格，版本号由 sync-version.ts 同步） |
