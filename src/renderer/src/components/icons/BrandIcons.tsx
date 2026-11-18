import type { SVGProps } from 'react';

/**
 * WorkPulse 品牌多色图标集（单一数据源）
 * ============================================================================
 * 设计语言与主程序图标（resources/icon.svg）同源：
 *   - 深蓝紫主体  #2C2F53 / #4C4F6E
 *   - 灰紫结构    #999AAC / #CACAD4
 *   - 青色点缀    #11CBE5 / #91EDF8
 *   - 玫红点缀    #FA4659 / #FDB8BF
 *   - 圆角、扁平、实心填充，与 lucide 线性图标形成"品牌位 vs 操作位"分工。
 *
 * 用法：尺寸一律由外部 className 控制（如 w-[18px] h-[18px]），与 lucide 一致。
 *       viewBox 固定 0 0 24 24，颜色写死为品牌色（多色，不随 currentColor）。
 *
 * 覆盖：应用 Logo + 全部导航功能图标。品牌图标（Paddle/ONNX/.NET）保留可辨识主体色。
 */

type BrandIconProps = SVGProps<SVGSVGElement>;

/** 统一 SVG 外壳（brand-icon 供深色主题 CSS 提亮；合并外部 className） */
function BrandSvg({ children, className, ...props }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden="true"
      className={className ? `brand-icon ${className}` : 'brand-icon'}
      {...props}
    >
      {children}
    </svg>
  );
}

/** 应用 Logo：多色显示器 + 脉搏波形（与主图标一致，供程序内品牌位复用） */
export function BrandLogo(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <defs>
        <linearGradient id="wp-logo-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4C4F6E" />
          <stop offset="1" stopColor="#2C2F53" />
        </linearGradient>
        <linearGradient id="wp-logo-pulse" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#11CBE5" />
          <stop offset="0.55" stopColor="#91EDF8" />
          <stop offset="1" stopColor="#FA4659" />
        </linearGradient>
      </defs>
      <rect x="10.5" y="17" width="3" height="3.2" rx="0.5" fill="#999AAC" />
      <rect x="7.8" y="20" width="8.4" height="1.6" rx="0.8" fill="#999AAC" />
      <rect x="2.4" y="3" width="19.6" height="14" rx="2.6" fill="#7C7F95" />
      <rect x="2" y="2.4" width="19.6" height="14" rx="2.6" fill="#CACAD4" />
      <rect x="3.4" y="3.8" width="16.8" height="11" rx="1.6" fill="url(#wp-logo-screen)" />
      <circle cx="7.8" cy="6.9" r="0.85" fill="#11CBE5" />
      <circle cx="10.4" cy="6.9" r="0.85" fill="#BCF4F5" />
      <circle cx="13" cy="6.9" r="0.85" fill="#FDB8BF" />
      <circle cx="15.6" cy="6.9" r="0.85" fill="#FA4659" />
      <path
        d="M4.8 10.4 H8 L9.2 8.7 L10.5 12.2 L12 7.6 L13.4 11 L14.6 9.8 L19 9.8"
        fill="none"
        stroke="#11CBE5"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.25"
      />
      <path
        d="M4.8 10.4 H8 L9.2 8.7 L10.5 12.2 L12 7.6 L13.4 11 L14.6 9.8 L19 9.8"
        fill="none"
        stroke="url(#wp-logo-pulse)"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </BrandSvg>
  );
}

/** 工作日志：带勾选的清单板 */
export function BrandWorklog(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.6" fill="#2C2F53" />
      <rect x="3.2" y="2.2" width="5.6" height="2.8" rx="1.2" fill="#7C7F95" />
      <rect x="11.8" y="2.2" width="5.6" height="2.8" rx="1.2" fill="#7C7F95" />
      <circle cx="8.4" cy="9.2" r="1.5" fill="#11CBE5" />
      <path
        d="M11.6 8.6h5.2M11.6 10h3.6"
        stroke="#CACAD4"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8.4" cy="14.6" r="1.5" fill="#FA4659" />
      <path
        d="M11.6 14h5.2M11.6 15.4h3.6"
        stroke="#CACAD4"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </BrandSvg>
  );
}

/** 看板：三列卡片 */
export function BrandKanban(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="3" y="4" width="5" height="16" rx="1.6" fill="#4C4F6E" />
      <rect x="9.5" y="4" width="5" height="16" rx="1.6" fill="#4C4F6E" />
      <rect x="16" y="4" width="5" height="16" rx="1.6" fill="#4C4F6E" />
      <rect x="4.2" y="5.6" width="2.6" height="4.2" rx="0.9" fill="#11CBE5" />
      <rect x="10.7" y="5.6" width="2.6" height="5.8" rx="0.9" fill="#91EDF8" />
      <rect x="17.2" y="5.6" width="2.6" height="3.4" rx="0.9" fill="#FA4659" />
      <rect x="10.7" y="13" width="2.6" height="3.4" rx="0.9" fill="#999AAC" />
    </BrandSvg>
  );
}

/** 日历：翻页日历 + 青/红标记 */
export function BrandCalendar(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="3.2" y="5" width="17.6" height="15.4" rx="2.6" fill="#2C2F53" />
      <path d="M3.2 9.6h17.6" stroke="#4C4F6E" strokeWidth="1" />
      <rect x="3.2" y="4" width="17.6" height="4" rx="2.2" fill="#7C7F95" />
      <rect x="7" y="2.6" width="1.8" height="3.4" rx="0.9" fill="#CACAD4" />
      <rect x="15.2" y="2.6" width="1.8" height="3.4" rx="0.9" fill="#CACAD4" />
      <circle cx="8.4" cy="14" r="1.7" fill="#11CBE5" />
      <circle cx="12" cy="14" r="1.7" fill="#999AAC" />
      <circle cx="15.6" cy="14" r="1.7" fill="#FA4659" />
      <rect x="6.2" y="17.2" width="11.6" height="1.3" rx="0.65" fill="#4C4F6E" />
    </BrandSvg>
  );
}

/** 统计：柱状图（青→红渐变柱） */
export function BrandStats(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="3" y="19.4" width="18" height="1.8" rx="0.9" fill="#999AAC" />
      <rect x="4.6" y="13" width="3.4" height="6" rx="1.2" fill="#11CBE5" />
      <rect x="10.3" y="8.6" width="3.4" height="10.4" rx="1.2" fill="#91EDF8" />
      <rect x="16" y="5.2" width="3.4" height="13.8" rx="1.2" fill="#FA4659" />
    </BrandSvg>
  );
}

/** 报告：文档 + 折线 */
export function BrandReport(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path
        d="M6 2.8h8l4.2 4.2V20a1.4 1.4 0 0 1-1.4 1.4H6A1.4 1.4 0 0 1 4.6 20V4.2A1.4 1.4 0 0 1 6 2.8z"
        fill="#2C2F53"
      />
      <path d="M14 2.8v4.2h4.2" fill="#7C7F95" />
      <path
        d="M7.2 16.8l2.4-3 2.2 1.8 3.2-4.2"
        fill="none"
        stroke="#11CBE5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="11.4" r="1.15" fill="#FA4659" />
      <path d="M7.2 7.4h6.4M7.2 9.8h4.2" stroke="#999AAC" strokeWidth="1.1" strokeLinecap="round" />
    </BrandSvg>
  );
}

/** 周报：日历 + 对勾 */
export function BrandReports(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="3" y="5" width="18" height="15.4" rx="2.6" fill="#2C2F53" />
      <rect x="3" y="4" width="18" height="4" rx="2.2" fill="#7C7F95" />
      <rect x="7" y="2.6" width="1.8" height="3.4" rx="0.9" fill="#CACAD4" />
      <rect x="15.2" y="2.6" width="1.8" height="3.4" rx="0.9" fill="#CACAD4" />
      <path
        d="M7.4 13.6l2.2 2.2 4.4-4.8"
        fill="none"
        stroke="#11CBE5"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="16.8" r="1.5" fill="#FA4659" />
    </BrandSvg>
  );
}

/** RSS：信号弧 + 节点 */
export function BrandRss(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4.4" fill="#2C2F53" />
      <circle cx="7.6" cy="16.4" r="1.7" fill="#11CBE5" />
      <path
        d="M6.2 10.2a7.6 7.6 0 0 1 7.6 7.6"
        fill="none"
        stroke="#91EDF8"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M6.2 6.2a11.6 11.6 0 0 1 11.6 11.6"
        fill="none"
        stroke="#FA4659"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </BrandSvg>
  );
}

/** OCR 文字识别：扫描框 + 文字 */
export function BrandOcr(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path
        d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"
        fill="none"
        stroke="#2C2F53"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="7.4" y="9.6" width="9.2" height="1.5" rx="0.75" fill="#11CBE5" />
      <rect x="7.4" y="12.9" width="6.4" height="1.5" rx="0.75" fill="#999AAC" />
      <path
        d="M4.6 12h14.8"
        stroke="#FA4659"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.85"
      />
    </BrandSvg>
  );
}

/** PP-OCR：文档 + 扫描高亮 */
export function BrandPp(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path
        d="M6 2.8h7.6L17.8 7v12.2a1.4 1.4 0 0 1-1.4 1.4H6A1.4 1.4 0 0 1 4.6 19V4.2A1.4 1.4 0 0 1 6 2.8z"
        fill="#2C2F53"
      />
      <path d="M13.6 2.8V7H17.8" fill="#7C7F95" />
      <path d="M4.6 10.2h12.8" stroke="#FA4659" strokeWidth="1.2" opacity="0.9" />
      <rect x="7" y="12" width="8" height="1.4" rx="0.7" fill="#11CBE5" />
      <rect x="7" y="15" width="5.4" height="1.4" rx="0.7" fill="#CACAD4" />
    </BrandSvg>
  );
}

/** X 光 / 影像：闪电扫描 */
export function BrandXray(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4.6" fill="#2C2F53" />
      <path d="M13.4 5.2L7.6 13h4l-1.2 5.8L16.6 10h-4.2z" fill="#11CBE5" />
      <path
        d="M13.4 5.2L7.6 13h4l-1.2 5.8L16.6 10h-4.2z"
        fill="none"
        stroke="#91EDF8"
        strokeWidth="0.4"
      />
      <circle cx="17.6" cy="6.4" r="1.1" fill="#FA4659" />
    </BrandSvg>
  );
}

/** ONNX：神经网络节点（保留 ONNX 可辨识的网状结构，主色青蓝） */
export function BrandOnnx(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <g stroke="#7C7F95" strokeWidth="1.2">
        <path d="M7 6.5L15.5 5M7 6.5L15.5 12M7 6.5L15.5 19M7 12L15.5 5M7 12L15.5 12M7 12L15.5 19M7 17.5L15.5 12M7 17.5L15.5 19" />
      </g>
      <circle cx="7" cy="6.5" r="2.1" fill="#11CBE5" />
      <circle cx="7" cy="12" r="2.1" fill="#2C2F53" />
      <circle cx="7" cy="17.5" r="2.1" fill="#11CBE5" />
      <circle cx="15.5" cy="5" r="2.1" fill="#FA4659" />
      <circle cx="15.5" cy="12" r="2.1" fill="#91EDF8" />
      <circle cx="15.5" cy="19" r="2.1" fill="#FA4659" />
    </BrandSvg>
  );
}

/** AI 模型 / 机器人：芯片脑袋 */
export function BrandRobot(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="4.5" y="7" width="15" height="12.4" rx="3" fill="#2C2F53" />
      <path d="M12 3v4" stroke="#7C7F95" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="2.8" r="1.5" fill="#FA4659" />
      <rect x="7.4" y="11" width="3" height="3" rx="1.2" fill="#11CBE5" />
      <rect x="13.6" y="11" width="3" height="3" rx="1.2" fill="#11CBE5" />
      <path d="M9 16.4h6" stroke="#999AAC" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="2.8" y="11" width="1.8" height="3.2" rx="0.9" fill="#7C7F95" />
      <rect x="19.4" y="11" width="1.8" height="3.2" rx="0.9" fill="#7C7F95" />
    </BrandSvg>
  );
}

/** AI 对话：双气泡 + 星芒 */
export function BrandChat(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path
        d="M3.6 6.4a2.6 2.6 0 0 1 2.6-2.6h9.2a2.6 2.6 0 0 1 2.6 2.6v6.6a2.6 2.6 0 0 1-2.6 2.6H9.4l-4.2 3.2v-3.4a2.6 2.6 0 0 1-1.6-2.4z"
        fill="#2C2F53"
      />
      <circle cx="7.6" cy="9.6" r="1.1" fill="#11CBE5" />
      <circle cx="11" cy="9.6" r="1.1" fill="#CACAD4" />
      <circle cx="14.4" cy="9.6" r="1.1" fill="#999AAC" />
      <path d="M17.6 13l0.7 1.7 1.7 0.7-1.7 0.7-0.7 1.7-0.7-1.7-1.7-0.7 1.7-0.7z" fill="#FA4659" />
    </BrandSvg>
  );
}

/** AI 统计：柱状图 + 折线 */
export function BrandAiStats(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="3" y="19.4" width="18" height="1.8" rx="0.9" fill="#999AAC" />
      <rect x="4.8" y="14" width="3.2" height="5" rx="1.1" fill="#4C4F6E" />
      <rect x="10.4" y="10.4" width="3.2" height="8.6" rx="1.1" fill="#4C4F6E" />
      <rect x="16" y="7.4" width="3.2" height="11.6" rx="1.1" fill="#4C4F6E" />
      <path
        d="M6.4 13.2L11.8 9.4 17.6 5.6"
        fill="none"
        stroke="#11CBE5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.6" cy="5.6" r="1.4" fill="#FA4659" />
    </BrandSvg>
  );
}

/** 流体玻璃：水滴 + 高光 */
export function BrandGlass(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path
        d="M12 2.6S5.4 9.8 5.4 14.4a6.6 6.6 0 0 0 13.2 0C18.6 9.8 12 2.6 12 2.6z"
        fill="#11CBE5"
      />
      <path
        d="M12 2.6S5.4 9.8 5.4 14.4a6.6 6.6 0 0 0 13.2 0C18.6 9.8 12 2.6 12 2.6z"
        fill="none"
        stroke="#91EDF8"
        strokeWidth="0.6"
      />
      <path
        d="M8.6 14.8a3.6 3.6 0 0 0 3.4 3.4"
        fill="none"
        stroke="#EAEAEE"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="15.4" cy="7.8" r="1.1" fill="#FA4659" />
    </BrandSvg>
  );
}

/** .NET：紫色圆角方块 + N 标记（保留品牌识别色） */
export function BrandDotnet(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <rect x="2.8" y="3" width="18.4" height="18" rx="4.4" fill="#4C4F6E" />
      <path
        d="M7 17V7l5.2 7.2V7M17 17V7"
        fill="none"
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.6" cy="5.6" r="1.5" fill="#11CBE5" />
    </BrandSvg>
  );
}

/** PaddlePaddle 飞桨：保留飞桨可辨识的青蓝主体 */
export function BrandPaddle(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path
        d="M5.4 8.2a3.8 3.8 0 0 1 3.7-3.1h2.2v2.6H9.1a1.2 1.2 0 0 0 0 2.4h2.2v2.6H9.1a3.8 3.8 0 0 1-3.7-4.5z"
        fill="#11CBE5"
      />
      <path d="M12.4 5.1h4.9a3.4 3.4 0 0 1 0 6.8h-2.4v4.4h-2.5z" fill="#2C2F53" />
      <path d="M14.9 7.5h2.2a1 1 0 0 1 0 2h-2.2z" fill="#91EDF8" />
      <circle cx="18.6" cy="7.6" r="1" fill="#FA4659" />
    </BrandSvg>
  );
}

/** 截图标注：取景框 + 镜头 + 标注笔（用于悬浮窗/Touch Bar 截图快捷入口） */
export function BrandScreenshot(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path
        d="M5 8.4V6.2A2.2 2.2 0 0 1 7.2 4h2.2M14.6 4h2.2A2.2 2.2 0 0 1 19 6.2v2.2M19 14.6v2.2a2.2 2.2 0 0 1-2.2 2.2h-2.2M9.4 20H7.2A2.2 2.2 0 0 1 5 17.8v-2.2"
        fill="none"
        stroke="#2C2F53"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="12" cy="11.6" r="3.3" fill="#2C2F53" />
      <circle cx="12" cy="11.6" r="1.75" fill="#11CBE5" />
      <path d="M16.4 16.2l3.3-3.3 1.5 1.5-3.3 3.3-2.2.7z" fill="#FA4659" />
      <path d="M16.4 16.2l1.3 1.3" stroke="#FDB8BF" strokeWidth="0.9" strokeLinecap="round" />
    </BrandSvg>
  );
}

/** 设置：齿轮 + 青色核心 */
export function BrandSettings(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path
        d="M10.4 2.8h3.2l.5 2.3 1.9.8 2.1-1.1 2.2 2.2-1.1 2.1.8 1.9 2.3.5v3.2l-2.3.5-.8 1.9 1.1 2.1-2.2 2.2-2.1-1.1-1.9.8-.5 2.3h-3.2l-.5-2.3-1.9-.8-2.1 1.1-2.2-2.2 1.1-2.1-.8-1.9-2.3-.5v-3.2l2.3-.5.8-1.9-1.1-2.1 2.2-2.2 2.1 1.1 1.9-.8z"
        fill="#2C2F53"
      />
      <circle cx="12" cy="12" r="3.2" fill="#999AAC" />
      <circle cx="12" cy="12" r="1.9" fill="#11CBE5" />
    </BrandSvg>
  );
}
