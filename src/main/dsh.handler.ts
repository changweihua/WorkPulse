/**
 * dsh.handler.ts
 * 
 * 功能：暴露 DSH 管理命令给渲染进程，通过 IPC 通信。
 * 命令：
 *   - dsh:getStatus  - 获取状态和端口
 *   - dsh:start      - 启动 DSH，可传入 apiKey（方式一）
 *   - dsh:stop       - 停止 DSH
 *   - dsh:checkHealth - 健康检查
 */

import { ipcMain } from 'electron';
import { dshManager } from './dsh-manager';
import log from 'electron-log/main';

// 获取状态
ipcMain.handle('dsh:getStatus', () => {
    return {
        status: dshManager.getStatus(),
        port: dshManager.getPort(),
    };
});

/**
 * 启动 DSH
 * 参数：可选的 apiKey (string)
 * 如果不传，则使用方式三（用户在 UI 中配置）
 * 如果传入，则使用方式一（通过环境变量注入）
 */
ipcMain.handle('dsh:start', async (event, apiKey?: string) => {
    const logger = log.scope('DSH-IPC');
    logger.info('收到启动请求', { hasKey: !!apiKey });
    await dshManager.start(apiKey);
    return {
        success: true,
        port: dshManager.getPort(),
        // 可选：告知前端使用了哪种方式
        mode: apiKey ? 'way1' : 'way3',
    };
});

// 停止 DSH
ipcMain.handle('dsh:stop', () => {
    dshManager.stop();
    return { success: true };
});

// 健康检查
ipcMain.handle('dsh:checkHealth', async () => {
    const healthy = await dshManager.checkHealth();
    return { healthy };
});