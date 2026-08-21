const sharp = require('sharp');
const path = require('path');

const resourcesDir = path.join(__dirname, '..', 'resources');

// Bright, vibrant colors — visible at 16px on any taskbar
const C1 = '#22d3ee'; // cyan
const C2 = '#818cf8'; // indigo
const C3 = '#f472b6'; // pink
const C4 = '#34d399'; // emerald

// ============================================================
// Tray icon: 4 colored rounded squares in a 2×2 grid
// Wider gap + padding for breathing room, rounded corners
// ============================================================
function genTrayIconSVG(size = 256) {
  const pad = 16;   // outer padding
  const gap = 18;   // gap between squares
  const cell = (256 - pad * 2 - gap) / 2;
  const r = 22;

  return `<svg width="${size}" height="${size}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
    <rect x="${pad}" y="${pad}" width="${cell}" height="${cell}" rx="${r}" fill="${C1}" />
    <rect x="${pad + cell + gap}" y="${pad}" width="${cell}" height="${cell}" rx="${r}" fill="${C2}" />
    <rect x="${pad}" y="${pad + cell + gap}" width="${cell}" height="${cell}" rx="${r}" fill="${C3}" />
    <rect x="${pad + cell + gap}" y="${pad + cell + gap}" width="${cell}" height="${cell}" rx="${r}" fill="${C4}" />
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
