// src/main/dotnet-loader.ts
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import { sanitizeLogMessage } from './logSanitizer';

// ── 日志 ──

const LOG_PATHS = [
    path.join(app.getPath('userData'), 'dotnet-loader.log'),
    path.join(os.tmpdir(), 'workpulse-dotnet-loader.log'),
    path.join(process.cwd(), 'dotnet-loader.log'),
];

function writeLog(entry: string) {
    for (const logFile of LOG_PATHS) {
        try {
            const dir = path.dirname(logFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(logFile, entry + '\n', 'utf-8');
            return;
        } catch { /* 静默 */ }
    }
}

function log(msg: string, data?: unknown) {
    const entry = `[${new Date().toISOString()}] ${msg}${data ? ' ' + JSON.stringify(data, null, 2) : ''}`;
    const sanitized = sanitizeLogMessage(entry);
    console.log(sanitized);
    writeLog(sanitized);
}

// ── 路径解析 ──

function resolveNativeRoot(): string {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'native');
    }
    const candidates = [
        path.join(process.cwd(), 'native'),
        path.join(app.getAppPath(), 'native'),
        path.join(__dirname, '../../native'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[0];
}

// ── 主入口 ──

export async function loadDotNet() {
    log('=== 开始加载 .NET DLL ===');

    log('路径诊断', {
        __dirname,
        'process.cwd()': process.cwd(),
        'app.getAppPath()': app.getAppPath(),
        'app.isPackaged': app.isPackaged,
        'process.resourcesPath': process.resourcesPath,
    });

    // 1. 解析路径
    const nativePath = resolveNativeRoot();
    log('最终 nativePath', nativePath);

    const dllPath = path.join(nativePath, 'Bridge.dll');
    const configPath = path.join(nativePath, 'Bridge.runtimeconfig.json');
    const depsPath = path.join(nativePath, 'Bridge.deps.json');

    for (const f of [dllPath, configPath, depsPath]) {
        if (!fs.existsSync(f)) throw new Error(`Missing required file: ${f}`);
        log(`✅ 文件存在: ${f}`);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    log('runtimeconfig.json 解析成功', config);

    // 2. 环境变量
    process.env.DOTNET_ROOT = process.env.DOTNET_ROOT || 'C:\\Program Files\\dotnet';
    log('DOTNET_ROOT', process.env.DOTNET_ROOT);

    // 3. 导入 node-api-dotnet（asar:false 后 dev 和打包路径完全一致）
    log('正在导入 node-api-dotnet...');
    const dotnetModule = await import('node-api-dotnet/net10.0');
    const dotnet = dotnetModule.default || dotnetModule;
    log('node-api-dotnet 导入成功');

    // 4. 切换工作目录到 native → hostfxr 能找到 Bridge 的配置文件
    const originalCwd = process.cwd();
    process.chdir(nativePath);
    log('切换工作目录到', nativePath);

    try {
        log('尝试 dotnet.require...');
        const lib = dotnet.require(dllPath);
        log('dotnet.require 成功，导出:', Object.keys(lib));

        if (lib.NativeBridge) {
            const methods = Object.keys(lib.NativeBridge);
            log('NativeBridge 方法:', methods);
        } else {
            log('⚠️ NativeBridge 未找到');
        }

        return lib;
    } catch (err: unknown) {
        log('❌ 加载失败', (err as Error).message);
        log('错误堆栈', (err as Error).stack);
        throw err;
    } finally {
        process.chdir(originalCwd);
        log('恢复工作目录到', originalCwd);
        log('=== 加载过程结束 ===\n');
    }
}