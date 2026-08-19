const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

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

// Generate PNG files first (known working approach)
async function genPNG(svg, width, height, pngFile) {
  await sharp(Buffer.from(svg))
    .resize(width, height)
    .png()
    .toFile(path.join(buildDir, pngFile));
  console.log(`  PNG: ${pngFile}`);
}

// ============================================================
// 1. installerSidebar (164×314)
// ============================================================
async function genSidebar() {
  console.log('Generating installerSidebar...');
  const svg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${NAVY}" />
        <stop offset="100%" stop-color="${NAVY_MID}" />
      </linearGradient>
    </defs>
    <rect width="164" height="314" fill="url(#bg)" />
    <rect x="34" y="55" width="116" height="85" rx="8" fill="${NAVY_LIGHT}" />
    <rect x="40" y="61" width="104" height="65" rx="4" fill="#141930" />
    <rect x="44" y="108" width="96" height="10" rx="2" fill="#2A3050" />
    <circle cx="56" cy="113" r="4" fill="${CYAN}" />
    <circle cx="72" cy="113" r="4" fill="${LIGHT_BLUE}" />
    <circle cx="88" cy="113" r="4" fill="${PINK}" />
    <circle cx="104" cy="113" r="4" fill="${RED}" />
    <rect x="72" y="140" width="24" height="5" rx="1" fill="${NAVY_LIGHT}" />
    <rect x="60" y="145" width="48" height="4" rx="2" fill="${NAVY_LIGHT}" />
    <text x="82" y="195" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" font-weight="bold" fill="${WHITE}">WorkPulse</text>
    <text x="82" y="218" text-anchor="middle" font-family="Microsoft YaHei UI, SimHei, sans-serif" font-size="10" fill="${GRAY}">工作脉搏 · 高效协同</text>
    <text x="82" y="238" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="8" fill="#646578">v0.1.9</text>
    <circle cx="22" cy="275" r="4" fill="${CYAN}" opacity="0.25" />
    <circle cx="37" cy="282" r="3" fill="${LIGHT_BLUE}" opacity="0.2" />
    <circle cx="127" cy="273" r="3.5" fill="${PINK}" opacity="0.2" />
    <circle cx="142" cy="283" r="2.5" fill="${RED}" opacity="0.2" />
  </svg>`;
  await genPNG(svg, 164, 314, 'installerSidebar.png');
}

// ============================================================
// 2. installerHeader (150×57)
// ============================================================
async function genHeader() {
  console.log('Generating installerHeader...');
  const svg = `<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${NAVY}" />
        <stop offset="100%" stop-color="${NAVY_LIGHT}" />
      </linearGradient>
    </defs>
    <rect width="150" height="57" fill="url(#bg)" />
    <circle cx="18" cy="22" r="4" fill="${CYAN}" />
    <circle cx="30" cy="22" r="4" fill="${LIGHT_BLUE}" />
    <circle cx="42" cy="22" r="4" fill="${PINK}" />
    <circle cx="54" cy="22" r="4" fill="${RED}" />
    <text x="70" y="28" font-family="Segoe UI, sans-serif" font-size="14" font-weight="bold" fill="${WHITE}">WorkPulse</text>
    <text x="70" y="42" font-family="Microsoft YaHei UI, SimHei, sans-serif" font-size="9" fill="${GRAY}">安装向导</text>
  </svg>`;
  await genPNG(svg, 150, 57, 'installerHeader.png');
}

// ============================================================
// 3. uninstallerSidebar (164×314)
// ============================================================
async function genUninstallSidebar() {
  console.log('Generating uninstallerSidebar...');
  const svg = `<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#232837" />
        <stop offset="100%" stop-color="#323746" />
      </linearGradient>
    </defs>
    <rect width="164" height="314" fill="url(#bg)" />
    <rect x="34" y="55" width="116" height="85" rx="8" fill="${NAVY_LIGHT}" />
    <rect x="40" y="61" width="104" height="65" rx="4" fill="#141930" />
    <rect x="44" y="108" width="96" height="10" rx="2" fill="#2A3050" />
    <circle cx="56" cy="113" r="4" fill="${CYAN}" />
    <circle cx="72" cy="113" r="4" fill="${LIGHT_BLUE}" />
    <circle cx="88" cy="113" r="4" fill="${PINK}" />
    <circle cx="104" cy="113" r="4" fill="${RED}" />
    <rect x="72" y="140" width="24" height="5" rx="1" fill="${NAVY_LIGHT}" />
    <rect x="60" y="145" width="48" height="4" rx="2" fill="${NAVY_LIGHT}" />
    <text x="82" y="195" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" font-weight="bold" fill="${WHITE}">WorkPulse</text>
    <text x="82" y="218" text-anchor="middle" font-family="Microsoft YaHei UI, SimHei, sans-serif" font-size="10" fill="${GRAY}">卸载向导</text>
    <circle cx="22" cy="275" r="4" fill="${CYAN}" opacity="0.25" />
    <circle cx="37" cy="282" r="3" fill="${LIGHT_BLUE}" opacity="0.2" />
    <circle cx="127" cy="273" r="3.5" fill="${PINK}" opacity="0.2" />
    <circle cx="142" cy="283" r="2.5" fill="${RED}" opacity="0.2" />
  </svg>`;
  await genPNG(svg, 164, 314, 'uninstallerSidebar.png');
}

(async () => {
  await genSidebar();
  await genHeader();
  await genUninstallSidebar();
  console.log('All PNG assets generated!');
  console.log('Now run: python build/convert-png-to-bmp.py');
})();
