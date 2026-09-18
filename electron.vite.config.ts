import { resolve } from 'path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const define: Record<string, string> = {}
  for (const key in env) {
    if (key.startsWith('VITE_')) {
      define[`import.meta.env.${key}`] = JSON.stringify(env[key])
      define[`process.env.${key}`] = JSON.stringify(env[key])
    }
  }

  return {
    main: {
      define,
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
        rolldownOptions: {
          input: {
            index: resolve(__dirname, 'src/main/index.ts'),
            splash: resolve(__dirname, 'src/preload/splash.ts'),
          }
        }
      }
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
          }
        }
      }
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
            radial: resolve(__dirname, 'src/renderer/radial.html'),
            screenshotOverlay: resolve(__dirname, 'src/renderer/screenshot-overlay.html'),
          }
        }
      },
      plugins: [react(), tailwindcss()]
    }
  }
})
