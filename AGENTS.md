# WorkPulse 项目规范

## 语言规范

- **所有对话、注释、提交信息、文档必须使用中文**
- AI Agent 与用户的交互一律使用中文，包括代码注释和变量命名说明
- 唯一例外：代码本身（变量名、函数名、类型名等）保持英文
- **记录规范**：所有变更记录、日志、文档必须使用中文撰写，确保团队成员可读性

## Commitlint 规则

使用 `git-commit-emoji` 格式（extend: `git-commit-emoji`）。

### AI Agent 必须遵循的格式

**格式：** `emoji type: subject`

- **emoji**：必须使用下方对照表中的 emoji，不可替换
- **type**：必须使用对照表中的类型，不可自创
- **subject**：小写开头，简洁描述变更内容，不加句号
- **header**：最长 72 字符（含 emoji 和空格），超出会被拒绝。⚠️ `✨ feat: ` 前缀占 9 字符，实际 subject 仅剩 63 字符，务必精简
- **body**：每行最长 200 字符（可选）

**⚠️ 严禁手动拼接 emoji + type！必须使用以下方式之一：**

1. `npm run commit` — 交互式菜单选择（推荐）
2. `npx tsx scripts/commit.ts <type> "<subject>"` — AI Agent 专用提交脚本（**AI Agent 必须使用此方式**）
3. `npm run ai-commit` — 自动推断并生成 commit message
4. 如果必须手动写，**必须逐字复制下方对照表中的 emoji 和 type 组合**，禁止凭记忆拼写

**emoji → type 速查（按 emoji 排序，用于复制）：**

```
🎉 init     ✨ feat     🐞 fix      📃 docs     🌈 style    🦄 refactor
🎈 perf     🧪 test     🔧 build    🐎 ci       🐳 chore    ↩ revert
🔒 security 📦 deps     🗑️ remove
```

**emoji ↔ type 对照表（必须严格匹配）：**

| emoji | type     | 用途                       |
| ----- | -------- | -------------------------- |
| 🎉    | init     | 项目初始化                 |
| ✨    | feat     | 新功能                     |
| 🐞    | fix      | Bug 修复                   |
| 📃    | docs     | 文档                       |
| 🌈    | style    | 样式调整（不影响逻辑）     |
| 🦄    | refactor | 重构                       |
| 🎈    | perf     | 性能优化                   |
| 🧪    | test     | 测试                       |
| 🔧    | build    | 构建/依赖                  |
| 🐎    | ci       | CI/CD                      |
| 🐳    | chore    | 其他杂项（发布、版本号等） |
| ↩     | revert   | 回滚                       |
| 🔒    | security | 安全修复                   |
| 📦    | deps     | 依赖更新                   |
| 🗑️    | remove   | 代码/功能移除              |

**正确示例：**

- `✨ feat: add radial menu navigation`
- `🐞 fix: screenshot overlay transparency`
- `🎈 perf: onnx/ocr webworker thread separation`
- `🐳 chore: release v0.2.22`
- `📃 docs: update README installation steps`

**错误示例（禁止）：**

- `chore: release v0.2.23` ← 缺少 emoji
- `🐠 chore: xxx` ← emoji 错误（热带鱼不是鲸鱼）
- `fix: Add radial menu` ← 首字母大写
- `fix: add radial menu.` ← 尾部句号

### ⚠️ Windows 下写 commit message 的正确方式

Shell 工具在 Windows 上默认使用 GBK 编码，emoji 字符会丢失或乱码。**必须**使用 Node.js 写入临时文件（无 BOM）：

```bash
node -e "require('fs').writeFileSync('C:\\Users\\Changweihua\\AppData\\Local\\Temp\\opencode\\COMMIT_MSG','\u{1F41B} fix: resolve camera permission crash','utf8')" && git commit -F "C:\Users\Changweihua\AppData\Local\Temp\opencode\COMMIT_MSG"
```

**关键点：**

- 使用 Node.js `fs.writeFileSync(..., 'utf8')` 写入 —— **UTF-8 无 BOM**
- **禁止** `pwsh -Command "[System.IO.File]::WriteAllText(..., [System.Text.Encoding]::UTF8)"` —— 会写入 BOM (`\uFEFF`)，导致 commitlint 报 `type must be one of [...]` 错误
- **禁止** `git commit -m "emoji msg"` — shell 在插值字符串中会破坏 emoji
- **禁止** 随意使用 `--no-verify` — 仅在 hook 真的 broken 时使用

### 常见错误

1. **缺少 emoji 前缀**：`chore: release v0.2.23` ← 错误（没有 emoji）
2. **emoji 错误**：`🐠 chore:` ← 错误（热带鱼不是鲸鱼；🐳 = whale = chore）
3. **首字母大写**：`fix: Add radial menu` ← 错误（应为 `add`）
4. **尾部句号**：`fix: add radial menu.` ← 错误

## 提交前必须更新 CHANGELOG.md

- **每次改动提交前，必须先在 `CHANGELOG.md` 的 `[未发布]` 区块记录变更**
- 记录完成后再执行 `git commit`
- CHANGELOG 条目使用中文，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
- 分类：`### 新增` / `### 变更` / `### 修复` / `### 移除`
- 条目简洁明了，描述**做了什么**而非怎么做的

## 提交范围规范

- **每次提交只提交自己修改的文件**，禁止提交未修改的文件
- 提交前使用 `git status` 确认变更范围，仅 `git add` 自己修改的文件
- 禁止使用 `git add .` 或 `git add -A`（除非确认所有变更都是自己做的）
- 合并分支时除外：合并产生的冲突解决可以包含多方修改

## 严禁私自提交（最严格规则）

- **AI Agent 禁止自行执行 `git add` 和 `git commit`**，除非用户明确发出"提交"指令
- AI 可以修改文件、更新 CHANGELOG、准备 commit message，但**提交动作必须由用户主动触发**
- 用户说"提交"、"commit"、"帮我提交"才算明确指令；"改一下"、"修一下"、"优化"不算
- 违反此规则将导致不受控的代码入库，**严重违规，零容忍**
- Orchestrator 和所有子 Agent 均受此规则约束，无例外

## 严禁私自 Push

- **只 commit，不 push**，除非用户明确说"推送"
- 违反此规则将导致不可控的发布，严重违规

## 严禁跳过格式校验

- **禁止** `git commit --no-verify` — commitlint hook 必须正常执行
- 如果 hook 报错，修复 commit message 格式后重新提交，而不是跳过校验
- **唯一例外**：hook 本身 broken（如 Node 版本问题、npm 依赖缺失），且用户明确允许

## 发布版本流程（必须严格遵循）

**顺序不可调换，每一步都必须执行：**

| 步骤  | 操作                                                                | 说明                                                  |
| ----- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| **1** | `npx bumpp X.Y.Z --no-git-checks`                                   | 升 package.json 版本，自动生成 git tag                |
| **2** | `npx tsx scripts/sync-version.ts`                                   | 同步 .env、splash.html 到新版本（必须在 step 1 之后） |
| **3** | `git add package.json package-lock.json .env resources/splash.html` | 暂存所有版本相关文件                                  |
| **4** | `pwsh -Command "..." && git commit -F "..."`                        | 用 🐳 chore: release vX.Y.Z 提交                      |
| **5** | `git push && git push --tags`                                       | 推送 commits + tag                                    |

**⚠️ 常见错误（已犯过，禁止再犯）：**

- ❌ sync-version 在 bump 之前执行 → 同步的是旧版本号
- ❌ 忘记 git tag → GitHub Release / Changelog 无法关联版本
- ❌ 忘记 push --tags → tag 只在本地，远程没有
- ❌ 只 commit 不 tag → 版本追溯断裂

**⚠️ bumpp 可能因 commitlint 失败导致 tag 未创建：**

- bumpp 在 commit 失败时不会创建 tag，必须手动创建
- 如果 `git tag -l "vX.Y.Z"` 为空，必须手动执行 `git tag vX.Y.Z` 再 `git push origin vX.Y.Z`
- **tag 必须由你手动创建和推送**，这样才能触发 GitHub Actions 自动构建

**发版前必须确认：**

1. `grep "VITE_APP_VERSION" .env` 显示正确版本
2. `grep "APP_VERSION" resources/splash.html` 显示正确版本
3. `git tag -l "vX.Y.Z"` 能找到 tag（若无则手动创建）

## Git Worktree 规范（AI Agent 并行开发）

### 为什么用 Worktree

WorkPulse 采用 AI Agent 并行开发模式：多个 AI Agent 同时在不同功能上工作，互不干扰。每个 Agent 在独立的 worktree 中操作，拥有独立的工作目录和分支，共享同一个 `.git` 仓库。

### 命名规范

```
WorkPulse              ← 主工作目录（main 分支，人类 / orchestrator）
WorkPulse-<agent-id>   ← Agent 隔离目录（如 WorkPulse-agent-a）
```

- 分支名格式：`agent/<agent-id>/<feature>`，如 `agent/agent-a/feat-idle-chart`
- Agent ID 由 orchestrator 分配，用于追踪归属

### 操作流程

**创建（Agent 开始工作前）：**

```bash
# 基于 main 创建隔离工作树 + 分支
git worktree add ../WorkPulse-<agent-id> -b agent/<agent-id>/<feature-name>
```

**Agent 工作期间：**

- 在自己的 worktree 目录中自由 commit、修改代码
- 不需要 stash，不需要切分支
- 可以 `git push` 自己的分支到 remote（如需协作）

**完成合并：**

```bash
# 1. 进入主工作目录
cd D:\Github\WorkPulse

# 2. 合并 Agent 的分支
git merge agent/<agent-id>/<feature-name>

# 3. 清理 worktree 和分支
git worktree remove ../WorkPulse-<agent-id>
git branch -d agent/<agent-id>/<feature-name>
```

### ⚠️ 禁止事项

1. **禁止在同一分支上创建多个 worktree** — Git 会报错，每个 Agent 必须用独立分支名
2. **禁止在有未提交改动时删除 worktree** — 先 commit 或 stash
3. **禁止删除主工作目录** — `WorkPulse/` 是主仓库，不可删除
4. **禁止在非主 worktree 中执行发版流程** — 版本 bump、tag、push 只在主目录操作
5. **禁止在 worktree 中修改 `.git/config` 全局设置** — 只能用 `--local` 作用域

### 强制规则

**Agent 必须遵守以下规则，违反将拒绝合并：**

1. **强制使用 Worktree** — AI Agent 开发新功能或修复 Bug 时，**必须**在独立的 worktree 中工作，禁止直接在主目录（main 分支）上修改代码
2. **强制提交** — Agent 在 worktree 中的每次有意义的修改都必须 commit，禁止保留未提交的更改
3. **强制提交后再合并** — 合并到 main 之前，worktree 中的所有更改必须已 commit，未提交的更改将阻止合并
4. **强制清理** — Agent 完成工作并成功合并后，必须立即清理 worktree 和分支，避免残留
5. **强制验证** — Orchestrator 合并前必须验证：worktree 无未提交更改、分支可正常合并、代码符合项目规范

**Orchestrator 检查清单（合并前）：**

```bash
# 1. 检查 worktree 是否有未提交更改
git -C ../WorkPulse-<agent-id> status --porcelain

# 2. 检查分支是否可合并（无冲突）
git merge --no-commit --no-ff agent/<agent-id>/<feature>

# 3. 验证后执行实际合并
git merge agent/<agent-id>/<feature>
```

### Orchestrator 职责

- 分配唯一的 Agent ID
- 在调度器中记录：哪个 agent 在哪个 worktree、什么分支、做什么任务
- Agent 完成后负责合并、清理、验证
- 维护 worktree 清单，避免残留

### 快速查看当前状态

```bash
git worktree list          # 列出所有 worktree
git worktree prune         # 清理失效记录
```

## 截图规范

- **悬浮窗背景必须透明**：overlay 窗口背景使用 `background: 'transparent'`，不允许有蒙版颜色
- **截图区域边框使用高分辨度颜色**：选区边框用亮色（如 `#00e5ff`），不要用半透明填充
- **capture 时隐藏所有 overlay 内容**：选区边框、十字线、工具栏等在截图瞬间必须隐藏，避免被截取进图片
