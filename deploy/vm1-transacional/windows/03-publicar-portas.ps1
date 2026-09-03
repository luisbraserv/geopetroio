# =====================================================================
# VM-1 - PASSO 3 de 3: expor o front do WSL2 para a rede
#
# Rode como Administrador, na sessao RDP da VM.
#
# O PROBLEMA QUE ESTE SCRIPT RESOLVE
#
# O WSL2 roda atras de um NAT proprio. Uma porta publicada pelo Docker
# dentro dele responde em 'localhost' NA PROPRIA VM e parece funcionar —
# mas nao responde para ninguem na rede. O usuario testa no servidor, ve
# a tela de login, e so descobre o problema quando alguem tenta acessar
# de fora. Por isso este passo e obrigatorio, nao opcional.
#
# Pior: o IP do WSL2 MUDA a cada reinicio. Um redirecionamento fixo para
# de funcionar no primeiro reboot. Dai a tarefa agendada no fim.
#
# A porta 80 fica com o IIS, que permanece no ar — o front sobe na 8090.
# =====================================================================

param(
    [int]$Porta = 8090,
    [string]$Distro = "Ubuntu",
    # Usado pela tarefa agendada no boot: refaz o redirecionamento em silencio.
    [switch]$Renovar
)

$ErrorActionPreference = "Stop"

function Passo($t) { if (-not $Renovar) { Write-Host "`n=== $t ===" -ForegroundColor Cyan } }
function Ok($t)    { if (-not $Renovar) { Write-Host "  OK   $t" -ForegroundColor Green } }

$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidade)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Este script precisa ser executado como Administrador."
}

# --- Descobrir o IP atual do WSL -------------------------------------

Passo "Descobrindo o IP do WSL"

# 'hostname -I' pode devolver varios enderecos; o primeiro e o da interface eth0.
$saida = (& wsl.exe -d $Distro -e hostname -I) -replace "`0", ""
$ipWsl = ($saida -split '\s+' | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1)

if (-not $ipWsl) {
    throw "Nao foi possivel obter o IP do WSL. A distro '$Distro' esta rodando? Tente: wsl -d $Distro -e true"
}
Ok "WSL em $ipWsl"

# --- Redirecionar a porta --------------------------------------------

Passo "Redirecionando a porta $Porta"

# Remove antes de adicionar: sem isto, o redirecionamento antigo (apontando para
# o IP anterior do WSL) permanece e o netsh recusa o novo.
& netsh interface portproxy delete v4tov4 listenport=$Porta listenaddress=0.0.0.0 2>&1 | Out-Null
& netsh interface portproxy add v4tov4 `
    listenport=$Porta listenaddress=0.0.0.0 `
    connectport=$Porta connectaddress=$ipWsl | Out-Null
Ok "0.0.0.0:$Porta -> ${ipWsl}:$Porta"

# --- Firewall ---------------------------------------------------------

$nomeRegra = "GeopetroIO Front (WSL) $Porta"
if (-not (Get-NetFirewallRule -DisplayName $nomeRegra -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $nomeRegra -Direction Inbound -Action Allow `
                        -Protocol TCP -LocalPort $Porta -Profile Any | Out-Null
    Ok "regra de firewall criada"
} else {
    Ok "regra de firewall ja existe"
}

if ($Renovar) { return }

# --- Tarefas agendadas ------------------------------------------------

Passo "Agendando a renovacao no boot"

$caminhoScript = $MyInvocation.MyCommand.Path

# Duas tarefas, porque sao dois problemas distintos:
#
# 1. O WSL nao sobe sozinho no boot. Sem uma sessao que o acorde, o Docker
#    la dentro nunca inicia — mesmo com 'restart: unless-stopped'.
# 2. O IP do WSL muda a cada boot, invalidando o portproxy.
#
# A ordem importa: acordar o WSL primeiro, so entao ler o IP novo.

$acoes = @(
    @{
        Nome = "GeopetroIO - Iniciar WSL no boot"
        Acao = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d $Distro -e true"
        Atraso = "PT30S"
    },
    @{
        Nome = "GeopetroIO - Renovar portproxy do WSL"
        Acao = New-ScheduledTaskAction -Execute "powershell.exe" `
               -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$caminhoScript`" -Porta $Porta -Distro $Distro -Renovar"
        Atraso = "PT90S"
    }
)

foreach ($item in $acoes) {
    Unregister-ScheduledTask -TaskName $item.Nome -Confirm:$false -ErrorAction SilentlyContinue

    $gatilho = New-ScheduledTaskTrigger -AtStartup
    $gatilho.Delay = $item.Atraso

    Register-ScheduledTask -TaskName $item.Nome `
        -Action $item.Acao -Trigger $gatilho `
        -User "SYSTEM" -RunLevel Highest `
        -Description "Deploy GeopetroIO VM-1. Ver deploy/vm1-transacional/windows/README.md" | Out-Null
    Ok "tarefa: $($item.Nome)"
}

# --- Resultado --------------------------------------------------------

Passo "Redirecionamentos ativos"
& netsh interface portproxy show v4tov4

$ips = Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }

Write-Host ""
Write-Host "PASSO 3 CONCLUIDO." -ForegroundColor Green
Write-Host "O front respondera em:"
foreach ($ip in $ips) { Write-Host "  http://$($ip.IPAddress):$Porta" }
Write-Host ""
Write-Host "A porta 80 continua com o IIS, intacta." -ForegroundColor Yellow
