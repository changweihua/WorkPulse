import { resolve } from 'path';
import { defineConfig, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const define: Record<string, string> = {};
  for (const key in env) {
    if (key.startsWith('VITE_')) {
      define[`import.meta.env.${key}`] = JSON.stringify(env[key]);
      define[`process.env.${key}`] = JSON.stringify(env[key]);
    }
  }

  // 构建 ID：每次执行构建时生成一次（Date.now() 的 36 进制字符串），仅注入 main 构建。
  // 用途：integrityCheck 用它区分「重新构建/升级」与「同一次构建产物被篡改」——
  // 源码改动后重新打包会让 app.asar 哈希变化但版本号不变，若只比对版本就会误报篡改；
  // 记录中的 buildId 与当前 __BUILD_ID__ 不一致时直接刷新基准哈希（视为重新构建），
  // 只有 buildId 与版本都一致时哈希不同才判定为篡改。
  const buildIdDefine = JSON.stringify(Date.now().toString(36));

  return {
    main: {
      define: {
        ...define,
        __BUILD_ID__: buildIdDefine,
      },
      plugins: [
        ...(mode === 'production'
          ? [
              obfuscatorPlugin({
                apply: 'build',
                options: {
                  compact: true,
                  controlFlowFlattening: true,
                  controlFlowFlatteningThreshold: 0.5,
                  deadCodeInjection: true,
                  deadCodeInjectionThreshold: 0.2,
                  stringArray: true,
                  stringArrayEncoding: ['base64'],
                  stringArrayThreshold: 0.75,
                },
              }),
            ]
          : []),
      ],
      build: {
        // feedsmith 的 dist 内自带嵌套 node_modules/trousse，electron-builder 依赖收集器
        // 会硬编码跳过嵌套 node_modules 导致打包后运行时 Cannot find module，故将 feedsmith
        // 打进 main bundle（其内部相对 require 在构建期即可解析）
        externalizeDeps: {
          exclude: ['feedsmith'],
        },
        rolldownOptions: {
          // original-fs 是 Electron 内置模块（未打 asar 补丁的原生 fs），
          // 打包器无法从 node_modules 解析，需保持 external 由运行时 require
          external: ['original-fs'],
          input: {
            index: resolve(__dirname, 'src/main/index.ts'),
            splash: resolve(__dirname, 'src/preload/splash.ts'),
          },
        },
      },
    },
    preload: {
      define,
      build: {
        rolldownOptions: {
          input: {
            index: resolve(__dirname, 'src/preload/index.ts'),
            splash: resolve(__dirname, 'src/preload/splash.ts'),
            radial: resolve(__dirname, 'src/preload/radial.ts'),
            screenshotOverlay: resolve(__dirname, 'src/preload/screenshot-overlay.ts'),
          },
        },
      },
    },
    renderer: {
      envDir: './',
      publicDir: resolve(__dirname, 'public'),
      define,
      envPrefix: 'VITE_',
      server: {
        port: 5252,
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
      },
      resolve: {
        alias: {
          '@': resolve('src/renderer/src'),
        },
      },
      build: {
        rolldownOptions: {
          input: {
            index: resolve(__dirname, 'src/renderer/index.html'),
            radial: resolve(__dirname, 'src/renderer/radial.html'),
            screenshotOverlay: resolve(__dirname, 'src/renderer/screenshot-overlay.html'),
          },
        },
      },
      plugins: [react(), tailwindcss()],
    },
  };
});
