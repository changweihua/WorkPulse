/**
 * 构建前签名校验脚本。
 *
 * 在发布/分发构建前检查必需的代码签名环境变量是否已设置。
 * 本脚本有意不做阻断：只输出告警而不以错误退出，
 * 因为多数开发机上并未安装签名证书。
 *
 * 退出码：
 *   0 – 全部检查通过（或仅输出告警）
 */

import { execSync } from 'child_process';

const isCI = process.env.CI === 'true';
const isRelease = process.argv.includes('--release') || process.env.RELEASE_BUILD === 'true';

// ── macOS ──────────────────────────────────────────────────────────────────────
const macCertName = process.env.CSC_NAME || process.env.CSC_LINK;
if (isCI || isRelease) {
  if (!macCertName) {
    console.warn('⚠️  未配置 macOS 签名证书。' + '发布构建需设置 CSC_NAME 或 CSC_LINK 环境变量。');
  } else {
    console.log(`✅ 已配置 macOS 签名证书：${macCertName}`);
  }
} else {
  console.log('ℹ️  跳过 macOS 签名检查（本地构建，identity: null 属正常情况）');
}

// ── Windows ────────────────────────────────────────────────────────────────────
const winCertPath = process.env.WIN_CSC_LINK;
const winCertPass = process.env.WIN_CSC_KEY_PASSWORD;
if (isCI || isRelease) {
  if (!winCertPath) {
    console.warn(
      '⚠️  未配置 Windows 签名证书。' +
        '发布构建需设置 WIN_CSC_LINK 与 WIN_CSC_KEY_PASSWORD 环境变量。',
    );
  } else if (!winCertPass) {
    console.warn('⚠️  已设置 WIN_CSC_LINK，但缺少 WIN_CSC_KEY_PASSWORD。');
  } else {
    console.log('✅ 已配置 Windows 签名证书。');
  }
} else {
  console.log('ℹ️  跳过 Windows 签名检查（本地构建）');
}

// ── 公证（macOS）────────────────────────────────────────────────────────────────
if (isCI || isRelease) {
  const appleId = process.env.APPLE_ID;
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  if (!appleId || !applePassword) {
    console.warn(
      '⚠️  未配置 Apple 公证凭据。' +
        '公证发布构建需设置 APPLE_ID 与 APPLE_APP_SPECIFIC_PASSWORD 环境变量。',
    );
  } else {
    console.log('✅ 已配置 Apple 公证凭据。');
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────────────
console.log('');
console.log('签名检查完成。以上告警不会阻断构建。');
