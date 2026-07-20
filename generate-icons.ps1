# ================================================================
# generate-icons.ps1
# 功能：从 SVG 源文件生成 Electron 应用所需的所有图标
# 输入：resources/icon.svg（主图标）, resources/tray-icon.svg（托盘图标）
# 输出：
#   - resources/icon.ico（Windows，含 16~256 尺寸）
#   - resources/icon.icns（macOS，需在 Mac 上生成）
#   - resources/icon.png（Linux 及备用，1024x1024）
#   - resources/tray-icon-win.png（Windows/Linux 托盘，256x256）
#   - resources/tray-icon.png（通用托盘，512x512，高清晰）   # 修改点1
#   - resources/tray-icon-macTemplate.png（macOS 模板，256x256）
#   - resources/tray-icon-macTemplate@2x.png（macOS 模板高清，512x512）
# 依赖：ImageMagick 7（magick 命令）
# 特性：自动裁剪白边 + 保留 10% 透明边距（原 5%，现扩大一倍）
# ================================================================

# -------- 配置 --------
$mainSvg = "resources/icon.svg"
$traySvg = "resources/tray-icon.svg"
$outputDir = "resources"

# 主图标尺寸（包含 Windows 所需所有尺寸）
$mainSizes = @(16, 24, 32, 40, 48, 64, 96, 128, 256, 512, 1024)
$tempDir = "temp_icons"

# -------- 检查 ImageMagick --------
try {
    $null = Get-Command "magick" -ErrorAction Stop
}
catch {
    Write-Error "❌ 未找到 ImageMagick，请从 https://imagemagick.org/script/download.php 下载安装。"
    Write-Host "安装时请勾选 'Install legacy utilities (e.g. convert)' 以确保 magick 命令可用。"
    exit 1
}

# -------- 检查 SVG 源文件 --------
if (-not (Test-Path $mainSvg)) {
    Write-Error "❌ 找不到主图标源文件: $mainSvg"
    exit 1
}
if (-not (Test-Path $traySvg)) {
    Write-Error "❌ 找不到托盘图标源文件: $traySvg"
    exit 1
}

# 确保输出目录存在
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Write-Host "✅ 开始生成所有图标（透明背景，保留 10% 边距）..."

# ================================================================
# 1. 生成主图标
# ================================================================
Write-Host "`n📌 生成主图标..."

# 创建临时目录
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# 生成各尺寸 PNG（裁剪白边，添加 10% 透明边框，再缩放）
foreach ($size in $mainSizes) {
    $pngFile = Join-Path $tempDir "icon_${size}x${size}.png"
    Write-Host "  生成 ${size}x${size} ..."
    # 修改点2：边距从 5% 改为 10%
    magick $mainSvg -background none -trim +repage -bordercolor none -border 10%x10% -transparent white -alpha on -density 1200 -filter Catrom -resize ${size}x${size} -quality 100 $pngFile
}

# 生成 icon.png（最大尺寸）
Copy-Item (Join-Path $tempDir "icon_1024x1024.png") (Join-Path $outputDir "icon.png") -Force
Write-Host "  ✅ icon.png 生成 (1024x1024)"

# 生成 Windows .ico（BMP 格式，包含 16~256 尺寸）
Write-Host "  生成 icon.ico ..."
$icoSizes = @(16, 24, 32, 40, 48, 64, 96, 128, 256)
$icoInputs = @()
foreach ($size in $icoSizes) {
    $icoInputs += (Join-Path $tempDir "icon_${size}x${size}.png")
}
$icoArgs = $icoInputs + "-define", "icon:auto-resize", "-define", "icon:format=bmp", "-compress", "None", (Join-Path $outputDir "icon.ico")
magick $icoArgs
Write-Host "  ✅ icon.ico 生成（包含 $($icoSizes.Count) 种尺寸，BMP 格式）"

# 生成 macOS .icns（仅在 macOS 系统上执行）
if ($IsMacOS) {
    Write-Host "  生成 icon.icns ..."
    $iconsetDir = "icon.iconset"
    New-Item -ItemType Directory -Path $iconsetDir -Force | Out-Null
    $icnsMap = @{
        "icon_16x16.png"      = "16"
        "icon_16x16@2x.png"   = "32"
        "icon_32x32.png"      = "32"
        "icon_32x32@2x.png"   = "64"
        "icon_128x128.png"    = "128"
        "icon_128x128@2x.png" = "256"
        "icon_256x256.png"    = "256"
        "icon_256x256@2x.png" = "512"
        "icon_512x512.png"    = "512"
        "icon_512x512@2x.png" = "1024"
    }
    foreach ($key in $icnsMap.Keys) {
        $size = $icnsMap[$key]
        $src = Join-Path $tempDir "icon_${size}x${size}.png"
        if (Test-Path $src) {
            $dst = Join-Path $iconsetDir $key
            Copy-Item $src $dst -Force
        }
    }
    $pngCount = (Get-ChildItem $iconsetDir -Filter "*.png" | Measure-Object).Count
    if ($pngCount -gt 0) {
        iconutil -c icns $iconsetDir -o (Join-Path $outputDir "icon.icns")
        Write-Host "  ✅ icon.icns 生成"
    }
    else {
        Write-Host "  ⚠️ 缺少尺寸，跳过 .icns"
    }
    Remove-Item -Recurse -Force $iconsetDir
}
else {
    Write-Host "  ⚠️ 非 macOS 系统，跳过 .icns 生成。如需，请在 Mac 上运行本脚本。"
}

# 清理主图标临时文件（托盘图标还会用到，先保留）
# 我们会在托盘图标生成后统一清理

# ================================================================
# 2. 生成托盘图标
# ================================================================
Write-Host "`n📌 生成托盘图标..."

# 2.1 Windows/Linux 专用托盘图标（256x256，支持高 DPI）
$trayWinSize = 256
$trayWinPng = Join-Path $outputDir "tray-icon-win.png"
Write-Host "  生成 tray-icon-win.png (${trayWinSize}x${trayWinSize}) ..."
magick $traySvg -background none -trim +repage -bordercolor none -border 10%x10% -transparent white -alpha on -density 1200 -filter Catrom -resize ${trayWinSize}x${trayWinSize} -quality 100 $trayWinPng
Write-Host "  ✅ tray-icon-win.png 生成"

# 2.2 通用托盘图标（修改点3：尺寸改为 512x512，边距 10%）
$traySize = 512   # ← 原为 20，现改为 512
$trayPng = Join-Path $outputDir "tray-icon.png"
Write-Host "  生成 tray-icon.png (${traySize}x${traySize}) ..."
magick $traySvg -background none -trim +repage -bordercolor none -border 10%x10% -transparent white -alpha on -density 1200 -filter Catrom -resize ${traySize}x${traySize} -quality 100 $trayPng
Write-Host "  ✅ tray-icon.png 生成（512x512，10% 边距）"

# 2.3 macOS 模板图标（黑白，透明，256 和 512）
$macSizes = @("256x256", "512x512")
$macNames = @("tray-icon-macTemplate.png", "tray-icon-macTemplate@2x.png")
for ($i = 0; $i -lt $macSizes.Length; $i++) {
    $size = $macSizes[$i]
    $name = $macNames[$i]
    $outFile = Join-Path $outputDir $name
    Write-Host "  生成 $name ..."
    magick $traySvg -colorspace Gray -threshold 50% -background none -trim +repage -bordercolor none -border 10%x10% -transparent white -alpha on -density 1200 -filter Catrom -resize $size -quality 100 $outFile
}
Write-Host "  ✅ macOS 模板图标生成（可选，用于 setTemplateImage）"

# 清理临时目录
Remove-Item -Recurse -Force $tempDir

# ================================================================
# 完成
# ================================================================
Write-Host "`n🎉 所有图标生成完毕！"
Write-Host "生成的文件位于: $outputDir"
Write-Host "  - icon.ico（Windows，含 16~256 尺寸，BMP 格式）"
Write-Host "  - icon.icns（macOS，需在 Mac 上生成）" 
Write-Host "  - icon.png（Linux 及备用）"
Write-Host "  - tray-icon-win.png（Windows/Linux 托盘，256x256，10% 边距）"
Write-Host "  - tray-icon.png（通用托盘，512x512，10% 边距）"
Write-Host "  - tray-icon-macTemplate.png / @2x（macOS 模板）"
Write-Host "`n📝 提示："
Write-Host "  - 所有图标已自动保留约 10% 透明边距（原 5% 的两倍），图形更舒展。"
Write-Host "  - 若 Windows 图标仍模糊，请清除图标缓存："
Write-Host "       ie4uinit.exe -ClearIconCache"
Write-Host "       taskkill /f /im explorer.exe && start explorer.exe"
Write-Host "  - 若 macOS 使用模板，请在代码中调用 icon.setTemplateImage(true)。"