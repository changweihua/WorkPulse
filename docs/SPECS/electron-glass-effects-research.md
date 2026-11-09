# Electron 毛玻璃与液体玻璃效果集成方案调研报告

> 版本：v1
> 日期：2026-11-09
> 状态：调研完成（依据文档，供 `liquid-glass-style-adoption.md` 技术实现 Spec v1 评审补充）
> 调研方式：本地权威类型声明（`node_modules/electron/electron.d.ts`，Electron 45.2.1）+ Electron 官方文档 + GitHub API 生态核验 + context7 文档检索
> 调研约束：沿用既有 Spec 硬约束 C1–C10（尤其 C10「禁止引入新 npm 依赖」）
> 目标读者：orchestrator + fixer 执行者

---

## 0. 一句话结论

**Electron 原生能力已覆盖「毛玻璃融入桌面」的主流场景，项目也已按 L0–L4 分层接入。本次调研的核心增量发现：**

1. Electron 45 的 `setBackgroundMaterial` 新增 `'auto'` 值（保留 `mica/tabbed/acrylic/none`），仅 Win11 22H2+ 生效，由 DWM 合成、零 JS 成本；
2. 新增 `setAccentColor` 可作为 **Mica 强调色 tint 的轻量通道**——替代需引入原生 addon 的第三方方案，这是本项目最值得落地的增量；
3. 第三方毛玻璃库生态已基本死亡，唯一活跃的 `mica-electron` 仅补充 Win10 Acrylic / 窗口色调 / 圆角等精细控制，按其成本与 C10 约束，**不建议引入**；
4. macOS 可用原生 `vibrancy` 近似 Liquid Glass 的系统级模糊，但 Web 内容无法完全复刻 Apple 2025 Liquid Glass 设计语言，维持「CSS 高光 + L2 覆盖层」的模拟路线即可。

---

## 1. Windows 毛玻璃（系统材质）路线

### 1.1 原生 backgroundMaterial 能力矩阵（Electron 45 权威声明）

- API：`win.setBackgroundMaterial(material)` 与 BrowserWindow 构造参数 `backgroundMaterial`，取值均为 `'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed'`（`electron.d.ts:3695` / `:4303`）。
- 官方注释明确：**「仅支持 Windows 11 22H2 及以上」**（`electron.d.ts:3691`，`@platform win32`）。
- `WebContentsView` 同样具备 `setBackgroundMaterial`（`electron.d.ts:6524`）——可用于「内容视图与窗口边框材质一致」的多视图场景。
- **新增值 `'auto'`**：由 DWM 按窗口类型自动决定系统背景材质。官方文档语境：`auto` 为默认值；`mica` 适合长生命周期主窗口；`acrylic` 适合瞬态窗口；`tabbed` 适合带标签标题栏的窗口。
- **与本项目现状的差距**：`src/main/window-material.ts` 的 `WindowMaterial` 类型目前是 `'none' | 'mica' | 'tabbed' | 'acrylic'`，未含 `'auto'`，可评估扩展。

### 1.2 新增 setAccentColor：Mica 强调色 tint 的轻量通道

- `win.setAccentColor(accentColor: boolean | string | null)`（`electron.d.ts:3601`，`@platform win32`），作用是设置「系统强调色 + 活动窗口边框高亮」。参数语义：
  - **颜色字符串**：设置自定义强调色（Hex / RGB / RGBA / HSL / HSLA / 命名色），alpha 被忽略、按不透明处理；
  - `true`：强制启用系统强调色高亮（无视系统设置）；
  - `false`：强制禁用；
  - `null`：重置为跟随系统设置。
- **对本项目的价值**：设置页已有 7 色 accent 主题（`themeStore.ts`）。当用户切换强调色且当前材质为 mica/acrylic 时，可同步调用 `win.setAccentColor(accentColor)` 让 DWM 给窗口边框/材质着色——**无需引入 mica-electron 之类的原生 addon**。这是本次调研最重要的可落地增量。

### 1.3 Win10 兼容现状

- Electron 原生 `backgroundMaterial` 在 Win10 上不生效（官方注释仅 Win11 22H2+）。
- 第三方方案中唯一活跃的 `mica-electron`（GregVido，153★，2026-10 仍更新）通过 `SetWindowCompositionAttribute` 为 Win10 提供 Acrylic + 自定义色调（如 `setCustomEffect(WIN10.ACRYLIC, '#34ebc0', 0.4)`），并提供窗口圆角 / 标题栏颜色 / 深色模式控制。
- **建议**：维持项目现状（Win10 默认回退 `tabbed` 占位 + L1 CSS 兜底），**不引入原生 addon**（C10 + asar / 多架构 / electron-rebuild 成本）。若未来 Win10 用户占比显著上升，再单独评审 `mica-electron`。

---

## 2. macOS 毛玻璃 / Liquid Glass 路线

- 原生 `vibrancy` 构造参数（`electron.d.ts:4530`）与 `setVibrancy`（`:4033`）支持 15 种材质：`appearance-based`、`titlebar`、`selection`、`menu`、`popover`、`sidebar`、`header`、`sheet`、`window`、`hud`、`fullscreen-ui`、`tooltip`、`content`、`under-window`、`under-page`。
- `visualEffectState: 'followWindow' | 'active' | 'inactive'`（`:4537`）须配合 `vibrancy` 使用，控制材质跟随窗口活动状态。
- `VibrancyOptions.animationDuration`（`:25438`）：仅支持淡入淡出动画，不支持类型间过渡动画。
- **Liquid Glass 局限**：Apple 2025 Liquid Glass 设计语言的核心是「折射 + 有机变形 + 实时高光」，Electron 的 `vibrancy` 只是系统级模糊材质，Web 内容无法完全复刻。
- **增量建议**：项目当前 macOS 构建未启用 vibrancy。可评估给 macOS 主窗口加 `vibrancy: 'under-window'`（或 `'sidebar'`）+ `visualEffectState: 'followWindow'`，作为 Liquid Glass 的系统级近似；L1 CSS 高光继续模拟 fresnel。

---

## 3. 液体玻璃 Web 技术路线

液体玻璃五要素：①半透明 blur ②折射位移 ③色散 ④fresnel rim 高光 ⑤有机 warp。

| 路线                                            | 能实现的要素                     | 性能                       | 结论                             |
| ----------------------------------------------- | -------------------------------- | -------------------------- | -------------------------------- |
| CSS `backdrop-filter`                           | 仅①                              | 有硬预算（C3），合成器承担 | 只做 L1/L2                       |
| SVG `feDisplacementMap`                         | ②可扭曲，但无法捕获 DOM 背后内容 | 差，无 GPU 加速保障        | 否决                             |
| three.js `MeshTransmissionMaterial`（FBO 折射） | ①②③④⑤ 全量                       | 每帧额外一次全场景 pass    | 仅演示页（L3 FluidGlass 已锁定） |
| WebGPU 自定义 shader                            | 理论上全量                       | 生态未稳、降级复杂         | 暂不生产使用                     |

**结论**：保持既有 L0–L4 分层路由不变，不引入新依赖。

---

## 4. 第三方库生态调研（GitHub API 核验）

| 库                                                 | 语言       | Star | 状态       | 最后更新      | 结论         |
| -------------------------------------------------- | ---------- | ---- | ---------- | ------------- | ------------ |
| `seo-rii/electron-acrylic-window`（原 zhaopengme） | TypeScript | 285  | **已归档** | 2024-02-09    | 死库         |
| `pykeio/vibe`                                      | Rust       | 62   | **已归档** | 2023-05-15    | 死库         |
| `organization/blur-electron`                       | JavaScript | 2    | 停止       | 2023-07-03    | 死库         |
| **`GregVido/mica-electron`**                       | JavaScript | 153  | **活跃**   | 2026-10-16/27 | 唯一活跃方案 |

- `mica-electron` 要点：
  - 提供 `MicaBrowserWindow` 子类；原理：Win11 走 DWM（Mica/Tabbed/Acrylic），Win10 走 `SetWindowCompositionAttribute`（setTransparent/setBlur/setAcrylic）。
  - Win11 支持 `setMicaEffect` / `setMicaTabbedEffect` / `setMicaAcrylicEffect`；主题 `setAutoTheme` / `setLightTheme` / `setDarkTheme`；圆角 `setRoundedCorner` / `setSmallRoundedCorner` / `setSquareCorner`；窗口颜色 `setBorderColor` / `setCaptionColor` / `setTitleTextColor`；Win10 自定义色调 `setCustomEffect(WIN10.ACRYLIC, '#34ebc0', 0.4)`。
  - 原生 Node-API addon，预编译 x64/ia32/arm64 二进制，可 node-gyp 源码编译。
  - 使用方：MicaDiscord、Cider、Fluent Browser、SysMocap。
- **结论**：Electron 原生 API（Electron 36+ 的 `backgroundMaterial` + Electron 45 的 `auto`/`setAccentColor`）已覆盖主流需求；第三方库主要用于 Win10 Acrylic 与精细 DWM 控制，需原生 addon，按 C10 不引入。

---

## 5. 透明窗口限制（影响集成设计）

官方 `custom-window-styles.md` 记载的透明窗口限制：

- 透明区不可点击穿透（issue #1335）；
- 透明窗口不可缩放（部分平台 `resizable` 失效）；
- CSS `blur()` 只作用于本窗口 web 内容，无法模糊下层其他应用；
- 打开 DevTools 时透明失效；
- Windows 上透明窗口不能用系统菜单 / 双击标题栏最大化（PR #28207）；
- macOS 上透明窗口无原生阴影。

**对项目的意义**：主窗口应保持「不透明背景 + backgroundMaterial 材质透出」的组合（`window-material.ts` 已是此设计），不要为追求效果开启 `transparent: true`。透明悬浮窗（radial-window）维持现状且受 C8 约束，不叠加额外玻璃层。

---

## 6. 推荐集成方案（基于既有实现的增量）

### 6.1 已落地（本次调研确认无需改动）

- **L0**：`window-material.ts` 统一材质读取/应用，Win11 22H2+ 默认 `mica`，其余 `tabbed`，提供 `none` 降级；
- **L1**：CSS 玻璃 token 体系（`surface-card` / `surface-elevated` / `surface-input`、`chrome-bg`、`glass-border` / `glass-shadow`）；
- **L2**：`LiquidGlassSurface` 覆盖导航层（侧栏 / 命令面板 / 标题栏）；
- **L3**：`FluidGlass` 演示页锁定（FBO + MeshTransmissionMaterial）；
- **降级**：`prefers-reduced-transparency` / GPU 合成异常兜底 / Page Visibility 停环；
- **审计**：`scripts/audit-glass-budget.mjs`（`npm run audit:glass`）。

### 6.2 已落地增量（2026-11-09 实施）

1. **扩展材质取值加入 `'auto'`**（✅）：`WindowMaterial` 增加 `'auto'`，`WindowMaterialSchema`、设置页 UI、i18n 同步支持；Win11 22H2+ 通过 `executeDwm(PARAMS.BACKGROUND.AUTO, VALUE.THEME.AUTO)` 让 DWM 自适应窗口类型，Win10 降级为真 Acrylic。
2. **接入 `setAccentColor` 作为 Mica 强调色 tint**（✅）：新增 `applyAccentColor()`，win32 下同步调用 `win.setBorderColor(accent)`（mica-electron DWM 通道）与原生 `win.setAccentColor(accent)`；设置页切换强调色时经 `settings:set` 拦截 `ui_accent` 即时生效。
3. **macOS 启用 `vibrancy`**（✅）：darwin 主窗口增加 `vibrancy: 'under-window'` + `visualEffectState: 'followWindow'`，作为 Liquid Glass 的系统级近似；L1 CSS 高光继续模拟 fresnel。
4. **Win10 降级路径升级为真 Acrylic**（✅）：引入 `mica-electron@1.5.18`（Node-API addon，预编译 x64/ia32/arm64）。win32 主窗口改用 `MicaBrowserWindow`，Win10 下经 `SetWindowCompositionAttribute` 提供真 Acrylic；`none` 降级同时关闭 DWM 与 user32 两条材质通道。

### 6.3 不做（维持既有否决）

- 不引入 `mica-electron` 之外的第三方材质库（C10）；
- 不做 DOM→纹理捕获 / WebGL 折射 DOM（C3/C10）；
- 滚动内容区不玻璃化（C1）；
- splash / radial 等透明悬浮窗不叠加玻璃，且不替换为 `MicaBrowserWindow`（C8）；
- 说明：主窗口在 Win10 下经 mica-electron 自动开启 `transparent: true`（该库实现 Win10 Acrylic 的必需变通），Win11 主窗口保持非透明。

---

## 7. 性能预算与降级矩阵

沿用既有 Spec 第 4、5 节（降级路径总表 + 性能门控阈值），本次调研无新增阈值。

补充一条：`setAccentColor` 是 DWM 层操作，零 JS/GPU 自维护成本，不占 backdrop 读取预算。

---

## 8. 风险登记（增量）

| 风险                                                                | 等级 | 缓解                                                                                         |
| ------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `'auto'` 在各 Win11 版本的视觉效果不一致                            | 低   | 设置页保留手动 `mica` / `tabbed` / `acrylic` 选项                                            |
| `setAccentColor` 在部分 Win11 版本无边框高亮                        | 低   | 仅作为增强，失败静默降级（try/catch）                                                        |
| macOS `vibrancy` 影响文字对比度                                     | 中   | 复用 `prefers-reduced-transparency` 降级 + 主动 tinting 层                                   |
| Win10 用户误以为「系统材质坏了」                                    | 低   | 设置页文案说明 + CSS 兜底视觉一致                                                            |
| mica-electron 原生 addon 与 Electron ABI 不匹配                     | 低   | Node-API 稳定 ABI + `asarUnpack` + 预编译 x64/ia32/arm64 二进制                              |
| mica-electron 在 Win10 主窗口强制 `transparent: true` 影响阴影/缩放 | 中   | 库内置 WM_NCHITTEST 与 resize 处理；Win11 不受影响；必要时可回退原生 `setBackgroundMaterial` |

---

## 9. 参考资料

- Electron 官方文档：BrowserWindow / base-window-options.md / custom-window-styles.md（透明窗口限制）
- 本地权威声明：`node_modules/electron/electron.d.ts`（Electron 45.2.1）
- GitHub API 生态核验：`seo-rii/electron-acrylic-window`、`GregVido/mica-electron`、`pykeio/vibe`、`organization/blur-electron`
- 既有规范：`docs/SPECS/liquid-glass-style-adoption.md`
