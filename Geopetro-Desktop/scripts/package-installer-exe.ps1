$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AppName = "Geopetro Desktop"
$BaseVersion = "0.1.0"

# Auto-incrementa o build number para permitir reinstalar sem desinstalar
# (WiX bloqueia reinstalacao de versao identica). Arquivo mantido fora do repo.
$BuildFile = Join-Path $ProjectRoot "target\build-number.txt"
$BuildNumber = 0
if (Test-Path $BuildFile) {
    $BuildNumber = [int](Get-Content $BuildFile -Raw).Trim()
}
$BuildNumber++
New-Item -ItemType Directory -Force -Path (Split-Path $BuildFile) | Out-Null
Set-Content -Path $BuildFile -Value $BuildNumber

$AppVersion = "$BaseVersion.$BuildNumber"
$ArtifactName = "Geopetro-Desktop-$BaseVersion.jar"
$InputDir = Join-Path $ProjectRoot "target\jpackage-input"
$DistDir = Join-Path $ProjectRoot "target\dist\installer"

Write-Host "Gerando instalador versao $AppVersion" -ForegroundColor Cyan

function Resolve-Maven {
    # O wrapper do proprio projeto vem primeiro: garante a mesma versao de Maven que compila o
    # projeto no dia a dia e nao depende de instalacao na maquina.
    $wrapper = Join-Path $ProjectRoot "mvnw.cmd"
    if (Test-Path $wrapper) { return $wrapper }

    $mvn = Get-Command mvn.cmd -ErrorAction SilentlyContinue
    if ($mvn) { return $mvn.Source }

    # Ultimo recurso: qualquer dist ja baixada pelo wrapper. Sem caminho fixo — a versao muda
    # com o tempo, e um caminho cravado quebra silenciosamente na proxima atualizacao.
    $dists = Join-Path $env:USERPROFILE ".m2\wrapper\dists"
    if (Test-Path $dists) {
        $encontrado = Get-ChildItem $dists -Recurse -Filter "mvn.cmd" -ErrorAction SilentlyContinue |
                      Sort-Object FullName -Descending |
                      Select-Object -First 1
        if ($encontrado) { return $encontrado.FullName }
    }

    throw "Maven nao encontrado. Use o mvnw.cmd do projeto ou instale o Maven no PATH."
}

function Resolve-JPackage {
    $jpackage = Get-Command jpackage.exe -ErrorAction SilentlyContinue
    if ($jpackage) { return $jpackage.Source }

    $candidates = @(
        "C:\Program Files\Java\jdk-25.0.2\bin\jpackage.exe",
        "C:\Program Files\Java\jdk-21\bin\jpackage.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }

    throw "jpackage.exe nao encontrado. Instale um JDK 21+ completo e ajuste o PATH."
}

function Assert-WixInstalled {
    $wix = Get-Command wix.exe -ErrorAction SilentlyContinue
    $candle = Get-Command candle.exe -ErrorAction SilentlyContinue
    $light = Get-Command light.exe -ErrorAction SilentlyContinue

    if ($wix -or ($candle -and $light)) { return }

    # Verifica instalacao padrao do WiX Toolset v3.x
    $wixCandidates = @(
        "C:\Program Files (x86)\WiX Toolset v3.14\bin",
        "C:\Program Files (x86)\WiX Toolset v3.11\bin",
        "C:\Program Files\WiX Toolset v3.14\bin",
        "C:\Program Files\WiX Toolset v3.11\bin"
    )

    foreach ($dir in $wixCandidates) {
        if (Test-Path (Join-Path $dir "candle.exe")) {
            $env:PATH = "$dir;$env:PATH"
            Write-Host "WiX Toolset encontrado em: $dir (adicionado ao PATH da sessao)"
            return
        }
    }

    throw "WiX Toolset nao encontrado. Para gerar instalador .exe com jpackage, instale o WiX Toolset e reabra o terminal. Exemplo: winget install WiXToolset.WiXToolset"
}

Assert-WixInstalled
$mvn = Resolve-Maven
$jpackage = Resolve-JPackage

Push-Location $ProjectRoot
try {
    & $mvn package -DskipTests

    Remove-Item $InputDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $DistDir -Recurse -Force -ErrorAction SilentlyContinue

    # Se o arquivo .exe ainda existir (locked pelo OneDrive), tenta renomear e re-deletar
    $oldExe = Join-Path $DistDir "$AppName-$AppVersion.exe"
    if (Test-Path $oldExe) {
        $tmpName = "$oldExe.old-$(Get-Random)"
        try {
            Rename-Item $oldExe $tmpName -Force -ErrorAction Stop
            Remove-Item $tmpName -Force -ErrorAction SilentlyContinue
        } catch {
            throw "Nao foi possivel remover o instalador antigo (provavelmente lockado pelo OneDrive): $oldExe. Pause a sincronizacao do OneDrive e tente novamente."
        }
    }

    New-Item -ItemType Directory -Force -Path $InputDir | Out-Null
    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

    Copy-Item (Join-Path $ProjectRoot "target\$ArtifactName") (Join-Path $InputDir $ArtifactName) -Force

    # Gera o logo.ico a partir do logo.png
    $pngSource = Join-Path $ProjectRoot "src\main\resources\icon\logo.png"
    $icoTarget = Join-Path $ProjectRoot "src\main\resources\icon\logo.ico"
    if (Test-Path $pngSource) {
        & (Join-Path $PSScriptRoot "png-to-ico.ps1") -PngPath $pngSource -IcoPath $icoTarget
    }

    $jpackageArgs = @(
        "--type", "exe",
        "--name", $AppName,
        "--app-version", $AppVersion,
        "--vendor", "Braserv",
        "--input", $InputDir,
        "--main-jar", $ArtifactName,
        "--main-class", "org.springframework.boot.loader.launch.JarLauncher",
        "--dest", $DistDir,
        "--win-menu",
        "--win-shortcut",
        "--win-dir-chooser",
        "--win-per-user-install",
        "--win-upgrade-uuid", "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "--add-modules", "ALL-MODULE-PATH",
        "--java-options", "-Dfile.encoding=UTF-8",
        "--java-options", "--enable-native-access=ALL-UNNAMED"
    )
    if (Test-Path $icoTarget) {
        $jpackageArgs += @("--icon", $icoTarget)
    }

    & $jpackage @jpackageArgs

    Write-Host "Instalador gerado em: $DistDir" -ForegroundColor Green
}
finally {
    Pop-Location
}