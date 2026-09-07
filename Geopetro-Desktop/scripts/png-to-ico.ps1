param(
    [Parameter(Mandatory=$true)][string]$PngPath,
    [Parameter(Mandatory=$true)][string]$IcoPath
)

$png = [System.IO.File]::ReadAllBytes($PngPath)
$size = $png.Length

# Para ICO com PNG embutido (>= 256px), largura/altura = 0 no directory entry
$wByte = 0
$hByte = 0

$ico = New-Object byte[] (22 + $size)

# ICONDIR header
$ico[0] = 0; $ico[1] = 0          # Reserved
$ico[2] = 1; $ico[3] = 0          # Type = ICO
$ico[4] = 1; $ico[5] = 0          # Count = 1

# ICONDIRENTRY
$ico[6] = $wByte                  # Width
$ico[7] = $hByte                  # Height
$ico[8] = 0                       # Color count
$ico[9] = 0                       # Reserved
$ico[10] = 1; $ico[11] = 0        # Planes
$ico[12] = 32; $ico[13] = 0       # BitCount (32)
[Array]::Copy([BitConverter]::GetBytes([uint32]$size), 0, $ico, 14, 4)  # SizeInBytes
[Array]::Copy([BitConverter]::GetBytes([uint32]22), 0, $ico, 18, 4)     # Offset
[Array]::Copy($png, 0, $ico, 22, $size)

[System.IO.File]::WriteAllBytes($IcoPath, $ico)
Write-Host "ICO criado: $IcoPath ($($ico.Length) bytes)"
