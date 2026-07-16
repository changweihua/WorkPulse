// src/preload/splash.ts
import { contextBridge } from 'electron'

// 定义需要暴露给 splash 页面的环境变量
const env = {
    // 从 Vite 的 import.meta.env 读取（由构建工具注入）
    // 注意：这些值在构建时会被 Vite 替换
    MODE: import.meta.env.MODE,
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
    BASE_URL: import.meta.env.BASE_URL,
    // 自定义环境变量（需要以 VITE_ 开头）
    VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE,
    // 也可以从 process.env 读取（但需经过构建工具处理）
    // 建议用 Vite 的 import.meta.env
}

// 安全地暴露给渲染进程
contextBridge.exposeInMainWorld('__splash_env__', env)

// 类型声明（让 splash.html 里的 TypeScript 能识别）
export type SplashEnv = typeof env