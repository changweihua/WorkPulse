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

### ⚠️ Windows 下写 commit message 的正确方式

Shell 工具和 Python `open()` 在 Windows 上默认使用 GBK 编码，emoji 字符会丢失或乱码。**必须**使用以下模式：

```python
python -c "
import sys; sys.stdout.reconfigure(encoding='utf-8')
msg = '\U0001f433 chore: release v0.2.23'
with open('C:/Users/CHANGW~1/AppData/Local/Temp/opencode/COMMIT_MSG', 'w', encoding='utf-8') as f:
    f.write(msg)
" && git commit -F "C:/Users/CHANGW~1/AppData/Local/Temp/opencode/COMMIT_MSG"
```

**关键点：**
- `open()` 必须加 `encoding='utf-8'`
- `sys.stdout.reconfigure(encoding='utf-8')` 防止 print 报错
- **禁止** `git commit -m "emoji msg"` — shell 在插值字符串中会破坏 emoji
- **禁止** 随意使用 `--no-verify` — 仅在 hook 真的 broken 时使用

### 常见错误

1. **缺少 emoji 前缀**：`chore: release v0.2.23` ← 错误（没有 emoji）
2. **emoji 错误**：`🐠 chore:` ← 错误（热带鱼不是鲸鱼；🐳 = whale = chore）
3. **首字母大写**：`fix: Add radial menu` ← 错误（应为 `add`）
4. **尾部句号**：`fix: add radial menu.` ← 错误

## 严禁私自 Push

- **只 commit，不 push**，除非用户明确说"推送"
- 违反此规则将导致不可控的发布，严重违规

## 严禁跳过格式校验

- **禁止** `git commit --no-verify` — commitlint hook 必须正常执行
- 如果 hook 报错，修复 commit message 格式后重新提交，而不是跳过校验
- **唯一例外**：hook 本身 broken（如 Node 版本问题、npm 依赖缺失），且用户明确允许

## 截图规范

- **悬浮窗背景必须透明**：overlay 窗口背景使用 `background: 'transparent'`，不允许有蒙版颜色
- **截图区域边框使用高分辨度颜色**：选区边框用亮色（如 `#00e5ff`），不要用半透明填充
- **capture 时隐藏所有 overlay 内容**：选区边框、十字线、工具栏等在截图瞬间必须隐藏，避免被截取进图片
