$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AppName = "Geopetro IO - Sonda"
$AppVersion = "0.1.0"
$ArtifactName = "Geopetro-Desktop-$AppVersion.jar"
$InputDir = Join-Path $ProjectRoot "target\jpackage-input"
$DistDir = Join-Path $ProjectRoot "target\dist\app-image"

function Resolve-Maven {
    $mvn = Get-Command mvn.cmd -ErrorAction SilentlyContinue
    if ($mvn) { return $mvn.Source }

    $bundled = Join-Path $env:USERPROFILE ".m2\wrapper\dists\apache-maven-3.9.12-bin\5nmfsn99br87k5d4ajlekdq10k\apache-maven-3.9.12\bin\mvn.cmd"
    if (Test-Path $bundled) { return $bundled }

    throw "Maven nao encontrado. Instale o Maven ou ajuste o PATH."
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

$mvn = Resolve-Maven
$jpackage = Resolve-JPackage

Push-Location $ProjectRoot
try {
    & $mvn package -DskipTests

    Remove-Item $InputDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $DistDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $InputDir | Out-Null
    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

    Copy-Item (Join-Path $ProjectRoot "target\$ArtifactName") (Join-Path $InputDir $ArtifactName) -Force

    & $jpackage `
        --type app-image `
        --name $AppName `
        --app-version $AppVersion `
        --vendor "Braserv" `
        --input $InputDir `
        --main-jar $ArtifactName `
        --dest $DistDir `
        --java-options "-Dfile.encoding=UTF-8"

    Write-Host "Aplicacao gerada em: $DistDir" -ForegroundColor Green
    Write-Host "Executavel: $(Join-Path $DistDir "$AppName\$AppName.exe")" -ForegroundColor Green
}
finally {
    Pop-Location
}