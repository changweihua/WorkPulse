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
// 品牌 wordmark：隶书「记了么」字标 + WORKPULSE + 标语（与 resources/logo/ 同源）
const WORDMARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1408 768" width="1408" height="768"><rect width="1408" height="768" fill="#FFFFFF"/><defs><linearGradient id="sp-ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C4F6E"/><stop offset="1" stop-color="#2C2F53"/></linearGradient></defs><g transform="translate(61,163) scale(0.42)"><defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C4F6E"/><stop offset="1" stop-color="#2C2F53"/></linearGradient></defs><g transform="translate(120,715)"><g transform="translate(0,0)"><path d="M756-633Q770-638 780-642Q790-646 794-647Q795-647 786-546Q784-512 782-495Q775-423 770.50-382Q766-341 764-340Q762-337 732-336Q702-335 640-335L520-335L519-317Q519-274 524-234Q525-215 527.50-203Q530-191 533.50-186Q537-181 549-171Q568-155 581-148Q602-138 651.50-130Q701-122 762-120L814-119L833-126Q853-133 863-140Q879-150 902-166Q925-182 942-195L954-204L954-195Q957-168 933-109.50Q909-51 884-23Q874-13 863-8Q852-3 836-3Q818-3 792-8.50Q766-14 718-26L615-53Q554-69 526.50-80Q499-91 483-107Q465-125 458-150.50Q451-176 447-232Q445-276 436-346Q429-417 430-417Q442-416 455-413Q469-410 481.50-409Q494-408 517-408L580-408L634-410Q685-412 686-412Q688-413 690-415Q692-417 693-420Q695-431 698.50-453.50Q702-476 704-501L705-519L662-518Q634-515 573-515Q566-514 552-514L508-513Q493-513 488.50-514Q484-515 483-518Q481-523 474.50-558Q468-593 466-606L477-604Q488-600 510.50-597.50Q533-595 558-595Q617-595 659.50-603.50Q702-612 756-633M322-640Q344-646 344-642Q344-638 320-578Q296-518 291-510Q284-500 280-500Q276-500 261-512Q256-515 215-548Q204-559 192-568Q185-573 176-582Q155-598 166-598Q168-598 200-606Q234-616 279-628Q294-633 322-640M273-455Q336-465 336-461L333-449Q328-430 312.50-341Q297-252 292-207Q291-195 291-189Q291-183 293-182Q296-178 307-181Q318-184 362-202L404-218Q405-215 378-177Q361-151 352.50-140.50Q344-130 329-118Q293-86 262-63Q231-40 226-40Q219-40 200-68Q181-96 168-126Q166-130 162.50-140Q159-150 158.50-153.50Q158-157 159-158Q160-160 185-162Q204-164 209-165.50Q214-167 215-173Q215-181 237-329Q244-371 244-382Q244-386 239-386.50Q234-387 222-386Q158-381 144-375Q137-370 134-370L128-387Q118-414 113-423Q105-442 105-446Q105-447 168-449Q228-450 273-455" fill="url(#ink)"/></g>
<g transform="translate(1060,0)"><path d="M747-647L796-663Q809-668 822-670L817-650Q815-643 810.50-627Q806-611 799-586Q780-517 766-485Q752-453 725-418Q706-392 675-358Q644-324 640-324Q638-324 637.50-321.50Q637-319 637-312Q637-289 641-197Q644-128 644-95Q644-63 641-49Q638-35 631-27Q626-20 614-17Q602-14 549-6Q513 0 479 3Q445 6 388 10L365 12Q238 19 229 21L224 21Q221 21 219.50 19.50Q218 18 216 14Q211 2 194-71Q177-144 179-144Q182-144 198-135Q228-120 265-107Q302-94 327-89Q345-87 386-87Q456-87 489-90Q515-93 527-98.50Q539-104 543.50-117.50Q548-131 551-161Q552-174 552-226Q552-329 549-345L546-354L565-368Q584-381 597-394Q610-407 629-429Q651-457 673.50-493.50Q696-530 696-539Q696-541 692-542Q688-543 680-543L648-542Q523-537 337-512L265-502Q261-501 257.50-509Q254-517 241-560L223-618L232-620Q233-620 265-615Q307-606 414-606Q488-606 544-610Q668-619 747-647" fill="url(#ink)"/></g>
<g transform="translate(2120,0)"><path d="M480-683L482-698L529-659Q548-645 560.50-635Q573-625 576-621Q576-618 558-588.50Q540-559 529-546Q517-528 485-494Q402-404 330-356Q298-335 247-310.50Q196-286 188-288Q187-288 181-303Q176-321 134-399Q129-407 127-413Q125-419 127-418Q142-412 179-412Q220-412 250.50-418.50Q281-425 312-441Q335-451 350-462Q365-473 386-494Q417-526 435.50-557Q454-588 467-634Q478-672 480-683M520-359L547-412Q564-445 569.50-454Q575-463 581-463Q585-463 599-455Q611-450 630.50-438Q650-426 658-420Q656-416 648.50-406.50Q641-397 630-384Q615-367 571-315Q518-253 474.50-190.50Q431-128 431-116Q431-109 438.50-106.50Q446-104 478-102Q522-100 544-100Q602-100 649-105Q686-108 706-110.50Q726-113 726-116L714-143Q708-153 697-180Q693-192 690-195Q689-198 692-200Q710-207 731-215.50Q752-224 766-230Q784-239 788-239Q791-239 792-234Q793-229 794-227Q796-216 817.50-152.50Q839-89 850-60Q857-39 868-17Q874-4 874.50-0.50Q875 3 872 6Q868 8 828.50 28.50Q789 49 786 49Q785 49 776 26L769 2L601 1L574 1Q501 1 457.50 0Q414-1 395-4Q321-13 316-18Q314-20 305.50-81.50Q297-143 299-144L317-141Q331-138 337-138Q343-138 347-140.50Q351-143 358-150L444-261" fill="url(#ink)"/></g></g></g><text x="704" y="600" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" letter-spacing="22" fill="#4C4F6E">WORKPULSE</text><text x="704" y="660" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" letter-spacing="8" fill="#11CBE5">让每一份努力被看见</text></svg>`;

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
