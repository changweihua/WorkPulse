// 构建后处理：从 runtimeconfig.json 移除 WindowsDesktop.App 框架引用。
// net10.0-windows TFM 会隐式注入该框架，导致目标机器必须装 .NET Desktop Runtime；
// 本项目只用 WinRT 投影（Microsoft.Windows.SDK.NET + WinRT.Runtime，随包携带），
// 不依赖 WPF/WinForms，移除后三项采集实测正常。
// 由 Bridge.csproj 的 StripWindowsDesktopFramework target 在 Build 后调用。
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'native', 'Bridge.runtimeconfig.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const frameworks = config.runtimeOptions?.frameworks;
if (Array.isArray(frameworks)) {
  const kept = frameworks.filter((f) => f.name !== 'Microsoft.WindowsDesktop.App');
  if (kept.length !== frameworks.length) {
    config.runtimeOptions.frameworks = kept;
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
    console.log('[Bridge] 已移除 WindowsDesktop.App 框架引用');
  }
}
