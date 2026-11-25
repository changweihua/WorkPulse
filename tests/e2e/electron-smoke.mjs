/**
 * Electron GUI 冒烟验证（真实窗口，不依赖手工点击）。
 *
 * 运行：npm run test:e2e（会先构建最新产物）
 * 隔离：WORKPULSE_E2E=1 + 临时 userData；跳过单实例锁、全局快捷键、托盘、
 *       协议注册与更新检查，绝不污染用户机器上的真实数据。
 * 产物：test-results/ 下的截图，失败时保留现场便于排查。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright-core');
const electronExecutable = require('electron');

// resolve 去掉尾部反斜杠：Windows 下 Playwright 用 shell 拼接参数，
// 尾部 `\` 会把结尾引号转义成字面量，导致 Electron 拿到错误的应用路径。
const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const appPath = projectRoot.replace(/\\/g, '/');
const mainEntry = join(projectRoot, 'out', 'main', 'index.js');
const resultsDir = join(projectRoot, 'test-results');

if (!existsSync(mainEntry)) {
  console.error('✘ 缺少构建产物 out/main/index.js，请先执行 npm run build');
  process.exit(1);
}
if (!existsSync(electronExecutable)) {
  console.error(`✘ Electron 可执行文件不存在：${electronExecutable}`);
  process.exit(1);
}

mkdirSync(resultsDir, { recursive: true });
const userDataDir = mkdtempSync(join(tmpdir(), 'workpulse-e2e-'));
let electronApp;

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✔ ${message}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`超时 ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** 截图是辅助产物，透明窗口 / DWM 材质在某些机器上会卡住，不能让它拖垮主检查 */
async function tryScreenshot(page, file) {
  try {
    await page.screenshot({ path: join(resultsDir, file), timeout: 8_000, animations: 'disabled' });
    console.log(`✔ 截图已保存：${file}`);
  } catch (error) {
    console.log(`⚠ 跳过截图 ${file}：${String(error).split('\n')[0]}`);
  }
}

/** 找到主窗口页面（启动屏先创建，不能直接用 firstWindow） */
async function findMainPage(app) {
  const context = app.context();
  for (let i = 0; i < 80; i++) {
    const page = context.pages().find((p) => /index\.html(\?.*)?$/.test(p.url()));
    if (page) return page;
    await wait(500);
  }
  const urls = context.pages().map((p) => p.url());
  throw new Error(`未找到主窗口页面；当前窗口：${urls.join(', ') || '(无)'}`);
}

// 工作台等 Electron 宿主会把 ELECTRON_RUN_AS_NODE / NODE_OPTIONS 注入子进程，
// 这会让 Electron 退化成 Node CLI 并拒绝 --remote-debugging-port。必须剔除。
const childEnv = {
  ...process.env,
  WORKPULSE_E2E: '1',
  WORKPULSE_E2E_USER_DATA: userDataDir,
  NODE_ENV: 'production',
};
delete childEnv.ELECTRON_RUN_AS_NODE;
delete childEnv.NODE_OPTIONS;

try {
  electronApp = await _electron.launch({
    executablePath: electronExecutable,
    args: [appPath],
    cwd: projectRoot,
    env: childEnv,
    timeout: 60_000,
  });

  const actualUserData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  check(
    resolve(actualUserData) === resolve(userDataDir),
    `userData 已隔离到临时目录（${actualUserData}）`,
  );

  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.getURL().includes('index.html')) {
        win.show();
        win.focus();
      }
    }
  });
  const page = await findMainPage(electronApp);
  await page.bringToFront();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, null, {
    timeout: 40_000,
  });
  check(true, '主窗口 React 根节点已渲染');

  const hasViewTransition = await page.evaluate(
    () => typeof document.startViewTransition === 'function',
  );
  check(hasViewTransition, '当前 Chromium 原生支持 View Transition API');

  await tryScreenshot(page, 'e2e-main.png');

  // 进入设置页并验证「从点击位置扩散」的 reveal 路径确实被触发
  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await page.waitForSelector('[data-testid="theme-dark"]', { timeout: 40_000 });
  await page.evaluate(() => {
    window.__e2eReveal = { seen: false, background: '' };
    const root = document.documentElement;
    new MutationObserver(() => {
      if (root.classList.contains('theme-reveal')) {
        window.__e2eReveal.seen = true;
        window.__e2eReveal.background = root.style.background;
      }
    }).observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
  });

  await page.locator('[data-testid="theme-dark"]').click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'), null, {
    timeout: 10_000,
  });
  const reveal = await page.evaluate(() => window.__e2eReveal);
  check(reveal.seen, '点击深色主题触发了 theme-reveal 扩散路径');
  check(Boolean(reveal.background), '扩散期间新快照补了目标主题底色');
  await tryScreenshot(page, 'e2e-settings-dark.png');

  // reduced-motion 下应直接切换，不走 View Transition
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    window.__e2eReveal = { seen: false, background: '' };
  });
  await page.locator('[data-testid="theme-light"]').click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'), null, {
    timeout: 10_000,
  });
  const reduced = await page.evaluate(() => window.__e2eReveal);
  check(!reduced.seen, '减少动态偏好下不再播放扩散动画');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // 命令面板快捷键 → 输入框聚焦 → Esc 关闭
  await page.keyboard.press('Control+k');
  await page.waitForSelector('[data-testid="command-palette-input"]', { timeout: 10_000 });
  check(true, 'Ctrl/⌘ + K 打开命令面板');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="command-palette-input"]', {
    state: 'detached',
    timeout: 10_000,
  });
  check(true, 'Esc 关闭命令面板');

  console.log(`\n全部 GUI 冒烟检查通过，截图已写入 ${resultsDir}`);
} catch (error) {
  console.error('\n✘ GUI 冒烟检查失败：', error);
  // 失败时保留临时 userData 并输出主进程日志尾部，便于自行排查
  try {
    const logsDir = join(userDataDir, 'logs');
    for (const file of readdirSync(logsDir)) {
      const text = readFileSync(join(logsDir, file), 'utf8')
        .trim()
        .split('\n')
        .slice(-40)
        .join('\n');
      console.error(`\n--- ${file} (末尾 40 行) ---\n${text}`);
    }
    console.error(`\n临时 userData 已保留：${userDataDir}`);
  } catch {
    console.error(`\n未能读取主进程日志，临时 userData：${userDataDir}`);
  }
  process.exitCode = 1;
} finally {
  if (electronApp) {
    let proc;
    try {
      proc = electronApp.process?.();
      await withTimeout(electronApp.close(), 10_000);
    } catch {
      // 应用可能已经自行退出
    }
    if (proc && !proc.killed && proc.exitCode === null) proc.kill();
  }
  // 成功才清掉临时 userData；失败时保留现场（见 catch 输出的路径）
  if (!process.exitCode) rmSync(userDataDir, { recursive: true, force: true });
}
