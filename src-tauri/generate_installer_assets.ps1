Add-Type -AssemblyName System.Drawing

$sidebarPath = "c:\Users\might\Downloads\odre\src-tauri\icons\nsis-sidebar.bmp"
$headerPath = "c:\Users\might\Downloads\odre\src-tauri\icons\nsis-header.bmp"
$png128Path = "c:\Users\might\Downloads\odre\src-tauri\icons\128x128.png"
$png32Path = "c:\Users\might\Downloads\odre\src-tauri\icons\32x32.png"

# Sidebar Image (164x314)
$sbBmp = New-Object System.Drawing.Bitmap 164, 314
$sbGraphics = [System.Drawing.Graphics]::FromImage($sbBmp)
$sbGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$sbGraphics.Clear([System.Drawing.Color]::FromArgb(255, 18, 18, 18))

if (Test-Path $png128Path) {
    $img = [System.Drawing.Image]::FromFile($png128Path)
    $x = [int]((164 - 128) / 2)
    $y = [int]((314 - 128) / 2 - 20)
    $sbGraphics.DrawImage($img, $x, $y, 128, 128)
    $img.Dispose()
}

$sbBmp.Save($sidebarPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$sbGraphics.Dispose()
$sbBmp.Dispose()

# Header Image (150x57)
$hdBmp = New-Object System.Drawing.Bitmap 150, 57
$hdGraphics = [System.Drawing.Graphics]::FromImage($hdBmp)
$hdGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$hdGraphics.Clear([System.Drawing.Color]::FromArgb(255, 18, 18, 18))

if (Test-Path $png32Path) {
    $img = [System.Drawing.Image]::FromFile($png32Path)
    $x = [int](150 - 32 - 12)
    $y = [int]((57 - 32) / 2)
    $hdGraphics.DrawImage($img, $x, $y, 32, 32)
    $img.Dispose()
}

$hdBmp.Save($headerPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$hdGraphics.Dispose()
$hdBmp.Dispose()

Write-Output "Images generated correctly."
