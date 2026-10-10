# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。每次发布（`npm run release` 或手动打 `v*` 标签）时同步更新本文件。

## [未发布]

### 新增

- ✨ feat: 悬浮窗状态环视觉精简 — 删除两侧身份 Logo 与进度弧端点圆点，电量圆点去描边改为纯填充，充电闪电移至中心 Logo 位置，轨道减淡（0.34→0.20）
- 🐞 fix: 悬浮窗拖拽反向漂移 — 拖拽位移从渲染层 Chromium movementX/Y 改为主进程 screen.getCursorScreenPoint() 绝对差分定位（渲染层合成鼠标事件会因窗口移动而反向/重复）
- 🐞 fix: 悬浮窗正方形阴影 — setShape 从单个方形 rect 改为多行矩形条带平铺逼近圆形（OS 按 setShape 边界合成暗边），并移除状态环全部残留 drop-shadow

- ✨ feat: 新增 Ctrl+K 全局命令面板，支持页面导航、拼音匹配与日志搜索直达
- ✨ feat: 导航配置抽取为 `config/navigation.ts` 单一数据源，顶部导航改为按配置渲染
- ✨ feat: 侧边栏响应式自动收起/展开 — 小屏幕（<768px）自动收起，大屏幕（≥768px）自动展开，尊重用户手动操作
- ✨ feat: RULES.md — 基于实际依赖版本生成的代码审查规则文档（12 章节覆盖 React 19/Zustand v5/Drizzle/Zod v4/Tailwind v4/Motion/Vite 8/TS 7/Router v7）
- ✨ feat: FIX-PLAN.md — 代码审查修复方案文档
- 🦄 refactor: React Router 导入路径迁移 — 6 个文件的 hooks/组件从 `react-router-dom` 迁移至 `react-router`（`createHashRouter` 和 `RouterProvider` 保留 `react-router-dom`）
- 🦄 refactor: Zustand v5 规范对齐 — 6 个 store 改为 `create<T>()(...)` 双调用，12 个消费组件添加 `useShallow` 防止不必要重渲染
- 🦄 refactor: CSS 设计规范对齐 — `surface-card` 毛玻璃参数统一为 `blur(16px) saturate(180%)`，新增 `chrome-bg`/`panel-dark`/`surface-subtle-dark` token 替代硬编码 hex
- ✨ feat: worklog 日志列表滚动触底自动加载更多（IntersectionObserver，保留手动按钮兜底）
- ✨ feat: AI 悬浮按钮与返回顶部按钮自动避让 — 检测到重叠时朝最近边缘平滑让位，对方消失后回到用户原位置，拖拽与位置持久化不受影响
- ✨ feat: 看板已完成列折叠 — 默认显示 6 条，其余渐隐折叠（mask 遮罩 + 高度动画 + 级联入场），支持展开/收起按钮与拖拽自动展开，状态持久化
- ✨ feat: 悬浮窗硬件状态环 — 圆形悬浮窗中心圆与菜单之间新增 CPU/内存/电量环形显示：主进程 1s 采样（CPU 差分 + EMA 平滑 + 突变直取）经 `hw-stats` 通道推送；CPU/内存对称弧（逆/顺时针各 127°、渐变负载色、≥85% 红色脉冲）；电量 5 档绿点按实际百分比半颗填充、逆时针点亮、充电闪电呼吸；菜单展开隐藏/收起显示；悬停底部读数条显示数值
- ✨ feat: 新增拼音匹配工具与搜索关键词高亮组件，为搜索优化提供基础能力
- ✨ feat: 工作日志搜索命中高亮与键盘导航 — 列表内容与搜索信息区关键词高亮，↑/↓ 循环切换选中项（Enter 展开、Esc 清空、支持输入法组词豁免），结果上限 50 条并超限时提示，LIKE 模式前缀命中优先排序、拼音补充匹配，支持从全局面板经 `?q=` 路由参数带入搜索词

### 变更

- 📃 docs: 语言规范强制化 — AGENTS.md 语言章节重写为强制规则（必须中文的 7 类场景表、允许英文的 5 类例外、全链路生效的强制约束），commit 正误示例与 Windows 提交示例全部改为中文 subject，消除「规则要求中文、示例却是英文」的矛盾
- 🐳 chore: 工具脚本输出中文化 — 12 个脚本（release、ai-commit、generate-changelog、check-signing、read-config、commit、win-sign、generate-integrity、brand-dev-exe 双份）的提交信息模板、分类映射、日志输出与注释改为中文；CHANGELOG 分类补齐 🔒 安全 / 📦 依赖更新 / 🗑️ 移除 / 🧪 测试 并新增 type 名兜底映射，避免产出英文分类头
- 🎈 perf: OCR 吞吐优化 — ImageData 以 transferable 方式发送给 Worker（消除 4K 图约 33MB 的结构化克隆），识别循环内改为累积到局部数组、循环结束后一次性提交状态（去掉每框 postProgress 与 box-recognized 双提交）
- 🎈 perf: 向量检索模块级缓存 — 首次搜索一次性解析全部 worklog 向量为 `Float32Array`（id 平行数组），后续搜索免重复 `JSON.parse`；autoIndexAll/indexSingleWorklog/rebuildIndex 写路径末尾统一失效缓存，0 条数据或表缺失时优雅返回空结果
- 🎈 perf: 启动性能优化 — 启动全库 `PRAGMA integrity_check`（settings KV 24h 门控）、每日备份（`copyFileSync` 改为 `fs.promises.copyFile`）与 `autoIndexAll` 向量索引统一延迟到 app ready 后约 15s 执行，electron-log 记录校验结果与耗时
- 🎈 perf: 截图光标 IPC 瘦身 — 16ms 轮询保留，坐标相对上次已发送值去重（静止零 IPC）、发送节流至约 30Hz，且仅发给鼠标所在屏的 overlay（选区广播逻辑不变）
- 📦 deps: 依赖分类瘦身 — 22 个仅渲染进程使用的依赖（echarts、three、@react-three/*、motion、lucide-react、zustand、onnxruntime-web、@huggingface/transformers 等）从 dependencies 移至 devDependencies，`@types/three` 同步归位 devDependencies
- 🐳 chore: 移除无用依赖 — 删除 `vectra`；`react-icons` 的 3 个硅基图标（SiOnnx/SiPaddle/SiPaddlepaddle）内联为本地 `SiliconIcons` 组件后移除依赖
- 🔧 build: 打包体积排除 — build.files 新增排除 `onnxruntime-node`、`@img`、`sharp`、`*.tsbuildinfo`；extraResources 模型过滤收窄为仅打包 `ppocrv6-tiny/**` 与 `ppocrv6-small/**`（medium 约 132MB 不再随包分发）
- 🎈 perf: AnimatedBackground 鼠标跟随去掉每帧 setState — 改为 useRef + rAF 直写 DOM transform，并将 blur 光斑静态化到内层元素以便合成层缓存
- 🎈 perf: 工作日志列表渲染优化 — 日志条目组件 React.memo 化，日期卡片启用 `content-visibility: auto` 屏外跳过渲染
- 🎈 perf: 模型配置内存缓存 — `getGlobalConfig` 结果模块级缓存，失效钩子覆盖 `setGlobalConfig`/`setActiveChatConfig`/`secureSettings` 的 token 写入（消除单次向量搜索 50+ 次查询与 30 次 DPAPI 解密）
- 🎈 perf: 向量缓存增量更新 — 索引写入改为按条 upsert（id→下标 Map），不再任意写入即全表重建；删除 worklog 时同步清理向量行（修复孤儿向量）
- 🎈 perf: 工作日志列表排序走索引 — 新增 `sort_key` 冗余列物化 `COALESCE(due_date, created_at)`（含存量回填与四处写路径回写），列表/搜索/导出改按 `sort_key` 排序，消除全表 join+sort
- 🎈 perf: 背景模糊开销降低 — AnimatedBackground 静止 30 帧后完全停止 rAF 循环（鼠标移动重启）；卡片 `backdrop-filter` 模糊半径 16→12px、输入框 20→15px（饱和度与玻璃质感参数保留）
- 🎈 perf: OCR 模型加载绕开 IPC 克隆 — `usePPOCR` 优先经 `appmodel://` 协议流式读取模型（模块级 ArrayBuffer 缓存 + content-length 分段进度），失败回退原 `read-model-file` IPC；消除 medium 变体约 138MB 的结构化克隆
- 🦄 refactor: worklog 瀑布流卡片高度测量改为 ResizeObserver 事件驱动，移除定时器与 MutationObserver
- 📦 deps: 升级全部过时依赖（18 项，均为小版本/补丁）— electron 44.5.0、electron-vite 6.0.0-beta.5、vite 8.3.1、openai 7.25.0、oxlint 1.86.0、oxfmt 0.71.0、motion 13.4.6、lucide-react 1.49.0 等；typecheck / lint / build 验证通过
- 📦 deps: 升级全部过时依赖（18 项）— electron 44.7.0、electron-vite 6.0.0-beta.7、vite 8.3.3、openai 7.30.0、oxlint 1.87.0、oxfmt 0.72.0、lucide-react 1.52.0、motion 14.0.0（官方声明 React 侧零破坏性变更，项目 17 处用法均在公开 API，0 行代码改动）等；typecheck / lint / format / build 验证通过
- 🐳 chore: 真实接入 oxfmt/oxlint — lint-staged 从「全仓 oxlint 恒红致 oxfmt 从不执行」修为仅检查 staged 文件、全部文件类型统一走 oxfmt，且 oxlint/oxfmt 命令追加 `--no-error-on-unmatched-pattern`（提交仅含被忽略路径 scripts/build/native/*.d.ts 等 JS/TS 文件时不再报「No files found」拦截提交）；完全移除 prettier（依赖、.prettierrc、脚本引用）；新增 CI workflow（typecheck + oxlint 警告棘轮 ≤50 + format:check + build，push/PR 触发）；新增 .gitattributes（LF 归一且保留 LFS 规则）；.editorconfig 补 max_line_length 与 oxfmt 对齐
- 🦄 refactor: oxlint 全仓 57 条警告清零 — 覆盖 react(set-state-in-effect)、react(refs)、react(purity)、react-hooks(exhaustive-deps)、react(immutability) 五类规则，修复均保持行为不变（派生加载态、effect 内同步 ref、Date 外提等最小模式），未使用任何 disable 注释
- 🌈 style: 全量 oxfmt 格式化 — 137 个存量文件按 .oxfmtrc.json（分号、2 空格缩进、宽度 100）统一格式，format:check 转绿（此前 132 文件为升级前既有债务）
- 🗑️ remove: 移除 18 处失效的 eslint-disable 注释 — 仓库从未接入 eslint，注释已全部失效；同步修复其暴露出的 14 条 oxlint 警告（ReportPage、ReportsPage、screenshot-overlay、useIdleCallback、useHuggingFaceModel），全仓警告保持 0
- 🌈 style: 行尾统一为 LF — package-lock.json 及 10 个 CRLF 残留文件转换（.env、.gitignore、.npmrc、Bridge 源码、resources 配置等），配合 .gitattributes 彻底消除行尾混用
- 🦄 refactor: XrayProcessor 移除死状态 `isPreviewing` — 处理中中间态从未渲染，状态恒为 false，按钮 `disabled`/文案简化为仅依赖 `imageLoaded`

### 新增

- ✨ feat: 开发模式独立 userData（`-dev` 后缀目录），与已安装版隔离日志、数据库、附件与缓存，避免双实例争抢磁盘缓存与数据污染

### 修复

- 🐞 fix: 打包后页面白屏报 React #301（Too many re-renders）— `useI18n` 的 `t` 改为 `useCallback` 引用稳定（原每次渲染返回新函数），并修正 WorkLogPage `useState(t)` 为惰性初始化 `useState(() => t)`（t 是函数，React 会执行它，prevT 变成 string 与 t 永不相等，渲染期派生 `if (prevT !== t)` 永真死循环）
- 🐞 fix: 统一 ECharts 图表字体为全局字体，新增公共图表主题模块
- 🐞 fix: 工作日志记录 tag 未垂直居中、编辑与删除按钮仅悬停显示 — 内容行改 `items-center` 并修正 `whitespace-nowrap` 拼写，编辑/删除按钮常驻显示
- 🐞 fix: 打包后启动崩溃 Cannot find module trousse — feedsmith 打进 main bundle（`externalizeDeps.exclude`），绕开 electron-builder 不收集依赖包内嵌套 `node_modules` 的限制
- 🐞 fix: 打包后设置与模型配置报 `Cannot find module './secureSettings'` — 将 modelConfig ↔ secureSettings 的运行时 require 懒加载改为静态 import（仅函数体内访问，规避初始化顺序），失效钩子链路不变
- 🐞 fix: 打包后删除带向量日志、每日限额检查报 `Cannot find module` — `db.ts`/`ai.ts` 内残留的相对路径裸 require 同样改为静态 import（函数体内调用，环分析安全）
- 🐞 fix: 完整性校验同版本重建被误报为篡改 — 基准记录引入构建 ID（`__BUILD_ID__` 构建期注入），构建 ID/版本变化视为重新构建或升级并刷新基准，仅同构建哈希不一致才判定篡改
- 🐞 fix: 打包环境完整性校验失效 — 改用 `original-fs` 读取 app.asar（Electron 补丁 fs 会把 asar 路径当归档内路径解析致 ENOENT），基准记录同时存入应用版本，版本变动判定为升级并刷新基准（不再把升级误报成篡改），同版本哈希不一致才弹警告
- 🐞 fix: dotnet:invoke 正确 await Bridge 返回值 — handler 改为 `await Promise.resolve(...)`；`ComputeFileHash` 改为 `Task<string>` + `Task.Run` 阻塞移出主线程（重编 Bridge.dll，方法名保持 JSExport 映射不变）
- 🐞 fix: AI 流式监听互杀 — `window.ai.on` 改为返回 unsubscribe（按通道 Set 去重），ChatPage 与常驻 AIChatPanel 各自精确清理，不再用 `removeAllListeners` 全清导致切会话时杀掉对方监听、流式中断
- 🐞 fix: preload AI 流式监听泄漏 — `streamChat` 的 onChunk/onDone/onError 同通道重复注册时替换旧监听，避免 ipcRenderer 监听器无限累积
- 🐞 fix: 扩展屏无法勾选截图区域与截错屏 — 改为每块显示器独立 overlay 窗口（选区状态主进程维护、跨屏渲染求交集、光标轮询焦点跟随），捕获源四级兜底匹配且失败时中止（不再回退主屏），裁剪按目标屏 scaleFactor 与缩略图实际尺寸比例换算并 clamp
- 🐞 fix: 全局 `focus-visible` 焦点环 — 新增 CSS 基础规则，40+ 可交互元素获得键盘导航支持（可访问性修复）
- 🐞 fix: 焦点环颜色纠正 — NavLayout 和 AIChatPanel 中 `ring-sky-500`/`ring-violet-500` 统一改为 `ring-blue-400`
- 🐞 fix: Toast Context.Provider 迁移 — `<ToastContext.Provider>` 改为 React 19 推荐的 `<Context value={}>` 写法
- 🐞 fix: 移除导航链接 `hover:scale` 违反动画禁令的代码
- 🐞 fix: 修复 14 个存量 web 类型错误 — `npm run typecheck:web` 首次归零（segmentClick/RadialApi 签名对齐 preload、ArticleReader 守卫 url 回调、rssStore.updateFeed 补 url 可选参数、i18n 补 apiKeySaved/apiKeyDeleted 词条、SettingsPage 遗留无引用处理器注释化）
- 🐞 fix: 启动崩溃 `no such column: sort_key` — `createTables` 不再提前创建 sort_key 索引（存量库该列由 migrateWorkLogSortKey 加列后才存在），索引统一在迁移内创建
- 🐞 fix: feedsmith v3 类型适配 — `domParseItems` 参数从 `ReturnType<typeof parseFeed>` 改为显式 `AnyFeed<string>`（v3 泛型 TDate 默认 string，ReturnType 实例化为 unknown 导致不匹配）
- 🐞 fix: 截图工具栏点击复制/保存无反应 — 重构提交误将四个按钮的 `run` 改为空函数，恢复 `runAction('copy'/'save')` 与占位提示调用（键盘快捷键不受影响）
- 🐞 fix: 看板首屏空白 — 渲染期派生的 `prevTasks` 改哨兵 `null` 初始化，store 有缓存时首帧即同步进 `localTasks`（fetch 失败也不再永久空白）
- 🐞 fix: 工作日志切换语言后条目文案停留在旧语言 — `tRef` 改为渲染期派生写入，语言切换当帧子组件即读到新 `t`
- 🐞 fix: 统计页「今天」跨天过期 — 模块级 `NOW` 常量改为组件挂载时取值，应用长驻跨天后柱状图与 AI 摘要不再圈选昨天

### 依赖更新

- 📦 deps: 批量升级依赖 — `drizzle-orm` 0.45.2→0.45.3、`drizzle-kit` 0.31.10→0.31.11、`openai` 7.19.0→7.21.0、`electron-context-menu` 5.0.0→5.1.0、`oxlint` 1.83.0→1.85.0、`tsx` 4.23.13→4.23.15、`@commitlint/cli` 21.2.2→21.2.3、`@iconify-json/thesvg-color` 1.2.11→1.2.12、`@types/node` 26.6.1→26.6.2、`@iconify-json/lucide` 1.2.134→1.2.135、`javascript-obfuscator` 5.7.0→5.8.0
- 📦 deps: 依赖升级到最新版 — `dotenv` 17.4.2→18.0.4、`feedsmith` 2.9.6→3.0.1、`oxfmt` 0.68.0→0.70.0（major），另含范围内升级 `vite` 8.3.1、`motion` 13.4.4、`three` 0.186.1、`lint-staged` 17.6.0、`sharp` 0.35.5、`koffi` 3.3.2、`@types/node` 26.6.3 等（`npm update` 同步 wanted 版本）

### 变更

- 🦄 refactor: 引入 Drizzle ORM — 新增 `schema.ts`（12 张表声明）、`db/index.ts`（基础设施）、`drizzle.config.ts`；db.ts/aiUsage.ts/attachments.ts 迁移至 Drizzle ORM + raw SQL 混合模式，保留所有导出接口
- ✨ feat: 新增 `scripts/release.ts` 一键发布脚本，自动完成版本更新→文件同步→提交→打 tag→推送，支持 `patch/minor/major/精确版本号` 参数
- ✨ feat: AIChatPanel 无限滚动 — 使用 `@reactuses/core` 的 `useInfiniteScroll`，初始显示最近 50 条消息，向上滚动自动加载更多，保持滚动位置不变
- 🎈 perf: 启动 Splash 快速启动跳过 1.5s 最短显示下限 — 主窗 ready-to-show 早到即提前关闭，下限仅作 splash 未显示时的兜底
- 🎈 perf: 完整性校验失败警告弹窗改为异步 — 消除启动关键路径上的主进程同步冻结
- 🎈 perf: 截图 both 模式 PNG 单次编码 — 剪贴板与存档复用同一 Buffer，避免重复 toPNG 编码

### 变更

- 🦄 refactor: worklog 页面瀑布流布局 — 新增 MasonryLayout 组件（ResizeObserver 响应式列数、贪心分配算法），工具栏响应式换行（小屏三行排列、大屏一行排开）；日志内容长文本自动换行
- 🦄 refactor: 多页面 padding 统一边距 — ReportsPage、StatsPage、SettingsPage、ModelConfigPage、XrayProcessor、OcrPagePP、CalendarPage、OcrPage、OnnxPage、ReportPage、AiStatsPage 统一为 px-6 py-4
- 🦄 refactor: OCR/ONNX/FluidGlass/ModelConfig 页面内容区域 surface-card 背景填充空白区域
- 🦄 refactor: 全宽页面布局 — `worklog`、`dotnet`、`model-config`、`settings` 四个页面设为 `fluid: true` 全宽模式；WorkLog 双栏日期分组、Settings 多栏网格、ModelConfig 左右分栏（列表+编辑弹窗）
- 🦄 refactor: 模型配置页模型卡片三行布局 — 模型名全显示 + 路径信息 + 标签行，最小高度 100px；默认模型右上角显示勾选图标（`default-model.svg`）
- 🦄 refactor: 模型配置页编辑表单改为毛玻璃弹窗 — 固定标题/按钮 + 中间内容滚动；Provider 选中高亮；默认选中第一个 Provider
- 🦄 refactor: 设置页网格布局 — 快捷键/搜索/开机/径向菜单半宽，报告偏好/外观/更新/关于全宽；径向菜单左列菜单项+右列自定义程序
- 📦 deps: 新增 `pinyin-pro` 依赖 — 拼音匹配/转换能力，供搜索优化的拼音检索与高亮使用

### 修复

- 🐞 fix: `set-close-action` IPC 参数校验失败 — `CloseActionSchema` 枚举值 `'close'` 与实际使用的 `'quit'` 不匹配，修正为 `z.enum(['minimize', 'quit', 'hide'])`
- 🐞 fix: 添加 `.npmrc` 和 CI workflow 配置 `--legacy-peer-deps`，解决 `@react-three/fiber@9.x` 与 `react@19.3.0` 的 peer dependency 冲突
- 🐞 fix: 修复 lint-staged 中 oxlint 在 Windows 上无法解析单文件路径的问题，改为目录扫描模式
- 🎈 perf: 新增 `scripts/commit.ts` 提交辅助脚本，AI Agent 使用 `npx tsx scripts/commit.ts <type> "<subject>"` 提交，避免 Windows 下 emoji 编码问题

- 🐞 fix: 模型配置页"添加模型"按钮点击无反应 — 表单渲染从 map() 循环内移到循环外，新增模型 ID 不在列表中导致 isEditing 永远为 false
- 🐞 fix: Embedding Provider 筛选标签数量与 Chat 不一致 — EMBED_PROVIDERS 新增 anthropic，两栏均为 8 个 Provider

### 移除

- 🗑️ remove: 清理 preload 中 5 个无主进程 handler 的 dead code IPC 通道（`report:generate`、`model:add-chat-config`、`model:update-chat-config`、`model:delete-chat-config`、`model:update-embedding`）及对应的类型声明和 `deleteChatConfig()` 函数

### 变更

- 🦄 refactor: 模型配置页全面重写 — Provider 筛选标签栏（全部 + 各 Provider pill）、添加模型改为下拉菜单选择 Provider 后自动填充 URL/模型名、计费方式选择器（按次数/按Token/无限制）、Token 月度限额输入、模型列表项显示 Provider 徽章+计费类型标签
- 🦄 refactor: modelConfig.ts 新增 BillingType 类型、provider/billingType/tokenQuota 字段、月度 Token 配额追踪函数（getMonthKey/isOverMonthlyTokenQuota/incrementMonthlyTokenCount/getMonthlyTokenCount）
- 🦄 refactor: db.ts 新增三条 ALTER TABLE 迁移（provider/billing_type/token_quota）
- 🦄 refactor: AIChatPanel UI 重构 — 去除层叠渐变/辉光/毛玻璃炫技风格，采用 ChatGPT/Claude 主流简洁设计（clean surfaces, clear hierarchy, minimal chrome）
- 🌈 style: AI 助手 Liquid Glass 美化 — 亮/暗双模式自适应（跟随系统主题）、多色渐变标识(violet→blue→cyan)、用户消息亮色渐变气泡/暗色深色气泡、AI消息微渐变背景、渐变发送按钮、渐变流式光标、会话列表渐变选中态、空状态升级
- 🦄 refactor: AIChatPanel DeepSeek 风格双栏布局 — 面板宽度 680px，左侧栏 260px 会话列表（新建按钮+月分组+相对时间），右侧主区域精简 Header+消息区+输入区
- ✨ feat: 会话列表按月分组（本月/上月/X月）+ 相对时间显示（刚刚/X分钟前/X小时前/昨天/X天前/X月X日）+ 消息数统计
- 🌈 style: FAB 浮动按钮 AI 星芒图标 — 三颗四角星（中心大+右上小+左下小），替代用户头像图标；idle 状态浮动动画 + drop-shadow 呼吸光晕
- 🦄 refactor: 消息展示改为全宽式 — 参考 2026 年主流 AI 助手设计（Claude.ai/ChatGPT/Cursor），去除气泡背景，用户右对齐蓝色条，AI左对齐透明底+微灰背景条
- 🦄 refactor: 每条AI消息显示模型名标签（AI头像+配置名称），提升可追溯性
- 🦄 refactor: Thinking/reasoning 折叠区域 — 默认折叠的 `<details>` 元素，替代之前的固定展开
- 🦄 refactor: 流式输出添加闪烁光标（caret）— 蓝色竖线 `animate-pulse`，表示仍在生成
- 🦄 refactor: 空状态改为场景化快捷操作卡片 — 图标+文字的垂直列表，替代药丸按钮
- 🦄 refactor: 面板整体 — 去除 animated gradient border 和 glow line，改用简洁 border-l + shadow-2xl
- 🦄 refactor: 输入区 — ChatGPT 风格融合式输入框（圆角容器+内嵌按钮+focus ring）
- 🦄 refactor: 会话历史按钮移至 header 右侧，模型选择器独立为 subtle bar
- 🌈 style: 增强面板与背景的视觉分离 — backdrop 加深至 black/30 + backdrop-blur，面板阴影增强为 −8px offset 30px spread
- 🦄 refactor: lint-staged 重构 — JS/TS 文件走 oxlint+oxfmt，非 JS/TS 文件走 prettier，移除 eslint 相关配置
- 🦄 refactor: zod ipc contract layer with unified IpcResult
- 🦄 refactor: preload 新增 `invoke()` helper，解包 IpcResult，渲染端零改动兼容
- 🦄 refactor: replace model config json blob with model_configs table
- 🦄 refactor: remove BrowserWindow daily summary — keep only in-app modal
- 🦄 refactor: remove renderer ai config backup, use main process sqlite

- 🦄 refactor: fluid 页面全宽排版 — worklog/dotnet/model-config/settings 路由启用 fluid: true；WorkLog 双栏瀑布流+合并单行工具栏；Settings 多栏 flex-wrap；ModelConfig 响应式网格+编辑弹窗+小屏筛选折叠
- 🦄 refactor: Settings 径向菜单两列 — 菜单项和自定义程序均改为 grid-cols-2 双列网格
- 🦄 refactor: 返回顶部按钮独立化 — 从 NavLayout 内联代码提取为 `ScrollToTopButton` 组件，统一 FAB 设计语言（56px 尺寸、渐变背景、Motion 动画、hover tooltip）
- 🌈 style: 统一 z-index 层级规范 — FAB 层 `z-[35]`（ScrollToTopButton/DotnetFAB/AIFloatingButton）、弹窗层 `z-50`、Toast 层 `z-[55]`

### 新增

- ✨ feat: 全局骨架屏加载动画 — 新增 Skeleton 组件库（SkeletonLine/SkeletonCircle/SkeletonRect/SkeletonStatCard/SkeletonTaskCard/SkeletonTableRow/SkeletonCard），8 个页面全面引入骨架屏（RssPage、ReportsPage、WorkLogPage、StatsPage、CalendarPage、KanbanPage、ChatPage、AiStatsPage）
- ✨ feat: oxlint + oxfmt 代码检查和格式化（替代 ESLint+Prettier，Rust 原生工具，速度更快）
- ✨ feat: Prettier 保留用于非 JS/TS 文件格式化（json/css/html/md/yaml/yml）
- ✨ feat: .editorconfig 统一编辑器配置（2空格缩进，UTF-8，LF）
- ✨ feat: cz-customizable 交互式提交（.cz-config.js，12 种 emoji type + 6 种 scope）
- ✨ feat: AI 提交辅助脚本（scripts/ai-commit.ts，自动推断 type/scope/subject）
- ✨ feat: AI 模型使用统计功能，追踪调用次数、token 用量和费用，新增独立 /ai-stats 页面
- ✨ feat: 集成 gpt-tokenizer 精确计算 token，替换粗略估算
- ✨ feat: AI 助手弹窗和对话页面消息操作栏（复制/点赞/踩/分享），参考 ChatGPT/Claude 设计
- ✨ feat: 每条消息气泡下方显示独立 token 数
- ✨ feat: electron security hardening and fix type errors
- ✨ feat: 统一 AI 模型配置管理，新增独立 ModelConfigPage 页面
- ✨ feat: theme switching with smooth transitions and zinc palette
- ✨ feat: daily work summary popup with QQ Music report style
- ✨ feat: daily summary as in-app modal on WorkLog page
- ✨ feat: auto vectorization for worklog search
- ✨ feat: configurable search mode (vector vs text)
- ✨ feat: per-model daily API call limit
- ✨ feat: quotaGroup for shared API rate limits

### 修复

- 🐞 fix: oxlint/oxfmt 配置迁移 — 将 oxfmt.config.ts 和 oxlint.config.ts 改为 JSON 配置格式（.oxfmtrc.json / .oxlintrc.json），修复 Node.js module 类型警告
- 🐞 fix: packArgs single-arg schema packing for settings:get
- 🐞 fix: remove AI config entry from settings and add search mode toggle
- 🐞 fix: resolve stale model config from incorrect migration
- 🐞 fix: modal visible in dev, widen to 480px, remove stale api_key refs
- 🐞 fix: daily summary — load via vite dev server in dev mode
- 🐞 fix: daily summary popup always show in dev mode
- 🐞 fix: daily summary stale marker cleared only once
- 🐞 fix: daily summary popup — mark on dismiss, clear stale marker
- 🐞 fix: daily summary popup blank screen — always render UI shell
- 🐞 fix: AI 聊天和报告使用全局模型配置，修复滚动问题

### 样式

- 🌈 style: sidebar floating effect with gap and rounded corners
- 🌈 style: unify border-radius tokens and enhance ai model menu
- 🌈 style: add obsidian-style markdown for report and rss reader
- 🌈 style: daily summary modal — blend with app theme

## [0.3.4] - 2026-09-16

### 新增

- `5852077` ✨ feat: enhance pdf export with print css, progress bar and watermark
- `cb989fc` ✨ feat: 优化AI助手空会话不保存为历史记录
- `846a211` ✨ feat: make dotnet FAB draggable
- `85536df` ✨ feat: add dotnet bridge IPC and FAB on worklog

### 变更

- `a5d47f3` 🦄 refactor: modularize main process and adopt wco titlebar
- `820db7f` 🔧 build: bump dependency versions

### 修复

- `ae05895` 🐞 fix: remove dotnet FAB from worklog page
- `f2fe1b6` 🐞 fix: guard missing i18n keys and isolate page errors in navlayout
- `468275e` 🐞 fix: remove duplicate dotnet nav entry
- `435d502` 🐞 fix: add wasm-unsafe-eval csp and errorboundary to xrayprocessor
- `37acd94` 🐞 fix: guard screenshot overlay against HMR duplicate root

### 样式

- `938a06d` 🌈 style: optimize loading animation with logo breathing pulse
- `c01afca` 🌈 style: widen content area to max-w-5xl for liquid glass pages
- `5b715ec` 🌈 style: apply liquid glass surface to worklog and settings pages

## [0.3.3] - 2026-09-15

### 新增

- `0b2ef7b` ✨ feat: add mermaid diagram rendering to markdown
- `bf85b38` ✨ feat: add system notifications for user operations
- `749b0d0` ✨ feat: add webgl fluid, spring animations, cursor ring and cancel
- `fc68a41` ✨ feat: disable cursorring, keep code for future
- `b988def` ✨ feat: add indexeddb offline memory and vectra vector search
- `9d8210b` ✨ feat: add mouse reactive title component
- `934a907` ✨ feat: ipc 校验、流式重连、持久化增强、现代 css 优化

### 变更

- `180a32c` 🔧 build: update dependencies and add sse retry with backoff

### 修复

- `c6ce2af` 🐞 fix: radial menu icon offset caused by motion transform conflict

## [0.3.2] - 2026-09-09

### 新增

- RSS 文章导出 PDF
- GitHub 风格 Markdown 渲染（代码块语言标签 + 复制按钮、表格、引用块、标题锚点、任务列表）
- Mermaid 图表渲染（自动适配亮/暗主题）
- 代码语法高亮（rehype-highlight + GitHub 暗色主题）
- RSS 错误提示（订阅/刷新失败 toast 通知）
- 液态玻璃效果（WebGL + CSS shimmer）

### 修复

- RSS 订阅加载失败：`stream.push() after EOF` 错误，改用 feedsmith DOM 解析
- 恢复启动时始终显示径向菜单

### 变更

- 自动变更日志生成（pre-commit hook）

## [0.3.1] - 2026-09-07

### 新增

- RSS 阅读器：毛玻璃三栏布局（订阅源 / 文章列表 / 阅读区），支持 PDF 导出文章

### 变更

- 强制 Worktree 规范与管理脚本，支持 AI Agent 并行开发

## [0.3.0] - 2026-09-04

### 新增

- 闲置图表初始化、工作日志预取、tooltip 箭头
- 侧栏 line-md 图标与静态背景

### 变更

- Electron 安全加固（基于掘金文章最佳实践）

## [0.2.28] - 2026-09-03

### 新增

- PaddleOCR WebGPU 后端支持，模型变体选择（ppocrv6）
- 导航栏重设计：可折叠侧栏 + AI 浮动面板

### 修复

- Canvas getContext 添加 `willReadfrequently` 提示

### 变更

- 添加 ppocrv6 模型变体与 git LFS 追踪

## [0.2.27] - 2026-09-02

### 新增

- 径向菜单程序配置，支持自动图标提取

### 修复

- 径向菜单 tooltip 修复：移至环形间隙、旋转朝向中心、恢复原始位置

## [0.2.26] - 2026-09-01

### 修复

- 启动时移除 `mainWindow.show()` 防止窗口闪烁
- 中心按钮单击展开替代双击
- tooltip 移入环形间隙避免被扇形遮盖

## [0.2.25] - 2026-08-28

### 新增

- Windows 托盘气泡通知

### 修复

- 截图与径向菜单内存生命周期修复
- 截图 overlay 取消时隐藏以支持窗口复用
- 径向菜单 onState/onCursor 监听器注册遗漏
- 径向菜单强制置顶：主窗口可见时隐藏、tooltip z-index、周期性重申

### 性能

- 截图 overlay 3 分钟闲置自动销毁
- 截图销毁、延迟加载径向菜单+dotnet、V8 堆限制
- 内存泄漏修复与资源优化

## [0.2.24] - 2026-08-27

### 新增

- 径向菜单启用/禁用开关，连接主进程
- 径向菜单点击折叠/展开

### 修复

- 径向菜单拖拽光标修复（grab/move/sizeall 通过 koffi user32.dll）
- 中心按钮交互修复（双击展开、单击拖拽、收起时显示/展开时隐藏）
- 径向窗口 not showing on Windows 修复
- meel 架构重写径向菜单窗口
- clip-path 时序闪白修复
- 径向图标、位置恢复、展开时禁用拖拽

### 变更

- 径向菜单重构为持久浮动小部件（meel 架构）

## [0.2.23] - 2026-08-27

### 新增

- AGENTS.md 项目规则文档
- commitlint no-skip 规则

### 修复

- 截图 overlay 鼠标穿透修复
- 径向菜单透明区域鼠标穿透修复（OS 级 setShape）
- 截图 overlay 窗口复用加速启动
- 截图操作 toast 替换为系统通知

### 性能

- ONNX/OCR webworker 线程分离 + 流式输出

## [0.2.22] - 2026-08-26

### 新增

- 径向菜单：圆环布局、双击展开/收起、弹簧动效、拖拽修复、截图按钮、事件驱动窗口互斥
- 径向菜单：程序图标中心、毛玻璃背景、位置持久化、页面跳转、配置面板
- 截图：蒙版选择区域、操作菜单（复制/保存/标记/视觉搜索）、十字准星、toast 通知
- Windows 系统通知集成（toastXml + workpulse:// 协议）

### 修复

- 截图 overlay 用 img+veil 模式重写（Windows 兼容方案）
- 彻底移除截图窗口 transparent 消除 DWM 鼠标穿透
- 截图 preload 路径修复
- 径向菜单：clip-path 闪白、拖拽延迟判定、背景适配深色主题

### 变更

- 截图改为遮罩模式（先覆盖屏幕选区再截图）

## [0.2.11] - 2026-08-25

### 新增

- 径向悬浮窗快捷菜单与附件管理
- 动态背景 + 毛玻璃效果
- 径向菜单：圆环分割布局、主窗口最小化自动显示、拖拽+互斥显示
- Vite8 rolldownOptions 迁移

## [0.2.10] - 2026-08-24

### 修复

- 分类分布图表不显示（容器条件渲染导致 echarts init 跳过）

### 变更

- ECharts 图表迁移、范围按钮 fixed、间距恢复
- 统计页范围按钮 sticky 固定顶部 + 滚动条隐藏

### 性能

- ECharts 柱状图动画不可见修复

### 新增

- ECharts 柱状图动画美化 + 统计页时间范围按钮放大
- rcedit 品牌化 dev electron.exe 图标
- hf-mirror 并行下载 + 模型更新 + dev 环境图标修复
- 窗口标题去除 Dev/Prod，版本显示增加 build hash

## [0.2.9] - 2026-08-23

### 新增

- 用户可选主题色，七种 accent 即时切换
- 报告与对话支持 Mermaid 图表渲染并跟随主题
- 接入 motion 动画，路由过渡与统计卡入场升级

### 变更

- 全页面表面色统一接入设计 token
- 全部入场动画统一 motion 编排并结合 fade
- 新增更新日志并按现有功能同步自述文件

## [0.2.8] - 2026-08-22

### 新增

- 会议开始定时提醒：提前量可配置（5/10/15/30 分钟），系统通知点击后恢复并聚焦主窗口
- Bark iOS 推送：`BARK_KEY` 通过环境变量或项目 `.env` 提供，可选 `BARK_SERVER` 接入自建服务
- 看板任务完成时推送系统通知与 Bark（完成按钮与拖拽到完成列均触发）
- `notifier` 模块统一通知出口（本地系统通知 + Bark），完整日志输出

### 修复

- 统计页标识符损坏：每日活动图表恢复渲染、环形图与卡片配色排版恢复；移除刷新按钮，周期切换即重载数据
- 报告生成卡在「生成中」：补回丢失的 `ai:stream-chat` 处理器并清理重复注册
- 报告保存时序：生成完成后自动保存并关联记录，后续编辑直接更新该条报告
- 任务栏图标回退：改用 `.ico` 并在材质应用后重设图标；运行时 AUMID 与打包 `appId` 统一
- Splash 偶发加载失败（ERR_FAILED -2）自动重试一次

### 变更

- 主进程接入 dotenv，支持从项目根目录 `.env` 读取配置

## [0.2.7] - 2026-08-22

### 新增

- 设置页支持切换窗口材质（Mica / Mica Tabbed / Acrylic）
- 日历月视图与待办、会议联动标记（圆点指示）
- 本地模型加载失败增加重试按钮
- 设计规范文档 `DESIGN.md`

### 变更

- 迁移至原生 `backgroundMaterial`（Electron 36+），替代 talex-mica-electron DWM 方案
- 全窗口 chrome 统一涂装：标题栏、导航栏、页面操作栏同色 + 毛玻璃效果
- 暗色模式全面适配：日历、PaddleOCR、XRay、报告页、AI 页、设置页
- 托盘图标与托盘菜单图标视觉优化（尺寸自适应、品牌配色）

### 修复

- macOS 无证书环境构建签名失败（`identity: null`）
- 工作日志与统计页大面积标识符损坏修复
- 设置页头部滚动遮挡、内容区满幅背景恢复

## [0.2.6] - 2026-08-21

### 新增

- AI 对话页重写：三栏布局、会话管理、Token 统计与成本估算、思考过程面板
- 模型配置增强：8 家供应商预设、连接测试、配置导入导出、表单校验
- 日程页面支持待办事项与会议预约（时间、地点）
- 统计页时间范围选择（近一月/近三月/近半年/近一年）与分类分布图表
- commitlint（emoji 类型 + 中文描述）+ bumpp 交互式发布流程

### 变更

- ONNX / OCR 页面重构为「模型面板 + 工作区」布局
- 模型下载固定走 hf-mirror.com 国内镜像，本地文件夹缓存跨页面复用
- 3D 贡献图动画性能优化（自管理时间线，动画结束后停止重绘）

### 修复

- 分类分布图表无限闪烁（i18n 函数引用导致的 effect 循环）
- 模型加载 dtype/device 回退链与镜像尾斜杠问题

## [0.2.5] - 2026-08-20

### 新增

- 路由切换过渡动画
- 报告页双栏布局：流式 Markdown 渲染（含 `<think>` 折叠面板）、历史侧栏、空状态引导
- 3D 贡献图（React Three Fiber）+ ECharts 堆叠柱状图 + 全局 ErrorBoundary

### 修复

- 流式 Markdown MessageChannel 端口竞态，改用事件广播模式
- CI macOS 构建的平台专属依赖问题

## [0.2.4] - 2026-08-20

### 新增

- AI streaming chat with net.fetch + MessagePort + Streamdown
- 托盘菜单图标、关闭动作设置、标题栏修复
- NSIS 安装包图片改为浅色背景
- 修复开机自启动弹出默认 Electron 窗口
- 移除 @typescript/typescript-win32-x64 直接依赖，修复 macOS CI 构建

## [0.2.3] - 2026-08-20

### 变更

- 移除 DSH 功能，版本号升至 0.2.2
- 更新 workflow

## [0.2.2] - 2026-08-19

### 新增

- 个性化 NSIS 安装界面：定制侧边栏和头部横幅图片
- 新托盘图标 + 菜单项图标 + 右键菜单清理
- 基于 token 的主题色机制 + 页面深色适配
- Mica / 亚克力（Acrylic）背景效果
- Fluent Design 设计语言
- 导航栏响应式布局 + 折叠菜单
- SettingsPage 固定顶部栏

### 修复

- NSIS 安装包图片用 Python Pillow 生成正确 BMP
- 用 SVG+sharp 重写安装包图片生成，修复中文乱码
- 导航栏完全透明，让 Mica 效果透出
- 导航栏下拉菜单溢出视口
- 红绿灯 tooltip 被裁剪

### 变更

- 移除强调色 IPC，优化 Mica 透明度
- 移除 react-use 依赖

## [0.2.1] - 2026-08-18

### 新增

- DSH 模块架构与安全优化
- 页面布局与版本同步

### 修复

- 主题切换与开机启动持久化

## [0.1.6] - 2026-08-03

### 修复

- 任务完成对话框居中
- 任务日期选择器

## [0.1.5] - 2026-07-31

### 新增

- Redesign WorkPulse + 升级 Electron
- 修复开发模式应用图标

## [0.1.4] - 2026-07-31

### 变更

- 合并 PR #1（zhunihuifeima/main）+ 代码审查反馈

## [0.1.3] - 2026-07-31

### 新增

- Bump release version to 0.1.5

## [0.1.2] - 2026-04-30

### 新增

- 本地化与发布工作流
- 报告、截图、设置功能增强
- 应用图标更新
- Windows 更新 artifact 名称修复
- GitHub 自动更新
- Release packaging workflow

## [0.1.1] - 2026-04-30

### 新增

- Bump release version to 0.1.1

## [0.1.0] - 2026-04-30

### 新增

- 任务编辑、应用图标修复、拖拽边界限制、README
- 搜索、深色模式、统计、导出、动画、日期选择器修复
- 应用图标和 Logo 资源
- 菜单栏托盘图标与可配置全局快捷键
- 原生菜单栏与全局快速创建快捷键
- 报告历史、键盘快捷键、整体优化

## [0.1.0-beta] - 2026-03-30

### 新增

- WorkPulse MVP：看板任务、工作日志、AI 报告
