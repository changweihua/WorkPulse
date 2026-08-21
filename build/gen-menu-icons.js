const sharp = require('sharp');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../resources');

// 品牌色系：高饱和度，Windows 原生菜单 16px 下清晰可辨
const INK = '#52525b';    // 主线条 zinc-600（比纯黑柔和，比原 #374151 醒目）
const BLUE = '#3b82f6';   // 新建日志
const CYAN = '#06b6d4';   // 新建任务
const EMERALD = '#10b981';// 完成勾
const ROSE = '#f43f5e';   // 退出

// Menu item icons — 加粗线条（1.8px@16）、彩色徽标，16px 可读性优先
const icons = {
  // New Log: document with blue plus badge
  'menu-new-log': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 2.5h6.5L12 5v4.5" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9.5 2.5V5H12" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="5" y1="7" x2="9" y2="7" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
    <line x1="5" y1="9.5" x2="7.5" y2="9.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
    <circle cx="11.5" cy="11.5" r="4" fill="${BLUE}"/>
    <line x1="11.5" y1="9.7" x2="11.5" y2="13.3" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="9.7" y1="11.5" x2="13.3" y2="11.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // New Task: checkbox with emerald check + cyan plus badge
  'menu-new-task': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="1.5" width="9" height="9" rx="2" stroke="${INK}" stroke-width="1.8"/>
    <polyline points="3.6,6 5.4,7.8 8.4,4.4" stroke="${EMERALD}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="11.5" cy="11.5" r="4" fill="${CYAN}"/>
    <line x1="11.5" y1="9.7" x2="11.5" y2="13.3" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="9.7" y1="11.5" x2="13.3" y2="11.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // Show App: window/monitor with traffic lights
  'menu-show': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="2" width="14" height="10" rx="2" stroke="${INK}" stroke-width="1.8"/>
    <line x1="1" y1="4.8" x2="15" y2="4.8" stroke="${INK}" stroke-width="1.4"/>
    <circle cx="3.1" cy="3.4" r="0.9" fill="#ef4444"/>
    <circle cx="5.3" cy="3.4" r="0.9" fill="#f59e0b"/>
    <circle cx="7.5" cy="3.4" r="0.9" fill="#22c55e"/>
    <line x1="5.5" y1="14.5" x2="10.5" y2="14.5" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="8" y1="12" x2="8" y2="14.2" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // Quit: power icon in rose
  'menu-quit': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1.8v5.4" stroke="${ROSE}" stroke-width="2" stroke-linecap="round"/>
    <path d="M4.3 4.3C3.2 5.7 2.6 7.3 2.6 9a5.4 5.4 0 1 0 10.8 0c0-1.7-.6-3.3-1.7-4.7" stroke="${ROSE}" stroke-width="1.9" stroke-linecap="round" fill="none"/>
  </svg>`,
};

async function generateIcons() {
  for (const [name, svg] of Object.entries(icons)) {
    // Generate 16px PNG
    await sharp(Buffer.from(svg))
      .resize(16, 16, { kernel: 'lanczos3' })
      .png()
      .toFile(path.join(OUTPUT_DIR, `${name}.png`));

    // Generate 32px PNG (for retina)
    await sharp(Buffer.from(svg))
      .resize(32, 32, { kernel: 'lanczos3' })
      .png()
      .toFile(path.join(OUTPUT_DIR, `${name}@2x.png`));

    console.log(`Generated: ${name}.png + ${name}@2x.png`);
  }
  console.log('Done!');
}

generateIcons().catch(console.error);
