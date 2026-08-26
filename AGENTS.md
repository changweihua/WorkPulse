# WorkPulse Project Rules

## Commitlint 规则

使用 `git-commit-emoji` 格式（extend: `git-commit-emoji`）。

**必须 emoji 前缀，格式：`emoji type: subject`**

**允许的 type：**
- `🎉 init` — 项目初始化
- `✨ feat` — 新功能
- `🐞 fix` — Bug 修复
- `📃 docs` — 文档
- `🌈 style` — 样式调整（不影响逻辑）
- `🦄 refactor` — 重构
- `🎈 perf` — 性能优化
- `🧪 test` — 测试
- `🔧 build` — 构建/依赖
- `🐎 ci` — CI/CD
- `🐳 chore` — 其他杂项（发布、版本号等）
- `↩ revert` — 回滚

**格式：** `emoji type: subject`（subject 必须小写开头，不能 sentence-case/start-case/pascal-case/upper-case）

**示例：**
- `✨ feat: add radial menu navigation`
- `🐞 fix: screenshot overlay transparency`
- `🎈 perf: onnx/ocr webworker thread separation`
- `🐳 chore: release v0.2.22`

**body 限制：** 每行最长 200 字符

## 严禁私自 Push

- **只 commit，不 push**，除非用户明确说"推送"
- 违反此规则将导致不可控的发布，严重违规

## 截图规范

- **悬浮窗背景必须透明**：overlay 窗口背景使用 `background: 'transparent'`，不允许有蒙版颜色
- **截图区域边框使用高分辨度颜色**：选区边框用亮色（如 `#00e5ff`），不要用半透明填充
- **capture 时隐藏所有 overlay 内容**：选区边框、十字线、工具栏等在截图瞬间必须隐藏，避免被截取进图片
