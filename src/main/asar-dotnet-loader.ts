// src/main/dotnet-loader.ts
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import { pathToFileURL } from 'url';

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
    console.log(entry);
    writeLog(entry);
}

// ── 路径解析 ──

function resolveNativeRoot(): string {
    if (app.isPackaged) {
        const fromResources = path.join(process.resourcesPath, 'native');
        if (fs.existsSync(fromResources)) return fromResources;

        const fromExe = path.join(path.dirname(app.getPath('exe')), 'resources', 'native');
        return fromExe;
    }

    const candidates = [
        path.join(process.cwd(), 'native'),
        path.join(app.getAppPath(), 'native'),
        path.join(__dirname, '../../native'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[0]; // fallback，让后续文件检查报清晰错误
}

function resolveNodeApiDotnetPath(): string {
    if (app.isPackaged) {
        const fullPath = path.join(
            process.resourcesPath,
            'node-api-dotnet',
            'net10.0.js'
        );
        return pathToFileURL(fullPath).href;
    }
    return pathToFileURL(require.resolve('node-api-dotnet/net10.0')).href;
}

// ── 验证 ──

function validateRequiredFiles(nativePath: string) {
    const files = [
        path.join(nativePath, 'Bridge.dll'),
        path.join(nativePath, 'Bridge.runtimeconfig.json'),
        path.join(nativePath, 'Bridge.deps.json'),
    ];
    for (const f of files) {
        if (!fs.existsSync(f)) {
            throw new Error(`Missing required file: ${f}`);
        }
        log(`✅ 文件存在: ${f}`);
    }
    return files; // [dllPath, configPath, depsPath]
}

function parseRuntimeConfig(configPath: string) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    log('runtimeconfig.json 解析成功', config);
    if (config.runtimeOptions?.includedFrameworks) {
        log('⚠️ 检测到 includedFrameworks (AOT 格式)，建议改为 framework 格式');
    }
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

    const [dllPath, configPath] = validateRequiredFiles(nativePath);
    parseRuntimeConfig(configPath);

    // 2. 环境变量
    process.env.NODE_API_TRACE_HOST = '1';
    process.env.NODE_API_DEBUG_RUNTIME = '1';
    process.env.NODE_DEBUG = 'napi';
    process.env.DOTNET_ROOT = process.env.DOTNET_ROOT || 'C:\\Program Files\\dotnet';
    log('DOTNET_ROOT', process.env.DOTNET_ROOT);

    // 3. 导入 node-api-dotnet（必须在 chdir 之前）
    //    打包环境下必须从 asar 外的真实文件系统加载，
    //    否则 hostfxr 原生代码无法读取 .runtimeconfig.json
    log('正在导入 node-api-dotnet...');
    const dotnetModuleUrl = resolveNodeApiDotnetPath();
    const dotnetModule = await import(dotnetModuleUrl);
    const dotnet = dotnetModule.default || dotnetModule;
    log('node-api-dotnet 导入成功');

    // 4. 切换工作目录到 native → hostfxr 能找到 Bridge 的配置文件
    const originalCwd = process.cwd();
    log('原始工作目录', originalCwd);
    process.chdir(nativePath);
    log('切换工作目录到', nativePath);

    try {
        // 5. 加载 Bridge.dll
        log('尝试 dotnet.require...');
        const lib = dotnet.require(dllPath);
        log('dotnet.require 成功，导出:', Object.keys(lib));

        if (lib.NativeBridge) {
            const methods = Object.keys(lib.NativeBridge);
            log('NativeBridge 方法:', methods);
            if (methods.length === 0) {
                log('⚠️ NativeBridge 没有方法，请检查 Generator 是否运行');
            }
            if (methods.includes('sayHello')) {
                try {
                    const result = lib.NativeBridge.sayHello('Test');
                    log('✅ sayHello 调用成功:', result);
                } catch (e: unknown) {
                    log('❌ sayHello 调用失败', (e as Error).message);
                }
            }
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