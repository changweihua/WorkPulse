/**
 * dsh-manager.ts
 *
 * DSH process manager (based on DeepSeek official desktop app design).
 *
 * Features:
 *   - Start DSH Web Host (random or specified port)
 *   - Strict readiness parsing: "dsh web: http://127.0.0.1:<port>"
 *   - Optional API key injection (way-1) or leave empty (way-3)
 *   - Timeout protection, graceful shutdown
 *   - Crash detection + auto-restart with exponential backoff
 *   - Status change callback for main→renderer push events
 */

import { spawn, type ChildProcessByStdio } from 'child_process';
import { Readable } from 'stream';
import log from 'electron-log/main';

// ---------- constants ----------
const READINESS_PREFIX = 'dsh web: ';
const DEFAULT_READINESS_TIMEOUT_MS = 90_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;
const MAX_STARTUP_OUTPUT_CHARS = 32_768;
const MAX_AUTO_RESTARTS = 3;
const AUTO_RESTART_DELAYS_MS = [2_000, 5_000, 10_000];

// ---------- types ----------
export type DSHStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopped';
export type DSHStatusListener = (status: DSHStatus, detail?: Record<string, unknown>) => void;

// ---------- readiness parser (reference: official code) ----------
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

// ---------- child process adapter ----------
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

// ---------- DSH Manager ----------
export class DSHManager {
    private child: any = null;
    private status: DSHStatus = 'idle';
    private port: number | null = null;
    private startPromise: Promise<string> | null = null;
    private shutdownPromise: Promise<void> | null = null;
    private exitedPromise: Promise<void> | null = null;
    private outputBuffer = '';
    private shuttingDown = false;
    private autoRestartCount = 0;
    private statusListeners: DSHStatusListener[] = [];

    getStatus() { return this.status; }
    getPort() { return this.port; }

    /**
     * Register a status change listener (for main→renderer push events).
     */
    onStatusChange(listener: DSHStatusListener): () => void {
        this.statusListeners.push(listener);
        return () => {
            this.statusListeners = this.statusListeners.filter(l => l !== listener);
        };
    }

    private emitStatusChange(detail?: Record<string, unknown>) {
        for (const listener of this.statusListeners) {
            try { listener(this.status, detail); } catch { /* swallow */ }
        }
    }

    private setStatus(s: DSHStatus, detail?: Record<string, unknown>) {
        if (this.status === s) return;
        this.status = s;
        this.emitStatusChange(detail);
    }

    /**
     * Start DSH service with auto-restart on crash.
     */
    async start(apiKey?: string, port = 0): Promise<string> {
        if (this.startPromise) return this.startPromise;
        if (this.shutdownPromise) throw new Error('Cannot start after shutdown');

        this.autoRestartCount = 0;
        this.startPromise = this.doStart(apiKey, port);
        return this.startPromise;
    }

    /**
     * Internal start implementation (may be called again for auto-restart).
     */
    private doStart(apiKey?: string, port = 0): Promise<string> {
        return new Promise<string>((resolve, reject) => {
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

            // Environment variables
            const env = { ...process.env };
            if (apiKey) {
                env.DEEPSEEK_API_KEY = apiKey;
                log.info('DSH start: using API key (way-1)');
            } else {
                log.info('DSH start: no API key, using way-3 (user configures in UI)');
            }

            const args = ['@deepseek-ai/dsh', 'web', '--host', '127.0.0.1', '--port', String(port), '--no-open'];
            const child = spawn('npx', args, {
                cwd: process.cwd(),
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true,
                windowsHide: true,
            });
            this.child = adaptChildProcess(child);
            this.setStatus('starting');
            log.info(`DSH process started, PID: ${this.child.pid}`);

            // Exit handler – detect crash after readiness
            const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
                this.exitedPromise = Promise.resolve();

                if (settled) {
                    // Process exited after readiness → crash or stop
                    if (!this.shuttingDown && this.status === 'running') {
                        log.warn('DSH process exited unexpectedly after running', { code, signal });
                        this.handleCrash(code, signal);
                    }
                    return;
                }

                // Exited before readiness
                fail(new Error(`DSH exited before readiness (code ${code}, signal ${signal})`));
            };
            cleanups.push(this.child.onExit(onExit));

            // Error handler
            this.child.onError((err: Error) => {
                fail(new Error(`DSH spawn error: ${err.message}`));
            });

            // Stdout – readiness detection
            cleanups.push(this.child.stdout.onData((chunk: string) => {
                appendOutput(chunk);
                try {
                    const url = parser.push(chunk);
                    if (url && !settled) {
                        settled = true;
                        cleanup();
                        this.setStatus('running');
                        this.port = new URL(url).port ? Number(new URL(url).port) : 0;
                        log.info(`DSH service ready: ${url}`);
                        resolve(url);
                    }
                } catch (err) {
                    fail(err);
                    this.child.kill('SIGTERM');
                }
            }));

            // Stderr – log only, not used for readiness
            cleanups.push(this.child.stderr.onData((chunk: string) => {
                appendOutput(chunk);
            }));

            // Readiness timeout
            const timeout = setTimeout(() => {
                fail(new Error(`DSH readiness timed out after ${DEFAULT_READINESS_TIMEOUT_MS}ms`));
                this.child.kill('SIGTERM');
            }, DEFAULT_READINESS_TIMEOUT_MS);

            this.startPromise?.finally(() => cleanup());
        });
    }

    /**
     * Handle crash after the service was running. Auto-restart with backoff.
     */
    private handleCrash(code: number | null, signal: NodeJS.Signals | null) {
        if (this.shuttingDown) return;

        if (this.autoRestartCount < MAX_AUTO_RESTARTS) {
            const delay = AUTO_RESTART_DELAYS_MS[this.autoRestartCount] ?? 10_000;
            this.autoRestartCount++;
            log.info(`DSH auto-restarting (attempt ${this.autoRestartCount}/${MAX_AUTO_RESTARTS}) in ${delay}ms`);
            this.setStatus('error', { reason: 'crash', autoRestarting: true, attempt: this.autoRestartCount, delay });

            setTimeout(() => {
                if (this.shuttingDown || this.status === 'stopped') return;
                this.startPromise = null;
                this.start().catch((err) => {
                    log.error('DSH auto-restart failed', err);
                });
            }, delay);
        } else {
            log.error('DSH crashed, max auto-restart attempts reached', { code, signal });
            this.setStatus('error', { reason: 'crash', code, signal, autoRestarting: false });
            this.port = null;
            this.child = null;
            this.startPromise = null;
        }
    }

    /**
     * Stop DSH service.
     */
    async stop(): Promise<void> {
        if (this.shutdownPromise) return this.shutdownPromise;
        if (!this.child) {
            this.setStatus('stopped');
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
                    log.warn('DSH did not exit in time, forcing SIGKILL');
                    this.child.kill('SIGKILL');
                    return closed;
                }
                return;
            }).finally(() => {
                this.setStatus('stopped');
                this.port = null;
                this.child = null;
                this.startPromise = null;
                this.shutdownPromise = null;
                this.autoRestartCount = 0;
                log.info('DSH service stopped');
                resolve();
            });
        });
        return this.shutdownPromise;
    }

    /**
     * Health check.
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

// Export singleton
export const dshManager = new DSHManager();
