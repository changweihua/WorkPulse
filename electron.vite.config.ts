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
      // ✅ 也注入到 process.env，使主进程和预加载能访问
      define[`process.env.${key}`] = JSON.stringify(env[key])
    }
  }

  return {
    main: {
      define,  // ✅ 主进程可以读取 process.env.VITE_XXX
      build: {
        rolldownOptions: {
          input: { index: resolve(__dirname, 'src/main/index.ts') }
        }
      }
    },
    preload: {
      define,  // ✅ 预加载进程也能读取
      build: {
        rolldownOptions: {
          input: { index: resolve(__dirname, 'src/preload/index.ts') }
        }
      }
    },
    renderer: {
      // 可选项：配置环境文件目录（默认根目录）
      envDir: './',  // 默认就是根目录
      define,  // ✅ 渲染进程通过 import.meta.env 读取
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
