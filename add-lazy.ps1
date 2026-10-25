# add-lazy.ps1
# Adds loading="lazy" decoding="async" to every <img> in index.html,
# except the first-screen hero background image.
# Run: powershell -ExecutionPolicy Bypass -File add-lazy.ps1
$ErrorActionPreference = 'Stop'
$file = Join-Path $PSScriptRoot 'index.html'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Regex handles quotes inside attributes (e.g. onerror with nested tags)
$pattern = '<img\b(?:"[^"]*"|''[^'']*''|[^''">])*>'
$count = 0

$new = [regex]::Replace($content, $pattern, {
    param($m)
    $tag = $m.Value
    if ($tag -match 'loading\s*=') { return $tag }        # already has loading
    if ($tag -match 'blur-\[1px\]') { return $tag }       # hero bg (first screen) - keep eager
    $script:count++
    return $tag.Substring(0, $tag.Length - 1) + ' loading="lazy" decoding="async">'
})

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($file, $new, $utf8NoBom)
Write-Host ("Added loading=""lazy"" to {0} images." -f $count)
