# 液态玻璃整体风格接入 · 技术实现 Spec

> 版本：v1（待评审）
> 状态：DRAFT
> 依据：exp-1 现状调研 / exp-2 组件结构调研 / lib-1 外部方案与代价调研
> 目标读者：orchestrator + fixer 执行者

---

## 0. 一句话结论

**不做全屏接管，也不做 DOM→纹理折射（技术底座缺失）。分四层路由：原生窗口材质铺底 + 现有 CSS 体系增强 + `LiquidGlassSurface` 覆盖导航层 + `FluidGlass` 保留为演示页专属。**

核心判断依据：本项目**没有任何 DOM 内容 → WebGL 纹理的捕获机制**（无 `html2canvas`、无 `dom-to-image`、无 `getDisplayMedia`、无实时纹理流，仅 `desktopCapturer` 用于截图 `src/main/screenshot.ts:487`）。因此「让 WebGL shader 折射真实 DOM 背后内容」在当前技术底座上**不可行**，除非引入新依赖或重建捕获管线。而 `backdrop-filter` 本身**没有位移采样能力**，也无法扭曲背后内容。

唯一能真正折射「桌面/窗口外内容」的现成通道是 **`setBackgroundMaterial`（已接入，Windows 系统材质）**——它由 DWM 合成，折射的是**真实桌面**，零 JS/GPU 自维护成本。这是本项目的最大杠杆。

---

## 1. 硬约束（不可协商）

| #   | 约束                                                                                                                                   | 依据                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | **内容层禁用 backdrop-filter 液态化**。16+ 处 `overflow-y-auto` 滚动区的内容卡片不做玻璃位移。                                         | Apple 官方纪律「玻璃只留给导航层，勿用于内容层」；willchan 预算铁律「禁止滚动内容上放 blur，写进 CI 审计」；实测一个 fixed header 的 backdrop-filter 把 61fps 打到 29fps |
| C2  | **禁止玻璃嵌套/叠玻璃**。玻璃元素之上不再叠玻璃元素。                                                                                  | Apple 官方原文；三层叠加实测对比度最差 1.5:1                                                                                                                             |
| C3  | **单帧 backdrop 读取预算 ≤ 3,000,000 设备像素 @ DPR2**。                                                                               | willchan 2026 工程结论                                                                                                                                                   |
| C4  | **filter 函数链视为乘法**。每个 filter function 在放大区域各跑一趟 pass。`blur+saturate` 已是两趟。                                    | 同上：`blur(24px) saturate(140%) brightness(1.05)` 让 header 每帧读 395 万设备像素                                                                                       |
| C5  | **Chrome 表面 blur 半径上限 1 处、radius ≤ 24px**。                                                                                    | 同上                                                                                                                                                                     |
| C6  | **必须提供 `prefers-reduced-transparency` 降级**。                                                                                     | Apple 官方支持；WCAG 合规因用户背景成变量而不确定                                                                                                                        |
| C7  | **必须有 Page Visibility 停环 + 按需渲染**。任何 rAF/WebGL 层在窗口不可见时停。                                                        | 三.js #7670（占满 1-2 核）、cytoscape #2657（15 分钟耗电 4%）                                                                                                            |
| C8  | **悬浮窗 `transparent:true` 是常开 GPU 项（实测 8× 功耗、GPU 永不 idle），不再叠加额外玻璃层**。                                       | tauri #15471 powermetrics 实测 620mW/36% vs 75mW/10%                                                                                                                     |
| C9  | **所有 filter 祖先链禁止 `will-change: transform` / transform 动画**（会触发 `lcd_text_disallowed`，LCD 次像素文本降级为灰度抗锯齿）。 | Chromium 渲染管线分析                                                                                                                                                    |
| C10 | **禁止引入新 npm 依赖**。液态玻璃方案不得引入 `liquid-glass-react` 等 30+ 碎片化包（无事实标准，绝大多数低下载量、无人维护）。         | lib-1 生态核实；老 glassmorphism 包已死                                                                                                                                  |

---

## 2. 管线路由矩阵（关键决策）

液态玻璃五要素：①半透明 blur ②折射位移 ③色散 ④高光 fresnel rim ⑤有机 warp。
**CSS 只能给第①项。②③④⑤ 需要位移采样能力（SVG `feDisplacementMap` 或 shader）。**

| 层级            | 位置                      | 路由管线                                                                 | 能拿到的要素                  | 成本                                                                             | 决策                          |
| --------------- | ------------------------- | ------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------- | ----------------------------- |
| **L0 系统层**   | 主窗口背景                | `setBackgroundMaterial('mica'/'tabbed'/'acrylic')`（**已接入**）         | ①②（真实桌面折射，DWM 合成）  | 近零：DWM 合成器承担                                                             | ✅ **主推**，扩默认值与设置项 |
| **L1 CSS 增强** | 全局 token + 导航层工具类 | 现有 `backdrop-filter` 体系精修                                          | ① + 伪造 ④（inset 高光）      | 低：合成器成本，静态背景近免费                                                   | ✅ 执行                       |
| **L2 覆盖层**   | 侧栏 / 命令面板 / 标题栏  | `LiquidGlassSurface.tsx`（**已存在**：CSS 毛玻璃 + R3F caustic overlay） | ① + ⑤（caustic 动态）+ 伪造 ④ | 中：单 pass 全屏 shader，`dpr={[0.5,1]}` 限像素比、`powerPreference:'low-power'` | ✅ **扩大复用范围**           |
| **L3 演示页**   | FluidGlassPage            | `FluidGlass.tsx`（FBO + MeshTransmissionMaterial）                       | ①②③④⑤ 全量                    | 高：每帧额外一次全场景 pass                                                      | ⚠️ **仅演示页**，不外溢       |
| **L4 禁止**     | 16+ 滚动区内容卡片        | —                                                                        | —                             | 每帧重采样，打爆 C3 预算                                                         | ❌ 硬禁止（C1）               |

### 为什么不做「WebGL 折射 DOM」

`LiquidGlassSurface.tsx:4-5` 文件头注释已明确定位：_"NOT a full WebGL FBO component like FluidGlass.tsx — it wraps any DOM content and adds a 'liquid glass' feel without heavy GPU cost."_ 它**不接受外部背景输入**，折射感完全由 CSS `backdrop-filter` 实现，shader 只叠一层 alpha 极低（`0.15 * intensity`）的 caustic。这是**正确的设计**——因为 DOM→纹理捕获机制缺失，强行做 FBO 折射需要先重建捕获管线（新依赖 + 每帧捕获 = 巨大成本），违反 C10 与 C3。

---

## 3. 分阶段实施

### 阶段一 · L0 系统材质铺底（收益最高、成本最低）

**事实**：`src/main/autoLaunch.ts:80` 已调用 `win.setBackgroundMaterial(data.material)`；材质类型从 `getSetting('window_material')` 读取，默认 `'tabbed'`（`src/main/index.ts:189`）；设置页已有 Mica/Tabbed/Acrylic 三项 UI（`SettingsPage.tsx:485, 974-987`），i18n 文案齐全（`i18n.ts:284-287, 612-615`）。

**要做**：

1. 审计主窗口背景是否**真的透出**材质——`background` 必须为 transparent 才能看到 Mica/Acrylic。检查 `index.css` 的 body/html 背景与各页面根容器背景，凡挡住材质的实心背景改为透明或半透明。
2. 把 `window_material` 从「隐藏设置项」提为**首启引导的视觉选项**（默认按 Windows 版本：Win11 22H2+ 默认 `mica`，其余 `tabbed`）。
3. 标题栏区域显式让位：`TitleBarLayout.tsx:11` 的 `bg-chrome-bg/70` 改为不遮挡材质的处理，让原生材质成为标题栏底。

**验收**：主窗口在 Mica/Acrylic 下背景透出系统材质；滚动密集页帧率不因本阶段下降（本阶段应零下降，因为是 DWM 层）。

**风险**：约 5% Windows 用户 GPU 合成异常（黑屏/灰屏，electron #40515）。缓解：材质项保留「无（不透明）」选项作为降级；GPU 进程崩溃 4 次会自动禁用 `gpu_compositing`，此时回退到 L1 CSS 底色。

---

### 阶段二 · L1 CSS 体系增强（2-4 天）

**要做**（全部在 `src/renderer/src/index.css`）：

1. **补 fresnel 边环**：用 `inset 0 1px 0 rgba(255,255,255,.25)` + `inset 0 -1px 0 rgba(255,255,255,.06)` 伪造顶部高光与底部反光（现有 `.surface-card` 已有部分 inset，需统一到所有玻璃工具类）。
2. **统一 filter 链，砍函数个数**（C4）：现有 `.surface-input` 是 `blur(15px) saturate(180%)`（两趟）。评估把 `saturate` 降为 `150%` 或移除——每省一个 function 就省一趟全区域 pass。
3. **radius 归一**：`.stat-card` 用 `blur(12px)`、`.surface-input` 用 `blur(15px)`、命令面板用 `blur(24px)`。按 C5 统一到 ≤24px，且 chrome 表面只保留一处 blur。
4. **`.dark` 对比度补强**：`.dark` 下 `--glass-border` 仅 `rgb(255 255 255 / 0.12)`，`surface-card` 为 `rgb(30 30 35 / 0.55)`。审计暗色下的文字对比度（审计实测：亮背景最差 2.1:1，需主动 tinting 保对比）。
5. **移除 C9 风险**：审计所有 `.surface-card` 祖先是否有 `will-change: transform` / transform 动画，有则移除。

**验收**：`npm run typecheck:web` + `npm run lint` 通过；肉眼玻璃质感更精致；单帧 backdrop 读取预算核算通过（手算每个 chrome 表面的 `采样区 × radius`，附表）。

**明确不做**：不动 16+ 滚动区内容卡片（C1）；不新增 filter function。

---

### 阶段三 · L2 导航层覆盖（1 周）

**要做**：把 `LiquidGlassSurface` 接入**导航层三处**（Apple 纪律允许的位置）：

1. **侧栏** `NavLayout.tsx:225`（现用 `.surface-sidebar`）
2. **命令面板** `CommandPalette.css:18-37`（现 `blur(6px)` / `blur(24px)`）
3. **标题栏** `TitleBarLayout.tsx:11`

**关键性能门控**（这是本阶段成败点）：

- `LiquidGlassSurface` 内含一个 R3F `<Canvas>`。**每个实例 = 一个 WebGL context**。浏览器对 WebGL context 数量有硬上限（通常 16 个），超出会丢弃最旧的。
- **必须做 context 预算**：全局最多 **2 个** 常驻 `LiquidGlassSurface` 实例（侧栏 + 命令面板，二者不会同时可见，实际上可共用 1 个挂载点）。标题栏**不挂 Canvas**，只用 L1 CSS（标题栏是长条，caustic 收益低、context 成本高）。
- **IntersectionObserver + `animated` 联动**：面板关闭 / 侧栏折叠时，把 `animated={false}` 让 caustic 停（`useFrame` 内部应据此早退）。
- **Page Visibility 停环**（C7）：窗口 hidden 时 `Canvas` 停渲染。检查 R3F 是否默认停（R3F v9 默认 `frameloop="always"`，需改为按需）。
- **`dpr={[0.5, 1]}` 已限像素比**，保留；`powerPreference: 'low-power'` 保留。

**验收**：命令面板呼出/关闭、侧栏折叠/展开、窗口切换 tab，全程 FPS ≥ 55；`chrome://tracing` 或活动监视器确认 GPU 无常驻占用（**DevTools 的 GPU 归因不可信**——含动画 backdrop-filter 时 DevTools 报 GPU idle 但活动监视器显示 GPU 进程 20% CPU）。

**降级**：`prefers-reduced-transparency` 命中 → `LiquidGlassSurface` 退化为不透明实心 surface（`frosted={false}` + 不透明背景），只保留布局不保留玻璃。

---

### 阶段四 · L3 演示页边界锁定（0.5 天）

**要做**：`FluidGlass.tsx` 是全量液态玻璃（FBO + `MeshTransmissionMaterial`，`samples:6` / `resolution:256` / `ior:1.15` / `chromaticAberration:0.05`），每帧额外一次全场景 pass。**必须锁死在演示页**：

1. 在 `FluidGlass.tsx` 文件头加显式警告注释：_「FBO 折射材质，每帧额外一次全场景渲染。仅限演示页使用，禁止复用到生产 UI 层。生产 UI 请用 LiquidGlassSurface（L2）或 L0/L1。」_
2. `FluidGlassPage` 已有 `useGLTF.preload` 模块级预加载 + 删除 `key={mode}` 避免重建 WebGL context（前序任务已做），保留。
3. 补 Page Visibility：窗口 hidden 时停 R3F frameloop。

**验收**：演示页在窗口 hidden 时 GPU 占用归零。

---

## 4. 降级路径总表

| 触发条件                  | 检测方式                                   | 降级动作                                                                                        |
| ------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 用户开启减少透明度        | `prefers-reduced-transparency: reduce`     | L1/L2 全部退实心不透明 surface；L0 材质保留（系统层不受影响）                                   |
| 用户开启减少动态          | `prefers-reduced-motion: reduce`           | `LiquidGlassSurface.animated={false}`（caustic 停）                                             |
| GPU 合成异常（黑屏/灰屏） | electron #40515，约 5% Windows 用户        | `window_material` 提供「无」选项；GPU 进程崩溃 4 次自动禁 `gpu_compositing`，回退 L1 CSS 实心底 |
| 窗口不可见                | `document.visibilitychange`                | 停所有 rAF / R3F frameloop（C7）                                                                |
| 命令面板/侧栏隐藏         | 组件卸载或 `animated={false}`              | 释放 caustic，避免空转                                                                          |
| 低电量/省电模式           | 暂无统一 API，用 IntersectionObserver 近似 | 屏外玻璃层不渲染                                                                                |

---

## 5. 性能门控阈值（可写进 CI / lint）

| 阈值                              | 值                              | 依据                       |
| --------------------------------- | ------------------------------- | -------------------------- |
| 单帧 backdrop 读取                | ≤ 3,000,000 设备像素 @ DPR2     | willchan FRAME_READ_BUDGET |
| chrome 表面 blur 半径             | ≤ 24px，且每表面仅 1 处 blur    | C5                         |
| filter function 链长度            | ≤ 2（blur + 至多 1 个调整函数） | C4 乘法效应                |
| 常驻 `LiquidGlassSurface` 实例    | ≤ 2（WebGL context 预算）       | context 数量硬上限         |
| 滚动内容区 backdrop-filter        | **0**                           | C1                         |
| 玻璃嵌套                          | **0**                           | C2                         |
| filter 祖先 will-change:transform | **0**                           | C9                         |

**建议落地方式**：写一个 `scripts/audit-glass-budget.mjs`，用正则/AST 扫 `src/renderer/src/**/*.tsx` 与 `index.css`，统计 `backdrop-filter` 出现次数、radius 值、filter 函数个数、是否在 `overflow-y-auto` 容器内，超阈值即退出码非 0。这是 willchan「写进 CI 审计」的直接落地。

---

## 6. 风险登记表

| 风险                                      | 等级 | 缓解                                                                       |
| ----------------------------------------- | ---- | -------------------------------------------------------------------------- |
| WebGL context 超限导致 caustic 丢失       | 高   | 阶段三 context 预算 ≤2；共享挂载点                                         |
| Mica/Acrylic 在部分 Win10/低版本不支持    | 中   | 按版本默认；提供「无」降级项                                               |
| 可读性回归（对比度随背景波动）            | 高   | `prefers-reduced-transparency` 降级 + 最坏背景测试 + 主动 tinting 层       |
| DevTools GPU 归因不可信导致误判性能       | 中   | 用活动监视器 / `chrome://tracing`，不用 DevTools Performance 面板的 GPU 行 |
| R3F v9 默认 `frameloop="always"` 造成空转 | 中   | 显式改按需 + Page Visibility                                               |
| 30+ 碎片化 npm 包诱惑                     | 中   | C10 硬禁止引入；一切自建于现有组件                                         |

---

## 7. 分阶段节奏（借鉴 Slack 分阶段上线）

Slack 的做法：day-one 只做 tab bar / create menu / 会话 header / composer，玻璃 header、搜索入口等高风险改动后置逐月打磨。

本项目对应：

- **day-one（阶段一+二）**：原生材质铺底 + CSS 增强。零 WebGL 风险，收益立现，可全量发布。
- **逐月打磨（阶段三）**：导航层 caustic 覆盖，先内部灰度（加一个 `liquid_glass_overlay` 设置开关，默认关，观察一周 FPS 与电池反馈再默认开）。
- **永久边界（阶段四）**：演示页锁定，防止 FBO 材质外溢到生产层。

---

## 8. 不做什么（明确否决）

| 否决项                                                       | 理由                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 引入 `liquid-glass-react` / `@avenra/liquid-glass` 等 npm 包 | 生态碎片化 30+ 包无事实标准，违反 C10；且其能力（SVG feDisplacementMap 折射 DOM）本项目无 DOM 捕获需求，性价比低 |
| 重建 DOM→纹理捕获管线以做 WebGL 折射 DOM                     | 需新依赖 + 每帧捕获，违反 C3/C10；`LiquidGlassSurface` 文件头注释已明确定位否决                                  |
| 16+ 滚动区内容卡片玻璃化                                     | C1 硬约束，实测把 61fps 打到 29fps                                                                               |
| 主窗口全屏接管 + 常驻 rAF                                    | C7/C8；cytoscape 实测 15 分钟耗电 4%                                                                             |
| 透明悬浮窗叠加玻璃层                                         | C8；transparent:true 已是 8× GPU 功耗基线                                                                        |
| 玻璃嵌套                                                     | C2；三层叠加对比度最差 1.5:1                                                                                     |

---

## 9. 附：现状资产清单（可复用）

| 资产                | 路径                                                                                                                                                                                   | 状态                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| CSS 玻璃 token 体系 | `index.css` surface-card/elevated/input、chrome-bg、panel-dark、glass-border/shadow，`.dark` 全覆盖                                                                                    | ✅ 已完备                          |
| 玻璃工具类          | `.stat-card`(752) `.surface-card`(1233) `.surface-sidebar`(1299) `.surface-elevated`(1363) `.surface-input`(1373) `.glass-border-active`(1425) `.bg-mica`(1467) `.reveal-border`(1477) | ✅ 已完备                          |
| 主题三档            | `@theme` 7-58 + `@theme static` 65-123 + `[data-accent]` 145-209（7 色）+ `.dark` 212-273；`themeStore.ts:25-45`                                                                       | ✅ 已完备                          |
| 覆盖层组件          | `LiquidGlassSurface.tsx`（CSS + R3F caustic，props: intensity/tintColor/animated/frosted）                                                                                             | ✅ 待扩大复用                      |
| FBO 演示组件        | `FluidGlass.tsx`（MeshTransmissionMaterial + FBO + 原生 pointermove + 模块级 preload）                                                                                                 | ✅ 锁演示页                        |
| 原生窗口材质        | `autoLaunch.ts:80` `setBackgroundMaterial`；`index.ts:189` 读 `window_material`；`SettingsPage.tsx:485,974-987` UI                                                                     | ✅ **已接入，最大杠杆**            |
| DOM→纹理捕获        | 无 html2canvas / dom-to-image / getDisplayMedia / 实时纹理流                                                                                                                           | ❌ 缺失（决定不做 WebGL 折射 DOM） |
| SVG filter          | 无 feDisplacementMap / feImage / feTurbulence                                                                                                                                          | ❌ 缺失                            |
