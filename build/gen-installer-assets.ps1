# Generate NSIS Installer Assets for WorkPulse
# Brand colors from app icon: dark navy, cyan, light blue, pink, red

Add-Type -AssemblyName System.Drawing

# Helper: FillRoundedRectangle
function FillRoundedRect([System.Drawing.Graphics]$gfx, [System.Drawing.Brush]$brush, [int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $r * 2, $r * 2, 180, 90)
    $path.AddArc($x + $w - $r * 2, $y, $r * 2, $r * 2, 270, 90)
    $path.AddArc($x + $w - $r * 2, $y + $h - $r * 2, $r * 2, $r * 2, 0, 90)
    $path.AddArc($x, $y + $h - $r * 2, $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()
    $gfx.FillPath($brush, $path)
    $path.Dispose()
}

$buildDir = "D:\Github\WorkPulse\build"

# Brand colors
$navy = [System.Drawing.Color]::FromArgb(26, 31, 54)       # #1A1F36
$navyLight = [System.Drawing.Color]::FromArgb(40, 48, 78)  # #28304E
$navyMid = [System.Drawing.Color]::FromArgb(33, 40, 66)    # #212842
$cyan = [System.Drawing.Color]::FromArgb(0, 212, 255)      # #00D4FF
$lightBlue = [System.Drawing.Color]::FromArgb(125, 211, 252) # #7DD3FC
$pink = [System.Drawing.Color]::FromArgb(252, 165, 165)    # #FCA5A5
$red = [System.Drawing.Color]::FromArgb(239, 68, 68)       # #EF4444
$white = [System.Drawing.Color]::FromArgb(255, 255, 255)
$gray = [System.Drawing.Color]::FromArgb(160, 165, 180)    # #A0A5B4
$grayLight = [System.Drawing.Color]::FromArgb(200, 205, 215)

# Fonts (CJK-safe)
$fontEn = "Segoe UI"
$fontCJK = "Microsoft YaHei UI"

# ============================================================
# 1. installerSidebar.bmp (164×314) - Welcome/Finish page left panel
# ============================================================
$bmp = New-Object System.Drawing.Bitmap(164, 314, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# Background gradient: dark navy
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(0, 314)),
    $navy,
    $navyMid
)
$g.FillRectangle($brush, 0, 0, 164, 314)

# Draw subtle monitor silhouette
$monitorBrush = New-Object System.Drawing.SolidBrush($navyLight)
FillRoundedRect $g $monitorBrush 24 60 116 85 8

# Monitor screen (darker)
$screenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, 25, 45))
FillRoundedRect $g $screenBrush 30 66 104 65 4

# Monitor stand
$g.FillRectangle($monitorBrush, 62, 145, 40, 8)
FillRoundedRect $g $monitorBrush 50 153 64 6 3

# Draw the 4 colored dots on the "taskbar"
$dotY = 95
$dotSize = 10
$dotSpacing = 22
$startX = 38

$g.FillEllipse((New-Object System.Drawing.SolidBrush($cyan)), $startX, $dotY, $dotSize, $dotSize)
$g.FillEllipse((New-Object System.Drawing.SolidBrush($lightBlue)), $startX + $dotSpacing, $dotY, $dotSize, $dotSize)
$g.FillEllipse((New-Object System.Drawing.SolidBrush($pink)), $startX + $dotSpacing * 2, $dotY, $dotSize, $dotSize)
$g.FillEllipse((New-Object System.Drawing.SolidBrush($red)), $startX + $dotSpacing * 3, $dotY, $dotSize, $dotSize)

# Taskbar line
$g.FillRectangle((New-Object System.Drawing.SolidBrush($gray)), 34, 108, 96, 2)

# "WorkPulse" title text
$titleFont = New-Object System.Drawing.Font($fontEn, 14, [System.Drawing.FontStyle]::Bold)
$titleBrush = New-Object System.Drawing.SolidBrush($white)
$titleSize = $g.MeasureString("WorkPulse", $titleFont)
$titleX = (164 - $titleSize.Width) / 2
$g.DrawString("WorkPulse", $titleFont, $titleBrush, $titleX, 185)

# Tagline
$tagFont = New-Object System.Drawing.Font($fontCJK, 8)
$tagBrush = New-Object System.Drawing.SolidBrush($gray)
$tagSize = $g.MeasureString("工作脉搏 · 高效协同", $tagFont)
$tagX = (164 - $tagSize.Width) / 2
$g.DrawString("工作脉搏 · 高效协同", $tagFont, $tagBrush, $tagX, 210)

# Version placeholder
$verFont = New-Object System.Drawing.Font($fontEn, 7)
$verBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 105, 120))
$g.DrawString("v0.1.9", $verFont, $verBrush, 70, 230)

# Decorative dots at bottom
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, $cyan.R, $cyan.G, $cyan.B))), 20, 270, 6, 6)
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, $lightBlue.R, $lightBlue.G, $lightBlue.B))), 35, 275, 4, 4)
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, $pink.R, $pink.G, $pink.B))), 125, 268, 5, 5)
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, $red.R, $red.G, $red.B))), 140, 278, 3, 3)

$bmp.Save("$buildDir\installerSidebar.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose()
$bmp.Dispose()
Write-Output "installerSidebar.bmp done"

# ============================================================
# 2. installerHeader.bmp (150×57) - Top banner
# ============================================================
$bmp2 = New-Object System.Drawing.Bitmap(150, 57, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Background gradient
$brush2 = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(150, 0)),
    $navy,
    $navyLight
)
$g2.FillRectangle($brush2, 0, 0, 150, 57)

# Small icon: 4 dots
$dotY2 = 20
$dotSize2 = 6
$dotSpacing2 = 12
$startX2 = 14

$g2.FillEllipse((New-Object System.Drawing.SolidBrush($cyan)), $startX2, $dotY2, $dotSize2, $dotSize2)
$g2.FillEllipse((New-Object System.Drawing.SolidBrush($lightBlue)), $startX2 + $dotSpacing2, $dotY2, $dotSize2, $dotSize2)
$g2.FillEllipse((New-Object System.Drawing.SolidBrush($pink)), $startX2 + $dotSpacing2 * 2, $dotY2, $dotSize2, $dotSize2)
$g2.FillEllipse((New-Object System.Drawing.SolidBrush($red)), $startX2 + $dotSpacing2 * 3, $dotY2, $dotSize2, $dotSize2)

# "WorkPulse" text
$headerFont = New-Object System.Drawing.Font($fontEn, 11, [System.Drawing.FontStyle]::Bold)
$headerBrush = New-Object System.Drawing.SolidBrush($white)
$g2.DrawString("WorkPulse", $headerFont, $headerBrush, 70, 18)

# Subtitle
$subFont = New-Object System.Drawing.Font($fontCJK, 7)
$subBrush = New-Object System.Drawing.SolidBrush($gray)
$g2.DrawString("安装向导", $subFont, $subBrush, 70, 35)

$bmp2.Save("$buildDir\installerHeader.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
$g2.Dispose()
$bmp2.Dispose()
Write-Output "installerHeader.bmp done"

# ============================================================
# 3. uninstallerSidebar.bmp (164×314) - Uninstaller sidebar
# ============================================================
$bmp3 = New-Object System.Drawing.Bitmap(164, 314, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g3 = [System.Drawing.Graphics]::FromImage($bmp3)
$g3.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Background: slightly different tone (warmer gray-navy for uninstall)
$brush3 = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(0, 314)),
    [System.Drawing.Color]::FromArgb(35, 40, 55),
    [System.Drawing.Color]::FromArgb(50, 55, 70)
)
$g3.FillRectangle($brush3, 0, 0, 164, 314)

# Monitor silhouette (same)
FillRoundedRect $g3 $monitorBrush 24 60 116 85 8
FillRoundedRect $g3 $screenBrush 30 66 104 65 4
$g3.FillRectangle($monitorBrush, 62, 145, 40, 8)
FillRoundedRect $g3 $monitorBrush 50 153 64 6 3

# 4 dots
$g3.FillEllipse((New-Object System.Drawing.SolidBrush($cyan)), $startX, $dotY, $dotSize, $dotSize)
$g3.FillEllipse((New-Object System.Drawing.SolidBrush($lightBlue)), $startX + $dotSpacing, $dotY, $dotSize, $dotSize)
$g3.FillEllipse((New-Object System.Drawing.SolidBrush($pink)), $startX + $dotSpacing * 2, $dotY, $dotSize, $dotSize)
$g3.FillEllipse((New-Object System.Drawing.SolidBrush($red)), $startX + $dotSpacing * 3, $dotY, $dotSize, $dotSize)
$g3.FillRectangle((New-Object System.Drawing.SolidBrush($gray)), 34, 108, 96, 2)

# "WorkPulse" title
$g3.DrawString("WorkPulse", $titleFont, $titleBrush, $titleX, 185)

# Uninstall tagline
$g3.DrawString("卸载向导", $tagFont, $tagBrush, 62, 210)

# Decorative dots
$g3.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, $cyan.R, $cyan.G, $cyan.B))), 20, 270, 6, 6)
$g3.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, $lightBlue.R, $lightBlue.G, $lightBlue.B))), 35, 275, 4, 4)
$g3.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, $pink.R, $pink.G, $pink.B))), 125, 268, 5, 5)
$g3.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, $red.R, $red.G, $red.B))), 140, 278, 3, 3)

$bmp3.Save("$buildDir\uninstallerSidebar.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
$g3.Dispose()
$bmp3.Dispose()
Write-Output "uninstallerSidebar.bmp done"

# Cleanup
$brush.Dispose()
$brush2.Dispose()
$brush3.Dispose()
$monitorBrush.Dispose()
$screenBrush.Dispose()
$titleFont.Dispose()
$titleBrush.Dispose()
$tagFont.Dispose()
$tagBrush.Dispose()
$verFont.Dispose()
$verBrush.Dispose()
$headerFont.Dispose()
$headerBrush.Dispose()
$subFont.Dispose()
$subBrush.Dispose()

Write-Output "All installer assets generated in $buildDir"
