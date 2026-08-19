const sharp = require('sharp');
const path = require('path');

const buildDir = path.join(__dirname);

// Brand colors
const NAVY = '#1A1F36';
const NAVY_LIGHT = '#28304E';
const NAVY_MID = '#212842';
const CYAN = '#00D4FF';
const LIGHT_BLUE = '#7DD3FC';
const PINK = '#FCA5A5';
const RED = '#EF4444';
const WHITE = '#FFFFFF';
const GRAY = '#A0A5B4';

// Helper: create monitor + dots SVG elements
function monitorElements(x, y, scale = 1) {
  const s = scale;
  return `
    <!-- Monitor body -->
    <rect x="${x+10*s}" y="${y}" width="${96*s}" height="${68*s}" rx="${6*s}" fill="${NAVY_LIGHT}" />
    <!-- Screen -->
    <rect x="${x+14*s}" y="${y+4*s}" width="${88*s}" height="${52*s}" rx="${3*s}" fill="#141930" />
    <!-- Taskbar -->
    <rect x="${x+18*s}" y="${y+42*s}" width="${80*s}" height="${10*s}" rx="${2*s}" fill="#2A3050" />
    <!-- 4 colored dots -->
    <circle cx="${x+30*s}" cy="${y+47*s}" r="${4*s}" fill="${CYAN}" />
    <circle cx="${x+46*s}" cy="${y+47*s}" r="${4*s}" fill="${LIGHT_BLUE}" />
    <circle cx="${x+62*s}" cy="${y+47*s}" r="${4*s}" fill="${PINK}" />
    <circle cx="${x+78*s}" cy="${y+47*s}" r="${4*s}" fill="${RED}" />
    <!-- Stand -->
    <rect x="${x+44*s}" y="${y+68*s}" width="${24*s}" height="${5*s}" rx="${1*s}" fill="${NAVY_LIGHT}" />
    <rect x="${x+36*s}" y="${y+73*s}" width="${40*s}" height="${4*s}" rx="${2*s}" fill="${NAVY_LIGHT}" />
  `;
}

// ============================================================
// 1. installerSidebar (164×314)
// ============================================================
async function genSidebar() {
  const svg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${NAVY}" />
        <stop offset="100%" stop-color="${NAVY_MID}" />
      </linearGradient>
    </defs>
    <!-- Background -->
    <rect width="164" height="314" fill="url(#bg)" />
    
    <!-- Monitor illustration -->
    ${monitorElements(24, 55, 1.15)}
    
    <!-- WorkPulse title -->
    <text x="82" y="195" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" font-weight="bold" fill="${WHITE}">WorkPulse</text>
    
    <!-- Tagline -->
    <text x="82" y="218" text-anchor="middle" font-family="Microsoft YaHei UI, SimHei, sans-serif" font-size="10" fill="${GRAY}">工作脉搏 · 高效协同</text>
    
    <!-- Version -->
    <text x="82" y="238" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="8" fill="#646578">v0.1.9</text>
    
    <!-- Decorative dots -->
    <circle cx="22" cy="275" r="4" fill="${CYAN}" opacity="0.25" />
    <circle cx="37" cy="282" r="3" fill="${LIGHT_BLUE}" opacity="0.2" />
    <circle cx="127" cy="273" r="3.5" fill="${PINK}" opacity="0.2" />
    <circle cx="142" cy="283" r="2.5" fill="${RED}" opacity="0.2" />
  </svg>`;

  await sharp(Buffer.from(svg))
    .resize(164, 314)
    .png()
    .toFile(path.join(buildDir, 'installerSidebar.png'));
  
  // Convert to BMP (24-bit)
  await sharp(Buffer.from(svg))
    .resize(164, 314)
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      // Create 24-bit BMP manually
      const w = info.width, h = info.height;
      const rowSize = Math.ceil((w * 3) / 4) * 4;
      const imgSize = rowSize * h;
      const fileSize = 54 + imgSize;
      const buf = Buffer.alloc(fileSize);
      
      // BMP header
      buf.write('BM', 0);
      buf.writeUInt32LE(fileSize, 2);
      buf.writeUInt32LE(54, 10);
      // DIB header
      buf.writeUInt32LE(40, 14);
      buf.writeInt32LE(w, 18);
      buf.writeInt32LE(h, 22);
      buf.writeUInt16LE(1, 26);
      buf.writeUInt16LE(24, 28);
      buf.writeUInt32LE(imgSize, 34);
      
      // Pixel data (bottom-up, BGR)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const srcIdx = ((h - 1 - y) * w + x) * 3;
          const dstIdx = 54 + y * rowSize + x * 3;
          buf[dstIdx] = data[srcIdx + 2]; // B
          buf[dstIdx + 1] = data[srcIdx + 1]; // G
          buf[dstIdx + 2] = data[srcIdx]; // R
        }
      }
      
      require('fs').writeFileSync(path.join(buildDir, 'installerSidebar.bmp'), buf);
    });
  
  console.log('installerSidebar done');
}

// ============================================================
// 2. installerHeader (150×57)
// ============================================================
async function genHeader() {
  const svg = `<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${NAVY}" />
        <stop offset="100%" stop-color="${NAVY_LIGHT}" />
      </linearGradient>
    </defs>
    <!-- Background -->
    <rect width="150" height="57" fill="url(#bg)" />
    
    <!-- 4 colored dots -->
    <circle cx="18" cy="22" r="4" fill="${CYAN}" />
    <circle cx="30" cy="22" r="4" fill="${LIGHT_BLUE}" />
    <circle cx="42" cy="22" r="4" fill="${PINK}" />
    <circle cx="54" cy="22" r="4" fill="${RED}" />
    
    <!-- WorkPulse title -->
    <text x="70" y="28" font-family="Segoe UI, sans-serif" font-size="14" font-weight="bold" fill="${WHITE}">WorkPulse</text>
    
    <!-- Subtitle -->
    <text x="70" y="42" font-family="Microsoft YaHei UI, SimHei, sans-serif" font-size="9" fill="${GRAY}">安装向导</text>
  </svg>`;

  await sharp(Buffer.from(svg))
    .resize(150, 57)
    .png()
    .toFile(path.join(buildDir, 'installerHeader.png'));
  
  // Convert to BMP
  await sharp(Buffer.from(svg))
    .resize(150, 57)
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      const w = info.width, h = info.height;
      const rowSize = Math.ceil((w * 3) / 4) * 4;
      const imgSize = rowSize * h;
      const fileSize = 54 + imgSize;
      const buf = Buffer.alloc(fileSize);
      
      buf.write('BM', 0);
      buf.writeUInt32LE(fileSize, 2);
      buf.writeUInt32LE(54, 10);
      buf.writeUInt32LE(40, 14);
      buf.writeInt32LE(w, 18);
      buf.writeInt32LE(h, 22);
      buf.writeUInt16LE(1, 26);
      buf.writeUInt16LE(24, 28);
      buf.writeUInt32LE(imgSize, 34);
      
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const srcIdx = ((h - 1 - y) * w + x) * 3;
          const dstIdx = 54 + y * rowSize + x * 3;
          buf[dstIdx] = data[srcIdx + 2];
          buf[dstIdx + 1] = data[srcIdx + 1];
          buf[dstIdx + 2] = data[srcIdx];
        }
      }
      
      require('fs').writeFileSync(path.join(buildDir, 'installerHeader.bmp'), buf);
    });
  
  console.log('installerHeader done');
}

// ============================================================
// 3. uninstallerSidebar (164×314)
// ============================================================
async function genUninstallSidebar() {
  const svg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#232837" />
        <stop offset="100%" stop-color="#323746" />
      </linearGradient>
    </defs>
    <!-- Background -->
    <rect width="164" height="314" fill="url(#bg)" />
    
    <!-- Monitor illustration -->
    ${monitorElements(24, 55, 1.15)}
    
    <!-- WorkPulse title -->
    <text x="82" y="195" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" font-weight="bold" fill="${WHITE}">WorkPulse</text>
    
    <!-- Uninstall tagline -->
    <text x="82" y="218" text-anchor="middle" font-family="Microsoft YaHei UI, SimHei, sans-serif" font-size="10" fill="${GRAY}">卸载向导</text>
    
    <!-- Decorative dots -->
    <circle cx="22" cy="275" r="4" fill="${CYAN}" opacity="0.25" />
    <circle cx="37" cy="282" r="3" fill="${LIGHT_BLUE}" opacity="0.2" />
    <circle cx="127" cy="273" r="3.5" fill="${PINK}" opacity="0.2" />
    <circle cx="142" cy="283" r="2.5" fill="${RED}" opacity="0.2" />
  </svg>`;

  await sharp(Buffer.from(svg))
    .resize(164, 314)
    .png()
    .toFile(path.join(buildDir, 'uninstallerSidebar.png'));
  
  // Convert to BMP
  await sharp(Buffer.from(svg))
    .resize(164, 314)
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      const w = info.width, h = info.height;
      const rowSize = Math.ceil((w * 3) / 4) * 4;
      const imgSize = rowSize * h;
      const fileSize = 54 + imgSize;
      const buf = Buffer.alloc(fileSize);
      
      buf.write('BM', 0);
      buf.writeUInt32LE(fileSize, 2);
      buf.writeUInt32LE(54, 10);
      buf.writeUInt32LE(40, 14);
      buf.writeInt32LE(w, 18);
      buf.writeInt32LE(h, 22);
      buf.writeUInt16LE(1, 26);
      buf.writeUInt16LE(24, 28);
      buf.writeUInt32LE(imgSize, 34);
      
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const srcIdx = ((h - 1 - y) * w + x) * 3;
          const dstIdx = 54 + y * rowSize + x * 3;
          buf[dstIdx] = data[srcIdx + 2];
          buf[dstIdx + 1] = data[srcIdx + 1];
          buf[dstIdx + 2] = data[srcIdx];
        }
      }
      
      require('fs').writeFileSync(path.join(buildDir, 'uninstallerSidebar.bmp'), buf);
    });
  
  console.log('uninstallerSidebar done');
}

(async () => {
  await genSidebar();
  await genHeader();
  await genUninstallSidebar();
  console.log('All assets generated!');
})();
