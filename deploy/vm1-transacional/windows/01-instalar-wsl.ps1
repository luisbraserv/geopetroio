# =====================================================================
# VM-1 - PASSO 1 de 3: instalar WSL2 + Ubuntu no Windows Server
#
# Rode como Administrador, na sessao RDP da VM.
#
# Por que WSL2 e nao Docker Desktop: em Windows Server o Docker Desktop
# exige licenca paga, e o Docker nativo do Windows so roda containers
# Windows — nossa stack (mysql:8, nginx:alpine) e Linux. WSL2 da o kernel
# Linux sem licenca e sem segunda VM.
#
# O script e idempotente: pode ser rodado de novo depois do reboot.
# =====================================================================

$ErrorActionPreference = "Stop"

function Passo($texto) { Write-Host "`n=== $texto ===" -ForegroundColor Cyan }
function Ok($texto)    { Write-Host "  OK   $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "  AVISO $texto" -ForegroundColor Yellow }

# --- Pre-requisitos -------------------------------------------------

Passo "Verificando pre-requisitos"

$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidade)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Este script precisa ser executado como Administrador."
}
Ok "sessao com privilegio de Administrador"

$so = Get-CimInstance Win32_OperatingSystem
$build = [int]$so.BuildNumber
Write-Host "  SO: $($so.Caption) (build $build)"

# WSL2 exige build 18362+. O 'wsl --install' automatico so existe do 20348
# (Server 2022) em diante; antes disso e preciso habilitar tudo na mao.
if ($build -lt 18362) {
    throw "Build $build nao suporta WSL2. Minimo: 18362. Atualize o Windows Server."
}
$instalacaoAutomatica = $build -ge 20348
if (-not $instalacaoAutomatica) {
    Aviso "build < 20348: usando o caminho manual (habilitar features + kernel avulso)"
}

# Sem virtualizacao exposta ao convidado o WSL2 nao sobe. Como esta VM e
# aninhada, isto depende do host — falhar aqui, com mensagem clara, e melhor
# que falhar dentro do 'wsl --install' com erro opaco.
$virtualizacao = (Get-CimInstance Win32_Processor | Select-Object -First 1).VirtualizationFirmwareEnabled
$hypervisorPresente = $so.Caption -and (Get-CimInstance Win32_ComputerSystem).HypervisorPresent
if (-not ($virtualizacao -or $hypervisorPresente)) {
    Aviso "a CPU nao reporta virtualizacao habilitada."
    Aviso "Se o 'wsl --install' falhar, confirme a virtualizacao aninhada no host da VM."
} else {
    Ok "virtualizacao disponivel"
}

# --- Habilitar as features ------------------------------------------

Passo "Habilitando as features do Windows"

$precisaReiniciar = $false
foreach ($feature in @("Microsoft-Windows-Subsystem-Linux", "VirtualMachinePlatform")) {
    $estado = Get-WindowsOptionalFeature -Online -FeatureName $feature
    if ($estado.State -eq "Enabled") {
        Ok "$feature ja habilitada"
    } else {
        Write-Host "  habilitando $feature..."
        $r = Enable-WindowsOptionalFeature -Online -FeatureName $feature -NoRestart
        if ($r.RestartNeeded) { $precisaReiniciar = $true }
        Ok "$feature habilitada"
    }
}

if ($precisaReiniciar) {
    Write-Host ""
    Write-Host "REINICIE A VM AGORA e rode este script novamente." -ForegroundColor Yellow
    Write-Host "As features de virtualizacao so passam a valer depois do reboot."
    Write-Host "  Restart-Computer -Force"
    exit 0
}

# --- Instalar o WSL --------------------------------------------------

Passo "Instalando o WSL"

$wslPresente = $null -ne (Get-Command wsl.exe -ErrorAction SilentlyContinue)
if ($instalacaoAutomatica) {
    # --no-launch evita o prompt interativo de criacao de usuario, que travaria
    # o script esperando teclado. O usuario e criado no passo 2.
    Write-Host "  wsl --install --no-launch ..."
    & wsl.exe --install --no-distribution --no-launch 2>&1 | Write-Host
    & wsl.exe --update 2>&1 | Write-Host
} else {
    if (-not $wslPresente) {
        $kernel = Join-Path $env:TEMP "wsl_update_x64.msi"
        Write-Host "  baixando o kernel do WSL2..."
        Invoke-WebRequest -Uri "https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi" `
                          -OutFile $kernel -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i", "`"$kernel`"", "/quiet", "/norestart" -Wait
        Ok "kernel do WSL2 instalado"
    }
}

& wsl.exe --set-default-version 2 2>&1 | Write-Host
Ok "WSL2 definido como versao padrao"

# --- Instalar o Ubuntu -----------------------------------------------

Passo "Instalando o Ubuntu"

$distros = (& wsl.exe --list --quiet) -replace "`0", "" -split "`r?`n" | Where-Object { $_.Trim() }
if ($distros -match "Ubuntu") {
    Ok "Ubuntu ja instalado"
} else {
    Write-Host "  baixando e instalando (pode levar alguns minutos)..."
    & wsl.exe --install -d Ubuntu --no-launch 2>&1 | Write-Host
    Ok "Ubuntu instalado"
}

# --- Configurar a distro ---------------------------------------------

Passo "Configurando o Ubuntu"

# systemd e necessario para o Docker subir sozinho: sem ele, o dockerd
# precisaria ser iniciado na mao a cada boot do WSL.
$wslConf = @"
[boot]
systemd=true

[interop]
appendWindowsPath=false
"@
$wslConfLinux = $wslConf -replace "`r`n", "`n"
$temp = Join-Path $env:TEMP "wsl.conf"
[IO.File]::WriteAllText($temp, $wslConfLinux)

& wsl.exe -d Ubuntu -u root -e cp "/mnt/c$($temp.Substring(2).Replace('\','/'))" /etc/wsl.conf
Ok "/etc/wsl.conf com systemd habilitado"

& wsl.exe --terminate Ubuntu 2>&1 | Out-Null
Ok "Ubuntu reiniciado para aplicar o systemd"

Write-Host ""
Write-Host "PASSO 1 CONCLUIDO." -ForegroundColor Green
Write-Host "Proximo: 02-preparar-ubuntu.sh"
Write-Host "  wsl -d Ubuntu -u root bash /mnt/c/geopetro/deploy/vm1-transacional/windows/02-preparar-ubuntu.sh"
