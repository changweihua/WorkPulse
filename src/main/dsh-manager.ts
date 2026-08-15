/**
 * dsh-manager.ts
 * 
 * 基于 DeepSeek 官方桌面应用的设计，使用更健壮的进程管理。
 * 功能：
 *   - 启动 DSH Web Host（监听随机端口或指定端口）
 *   - 严格解析就绪输出 "dsh web: http://127.0.0.1:<port>"
 *   - 支持传入 API Key（方式一）或留空（方式三）
 *   - 超时保护、优雅关闭
 *   - 并发启动/关闭控制
 */

import { spawn, type ChildProcessByStdio } from 'child_process';
import { Readable } from 'stream';
import log from 'electron-log/main';

// ---------- 常量 ----------
const READINESS_PREFIX = 'dsh web: ';
const DEFAULT_READINESS_TIMEOUT_MS = 90_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;
const MAX_STARTUP_OUTPUT_CHARS = 32_768;

// ---------- 类型 ----------
export type DSHStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopped';

// ---------- 就绪解析器（参考官方代码） ----------
export function createReadinessParser() {
    let pending = '';
    let readyUrl: string | undefined;

    const parseLine = (line: string): string | undefined => {
        if (!line.startsWith(READINESS_PREFIX)) return undefined;
        const token = line.slice(READINESS_PREFIX.length).split(/\s/u, 1)[0];
        if (!token) throw new Error(`DSH readiness line has no URL: ${line}`);
        let url: URL;
        try { url = new URL(token); } catch { throw new Error(`DSH readiness URL invalid: ${token}`); }
        const port = Number(url.port);
        if (url.protocol !== 'http:' ||
            (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') ||
            url.pathname !== '/' || url.search !== '' || url.hash !== '' ||
            !Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error(`DSH readiness URL must be loopback HTTP: ${token}`);
        }
        return url.origin;
    };

    return {
        push(chunk: string): string | undefined {
            pending += chunk;
            for (; ;) {
                const newline = pending.indexOf('\n');
                if (newline === -1) return readyUrl;
                const line = pending.slice(0, newline);
                pending = pending.slice(newline + 1);
                const parsed = parseLine(line.replace(/\r$/, ''));
                if (parsed !== undefined) {
                    if (readyUrl !== undefined && parsed !== readyUrl) {
                        throw new Error(`DSH emitted conflicting URLs: ${readyUrl} vs ${parsed}`);
                    }
                    readyUrl = parsed;
                    return readyUrl;
                }
            }
        },
        finalize(): string {
            if (pending !== '') parseLine(pending);
            if (!readyUrl) throw new Error('DSH exited before emitting readiness URL');
            return readyUrl;
        }
    };
}

// ---------- 适配子进程 ----------
function adaptChildProcess(child: ChildProcessByStdio<null, Readable, Readable>) {
    return {
        pid: child.pid,
        stdout: {
            onData: (listener: (chunk: string) => void) => {
                const accept = (data: string | Buffer) => listener(data.toString());
                child.stdout.on('data', accept);
                return () => child.stdout.off('data', accept);
            }
        },
        stderr: {
            onData: (listener: (chunk: string) => void) => {
                const accept = (data: string | Buffer) => listener(data.toString());
                child.stderr.on('data', accept);
                return () => child.stderr.off('data', accept);
            }
        },
        onExit: (listener: (code: number | null, signal: NodeJS.Signals | null) => void) => {
            child.on('exit', listener);
            return () => child.off('exit', listener);
        },
        onError: (listener: (error: Error) => void) => {
            child.on('error', listener);
            return () => child.off('error', listener);
        },
        kill: (signal: 'SIGTERM' | 'SIGKILL') => child.kill(signal)
    };
}

// ---------- DSH 管理器 ----------
export class DSHManager {
    private child: any = null;
    private status: DSHStatus = 'idle';
    private port: number | null = null;
    private startPromise: Promise<string> | null = null;
    private shutdownPromise: Promise<void> | null = null;
    private exitedPromise: Promise<void> | null = null;
    private outputBuffer = '';
    private shuttingDown = false;

    getStatus() { return this.status; }
    getPort() { return this.port; }

    /**
     * 启动 DSH 服务
     * @param apiKey - 可选，传入则设置环境变量 DEEPSEEK_API_KEY
     * @param port - 可选，指定端口，默认 0（随机分配）
     * @returns Promise<string> 返回就绪 URL
     */
    async start(apiKey?: string, port = 0): Promise<string> {
        if (this.startPromise) return this.startPromise;
        if (this.shutdownPromise) throw new Error('Cannot start after shutdown');

        this.startPromise = new Promise<string>((resolve, reject) => {
            const parser = createReadinessParser();
            let settled = false;
            const cleanups: Array<() => void> = [];

            const appendOutput = (chunk: string) => {
                this.outputBuffer = (this.outputBuffer + chunk).slice(-MAX_STARTUP_OUTPUT_CHARS);
                log.debug(`DSH output: ${chunk}`);
            };

            const cleanup = () => {
                clearTimeout(timeout);
                for (const dispose of cleanups) dispose();
            };

            const fail = (error: unknown) => {
                if (settled) return;
                settled = true;
                cleanup();
                const diag = this.outputBuffer ? `\nHost output:\n${this.outputBuffer}` : '';
                reject(new Error(`${error instanceof Error ? error.message : String(error)}${diag}`));
            };

            // 准备环境变量
            const env = { ...process.env };
            if (apiKey) {
                env.DEEPSEEK_API_KEY = apiKey;
                log.info('DSH 启动：使用传入的 API Key（方式一）');
            } else {
                log.info('DSH 启动：未传入 API Key，将使用方式三（用户在 UI 中配置）');
            }
            // 参考官方代码，在 Electron 中需要设置 ELECTRON_RUN_AS_NODE=1
            // 这里我们使用 npx，如果直接使用 node 执行 CLI 入口则需设置
            // 为了简单，我们继续使用 npx，但确保环境变量传递
            const args = ['@deepseek-ai/dsh', 'web', '--host', '127.0.0.1', '--port', String(port)];
            const child = spawn('npx', args, {
                cwd: process.cwd(),
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true,
                windowsHide: true,
            });
            this.child = adaptChildProcess(child);
            this.status = 'starting';
            log.info(`DSH 进程启动，PID: ${this.child.pid}`);

            // 退出处理
            const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
                if (settled) return;
                fail(new Error(`DSH exited before readiness (code ${code}, signal ${signal})`));
                this.exitedPromise = Promise.resolve();
            };
            cleanups.push(this.child.onExit(onExit));

            // 错误处理
            this.child.onError((err: Error) => {
                fail(new Error(`DSH spawn error: ${err.message}`));
            });

            // 处理 stdout
            cleanups.push(this.child.stdout.onData((chunk: string) => {
                appendOutput(chunk);
                try {
                    const url = parser.push(chunk);
                    if (url && !settled) {
                        settled = true;
                        cleanup();
                        this.status = 'running';
                        this.port = new URL(url).port ? Number(new URL(url).port) : 0;
                        log.info(`DSH 服务就绪: ${url}`);
                        resolve(url);
                    }
                } catch (err) {
                    fail(err);
                    this.child.kill('SIGTERM');
                }
            }));

            // stderr 只记录，不用于就绪检测
            cleanups.push(this.child.stderr.onData((chunk: string) => {
                appendOutput(chunk);
            }));

            // 超时
            const timeout = setTimeout(() => {
                fail(new Error(`DSH readiness timed out after ${DEFAULT_READINESS_TIMEOUT_MS}ms`));
                this.child.kill('SIGTERM');
            }, DEFAULT_READINESS_TIMEOUT_MS);

            // 保存清理函数
            this.startPromise?.finally(() => {
                cleanup();
            });
        });

        return this.startPromise;
    }

    /**
     * 停止 DSH 服务
     */
    async stop(): Promise<void> {
        if (this.shutdownPromise) return this.shutdownPromise;
        if (!this.child) {
            this.status = 'stopped';
            return Promise.resolve();
        }

        this.shutdownPromise = new Promise<void>((resolve) => {
            this.shuttingDown = true;
            this.child.kill('SIGTERM');
            const closed = this.exitedPromise || Promise.resolve();
            let timer: NodeJS.Timeout | undefined;
            const race = Promise.race([
                closed.then(() => 'closed' as const),
                new Promise<'timeout'>((res) => {
                    timer = setTimeout(() => res('timeout'), DEFAULT_SHUTDOWN_TIMEOUT_MS);
                })
            ]);
            race.then((result) => {
                if (timer) clearTimeout(timer);
                if (result === 'timeout') {
                    log.warn('DSH 未在超时内关闭，强制 SIGKILL');
                    this.child.kill('SIGKILL');
                    return closed;
                }
                return;
            }).finally(() => {
                this.status = 'stopped';
                this.port = null;
                this.child = null;
                this.startPromise = null;
                this.shutdownPromise = null;
                log.info('DSH 服务已停止');
                resolve();
            });
        });
        return this.shutdownPromise;
    }

    /**
     * 健康检查
     */
    async checkHealth(): Promise<boolean> {
        if (!this.port) return false;
        try {
            const res = await fetch(`http://127.0.0.1:${this.port}/health`, {
                signal: AbortSignal.timeout(2000)
            });
            return res.ok;
        } catch {
            return false;
        }
    }
}

// 导出单例
export const dshManager = new DSHManager();