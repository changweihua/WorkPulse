# 拾光 (WorkPulse)

[English](./README.md) | [中文](./README.zh-CN.md)

> 让每一份努力被看见

一款轻量桌面应用，几秒钟记录你的每日工作——写下做了什么、用看板管理任务、用 AI 生成工作报告。

为每一个想轻松回顾"今天干了啥"的打工人而生。

## 截图

| 工作日志 | 看板 |
|---------|------|
| ![工作日志](docs/screenshots/workpulse-worklog.png) | ![看板](docs/screenshots/workpulse-kanban.png) |

| AI 报告 | 统计 |
|---------|------|
| ![AI 报告](docs/screenshots/workpulse-report.png) | ![统计](docs/screenshots/workpulse-stats.png) |

## 功能

**工作日志** — 输入你刚做了什么，按回车，完成。支持 `#标签` 自动分类、全文搜索、撤销删除，以及带分类信息的 CSV/Markdown 导出。

**看板任务** — 在待办 → 进行中 → 已完成之间拖拽任务卡片。有草稿箱存放"以后再说"的想法，支持截止日期和内联编辑。完成任务时自动生成一条工作日志。

**AI 报告** — 选择时间范围，一键生成结构化工作总结。报告会结合工作日志和任务上下文，支持 OpenAI/Anthropic 兼容服务，可预览、编辑、保存到历史、复制或导出。

**数据统计** — 14 天活动柱状图、GitHub 风格热力图、连续记录天数、任务完成统计。

**快速记录** — 可配置全局快捷键（默认 `Ctrl+Shift+L` 记日志、`Ctrl+Shift+T` 加任务）让你无需切换窗口即可记录。快速日志同样支持 `#标签` 解析，也可从菜单栏托盘图标操作。

**深色模式** — 跟随系统、浅色、深色三种主题，全界面覆盖。Windows 11 支持 Mica 毛玻璃效果，与桌面环境无缝融合。

**多语言** — 支持中文和英文界面，可跟随系统语言。菜单、托盘操作、设置、导出及默认 AI 报告提示词均随语言切换。

**自动更新** — 打包版本会自动检查 GitHub Releases 新版本，后台下载更新，重启后安装。设置页面也提供手动检查更新。

**Windows Mica 效果** — 原生 Windows 11 Mica 材质应用于标题栏和导航栏，与桌面环境融为一体。

## 技术栈

- **Electron** + **React** + **TypeScript**
- **Vite** (electron-vite) 快速构建
- **SQLite** (better-sqlite3) 本地数据存储
- **Zustand** 状态管理
- **@dnd-kit** 拖拽排序
- **Tailwind CSS** 样式
- **talex-mica-electron** Windows Mica 效果

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 生产构建
npm run build

# 打包分发
npm run dist:mac    # macOS (DMG + ZIP, x64 + arm64)
npm run dist:win    # Windows (NSIS 安装包)
npm run dist:linux  # Linux (AppImage)
```

## 安装说明

### macOS

由于安装包未签名，macOS 在首次打开时会提示"已损坏"。把 `WorkPulse.app` 拖到 `/Applications` 之后，在终端执行一次以下命令以清除隔离属性：

```bash
xattr -cr /Applications/WorkPulse.app
```

然后正常打开应用即可。

### Windows

从 [Releases](../../releases) 下载 NSIS 安装包，运行安装程序并按照提示操作。应用将安装到 Program Files 目录。

## 发布构建

当推送 `v*` 标签或手动运行 `Release` 工作流时，GitHub Actions 会为 macOS、Windows 和 Linux 构建发布产物。

```bash
git tag v0.2.0
git push origin v0.2.0
```

工作流会将 DMG/ZIP、NSIS/便携版 EXE、AppImage 和 DEB 产物上传到 GitHub Release。默认构建未签名；如需 macOS 公证或 Windows 签名安装包，请另行配置签名密钥。

打包应用使用相同的 GitHub Release 元数据（`latest.yml`、`latest-mac.yml`、`latest-linux.yml`）进行自动更新检查。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘1` / `Ctrl+1` | 切换到工作日志 |
| `⌘2` / `Ctrl+2` | 切换到看板 |
| `⌘3` / `Ctrl+3` | 切换到报告 |
| `⌘4` / `Ctrl+4` | 切换到统计 |
| `⌘,` / `Ctrl+,` | 设置 |
| `Ctrl+Shift+L` | 全局快速记录日志 |
| `Ctrl+Shift+T` | 全局快速添加任务 |

## 数据与安全

所有数据存储在本地 SQLite 数据库中（系统应用数据目录）。每日自动备份。API Key 会在系统支持时通过 Electron 安全存储加密保存，并清理旧版遗留的明文密钥。无云端、无账号、无遥测。

## 许可证

MIT
