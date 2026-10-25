# optimize-images.ps1
# Compresses JPEG/PNG/JFIF images in the project folder using System.Drawing.
# WebP files are skipped (System.Drawing cannot encode WebP).
# Originals are copied to backup/ (folder structure preserved).
# Run: powershell -ExecutionPolicy Bypass -File optimize-images.ps1 -Start 0 -Count 40
param(
    [int]$Start = 0,
    [int]$Count = 40
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$ROOT = $PSScriptRoot
$BACKUP = Join-Path $ROOT 'backup'
$MAX_EDGE = 1920
$JPEG_QUALITY = 80

$exts = @('.jpg', '.jpeg', '.png', '.jfif')

function Get-Images($dir) {
    $result = @()
    foreach ($entry in Get-ChildItem -Path $dir -Force) {
        if ($entry.Name -in @('node_modules', 'backup')) { continue }
        if ($entry.PSIsContainer) {
            $result += Get-Images $entry.FullName
        } elseif ($exts -contains $entry.Extension.ToLower()) {
            $result += $entry.FullName
        }
    }
    return $result
}

function Get-JpegCodec {
    $codecs = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()
    return $codecs | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
}

function Save-Jpeg($bmp, $path) {
    $codec = Get-JpegCodec
    $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
        [System.Drawing.Imaging.Encoder]::Quality, [long]$JPEG_QUALITY)
    $bmp.Save($path, $codec, $encParams)
    $encParams.Dispose()
}

function Optimize-Image($file) {
    $rel = $file.Substring($ROOT.Length + 1)
    $backupFile = Join-Path $BACKUP $rel
    $dir = Split-Path $backupFile -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    if (-not (Test-Path $backupFile)) { Copy-Item $file $backupFile }

    # FromStream не блокирует файл, поэтому клонирование не требуется
    $stream = [System.IO.File]::OpenRead($file)
    $img = [System.Drawing.Image]::FromStream($stream)

    # Downscale very large images
    $w = $img.Width; $h = $img.Height
    if ($w -gt $MAX_EDGE -or $h -gt $MAX_EDGE) {
        $scale = [Math]::Min($MAX_EDGE / $w, $MAX_EDGE / $h)
        $nw = [int][Math]::Floor($w * $scale)
        $nh = [int][Math]::Floor($h * $scale)
        $nbmp = New-Object System.Drawing.Bitmap($nw, $nh)
        $g = [System.Drawing.Graphics]::FromImage($nbmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($img, 0, 0, $nw, $nh)
        $g.Dispose()
        $img.Dispose()
        $img = $nbmp
    }

    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    $tmp = $file + '.tmp'
    if (Test-Path $tmp) { Remove-Item $tmp -Force }

    if ($ext -eq '.png') {
        $img.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    } else {
        Save-Jpeg $img $tmp
    }
    $img.Dispose()
    $stream.Dispose()

    # Replace only if the result is smaller
    $origSize = (Get-Item $file).Length
    $tmpSize = (Get-Item $tmp).Length
    if ($tmpSize -lt $origSize) {
        Remove-Item $file -Force
        Move-Item $tmp $file
        Write-Host ("OK   {0}  ({1:N0} -> {2:N0} bytes)" -f $rel, $origSize, $tmpSize)
    } else {
        Remove-Item $tmp -Force
        Write-Host ("SKIP {0}  (no gain)" -f $rel)
    }
}

$files = Get-Images $ROOT
Write-Host ("Found images (jpg/png/jfif): {0}" -f $files.Count)
$end = [Math]::Min($Start + $Count, $files.Count)

# Собираем только ещё не обработанные файлы
$toProcess = @()
for ($i = $Start; $i -lt $end; $i++) {
    $f = $files[$i]
    $rel = $f.Substring($ROOT.Length + 1)
    $backupFile = Join-Path $BACKUP $rel
    if (-not (Test-Path $backupFile)) { $toProcess += $f }
}
Write-Host ("To process: {0}" -f $toProcess.Count)
if ($toProcess.Count -eq 0) { Write-Host "ALL DONE"; exit }

# Параллельная обработка (несколько потоков, чтобы уложиться в лимит времени)
$sync = [hashtable]::Synchronized(@{ ok = 0; fail = 0 })
$po = New-Object System.Threading.Tasks.ParallelOptions
$po.MaxDegreeOfParallelism = 16

$action = [System.Action[object]]{
    param($f)
    try {
        Optimize-Image $f
        $sync.ok++
    } catch {
        $sync.fail++
        Write-Host ("FAIL {0} - {1}" -f $f, $_.Exception.Message)
    }
}
[System.Threading.Tasks.Parallel]::ForEach([System.Collections.IEnumerable]$toProcess, $po, $action)

Write-Host ("Done. Compressed: {0}, errors: {1}. Originals in backup/" -f $sync.ok, $sync.fail)
