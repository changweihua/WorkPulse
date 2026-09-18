import { resolve } from 'path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

export default defineConfig(({ mode }) => {
  // 鍔犺浇 .env 鏂囦欢
  const env = loadEnv(mode, process.cwd(), '')

  // 鍔ㄦ€佹瀯寤?define 瀵硅薄锛屽彧娉ㄥ叆 VITE_ 寮€澶寸殑鍙橀噺
  // 鏄惧紡澹版槑 define 涓?Record<string, string>
  const define: Record<string, string> = {}
  for (const key in env) {
    if (key.startsWith('VITE_')) {
      define[`import.meta.env.${key}`] = JSON.stringify(env[key])
      // 鉁?涔熸敞鍏ュ埌 process.env锛屼娇涓昏繘绋嬪拰棰勫姞杞借兘璁块棶
      define[`process.env.${key}`] = JSON.stringify(env[key])
    }
  }

  return {
    main: {
      define,  // 鉁?涓昏繘绋嬪彲浠ヨ鍙?process.env.VITE_XXX
      plugins: [
        // 馃洝锔?浠呭湪 production 妯″紡涓嬫贩娣嗕富杩涚▼浠ｇ爜锛岄槻姝?asar 鍙嶇紪璇?        ...(mode === 'production'
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
        rolldownOptions: {
          input: {
            index: resolve(__dirname, 'src/main/index.ts'),
            splash: resolve(__dirname, 'src/preload/splash.ts'), // 缂栬瘧 preload
          }
        }
      }
    },
    preload: {
      define,  // 鉁?棰勫姞杞借繘绋嬩篃鑳借鍙?      build: {
        rolldownOptions: {
          input: {
            index: resolve(__dirname, 'src/preload/index.ts'),
            splash: resolve(__dirname, 'src/preload/splash.ts'),
            radial: resolve(__dirname, 'src/preload/radial.ts'),
            screenshotOverlay: resolve(__dirname, 'src/preload/screenshot-overlay.ts'),
          }
        }
      }
    },
    renderer: {
      // 鍙€夐」锛氶厤缃幆澧冩枃浠剁洰褰曪紙榛樿鏍圭洰褰曪級
      envDir: './',  // 榛樿灏辨槸鏍圭洰褰?      publicDir: resolve(__dirname, 'public'),  // GLB 绛夐潤鎬佽祫婧愬湪椤圭洰鏍?public/ 涓?      define,  // 鉁?娓叉煋杩涚▼閫氳繃 import.meta.env 璇诲彇
      // define: {
      //   'import.meta.env.VITE_APP_TITLE': JSON.stringify('WorkPulseX')
      // },
      // 鍙€夐」锛氫慨鏀圭幆澧冨彉閲忓墠缂€锛堥粯璁?VITE_锛?      envPrefix: 'VITE_',
      // build: {
      //   // 鉁?鍏抽敭锛歏ite 8 瀹為檯璁よ繖涓?      //   rolldownOptions: {
      //     input: 'src/renderer/index.html'
      //   }
      // },
      // 纭繚寮€鍙戞湇鍔″櫒鑳芥纭鐞?.wasm 鏂囦欢
      server: {
        port: 5252,
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
      build: {
        rolldownOptions: {
          input: {
            index: resolve(__dirname, 'src/renderer/index.html'),
            radial: resolve(__dirname, 'src/renderer/radial.html'), // 寰勫悜鑿滃崟鐙珛鍏ュ彛
            screenshotOverlay: resolve(__dirname, 'src/renderer/screenshot-overlay.html'), // 鍖哄煙鎴浘瑕嗙洊灞?          }
        }
      },
      plugins: [react(), tailwindcss()]
    }
  }
})
