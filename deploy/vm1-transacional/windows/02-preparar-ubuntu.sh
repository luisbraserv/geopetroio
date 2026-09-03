#!/usr/bin/env bash
# =====================================================================
# VM-1 - PASSO 2 de 3: Docker Engine dentro do Ubuntu do WSL
#
# Rode como root, a partir do PowerShell da VM:
#   wsl -d Ubuntu -u root bash <caminho>/02-preparar-ubuntu.sh
#
# Instala o Docker Engine (docker-ce) do repositorio oficial — nao o
# docker.io do Ubuntu, que costuma estar varias versoes atras e nao traz
# o plugin 'compose v2' que o nosso docker-compose.yml usa.
#
# Idempotente: rodar de novo apenas reconfirma o estado.
# =====================================================================

set -euo pipefail

USUARIO_APP="${USUARIO_APP:-geopetro}"

passo() { printf '\n=== %s ===\n' "$1"; }
ok()    { printf '  OK   %s\n' "$1"; }

# --- Sanidade -------------------------------------------------------

passo "Verificando o ambiente"

[ "$(id -u)" -eq 0 ] || { echo "ERRO: rode como root (wsl -u root)."; exit 1; }
grep -qi microsoft /proc/version || echo "  AVISO: nao parece ser WSL, seguindo mesmo assim"

# O systemd e o que mantem o dockerd de pe entre reinicios do WSL. Sem ele o
# 'docker compose up -d' sobe, mas nada volta sozinho depois de um reboot.
if [ ! -d /run/systemd/system ]; then
    echo "ERRO: systemd nao esta ativo nesta distro."
    echo "Confirme 'systemd=true' em /etc/wsl.conf e rode 'wsl --shutdown' no Windows."
    exit 1
fi
ok "systemd ativo"

# --- Docker ----------------------------------------------------------

passo "Instalando o Docker Engine"

if command -v docker >/dev/null 2>&1; then
    ok "docker ja instalado: $(docker --version)"
else
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg

    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list

    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
                           docker-buildx-plugin docker-compose-plugin
    ok "docker instalado: $(docker --version)"
fi

systemctl enable --now docker
ok "servico docker habilitado no boot"

# --- Usuario da aplicacao --------------------------------------------

passo "Preparando o usuario '$USUARIO_APP'"

if id "$USUARIO_APP" >/dev/null 2>&1; then
    ok "usuario ja existe"
else
    # Sem senha: o acesso a esta VM e pelo RDP do Windows, e uma senha local
    # aqui seria mais um segredo para guardar sem ganho de seguranca.
    adduser --disabled-password --gecos "" "$USUARIO_APP"
    ok "usuario criado"
fi

usermod -aG docker "$USUARIO_APP"
ok "usuario no grupo docker"

# Torna-o o usuario padrao do 'wsl -d Ubuntu', para nao operar tudo como root.
if ! grep -q "^default=" /etc/wsl.conf 2>/dev/null; then
    printf '\n[user]\ndefault=%s\n' "$USUARIO_APP" >> /etc/wsl.conf
    ok "definido como usuario padrao da distro"
fi

# --- Verificacao -----------------------------------------------------

passo "Verificando"

docker run --rm hello-world >/dev/null 2>&1 \
    && ok "docker executa containers" \
    || { echo "ERRO: 'docker run hello-world' falhou."; exit 1; }

docker compose version >/dev/null 2>&1 \
    && ok "compose v2 disponivel: $(docker compose version --short)" \
    || { echo "ERRO: plugin compose ausente."; exit 1; }

printf '\nPASSO 2 CONCLUIDO.\n'
printf 'Proximo: copiar o projeto e rodar 03-publicar-portas.ps1 no PowerShell.\n'
