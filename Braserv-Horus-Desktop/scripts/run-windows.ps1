$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$mainClass = "com.example.braservhorusdesktop.Launcher"
$devBuildDir = Join-Path $env:LOCALAPPDATA "GeopetroIO\dev-build"

$processosAnteriores = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -match '^java(w)?\.exe$' -and
        $_.CommandLine -like "*$mainClass*"
    }

foreach ($processo in $processosAnteriores) {
    Write-Host "Encerrando execucao anterior do Horus (PID $($processo.ProcessId))..."
    Stop-Process -Id $processo.ProcessId -Force -ErrorAction SilentlyContinue
}

if ($processosAnteriores) {
    Start-Sleep -Milliseconds 500
}

New-Item -ItemType Directory -Force -Path $devBuildDir | Out-Null

Write-Host "Compilando e iniciando a versao atual do Horus..."
Write-Host "Build de desenvolvimento: $devBuildDir"

Push-Location $projectRoot
try {
    & .\gradlew.bat run `
        --no-daemon `
        --rerun-tasks `
        "-PbuildDir=$devBuildDir"

    if ($LASTEXITCODE -ne 0) {
        throw "A execucao do Horus falhou com codigo $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
