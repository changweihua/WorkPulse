# WorkPulse 功能说明

**版本:** 0.2.26  
**技术栈:** Electron 44 + React 19 + TypeScript + Vite 8 + SQLite + Zustand + Tailwind CSS 4 + ECharts 6 + Three.js + Transformers.js  

---

## 目录

1. [工作日志](#1-工作日志)
2. [看板](#2-看板)
3. [AI 周报生成](#3-ai-周报生成)
4. [周报摘要](#4-周报摘要)
5. [AI 对话](#5-ai-对话)
6. [日历](#6-日历)
7. [数据统计](#7-数据统计)
8. [悬浮球导航](#8-悬浮球导航)
9. [截图](#9-截图)
10. [快捷创建](#10-快捷创建)
11. [导入导出](#11-导入导出)
12. [附件系统](#12-附件系统)
13. [本地 AI 推理 (ONNX)](#13-本地-ai-推理-onnx)
14. [OCR 文字识别](#14-ocr-文字识别)
15. [PaddleOCR](#15-paddleocr)
16. [X 光图像处理](#16-x-光图像处理)
17. [自动更新](#17-自动更新)
18. [设置中心](#18-设置中心)
19. [多语言支持](#19-多语言支持)
20. [主题系统](#20-主题系统)
21. [会议提醒](#21-会议提醒)
22. [系统托盘与全局快捷键](#22-系统托盘与全局快捷键)
23. [启动画面](#23-启动画面)
24. [数据备份](#24-数据备份)
25. [AI 模型缓存](#25-ai-模型缓存)
26. [.NET FFI 集成](#26-net-ffi-集成)

---

## 1. 工作日志

**路由:** `/worklog`（默认首页）  
**入口文件:** `src/renderer/src/pages/WorkLogPage.tsx`（672 行）

### 功能描述
核心功能模块。用户快速记录工作内容，支持 `#标签` 自动分类。提供全文搜索、行内编辑、删除撤销（5 秒）、分页加载、日期分组、附件管理，以及 CSV/Markdown 导入导出。

### 用户交互流程
1. 在输入框键入工作内容 → 输入 `#分类` 自动解析为标签
2. 按 `Enter` 保存 → 日志按日期分组展示
3. 点击日志项可行内编辑内容、分类、日期
4. 删除时底部弹出撤销条（5 秒自动消失）
5. 搜索框支持防抖全文搜索
6. 支持粘贴截图、选择文件、添加链接作为附件

### 数据库表
```sql
work_logs (id, content, category, created_at, task_id)
```

### 技术要点
- **Zustand store** (`worklogStore.ts`): 管理日志列表状态、分页、搜索
- **全文搜索:** SQLite `LIKE` 查询 + 防抖（300ms）
- **附件:** 通过 `appattachment://` 自定义协议提供本地文件服务
- **CSV/Markdown 导入导出:** 通过 `ipcRenderer.invoke('export:logs')` / `import:logs`

---

## 2. 看板

**路由:** `/kanban`  
**入口文件:** `src/renderer/src/pages/KanbanPage.tsx`（835 行）

### 功能描述
三列拖拽看板（待办 / 进行中 / 已完成），含可折叠草稿侧边栏。任务标记完成时弹出日志创建对话框，并触发纸屑庆祝动画。

### 用户交互流程
1. 使用 `@dnd-kit` 在三列之间拖拽任务
2. 点击任务可行内编辑标题/描述（支持 Markdown 预览）
3. 任务移入"已完成"列 → 弹出对话框要求填写工作日志
4. 确认后触发 `canvas-confetti`（120 粒子）庆祝动画
5. 草稿侧边栏数据存储在 `localStorage`
6. 支持截止日期选择（弹出层日历）

### 数据库表
```sql
tasks (id, title, description, status, board_column, position, created_at, updated_at, completed_at, due_date)
```

### 技术要点
- **状态管理:** `taskStore.ts`（Zustand）
- **拖拽:** `@dnd-kit/core` + `@dnd-kit/sortable`
- **庆祝动画:** `canvas-confetti`
- **状态值:** `todo` / `in_progress` / `done` / `draft`

---

## 3. AI 周报生成

**路由:** `/report`  
**入口文件:** `src/renderer/src/pages/ReportPage.tsx`（476 行）  
**AI 后端:** `src/main/ai.ts`（365 行）

### 功能描述
选择日期范围 → AI 生成结构化 Markdown 工作总结。支持流式输出、自定义系统提示词和报告模板、保存历史记录。

### 用户交互流程
1. 选择日期预设（本周/上周/本月/上月/本季/自定义）
2. 点击"生成" → 流式 Markdown 实时显示
3. 可切换为编辑模式修改内容
4. 保存到报告历史 → 历史侧边栏可查看/复制/导出
5. 支持导出为 Markdown 文件

### 技术要点
- **流式渲染:** `StreamedMarkdown` 组件 + `streamdown` 库（支持 Mermaid 图表）
- **AI 提供商:** OpenAI / Anthropic / DeepSeek 等，通过 `ai.ts` 统一接口
- **数据库表:** `reports (id, type, date_from, date_to, content, generated_at)`

---

## 4. 周报摘要

**路由:** `/reports`  
**入口文件:** `src/renderer/src/pages/ReportsPage.tsx`（272 行）

### 功能描述
自动生成的结构化周报摘要，包含 5 张统计卡片、亮点区域、每日任务/日志/会议计数及 Top 分类。

### 用户交互流程
1. 自动计算当周范围
2. 展示统计卡片：总日志数、完成任务数、进行中任务数、日均日志、本周天数
3. 亮点区域展示本周高产日期
4. 每日分解：任务/日志/会议数量 + 最活跃分类
5. 点击具体日期可展开查看详细内容

---

## 5. AI 对话

**路由:** `/chat`  
**入口文件:** `src/renderer/src/pages/ChatPage.tsx`（974+ 行）

### 功能描述
全功能 AI 聊天界面，支持多对话管理、13 种 AI 提供商预设、流式输出、思考链显示、费用追踪，以及对话导入导出。

### 支持的 AI 提供商
| 提供商 | 模型示例 | 特性 |
|--------|----------|------|
| DeepSeek | deepseek-chat / deepseek-reasoner | 思考链 |
| OpenAI | gpt-4o / o1 / o3-mini | 函数调用 |
| Anthropic | claude-3.5-sonnet | 长上下文 |
| 智谱 | glm-4 | 中文优化 |
| Moonshot | moonshot-v1-8k | 中文 |
| 通义千问 | qwen-max | 中文 |
| Gitee | gitee-completion | 中文 |
| Ollama | llama3 等 | 本地模型 |
| 自定义 | 用户自定义 | 完全可配 |

### 用户交互流程
1. 创建多个命名对话
2. 选择 AI 提供商 → 配置 API Key / 模型 / Base URL
3. 发送消息 → 流式响应 + 思考面板（如支持）
4. 追踪 token 用量和费用
5. 导入/导出对话为 JSON 文件
6. 测试 API 连接

### 技术要点
- **双 IPC 通道:** `ai:stream-chat`（OpenAI SDK 流式）和 `ai-chat-stream`（自定义流式）
- **思考链:** `reasoning_content` 字段支持
- **费用追踪:** 基于 token 计数 × 价格表

---

## 6. 日历

**路由:** `/calendar`  
**入口文件:** `src/renderer/src/pages/CalendarPage.tsx`（515 行）  
**组件:** `ChineseLunarCalendar.tsx`（298 行）

### 功能描述
完整日历视图，集成中国农历日期、节假日/调休检测、待办和会议事件管理。支持事件标记（iOS 风格横条）和提前提醒。

### 用户交互流程
1. 导航月份 → 查看农历日期和节日
2. 待办/会议标签页切换
3. 添加事件（日期/时间/地点）
4. 勾选完成
5. 会议提前提醒通知（30 秒轮询，可配置提前时间）

### 技术要点
- **农历:** `lunar-typescript` 库
- **节假日:** `holiday.ts` 内置 2024-2026 法定节假日
- **提醒:** `scheduler.ts`（30 秒间隔） + `notification.ts`（Windows Toast）
- **数据库表:** `calendar_events (id, type, title, description, event_date, start_time, end_time, location, completed, notified, created_at)`

---

## 7. 数据统计

**路由:** `/stats`  
**入口文件:** `src/renderer/src/pages/StatsPage.tsx`（790 行）

### 功能描述
丰富的数据统计仪表板，含 4 张动画统计卡片、3D 贡献网格、ECharts 环形图和柱状图、分类分布、周摘要和 AI 生成洞察。

### 用户交互流程
1. 选择时间范围（30/90/180/365 天）
2. 查看统计卡片：连续天数、总日志数、完成任务数、进行中任务数（计数动画）
3. 3D 贡献网格（可拖拽，悬停提示）
4. ECharts 环形图：日志/任务比例
5. 每日活动堆叠柱状图
6. 分类分布 + 周摘要
7. AI 自动生成洞察建议

### 技术要点
- **3D 贡献网格:** `ContributionGrid3D.tsx`（Three.js/R3F）
  - InstancedMesh + RoundedBoxGeometry
  - 生长动画 + 联系阴影 + 悬停提示
- **ECharts 6:** 主题感知（暗色/亮色自动切换）
- **计数动画:** 自定义 `useCountUp` hook

---

## 8. 悬浮球导航

**组件:** `RadialMenu.tsx`（384 行）  
**主进程:** `radial-window.ts`（372 行）

### 功能描述
始终置顶的透明悬浮窗口，含 5 个径向扇区，用于快速导航和截图触发。折叠状态下支持 OS 级点击穿透，展开/折叠通过中心按钮，支持拖拽定位。

### 用户交互流程
1. 中心按钮（折叠状态）→ 点击展开（圆形 clip-path 展开动画）
2. 悬停扇区 → 高亮 + 提示文字
3. 点击扇区 → 跳转对应页面或触发截图
4. 拖拽中心按钮 → 重新定位（位置跨会话保存）

### 技术要点
- **窗口:** 独立 Electron BrowserWindow，`alwaysOnTop: true`，`transparent: true`
- **交互:** 鼠标光标轮询（`radial:cursor` IPC）检测悬浮
- **动画:** CSS clip-path `circle()` + CSS transition
- **点击穿透:** `setIgnoreMouseEvents()` 动态切换
- **配置:** `radial_items` / `radial_position` 存储在 SQLite `settings` 表

---

## 9. 截图

**组件:** `screenshot-overlay.tsx`  
**主进程:** `index.ts`（screenshot overlay 逻辑）

### 功能描述
多显示器截图捕获，含区域选择、DPI 感知裁剪，支持快捷键、标题栏按钮、悬浮球三种触发方式。

### 用户交互流程
1. 触发截图：`Ctrl+Shift+S` / 标题栏按钮 / 悬浮球截图扇区
2. 透明覆盖层出现 → 十字准星光标
3. 拖拽绘制选择区域
4. 工具栏出现：复制 / 保存 / 取消
5. 点击复制 → 系统通知"截图已复制到剪贴板"
6. 点击保存 → 保存到 `~/Pictures/WorkPulse/screenshot-{timestamp}.png`
7. 覆盖层 30 秒后自动销毁（可重复使用）

### 技术要点
- **多显示器:** `screen.getDisplayNearestPoint()` 动态获取 scaleFactor
- **DPI 感知:** 选择区域坐标自动乘以显示器 scaleFactor
- **超时保护:** `desktopCapturer.getSources()` 8 秒超时
- **错误反馈:** 截图失败时显示错误提示（2 秒）
- **异步保存:** `fs.writeFile` 非阻塞写入

---

## 10. 快捷创建

**组件:** `QuickCreate.tsx`（139 行）

### 功能描述
全局快捷键触发的模态框，用于快速创建工作日志或看板任务，无需打开主窗口。

### 用户交互流程
1. 按下 `Cmd/Ctrl+Shift+L` → 快速创建日志
2. 按下 `Cmd/Ctrl+Shift+T` → 快速创建任务
3. 输入内容 → 支持 `#标签` 解析
4. 按 `Tab` 切换日志/任务模式
5. 按 `Enter` 保存
6. 按 `Escape` 关闭

---

## 11. 导入导出

**IPC 通道:** `export:logs` / `import:logs`

### 功能描述
支持工作日志的 CSV 和 Markdown 格式导入导出。

### CSV 格式
```csv
id,content,category,created_at
1,"完成API开发","开发","2025-01-15 10:30:00"
```

### Markdown 格式
```markdown
# 2025-01-15

## 开发
- 完成API开发
```

---

## 12. 附件系统

**入口文件:** `src/main/attachments.ts`（187 行）

### 功能描述
工作日志的文件附件管理——文件上传、截图粘贴、链接添加。文件存储在 `userData/attachments/`，通过自定义协议提供服务。

### 用户交互流程
1. 在日志输入框粘贴截图 → base64 截图存储
2. 通过文件选择器选择文件 → 复制到附件目录
3. 添加链接 → 存储 URL

### 技术要点
- **协议:** `appattachment://` 自定义协议提供文件服务
- **安全:** 路径遍历防护（`resolvedPath.startsWith(ATTACHMENTS_DIR)`）
- **数据库表:** `attachments (id, work_log_id, type, original_name, stored_path, mime_type, url, file_size, thumbnail_path, created_at)`

---

## 13. 本地 AI 推理 (ONNX)

**路由:** `/onnx`  
**入口文件:** `src/renderer/src/pages/OnnxPage.tsx`（459 行）

### 功能描述
通过 WebGPU（WASM 回退）在本地运行 ONNX 模型。支持文本生成（流式输出）、模型组选择（tiny/small/base）、模型下载进度追踪。

### 用户交互流程
1. 选择模型组（tiny / small / base）
2. 选择具体模型
3. 首次使用时下载权重
4. 聊天界面 → 流式输出
5. WebGPU 可用性检测

### 技术要点
- **后端:** Transformers.js + WebGPU API
- **模型存储:** `appmodel://` 自定义协议
- **降级:** WebGPU 不可用时自动降级到 WASM

---

## 14. OCR 文字识别

**路由:** `/ocr`  
**入口文件:** `src/renderer/src/pages/OcrPage.tsx`（504 行）

### 功能描述
基于 HuggingFace Transformers.js 的 OCR，支持多种模型组。

### 用户交互流程
1. 选择模型
2. 上传图片
3. 获取文字识别结果
4. 复制到剪贴板

### 技术要点
- **Hook:** `useOCRModel.ts` 封装模型加载和推理
- **模型:** 通过 Transformers.js 自动下载

---

## 15. PaddleOCR

**路由:** `/pp`  
**入口文件:** `src/renderer/src/pages/OcrPagePP.tsx`（348 行）

### 功能描述
PaddleOCR 运行在 Web Worker 中，支持检测（DET）和识别（REC）模型，结果以边界框可视化展示。

### 用户交互流程
1. 上传/拖拽图片
2. PaddleOCR 在 Worker 中处理
3. 结果显示在 Canvas 上（边界框 + 文字）
4. 文本提取

### 技术要点
- **Worker:** `ppocr.worker.ts`（379 行）
- **并行处理:** 6 个 Worker 槽位并行推理
- **模型:** DET（文本检测）+ REC（文字识别）

---

## 16. X 光图像处理

**路由:** `/xray`  
**入口文件:** `src/renderer/src/pages/XrayProcessor.tsx`（702 行）

### 功能描述
基于 Rust WASM 的图像增强工具，支持亮度/暗度/饱和度/细节调整，含全屏编辑器和材质叠加合成。

### 用户交互流程
1. 上传图片
2. 调整亮度/暗度/饱和度/细节
3. 预览明亮/暗淡版本
4. 全屏编辑器 → 添加叠加材质
5. 导出为 PNG

### 技术要点
- **WASM:** `xray_processor_bg.wasm`（Rust 编译）
- **材质:** 预置材质图片库
- **导出:** Canvas → PNG blob

---

## 17. 自动更新

**入口文件:** `src/main/updater.ts`（262 行）

### 功能描述
基于 GitHub Releases 的自动更新，含下载进度显示、发布说明和一键安装。

### 用户交互流程
1. 启动时自动检查更新（生产模式）
2. 设置中手动检查 → 显示发布说明
3. 自动下载 → 进度条
4. 退出并安装

### 技术要点
- **发布:** GitHub Releases（`changweihua/WorkPulse`）
- **平台:** Windows NSIS + Portable，macOS DMG + ZIP，Linux AppImage + deb

---

## 18. 设置中心

**路由:** `/settings`  
**入口文件:** `src/renderer/src/pages/SettingsPage.tsx`（1103 行）

### 功能描述
综合设置界面，涵盖 API 密钥、AI 提供商、报告语言/风格/提示词/模板、全局快捷键、主题、窗口材质、开机启动、关闭行为、会议提醒、悬浮球配置。

### 设置项一览
| 分类 | 设置项 |
|------|--------|
| AI 配置 | API Key（加密存储）、提供商、Base URL、模型 |
| 报告 | 语言、风格、系统提示词、报告模板 |
| 外观 | 主题（亮/暗/系统）、强调色（7 种）、窗口材质（Mica/Tabbed/Acrylic） |
| 快捷键 | 4 个全局快捷键配置 |
| 行为 | 开机启动、关闭行为（最小化到托盘/退出） |
| 会议提醒 | 启用/禁用、提前时间 |
| 悬浮球 | 启用/禁用、位置、扇区配置 |
| 数据 | 备份目录、版本信息 |

### 技术要点
- **加密存储:** `secureSettings.ts` 使用 Electron `safeStorage` 加密 API Key
- **数据库表:** `settings (key, value)`
- **即时生效:** 修改立即应用，无需重启

---

## 19. 多语言支持

**入口文件:** `src/renderer/src/lib/i18n.ts`（580 行，287 翻译键）  
**Store:** `languageStore.ts`（69 行）

### 功能描述
中文和英文双语支持，含系统语言检测。

### 用户交互流程
1. 设置 → 语言选择：系统 / 中文 / English
2. 所有 UI 文本即时切换
3. 系统选项自动检测 OS 语言

### 技术要点
- **翻译键:** 287 个（覆盖所有 UI 元素）
- **系统检测:** `navigator.language` 首次启动自动设置
- **主题感知:** 暗色/亮色自动切换

---

## 20. 主题系统

**Store:** `themeStore.ts`（74 行）  
**样式:** `index.css`（538 行）

### 功能描述
完整的暗色模式，含系统检测、7 种强调色主题和 3 种窗口材质。

### 强调色
| 颜色 | 效果 |
|------|------|
| Blue | 默认蓝色系 |
| Indigo | 靛蓝系 |
| Violet | 紫罗兰系 |
| Cyan | 青色系 |
| Emerald | 翡翠绿系 |
| Orange | 橙色系 |
| Rose | 玫瑰红系 |

### 窗口材质
| 材质 | 描述 |
|------|------|
| Mica Tabbed | 默认，标签化 Mica 材质 |
| Mica | 标准 Mica 材质 |
| Acrylic | 亚克力材质（更透明） |

### 设计系统
- **表面:** `surface-card`（液态玻璃）、`surface-elevated`、`surface-input`、`surface-inset`
- **字体:** JetBrains Mono（等宽）、Maple Mono（代码）、system-ui（正文）
- **动画:** 17 种关键帧动画（fadeIn, slideUp, bounceIn, celebrate 等）
- **图标:** Lucide React + Iconify + react-icons

---

## 21. 会议提醒

**入口文件:** `src/main/scheduler.ts`（51 行）  
**通知:** `src/main/notification.ts`（224 行）

### 功能描述
后台定时检查会议事件，到期前发送 Windows 通知提醒。

### 用户交互流程
1. 设置中启用会议提醒
2. 设置提前时间（5/10/15/30 分钟）
3. 后台每 30 秒检查一次
4. 到期前发送 Toast/气球通知
5. 点击通知 → 聚焦主窗口

### 技术要点
- **轮询:** `setInterval` 30 秒
- **通知:** Windows Toast + 气球通知
- **AppUserModelId:** `cmono.workpulse.app`（与 electron-builder 配置一致）
- **防重复:** `notified` 字段避免重复提醒

---

## 22. 系统托盘与全局快捷键

### 功能描述
系统托盘含 4 个菜单图标，4 个全局键盘快捷键。

### 托盘菜单
| 图标 | 功能 |
|------|------|
| 新建日志 | 打开快速创建对话框 |
| 新建任务 | 打开快速创建对话框（任务模式） |
| 显示窗口 | 聚焦主窗口 |
| 退出 | 退出应用 |

### 全局快捷键
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+L` | 快速创建日志 |
| `Ctrl+Shift+T` | 快速创建任务 |
| `Ctrl+Shift+Space` | 切换窗口显示/隐藏 |
| `Ctrl+Shift+S` | 截图 |

---

## 23. 启动画面

**文件:** `resources/splash.html`

### 功能描述
透明、圆角启动画面，显示版本号，带淡入动画。AppUserModelId 设置确保 Windows 通知图标正确。

### 用户交互流程
1. 应用启动时显示（1.5-5 秒）
2. 透明/圆角/居中
3. 版本号显示
4. 淡入动画
5. 主窗口就绪后销毁

---

## 24. 数据备份

**入口文件:** `src/main/db.ts`

### 功能描述
SQLite 数据库自动每日备份到 `userData/backups/`。

### 技术要点
- **频率:** 每日一次
- **方式:** WAL checkpoint → 文件复制
- **文件名:** `workpulse-YYYY-MM-DD.db`
- **目录:** `{userData}/backups/`

---

## 25. AI 模型缓存

### 功能描述
AI 模型通过 `appmodel://` 自定义协议缓存，首次使用时下载，支持从 asar 或文件系统读取。

### 用户交互流程
1. 首次使用某模型 → 自动下载
2. 下载进度显示
3. 后续使用 → 从缓存加载

### 技术要点
- **协议:** `appmodel://` 自定义协议
- **IPC:** `model:ensure` / `read-model-file`
- **存储:** `userData/models/`

---

## 26. .NET FFI 集成

**入口文件:** `src/main/dotnet-loader.ts` / `asar-dotnet-loader.ts`

### 功能描述
通过 koffi 延迟加载 .NET Core 运行时，提供原生 FFI 互操作，优雅降级。

### 技术要点
- **加载:** 延迟初始化，不阻塞启动
- **回退:** `node-api-dotnet` 作为备选
- **资源:** .NET 原生 DLL 打包在 `extraResources`

---

## 附录

### 数据库架构
```
┌─────────────────────────────────────────────┐
│                 SQLite (WAL)                 │
├─────────────┬─────────────┬─────────────────┤
│  work_logs  │    tasks    │    reports      │
│  (日志)     │  (看板任务) │   (AI报告)      │
├─────────────┼─────────────┼─────────────────┤
│  settings   │  calendar_  │  attachments    │
│  (设置)     │   events    │   (附件)        │
│             │  (日历事件) │                 │
└─────────────┴─────────────┴─────────────────┘
```

### IPC 通道统计
- **Renderer → Main:** 50+ 个 IPC 通道
- **Main → Renderer:** 10+ 个推送通道
- **截图专用:** 3 个通道（ready / cancel / crop）

### 页面路由
| 路由 | 页面 | 行数 |
|------|------|------|
| `/worklog` | 工作日志 | 672 |
| `/kanban` | 看板 | 835 |
| `/report` | AI 报告 | 476 |
| `/reports` | 周报摘要 | 272 |
| `/stats` | 数据统计 | 790 |
| `/calendar` | 日历 | 515 |
| `/chat` | AI 对话 | 974+ |
| `/settings` | 设置 | 1103 |
| `/onnx` | ONNX 推理 | 459 |
| `/xray` | X 光处理 | 702 |
| `/ocr` | OCR | 504 |
| `/pp` | PaddleOCR | 348 |
