param(
    [string]$AppName = "",
    [string]$AppVersion = ""   # vazio = gera versao automatica sempre crescente
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AppName)) {
    $AppName = "GeopetroIO - Cimenta$([char]0x00E7)$([char]0x00E3)o"
}

# UpgradeCode FIXO: e o mesmo da instalacao atual. Mantendo-o constante entre
# builds, o Windows Installer reconhece cada novo instalador como upgrade do
# produto ja instalado e o substitui (major upgrade), sem instalar lado a lado.
# NUNCA altere este GUID, senao os instaladores deixam de se substituir.
$UpgradeUuid = "BDFC9E0C-0A41-3769-B902-F526EA8271FC"

# Versao automatica e sempre crescente, dentro dos limites do MSI
# (minor <= 255, build <= 65535). Garante que todo novo instalador tenha
# versao MAIOR que a instalada, disparando a substituicao automatica.
#   minor = meses decorridos desde jan/2025
#   build = posicao do minuto dentro do mes (monotonica no mes)
if ([string]::IsNullOrWhiteSpace($AppVersion)) {
    $now = Get-Date
    $minor = ($now.Year - 2025) * 12 + ($now.Month - 1)
    $build = ($now.Day - 1) * 1440 + $now.Hour * 60 + $now.Minute
    $AppVersion = "1.$minor.$build"
}
Write-Host "Versao do instalador: $AppVersion (upgrade-uuid $UpgradeUuid)"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$installerDir = Join-Path $root "build\installer"
$stagingRoot = Join-Path $env:TEMP ("horus-package-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
$gradleBuildDir = Join-Path $stagingRoot "gradle-build"
$installDist = Join-Path $gradleBuildDir "install\Braserv-Horus-Desktop"
$inputDir = Join-Path $installDist "lib"
$stagingInstallerDir = Join-Path $stagingRoot "installer"
$tempDir = Join-Path $stagingRoot "jpackage"
$iconPath = Join-Path $root "src\main\resources\icons\app.ico"
$mainJar = "Braserv-Horus-Desktop-0.0.1-SNAPSHOT.jar"
$mainClass = "com.example.braservhorusdesktop.Launcher"

$jpackageCandidates = @(
    (Join-Path $env:USERPROFILE ".jdks\ms-21.0.10\bin\jpackage.exe"),
    (Join-Path $env:USERPROFILE ".jdks\openjdk-25.0.2\bin\jpackage.exe"),
    "C:\Program Files\Java\jdk-25.0.2\bin\jpackage.exe",
    "jpackage.exe"
)

$jpackage = $jpackageCandidates | Where-Object {
    if ($_ -eq "jpackage.exe") {
        Get-Command $_ -ErrorAction SilentlyContinue
    } else {
        Test-Path $_
    }
} | Select-Object -First 1

if (-not $jpackage) {
    throw "jpackage.exe nao encontrado. Instale um JDK 21+ ou adicione jpackage ao PATH."
}

Push-Location $root
try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\create-windows-icon.ps1")
    .\gradlew.bat installDist "-PbuildDir=$gradleBuildDir"
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle installDist falhou com codigo $LASTEXITCODE."
    }

    $rootPath = (Resolve-Path $root).Path
    if (Test-Path $installerDir) {
        $resolved = (Resolve-Path $installerDir).Path
        if (-not $resolved.StartsWith($rootPath)) {
            throw "Caminho fora do projeto bloqueado: $resolved"
        }
    } else {
        New-Item -ItemType Directory -Force -Path $installerDir | Out-Null
    }

    New-Item -ItemType Directory -Force -Path $stagingInstallerDir | Out-Null
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

    & $jpackage `
        --type exe `
        --name $AppName `
        --app-version $AppVersion `
        --win-upgrade-uuid $UpgradeUuid `
        --vendor "GeopetroIO" `
        --icon $iconPath `
        --input $inputDir `
        --main-jar $mainJar `
        --main-class $mainClass `
        --dest $stagingInstallerDir `
        --temp $tempDir `
        --win-per-user-install `
        --win-dir-chooser `
        --win-menu `
        --win-shortcut

    Copy-Item -Path (Join-Path $stagingInstallerDir "*") -Destination $installerDir -Force
    Write-Host "Instalador gerado em: $installerDir"
} finally {
    Pop-Location
}
