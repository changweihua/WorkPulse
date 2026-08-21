// src/preload/splash.ts
import { contextBridge } from 'electron'

// 定义需要暴露给 splash 页面的环境变量
const env = {
    MODE: import.meta.env.MODE,
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
    BASE_URL: import.meta.env.BASE_URL,
    VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE,
    APP_VERSION: import.meta.env.VITE_APP_VERSION,
}

// 安全地暴露给渲染进程
contextBridge.exposeInMainWorld('__splash_env__', env)

// 类型声明（让 splash.html 里的 TypeScript 能识别）
export type SplashEnv = typeof env