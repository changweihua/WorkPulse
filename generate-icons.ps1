# ================================================================
# generate-icons.ps1
# 功能：从 SVG 源文件生成 Electron 应用所需的所有图标
# 输入：resources/icon.svg（主图标）, resources/tray-icon.svg（托盘图标）
# 输出：
#   - resources/icon.ico（Windows，含 16~256 尺寸）
#   - resources/icon.icns（macOS，需在 Mac 上生成）
#   - resources/icon.png（Linux 及备用，1024x1024）
#   - resources/tray-icon.png + @Nx（托盘 base 16x16 + 各 DPI 变体，正方形等比）
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
    # 关键：-density 必须放在 SVG 输入文件之前，否则 SVG 先按默认 72DPI 栅格化为 256x256
    # 再被 -resize 放大，导致高分屏模糊。前置后先高密度矢量栅格化再降采样，边缘才锐利。
    # 关键2：-trim 后图形是宽扁的（显示器造型宽>高），直接 resize 保持比例会得到 1024x916
    # 这类非正方形图，违反 icon-replacement-guide.md 的 1024x1024 正方形规范，macOS 圆角会错位。
    # 先用 -extent 补成正方形画布（居中），再加 10% 边距缩放，保证每档都是正方形。
    magick -density 1200 $mainSvg -background none -trim +repage -transparent white -alpha on `
        -gravity center -extent "%[fx:max(w,h)]x%[fx:max(w,h)]" `
        -bordercolor none -border 10%x10% -filter Lanczos -resize ${size}x${size} -quality 100 $pngFile
}

# 生成 icon.png（最大尺寸）
Copy-Item (Join-Path $tempDir "icon_1024x1024.png") (Join-Path $outputDir "icon.png") -Force
Write-Host "  ✅ icon.png 生成 (1024x1024)"

# 生成 Windows .ico（BMP 格式，包含 16~256 尺寸）
# 关键：必须从「单张 1024 高清源图」配合明确的尺寸列表打包。
# 若把多张已缩放的 PNG 一起喂给 icon:auto-resize，ImageMagick 会选错源图反复缩放，
# 导致 ico 内各帧（尤其高分屏用的 256/128）二次插值而发虚。
Write-Host "  生成 icon.ico ..."
$icoSizeList = "256,192,128,96,64,48,40,32,24,16"
$icoSource = Join-Path $tempDir "icon_1024x1024.png"
magick $icoSource -define "icon:auto-resize=$icoSizeList" -define "icon:format=bmp" -compress None (Join-Path $outputDir "icon.ico")
Write-Host "  ✅ icon.ico 生成（包含 $($icoSizeList.Split(',').Count) 种尺寸，BMP 格式，源自 1024 高清图）"

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

# 关键：源 SVG 是横向三色柱状，viewBox 虽为 1024x1024，但图形包围盒本身非正方形。
# 直接 -resize NxN 会非等比压缩把圆形拉成椭圆。先把高清栅格 -trim 后补成正方形母图，
# 再从正方形母图等比降采样到各 DPI 尺寸，保证比例正确。
$trayMaster = Join-Path $tempDir "tray_master_1024.png"
Write-Host "  生成托盘正方形母图 (1024x1024) ..."
magick -density 1200 $traySvg -background none -trim +repage -transparent white -alpha on `
    -gravity center -extent "%[fx:max(w,h)]x%[fx:max(w,h)]" `
    -bordercolor none -border 10%x10% -filter Lanczos -resize 1024x1024 -quality 100 $trayMaster

# Electron 托盘在 Windows 是 16x16 逻辑像素。高分屏清晰的正确做法不是给大图让系统缩小，
# 而是提供 base + @Nx 变体，由 nativeImage.createFromPath 按每块屏幕实际 DPI 选原生像素，
# 避免小位图被放大重采样。后缀/像素取自 Electron 官方 HiDPI 解析表：
# 1x=16, 1.25x=20, 1.33x=21, 1.4x=22, 1.5x=24, 1.8x=29, 2x=32, 2.5x=40, 3x=48
$trayScales = @(
    @{ file = "tray-icon.png";       px = 16 },
    @{ file = "tray-icon@1.25x.png"; px = 20 },
    @{ file = "tray-icon@1.33x.png"; px = 21 },
    @{ file = "tray-icon@1.4x.png";  px = 22 },
    @{ file = "tray-icon@1.5x.png";  px = 24 },
    @{ file = "tray-icon@1.8x.png";  px = 29 },
    @{ file = "tray-icon@2x.png";    px = 32 },
    @{ file = "tray-icon@2.5x.png";  px = 40 },
    @{ file = "tray-icon@3x.png";    px = 48 }
)
foreach ($v in $trayScales) {
    magick $trayMaster -filter Lanczos -resize "$($v.px)x$($v.px)" -quality 100 (Join-Path $outputDir $v.file)
}
Write-Host "  ✅ 托盘 base + @Nx 变体生成（16~48px，共 $($trayScales.Count) 档）"

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
Write-Host "  - tray-icon.png + @1.25x/@1.33x/@1.4x/@1.5x/@1.8x/@2x/@2.5x/@3x（托盘 base 16x16 + 各 DPI 变体，正方形等比）"
Write-Host "`n📝 提示："
Write-Host "  - 托盘图走 Electron 原生 HiDPI：代码中用 nativeImage.createFromPath(base) 即可，切勿 resize 固定尺寸，否则高分屏发虚、非正方形还会变形。"
Write-Host "  - 若 Windows 图标仍模糊，请清除图标缓存："
Write-Host "       ie4uinit.exe -ClearIconCache"
Write-Host "       taskkill /f /im explorer.exe && start explorer.exe"
Write-Host "  - macOS 走代码中的 icon.setTemplateImage(true)，系统按 alpha 剪影渲染，无需单独模板文件。"