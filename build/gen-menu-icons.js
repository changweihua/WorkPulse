const sharp = require('sharp');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../resources');

// 品牌色系（与 resources/icon.svg / BrandIcons.tsx 同源）：
// 灰紫结构色做主线条，青 + 玫红做点缀，保证 16px 原生菜单下清晰可辨。
const INK = '#7C7F95'; // 灰紫结构色（主图标机身色），比纯黑柔和、贴合品牌
const CYAN = '#11CBE5'; // 品牌青（主图标脉搏起点 / 日志徽标）
const CYAN_DEEP = '#0891b2'; // 深青（勾选勾，白底上对比更稳）
const ROSE = '#FA4659'; // 品牌玫红（主图标脉搏终点 / 任务徽标 / 退出）

// Menu item icons — 加粗线条（1.8px@16）、品牌色徽标，16px 可读性优先
const icons = {
  // New Log: document with brand-cyan plus badge
  'menu-new-log': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 2.5h6.5L12 5v4.5" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9.5 2.5V5H12" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="5" y1="7" x2="9" y2="7" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
    <line x1="5" y1="9.5" x2="7.5" y2="9.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
    <circle cx="11.5" cy="11.5" r="4" fill="${CYAN}"/>
    <line x1="11.5" y1="9.7" x2="11.5" y2="13.3" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="9.7" y1="11.5" x2="13.3" y2="11.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // New Task: checkbox with brand-cyan check + rose plus badge
  'menu-new-task': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="1.5" width="9" height="9" rx="2" stroke="${INK}" stroke-width="1.8"/>
    <polyline points="3.6,6 5.4,7.8 8.4,4.4" stroke="${CYAN_DEEP}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="11.5" cy="11.5" r="4" fill="${ROSE}"/>
    <line x1="11.5" y1="9.7" x2="11.5" y2="13.3" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="9.7" y1="11.5" x2="13.3" y2="11.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // Show App: brand monitor with pulse waveform（呼应新主图标，替代旧红黄绿灯窗口）
  'menu-show': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="2" width="14" height="9.5" rx="2" stroke="${INK}" stroke-width="1.6"/>
    <path d="M2.8 7 L4.5 7 L5.6 5.4 L6.7 8.6" stroke="${CYAN}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.7 8.6 L8.0 4.4 L9.3 8.8 L10.5 7 L13.2 7" stroke="${ROSE}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="8" y1="11.5" x2="8" y2="13.4" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="5.6" y1="13.6" x2="10.4" y2="13.6" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,

  // Quit: power icon in brand rose
  'menu-quit': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1.8v5.4" stroke="${ROSE}" stroke-width="2" stroke-linecap="round"/>
    <path d="M4.3 4.3C3.2 5.7 2.6 7.3 2.6 9a5.4 5.4 0 1 0 10.8 0c0-1.7-.6-3.3-1.7-4.7" stroke="${ROSE}" stroke-width="1.9" stroke-linecap="round" fill="none"/>
  </svg>`,
};

// 品牌 wordmark：新主图标（灰紫显示器 + 青红脉搏）+ WorkPulse 字标
const WORDMARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1408 768" width="1408" height="768">
  <defs>
    <linearGradient id="wp-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D0D1DC"/><stop offset="1" stop-color="#9B9CAF"/></linearGradient>
    <linearGradient id="wp-screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C4F6E"/><stop offset="1" stop-color="#2C2F53"/></linearGradient>
    <linearGradient id="wp-pulse" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#11CBE5"/><stop offset="0.55" stop-color="#91EDF8"/><stop offset="1" stop-color="#FA4659"/></linearGradient>
  </defs>
  <rect width="1408" height="768" fill="#FFFFFF"/>
  <rect x="96" y="144" width="480" height="480" rx="108" fill="#2C2F53"/>
  <g transform="translate(125,179) scale(0.42)">
    <rect x="456" y="666" width="96" height="150" rx="18" fill="#999AAC"/>
    <rect x="336" y="810" width="352" height="58" rx="29" fill="#7C7F95"/>
    <rect x="336" y="800" width="352" height="58" rx="29" fill="#999AAC"/>
    <rect x="104" y="126" width="832" height="556" rx="52" fill="#7C7F95"/>
    <rect x="88" y="110" width="832" height="556" rx="52" fill="url(#wp-body)"/>
    <rect x="140" y="162" width="728" height="452" rx="26" fill="url(#wp-screen)"/>
    <circle cx="300" cy="252" r="20" fill="#11CBE5"/><circle cx="293" cy="245" r="9" fill="#E9FFF5" opacity="0.92"/>
    <circle cx="392" cy="252" r="20" fill="#BCF4F5"/><circle cx="385" cy="245" r="9" fill="#E9FFF5" opacity="0.92"/>
    <circle cx="484" cy="252" r="20" fill="#FDB8BF"/><circle cx="477" cy="245" r="9" fill="#FEDEE1" opacity="0.92"/>
    <circle cx="576" cy="252" r="20" fill="#FA4659"/><circle cx="569" cy="245" r="9" fill="#FEDEE1" opacity="0.92"/>
    <path d="M196 470 L292 470 L316 446 L340 470 L388 470 L412 502 L448 352 L484 504 L512 470 L580 470 L608 434 L640 434 L668 470 L812 470" fill="none" stroke="#11CBE5" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" opacity="0.18"/>
    <path d="M196 470 L292 470 L316 446 L340 470 L388 470 L412 502 L448 352 L484 504 L512 470 L580 470 L608 434 L640 434 L668 470 L812 470" fill="none" stroke="url(#wp-pulse)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="200" y="540" width="480" height="16" rx="8" fill="#EAEAEE" opacity="0.22"/>
    <circle cx="504" cy="636" r="11" fill="#7C7F95"/>
  </g>
  <text x="640" y="392" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="112" font-weight="700" fill="#2C2F53">WorkPulse</text>
  <text x="646" y="462" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="44" fill="#11CBE5">Work log + AI reports</text>
</svg>`;

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

  // 品牌 wordmark（旧版「记事本+黄点」Logo 的替换）
  await sharp(Buffer.from(WORDMARK)).png().toFile(path.join(OUTPUT_DIR, 'wordmark.png'));
  console.log('Generated: wordmark.png');
  console.log('Done!');
}

generateIcons().catch(console.error);
