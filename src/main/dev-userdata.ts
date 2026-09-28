/**
 * 开发模式独立 userData 隔离
 *
 * 背景：dev 实例与已安装版 WorkPulse 默认共用 `%APPDATA%\<appName>`，
 * 会互相争抢磁盘缓存（Chromium 报「拒绝访问 / Unable to move the cache」）、
 * 同时读写同一个 workpulse.db、共用单实例锁与托盘，导致数据污染与调试结论不可信。
 *
 * 做法：dev（未打包）时把 userData 改为带 `-dev` 后缀的独立目录，
 * 使日志、数据库、附件、缓存、app.integrity 全部与安装版隔离。
 *
 * 求值时机：本模块必须在 index.ts 中**最先** import（dotenv 之后）——
 * ES Module 按 import 语句顺序深度优先求值，attachments.ts 等模块在顶层就读取
 * `app.getPath('userData')`，晚一步就会读到未隔离的路径。
 */
import { app } from 'electron';

if (!app.isPackaged) {
  const devUserData = `${app.getPath('userData')}-dev`;
  app.setPath('userData', devUserData);
}
