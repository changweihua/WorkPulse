import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const PKG = path.join(ROOT, 'package.json')
const ENV = path.join(ROOT, '.env')
const SPLASH = path.join(ROOT, 'resources', 'splash.html')

function readJSON(filePath: string): { version: string } {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
}

function replaceInFile(filePath: string, pattern: RegExp, replacement: string): void {
    let content = fs.readFileSync(filePath, 'utf-8')
    if (!pattern.test(content)) {
        console.warn(`  ⚠ 未找到匹配: ${filePath}`)
        return
    }
    content = content.replace(pattern, replacement)
    fs.writeFileSync(filePath, content, 'utf-8')
}

function main(): void {
    const { version } = readJSON(PKG)
    console.log(`\n📦 当前版本: v${version}\n`)

    // 1. .env — VITE_APP_VERSION
    const envPattern = /^VITE_APP_VERSION=.*/m
    replaceInFile(ENV, envPattern, `VITE_APP_VERSION=${version}`)
    console.log('  ✅ .env')

    // 2. resources/splash.html — 版本号 fallback
    const splashPattern = /const\s+version\s*=\s*env\.APP_VERSION\s*\|\|\s*'[\d.]+'/
    replaceInFile(SPLASH, splashPattern, `const version = env.APP_VERSION || '${version}'`)
    console.log('  ✅ resources/splash.html')

    console.log(`\n🎉 版本号已同步: v${version}\n`)
}

main()
