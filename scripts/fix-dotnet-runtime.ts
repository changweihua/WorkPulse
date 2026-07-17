import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

// ── 类型 ──

interface RuntimeConfig {
    runtimeOptions?: {
        tfm?: string;
        framework?: {
            name?: string;
            version?: string;
        };
        configProperties?: Record<string, unknown>;
    };
}

// ── 工具函数 ──

function compareVersion(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (pa[i] > pb[i]) return 1;
        if (pa[i] < pb[i]) return -1;
    }
    return 0;
}

/** 解析 dotnet --list-runtimes → Map<主版本, 最高完整版本> */
function getAllDotnetVersions(): Map<number, string> {
    const raw = execSync('dotnet --list-runtimes', { encoding: 'utf-8' });
    const map = new Map<number, string>();

    for (const line of raw.split('\n')) {
        const m = line.match(/^Microsoft\.NETCore\.App\s+(\d+)\.(\d+)\.(\d+)/);
        if (!m) continue;

        const major = parseInt(m[1], 10);
        const full = `${m[1]}.${m[2]}.${m[3]}`;
        const existing = map.get(major);

        if (!existing || compareVersion(full, existing) > 0) {
            map.set(major, full);
        }
    }

    if (map.size === 0) {
        throw new Error('未找到 Microsoft.NETCore.App 运行时，请安装 .NET 运行时');
    }

    return map;
}

/** 从 runtimeconfig.json 读取 tfm 字段，提取主版本号 */
function getTfmMajor(filePath: string): number {
    const raw = readFileSync(filePath, 'utf-8');
    const config: RuntimeConfig = JSON.parse(raw);
    const tfm = config.runtimeOptions?.tfm;

    if (!tfm) {
        throw new Error(`${filePath} 缺少 runtimeOptions.tfm 字段`);
    }

    const m = tfm.match(/^net(\d+)\.\d+$/);
    if (!m) {
        throw new Error(`${filePath} 无法解析 tfm: ${tfm}`);
    }

    return parseInt(m[1], 10);
}

/** 递归查找目录下所有 *.runtimeconfig.json */
function findRuntimeConfigsRecursive(dir: string): string[] {
    const result: string[] = [];

    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);

        if (stat.isDirectory()) {
            result.push(...findRuntimeConfigsRecursive(full));
        } else if (entry.endsWith('.runtimeconfig.json')) {
            result.push(full);
        }
    }

    return result;
}

/** 修复单个 runtimeconfig.json：替换 framework.version */
function fixRuntimeConfig(filePath: string, targetVersion: string): boolean {
    const raw = readFileSync(filePath, 'utf-8');
    const config: RuntimeConfig = JSON.parse(raw);

    const framework = config.runtimeOptions?.framework;
    if (!framework?.version) return false;

    const oldVersion = framework.version;
    if (oldVersion === targetVersion) return false;

    framework.version = targetVersion;
    writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log(`✅ ${filePath}: ${oldVersion} → ${targetVersion}`);
    return true;
}

// ── 主流程 ──

function main(): void {
    const root = resolve(process.cwd());
    console.log(`🔍 项目根目录: ${root}`);

    // 1. 收集系统运行时版本
    const versionMap = getAllDotnetVersions();
    console.log('📦 系统 .NET 运行时 (主版本 → 最高修订版):');
    for (const [major, ver] of versionMap) {
        console.log(`   ${major}.x → ${ver}`);
    }

    // 2. 扫描 node-api-dotnet 下的 runtimeconfig.json
    const searchRoot = join(root, 'node_modules', 'node-api-dotnet');
    const configs = findRuntimeConfigsRecursive(searchRoot);

    if (configs.length === 0) {
        console.log('⚠️  未找到 runtimeconfig.json，无需处理');
        return;
    }

    // 3. 逐个修复
    let fixed = 0;
    let skipped = 0;

    for (const file of configs) {
        try {
            const major = getTfmMajor(file);
            const targetVersion = versionMap.get(major);

            if (!targetVersion) {
                console.log(
                    `⏭️  跳过 ${file}: 系统未安装 .NET ${major} 运行时（tfm 要求 net${major}.x）`
                );
                skipped++;
                continue;
            }

            if (fixRuntimeConfig(file, targetVersion)) {
                fixed++;
            } else {
                console.log(`✔️  无需修改 ${file} (已是 ${targetVersion})`);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`⚠️  ${file}: ${msg}`);
            skipped++;
        }
    }

    console.log(`\n🎉 已修复 ${fixed}/${configs.length}，跳过 ${skipped}`);
}

main();