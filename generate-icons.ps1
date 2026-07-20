# ================================================================
# generate-icons.ps1
# 描述：从 SVG 源文件生成 Electron 应用所需的所有图标
# 输入：resources/icon.svg（主图标）, resources/tray-icon.svg（托盘图标）
# 输出：resources/ 目录下的 icon.ico, icon.icns, icon.png,
#       tray-icon.png (256x256), tray-icon-macTemplate.png 及 @2x
# 依赖：ImageMagick 7（magick 命令）
# 作者：UI 优化版（含 -trim +repage 去白边）
# ================================================================

# -------- 1. 配置区域（可按需修改） --------
$mainSvg = "resources/icon.svg"          # 主图标源文件
$traySvg = "resources/tray-icon.svg"     # 托盘图标源文件
$outputDir = "resources"                 # 输出目录

# 主图标包含的尺寸（覆盖 Windows 常见需求）
$mainSizes = @(16, 24, 32, 40, 48, 64, 96, 128, 256, 512, 1024)

# 临时目录（用于存放各尺寸 PNG，最后自动删除）
$tempDir = "temp_icons"

# -------- 2. 检查 ImageMagick 是否安装 --------
try {
    $null = Get-Command "magick" -ErrorAction Stop
}
catch {
    Write-Error "❌ 未找到 ImageMagick。请从 https://imagemagick.org/script/download.php 下载安装。"
    Write-Host "安装时请务必勾选 'Install legacy utilities (e.g. convert)' 以确保 magick 命令可用。"
    exit 1
}

# -------- 3. 检查 SVG 源文件是否存在 --------
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

Write-Host "✅ 开始生成所有图标（已启用去白边 + 高清晰度）..."

# ================================================================
# 4. 生成主图标
# ================================================================
Write-Host "`n📌 生成主图标..."

# 创建临时目录
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# 循环生成各尺寸 PNG
foreach ($size in $mainSizes) {
    $pngFile = Join-Path $tempDir "icon_${size}x${size}.png"
    Write-Host "  生成 ${size}x${size} ..."
    # 关键优化：-trim +repage 自动裁剪多余透明边缘
    # -transparent white 将白色变为透明（适用于无白色图形的图标）
    # -alpha on 确保透明度通道开启
    # -density 1200 高密度渲染，保证矢量细节
    # -filter Catrom 高质量缩放滤镜（更锐利）
    # -resize 精确缩放到目标尺寸
    magick $mainSvg -background none -trim +repage -transparent white -alpha on -density 1200 -filter Catrom -resize ${size}x${size} -quality 100 $pngFile
}

# 生成 icon.png（最大尺寸，供 Linux 及备用）
Copy-Item (Join-Path $tempDir "icon_1024x1024.png") (Join-Path $outputDir "icon.png") -Force
Write-Host "  ✅ icon.png 生成 (1024x1024)"

# 生成 Windows .ico（包含所有尺寸，无损压缩）
Write-Host "  生成 icon.ico ..."
$icoInputs = @()
foreach ($size in $mainSizes) {
    $icoInputs += (Join-Path $tempDir "icon_${size}x${size}.png")
}
# 将所有 PNG 打包成一个 .ico，-define icon:auto-resize 自动适配，-compress None 无损耗
$icoArgs = $icoInputs + "-define", "icon:auto-resize", "-compress", "None", (Join-Path $outputDir "icon.ico")
magick $icoArgs
Write-Host "  ✅ icon.ico 生成 (包含 $($mainSizes.Count) 种尺寸)"

# 生成 macOS .icns（仅在 macOS 系统上执行）
if ($IsMacOS) {
    Write-Host "  生成 icon.icns ..."
    $iconsetDir = "icon.iconset"
    New-Item -ItemType Directory -Path $iconsetDir -Force | Out-Null
    # macOS 需要的标准尺寸映射（输出文件名 -> 源尺寸）
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
        $dst = Join-Path $iconsetDir $key
        Copy-Item $src $dst -Force
    }
    # 使用系统工具 iconutil 生成 .icns
    iconutil -c icns $iconsetDir -o (Join-Path $outputDir "icon.icns")
    Remove-Item -Recurse -Force $iconsetDir
    Write-Host "  ✅ icon.icns 生成"
}
else {
    Write-Host "  ⚠️ 非 macOS 系统，跳过 .icns 生成。如需，请在 Mac 上运行本脚本。"
}

# 清理临时目录（主图标所用）
Remove-Item -Recurse -Force $tempDir

# ================================================================
# 5. 生成托盘图标（高分辨率）
# ================================================================
Write-Host "`n📌 生成托盘图标..."

# 标准托盘图标 (Windows/Linux) - 256x256 确保高清
$traySize = 256
$trayPng = Join-Path $outputDir "tray-icon.png"
Write-Host "  生成 tray-icon.png (${traySize}x${traySize}) ..."
magick $traySvg -background none -trim +repage -transparent white -alpha on -density 1200 -filter Catrom -resize ${traySize}x${traySize} -quality 100 $trayPng
Write-Host "  ✅ tray-icon.png 生成"

# macOS 模板图标（黑白, 透明） - 提供 @2x 版本
# 注意：-colorspace Gray -threshold 50% 强制转为黑白（纯黑），符合 Apple 模板要求
$macSizes = @("256x256", "512x512")
$macNames = @("tray-icon-macTemplate.png", "tray-icon-macTemplate@2x.png")
for ($i = 0; $i -lt $macSizes.Length; $i++) {
    $size = $macSizes[$i]
    $name = $macNames[$i]
    $outFile = Join-Path $outputDir $name
    Write-Host "  生成 $name ..."
    magick $traySvg -colorspace Gray -threshold 50% -background none -trim +repage -transparent white -alpha on -density 1200 -filter Catrom -resize $size -quality 100 $outFile
}
Write-Host "  ✅ macOS 模板图标生成（可选，用于 setTemplateImage）"

# ================================================================
# 6. 完成
# ================================================================
Write-Host "`n🎉 所有图标生成完毕！"
Write-Host "生成的文件位于: $outputDir"
Write-Host "  - icon.ico (含 $($mainSizes.Count) 种尺寸，Windows)"
Write-Host "  - icon.icns (macOS，需在 Mac 上生成)" 
Write-Host "  - icon.png (Linux 及备用)"
Write-Host "  - tray-icon.png (256x256，通用托盘)"
Write-Host "  - tray-icon-macTemplate.png / @2x (macOS 模板，可选)"
Write-Host "`n💡 提示："
Write-Host "  - 所有图标已自动去除多余白边（-trim +repage），并保持透明背景。"
Write-Host "  - 若在 macOS 上使用模板图标，请在代码中调用 icon.setTemplateImage(true)。"
Write-Host "  - 若遇到证书错误，请设置环境变量 NODE_OPTIONS='--use-system-ca' 或 NODE_TLS_REJECT_UNAUTHORIZED=0（仅调试）。"