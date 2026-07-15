# ================================================================
# generate-icons.ps1
# 功能：一键生成 Electron 应用所需的所有图标
# 输入：resources/icon.svg (主图标), resources/tray-icon.svg (托盘图标)
# 输出：resources/icon.ico, resources/icon.icns, resources/icon.png,
#       resources/tray-icon.png (256x256),
#       resources/tray-icon-macTemplate.png, tray-icon-macTemplate@2x.png
# 特点：所有输出均为透明背景，高清晰度，适配高 DPI
# 依赖：ImageMagick 7 (magick 命令)
# ================================================================

# -------- 配置 --------
$mainSvg = "resources/icon.svg"
$traySvg = "resources/tray-icon.svg"
$outputDir = "resources"

# 主图标尺寸（覆盖 Windows 常见需求，避免拉伸）
$mainSizes = @(16, 24, 32, 40, 48, 64, 96, 128, 256, 512, 1024)
$tempDir = "temp_icons"

# -------- 检查 ImageMagick --------
try {
    $null = Get-Command "magick" -ErrorAction Stop
} catch {
    Write-Error "❌ 未找到 ImageMagick。请从 https://imagemagick.org/script/download.php 下载安装。"
    Write-Host "安装时请勾选 'Install legacy utilities (e.g. convert)' 以确保 magick 命令可用。"
    exit 1
}

# -------- 检查源文件 --------
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

Write-Host "✅ 开始生成所有图标（透明背景）..."

# ================================================================
# 1. 生成主图标
# ================================================================
Write-Host "`n📌 生成主图标..."

# 创建临时目录
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# 生成各尺寸 PNG（强制透明，移除白色）
foreach ($size in $mainSizes) {
    $pngFile = Join-Path $tempDir "icon_${size}x${size}.png"
    Write-Host "  生成 ${size}x${size} ..."
    magick $mainSvg -background none -transparent white -alpha on -density 1200 -filter Catrom -resize ${size}x${size} -quality 100 $pngFile
}

# 生成 icon.png (最大尺寸，供 Linux 及备用)
Copy-Item (Join-Path $tempDir "icon_1024x1024.png") (Join-Path $outputDir "icon.png") -Force
Write-Host "  ✅ icon.png 生成 (1024x1024)"

# 生成 Windows .ico (包含所有尺寸，无损压缩)
Write-Host "  生成 icon.ico ..."
$icoInputs = @()
foreach ($size in $mainSizes) {
    $icoInputs += (Join-Path $tempDir "icon_${size}x${size}.png")
}
$icoArgs = $icoInputs + "-define", "icon:auto-resize", "-compress", "None", (Join-Path $outputDir "icon.ico")
magick $icoArgs
Write-Host "  ✅ icon.ico 生成 (包含 $($mainSizes.Count) 种尺寸)"

# 生成 macOS .icns (仅在 macOS 上可行)
if ($IsMacOS) {
    Write-Host "  生成 icon.icns ..."
    $iconsetDir = "icon.iconset"
    New-Item -ItemType Directory -Path $iconsetDir -Force | Out-Null
    $icnsMap = @{
        "icon_16x16.png" = "16"
        "icon_16x16@2x.png" = "32"
        "icon_32x32.png" = "32"
        "icon_32x32@2x.png" = "64"
        "icon_128x128.png" = "128"
        "icon_128x128@2x.png" = "256"
        "icon_256x256.png" = "256"
        "icon_256x256@2x.png" = "512"
        "icon_512x512.png" = "512"
        "icon_512x512@2x.png" = "1024"
    }
    foreach ($key in $icnsMap.Keys) {
        $size = $icnsMap[$key]
        $src = Join-Path $tempDir "icon_${size}x${size}.png"
        $dst = Join-Path $iconsetDir $key
        Copy-Item $src $dst -Force
    }
    iconutil -c icns $iconsetDir -o (Join-Path $outputDir "icon.icns")
    Remove-Item -Recurse -Force $iconsetDir
    Write-Host "  ✅ icon.icns 生成"
} else {
    Write-Host "  ⚠️ 非 macOS 系统，跳过 .icns 生成。"
}

# 清理主图标临时文件
Remove-Item -Recurse -Force $tempDir

# ================================================================
# 2. 生成托盘图标 (高分辨率)
# ================================================================
Write-Host "`n📌 生成托盘图标..."

# 标准托盘图标 (Windows/Linux) - 256x256 确保高清
$traySize = 256
$trayPng = Join-Path $outputDir "tray-icon.png"
Write-Host "  生成 tray-icon.png (${traySize}x${traySize}) ..."
magick $traySvg -background none -transparent white -alpha on -density 1200 -filter Catrom -resize ${traySize}x${traySize} -quality 100 $trayPng
Write-Host "  ✅ tray-icon.png 生成"

# macOS 模板图标 (黑白, 透明) - 提供 @2x 版本
$macSizes = @("256x256", "512x512")
$macNames = @("tray-icon-macTemplate.png", "tray-icon-macTemplate@2x.png")
for ($i = 0; $i -lt $macSizes.Length; $i++) {
    $size = $macSizes[$i]
    $name = $macNames[$i]
    $outFile = Join-Path $outputDir $name
    Write-Host "  生成 $name ..."
    magick $traySvg -colorspace Gray -threshold 50% -background none -transparent white -alpha on -density 1200 -filter Catrom -resize $size -quality 100 $outFile
}
Write-Host "  ✅ macOS 模板图标生成 (可选用)"

# ================================================================
# 完成
# ================================================================
Write-Host "`n🎉 所有图标生成完毕！"
Write-Host "生成的文件位于: $outputDir"
Write-Host "  - icon.ico (含 $($mainSizes.Count) 种尺寸，Windows)"
Write-Host "  - icon.icns (macOS，需在 Mac 上生成)" 
Write-Host "  - icon.png (Linux 及备用)"
Write-Host "  - tray-icon.png (256x256，通用托盘)"
Write-Host "  - tray-icon-macTemplate.png / @2x (macOS 模板，可选)"
Write-Host "`n💡 提示："
Write-Host "  - 所有图标均为透明背景。"
Write-Host "  - 若 macOS 需使用模板，请将模板文件加入 extraResources，"
Write-Host "    并在主进程代码中根据平台加载对应文件或调用 setTemplateImage(true)。"