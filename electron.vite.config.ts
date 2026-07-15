import { resolve } from 'path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // 加载 .env 文件
  const env = loadEnv(mode, process.cwd(), '')

  // 动态构建 define 对象，只注入 VITE_ 开头的变量
  // 显式声明 define 为 Record<string, string>
  const define: Record<string, string> = {}
  for (const key in env) {
    if (key.startsWith('VITE_')) {
      define[`import.meta.env.${key}`] = JSON.stringify(env[key])
    }
  }

  return {
    main: {
      build: {
        outDir: 'dist/main',      // v6 推荐显式指定
        rolldownOptions: {
          input: { index: resolve(__dirname, 'src/main/index.ts') }
        }
      }
    },
    preload: {
      build: {
        rolldownOptions: {
          input: { index: resolve(__dirname, 'src/preload/index.ts') }
        }
      }
    },
    renderer: {
      // 可选项：配置环境文件目录（默认根目录）
      envDir: './',  // 默认就是根目录
      define, // 注入所有 VITE_ 开头的变量
      // define: {
      //   'import.meta.env.VITE_APP_TITLE': JSON.stringify('WorkPulseX')
      // },
      // 可选项：修改环境变量前缀（默认 VITE_）
      envPrefix: 'VITE_',
      // build: {
      //   // ✅ 关键：Vite 8 实际认这个
      //   rolldownOptions: {
      //     input: 'src/renderer/index.html'
      //   }
      // },
      // 确保开发服务器能正确处理 .wasm 文件
      server: {
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp'
        }
      },
      resolve: {
        alias: {
          '@': resolve('src/renderer/src')
        }
      },
      plugins: [react(), tailwindcss()]
    }
  }
})
