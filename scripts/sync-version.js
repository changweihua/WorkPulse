// scripts/sync-version.js
// 从 package.json 读取版本号，同步到 .env 和 splash.html
const { readFileSync, writeFileSync } = require('fs')
const { resolve } = require('path')

const root = resolve(__dirname, '..')
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')).version

// 1. 同步 .env（CI 中可能不存在，跳过）
const envPath = resolve(root, '.env')
try {
  const env = readFileSync(envPath, 'utf-8')
  const envUpdated = env.replace(/^VITE_APP_VERSION=.*$/m, `VITE_APP_VERSION=${version}`)
  if (envUpdated !== env) {
    writeFileSync(envPath, envUpdated, 'utf-8')
  } else if (!env.includes('VITE_APP_VERSION')) {
    writeFileSync(envPath, env.trimEnd() + `\nVITE_APP_VERSION=${version}\n`, 'utf-8')
  }
} catch {
  writeFileSync(envPath, `VITE_APP_VERSION=${version}\n`, 'utf-8')
}

// 2. 同步 splash.html 回退值
const splashPath = resolve(root, 'resources/splash.html')
const splash = readFileSync(splashPath, 'utf-8')
const splashUpdated = splash.replace(
  /(VITE_APP_VERSION\s*\|\|\s*')([^']+)(')/,
  `$1${version}$3`
)
if (splashUpdated !== splash) {
  writeFileSync(splashPath, splashUpdated, 'utf-8')
}

console.log(`[sync-version] done → ${version}`)
