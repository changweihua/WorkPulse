/**
 * electron-builder 的自定义 Windows 签名回调。
 *
 * 当 `win.sign` 指向一个 JS 文件路径时，electron-builder 会调用本模块。
 * 签名证书从 electron-builder 内置签名器所用的同一批环境变量读取，
 * 因此配置是自包含且显式的。
 *
 * 没有可用证书时构建仍会继续（开发机场景），但 CI 中的 prebuild 检查脚本会告警。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * @param {string} pathToSign  待签名文件的绝对路径
 * @param {string} hash        文件的 SHA-256 哈希
 * @returns {Promise<void>}
 */
module.exports = async function sign(pathToSign, hash) {
  const certificateFile = process.env.WIN_CSC_LINK;
  const certificatePassword = process.env.WIN_CSC_KEY_PASSWORD;

  if (!certificateFile) {
    console.warn(`[win-sign] 未设置 WIN_CSC_LINK，跳过对 ${path.basename(pathToSign)} 的代码签名`);
    return;
  }

  // 解析证书路径（可能是相对于项目根目录的相对路径）
  const resolvedCert = path.isAbsolute(certificateFile)
    ? certificateFile
    : path.resolve(process.cwd(), certificateFile);

  if (!fs.existsSync(resolvedCert)) {
    throw new Error(`[win-sign] 未找到证书文件：${resolvedCert}`);
  }

  // 确保 signtool 可用（PATH 中，或 electron-builder 自带的副本）
  const signtool = process.env.WINDOWS_SIGNTOOL_PATH || 'signtool.exe';

  const timestampServer = process.env.WINDOWS_TIMESTAMP_URL || 'http://timestamp.digicert.com';

  const args = [
    'sign',
    '/fd',
    'SHA256',
    '/tr',
    timestampServer,
    '/td',
    'SHA256',
    '/f',
    resolvedCert,
  ];
  if (certificatePassword) {
    args.push('/p', certificatePassword);
  }
  args.push(pathToSign);

  console.log(`[win-sign] 正在签名 ${path.basename(pathToSign)} ...`);
  execSync(`"${signtool}" ${args.join(' ')}`, { stdio: 'inherit' });
  console.log(`[win-sign] 完成：${path.basename(pathToSign)}`);
};
