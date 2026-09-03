# VM-1 sobre WSL2 — roteiro de instalação

> Windows Server · Docker Engine dentro do Ubuntu no WSL2 · 2026-08-31

## Por que WSL2

A stack da VM-1 é toda de **containers Linux** (`mysql:8`, `nginx:alpine`, JRE). No Windows Server há
três caminhos, e dois não servem:

| Caminho | Veredito |
|---|---|
| Docker nativo do Windows | ❌ só roda containers **Windows** |
| Docker Desktop | ❌ exige **licença paga** em servidor |
| **WSL2 + Docker Engine** | ✅ kernel Linux real, sem licença, sem segunda VM |

Depende de **virtualização aninhada** no host — já confirmada como habilitada.

---

## Antes de começar

**A porta 80 é do IIS e continua sendo.** O front sobe na **8090**, conforme decidido. Nada do IIS é
tocado por este roteiro.

**A VM-2 ainda não existe.** Isso tem consequência concreta e é melhor saber antes:

- ✅ **Tempo Real funciona** — vem do CLP via WebSocket, não passa pela telemetria
- ❌ **Monitoramento histórico não funciona** — as séries vivem no InfluxDB da VM-2

O backend degrada com elegância (timeout de 5 s, sem travar a tela), mas o gráfico virá vazio. O
`.env` exige `MONITORAMENTO_BASE_URL` preenchido; use um placeholder até a VM-2 existir.

---

## Passo 0 · Levar o projeto para a VM

O `docker-compose.yml` **compila a partir do código-fonte** (`build: context:`), então precisa da raiz
do repositório, não só da pasta `deploy`.

Na sua máquina, gere o pacote:

```powershell
Compress-Archive -Path `
  "Backend-Sonda-Geopetro-IO", "Front-Sonda-Geopetro-IO", "deploy" `
  -DestinationPath "$env:TEMP\geopetro.zip" -Force
```

Copie pelo RDP (a unidade local aparece como `\tsclient\C` na VM) e extraia em `C:\geopetro`.

> **Não compile a partir de `/mnt/c`.** O acesso do WSL ao disco do Windows é ordens de grandeza mais
> lento e confunde permissões de arquivo. O passo 4 copia o projeto para dentro do WSL antes de subir.

---

## Passo 1 · WSL2 + Ubuntu

PowerShell **como Administrador**:

```powershell
cd C:\geopetro\deploy\vm1-transacional\windows
powershell -ExecutionPolicy Bypass -File .\01-instalar-wsl.ps1
```

⚠️ **Provavelmente vai pedir reboot** na primeira execução — as features de virtualização só valem
depois dele. Reinicie e **rode o mesmo script de novo**; ele é idempotente e continua de onde parou.

---

## Passo 2 · Docker dentro do Ubuntu

```powershell
wsl -d Ubuntu -u root bash /mnt/c/geopetro/deploy/vm1-transacional/windows/02-preparar-ubuntu.sh
```

Termina verificando de verdade: roda um container e confere o `compose v2`. Se passar, o Docker está
funcional — não é só "instalou sem erro".

---

## Passo 3 · Expor a porta para a rede

```powershell
powershell -ExecutionPolicy Bypass -File .\03-publicar-portas.ps1 -Porta 8090
```

**Este passo não é opcional**, e a razão merece atenção:

> O WSL2 fica atrás de um NAT próprio. Uma porta publicada pelo Docker responde em `localhost` **na
> própria VM** e parece funcionar — mas não responde para ninguém na rede. Você testaria no servidor,
> veria a tela de login, e só descobriria o problema quando alguém tentasse acessar de fora.

Pior: **o IP do WSL2 muda a cada reinício**. Por isso o script também cria duas tarefas agendadas —
uma acorda o WSL no boot (senão o Docker lá dentro nunca inicia, mesmo com `restart: unless-stopped`),
outra refaz o redirecionamento com o IP novo.

---

## Passo 4 · Subir a aplicação

```powershell
wsl -d Ubuntu
```

Já dentro do Ubuntu:

```bash
# Para dentro do sistema de arquivos do WSL — compila muito mais rápido que /mnt/c
cp -r /mnt/c/geopetro ~/geopetro
cd ~/geopetro/deploy/vm1-transacional

cp .env.example .env
nano .env
```

Preencha:

| Variável | Como gerar / o que pôr |
|---|---|
| `MYSQL_ROOT_PASSWORD` | `openssl rand -base64 24` |
| `DB_PASSWORD` | `openssl rand -base64 24` |
| `JWT_SECRET` | `openssl rand -base64 48` — a aplicação **não sobe** vazio, de propósito |
| `FRONT_PORT` | `8090` |
| `TELEMETRIA_HOST_IP` | placeholder (ex.: `127.0.0.1`) até a VM-2 existir |
| `MONITORAMENTO_BASE_URL` | placeholder (ex.: `http://127.0.0.1:8081`) |
| `CORS_ALLOWED_ORIGINS` | `http://<IP-DA-VM>:8090` |

Então:

```bash
docker compose up -d --build      # a primeira vez demora: compila backend e front
docker compose ps
docker compose logs -f backend
```

---

## Passo 5 · Verificar

```bash
# 1. Backend de pé
docker compose exec backend curl -s localhost:8080/actuator/health/readiness

# 2. Front respondendo
curl -s -o /dev/null -w '%{http_code}\n' localhost:80

# 3. Schema criado (deve listar 11 tabelas)
docker compose exec mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "USE geopetro_io; SHOW TABLES;"
```

E o teste que realmente importa — **de outra máquina da rede**, não da VM:

```
http://<IP-DA-VM>:8090
```

Se abrir aqui mas não de fora, o problema é o passo 3.

---

## Problemas conhecidos

| Sintoma | Causa | Solução |
|---|---|---|
| `wsl --install` falha com erro de virtualização | Virtualização aninhada desligada no host | Confirmar com a equipe de infra |
| Abre na VM, não abre na rede | `portproxy` ausente ou apontando para IP velho | `.\03-publicar-portas.ps1 -Renovar` |
| Após reboot, nada responde | WSL não acordou | Verificar as duas tarefas no Agendador |
| `docker: command not found` | Passo 2 não rodou, ou rodou sem systemd | `wsl --shutdown` e repetir o passo 2 |
| Backend reinicia em laço | `JWT_SECRET` vazio ou MySQL sem schema | `docker compose logs backend` |
| Gráfico de Monitoramento vazio | **Esperado** — VM-2 não existe | Sem ação até criar a VM-2 |

---

## O que fica pendente

1. **VM-2 (telemetria)** — sem ela, Monitoramento histórico não funciona
2. **Sem HTTPS** — tráfego em texto claro, inclusive as senhas do login
3. **Sem backup do MySQL** — o volume `mysql-data` não tem rotina nenhuma
4. **Sem TLS no MQTT** — pendência da VM-2

O item 2 merece uma decisão consciente: a tela de login trafega credenciais em HTTP. Aceitável em rede
interna fechada, ruim se a VM for exposta para fora.
