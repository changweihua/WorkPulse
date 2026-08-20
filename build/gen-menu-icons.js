const sharp = require('sharp');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../resources');

// Menu item icons - simple, recognizable at 16px
const icons = {
  // New Log: document with plus
  'menu-new-log': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="1" width="9" height="12" rx="1.5" stroke="#374151" stroke-width="1.2" fill="none"/>
    <line x1="4" y1="4" x2="9" y2="4" stroke="#9CA3AF" stroke-width="1"/>
    <line x1="4" y1="6.5" x2="9" y2="6.5" stroke="#9CA3AF" stroke-width="1"/>
    <line x1="4" y1="9" x2="7" y2="9" stroke="#9CA3AF" stroke-width="1"/>
    <circle cx="11.5" cy="11.5" r="3.5" fill="white" stroke="#374151" stroke-width="1.2"/>
    <line x1="11.5" y1="9.5" x2="11.5" y2="13.5" stroke="#374151" stroke-width="1.2"/>
    <line x1="9.5" y1="11.5" x2="13.5" y2="11.5" stroke="#374151" stroke-width="1.2"/>
  </svg>`,

  // New Task: checkbox with plus
  'menu-new-task': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="1.5" width="8" height="8" rx="1.5" stroke="#374151" stroke-width="1.2" fill="none"/>
    <polyline points="3,5.5 4.5,7 7,4" stroke="#374151" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3.5" fill="white" stroke="#374151" stroke-width="1.2"/>
    <line x1="12" y1="10" x2="12" y2="14" stroke="#374151" stroke-width="1.2"/>
    <line x1="10" y1="12" x2="14" y2="12" stroke="#374151" stroke-width="1.2"/>
  </svg>`,

  // Show App: window/monitor icon
  'menu-show': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="2" width="14" height="10" rx="1.5" stroke="#374151" stroke-width="1.2" fill="none"/>
    <line x1="1" y1="4.5" x2="15" y2="4.5" stroke="#374151" stroke-width="1"/>
    <circle cx="3" cy="3.2" r="0.6" fill="#EF4444"/>
    <circle cx="5" cy="3.2" r="0.6" fill="#F59E0B"/>
    <circle cx="7" cy="3.2" r="0.6" fill="#22C55E"/>
    <line x1="6" y1="14" x2="10" y2="14" stroke="#374151" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="8" y1="12" x2="8" y2="14" stroke="#374151" stroke-width="1.2"/>
  </svg>`,

  // Quit: power icon
  'menu-quit': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 2v5" stroke="#374151" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M4.5 4.5C3.5 5.8 3 7.3 3 9c0 3.3 2.7 6 5 6s5-2.7 5-6c0-1.7-.5-3.2-1.5-4.5" stroke="#374151" stroke-width="1.3" stroke-linecap="round" fill="none"/>
  </svg>`,
};

async function generateIcons() {
  for (const [name, svg] of Object.entries(icons)) {
    // Generate 16px PNG
    await sharp(Buffer.from(svg))
      .resize(16, 16)
      .png()
      .toFile(path.join(OUTPUT_DIR, `${name}.png`));

    // Generate 32px PNG (for retina)
    await sharp(Buffer.from(svg))
      .resize(32, 32)
      .png()
      .toFile(path.join(OUTPUT_DIR, `${name}@2x.png`));

    console.log(`Generated: ${name}.png + ${name}@2x.png`);
  }
  console.log('Done!');
}

generateIcons().catch(console.error);
