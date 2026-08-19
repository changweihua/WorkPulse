const sharp = require('sharp');
const path = require('path');

const resourcesDir = path.join(__dirname, '..', 'resources');

// Brand colors
const NAVY = '#1A1F36';
const CYAN = '#00D4FF';
const LIGHT_BLUE = '#7DD3FC';
const PINK = '#FCA5A5';
const RED = '#EF4444';

// ============================================================
// New tray icon: simplified monitor with 4 dots (clean at 16-32px)
// ============================================================
function genTrayIconSVG(size = 256) {
  const s = size / 256;
  return `<svg width="${size}" height="${size}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <!-- Monitor body -->
    <rect x="28" y="20" width="200" height="140" rx="16" fill="${NAVY}" />
    <!-- Screen -->
    <rect x="40" y="32" width="176" height="108" rx="8" fill="#141930" />
    <!-- Taskbar -->
    <rect x="48" y="110" width="160" height="22" rx="4" fill="#2A3050" />
    <!-- 4 colored dots -->
    <circle cx="80" cy="121" r="8" fill="${CYAN}" />
    <circle cx="112" cy="121" r="8" fill="${LIGHT_BLUE}" />
    <circle cx="144" cy="121" r="8" fill="${PINK}" />
    <circle cx="176" cy="121" r="8" fill="${RED}" />
    <!-- Stand -->
    <rect x="100" y="160" width="56" height="12" rx="3" fill="${NAVY}" />
    <rect x="80" y="172" width="96" height="10" rx="5" fill="${NAVY}" />
    <!-- Base -->
    <rect x="68" y="182" width="120" height="12" rx="6" fill="#3A4060" />
  </svg>`;
}

// ============================================================
// Generate tray-icon.png at multiple sizes
// ============================================================
async function genTrayIcons() {
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  
  for (const size of sizes) {
    const svg = genTrayIconSVG(size);
    const outFile = size === 256 
      ? path.join(resourcesDir, 'tray-icon.png')
      : path.join(resourcesDir, `tray-icon-${size}.png`);
    
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outFile);
    
    console.log(`tray-icon-${size}.png done`);
  }
  
  // Also generate @2x for macOS
  await sharp(Buffer.from(genTrayIconSVG(512)))
    .resize(512, 512)
    .png()
    .toFile(path.join(resourcesDir, 'tray-icon-macTemplate.png'));
  console.log('tray-icon-macTemplate.png done');
  
  await sharp(Buffer.from(genTrayIconSVG(1024)))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(resourcesDir, 'tray-icon-macTemplate@2x.png'));
  console.log('tray-icon-macTemplate@2x.png done');
}

(async () => {
  await genTrayIcons();
  console.log('All tray icons generated!');
})();
