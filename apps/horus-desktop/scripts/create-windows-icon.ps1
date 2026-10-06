$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$source = Join-Path $root "src\main\resources\icons\logo.png"
$output = Join-Path $root "src\main\resources\icons\app.ico"
$sizes = @(256, 128, 64, 48, 32, 16)
$entries = @()

$image = [System.Drawing.Image]::FromFile($source)
try {
    foreach ($size in $sizes) {
        $bitmap = New-Object System.Drawing.Bitmap $size, $size
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($image, 0, 0, $size, $size)

        $stream = New-Object System.IO.MemoryStream
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $entries += ,@{
            Size = $size
            Bytes = $stream.ToArray()
        }

        $stream.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
} finally {
    $image.Dispose()
}

$file = [System.IO.File]::Create($output)
$writer = New-Object System.IO.BinaryWriter($file)
try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$entries.Count)

    $offset = 6 + (16 * $entries.Count)
    foreach ($entry in $entries) {
        $dimension = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
        $bytes = [byte[]]$entry.Bytes

        $writer.Write([byte]$dimension)
        $writer.Write([byte]$dimension)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$bytes.Length)
        $writer.Write([UInt32]$offset)

        $offset += $bytes.Length
    }

    foreach ($entry in $entries) {
        $writer.Write([byte[]]$entry.Bytes)
    }
} finally {
    $writer.Dispose()
    $file.Dispose()
}

Write-Host "Icone gerado em: $output"
