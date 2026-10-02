# VM única — produção

> Toda a pilha do GeopetroIO numa máquina, atrás de `geopetro.braservpetroleo.com.br` · Docker · 2026-10-02

O ambiente de desenvolvimento (`start-dev.cmd`, `stop-dev.cmd`, `deploy/dev/`) não muda e não deve ser
usado aqui. As pastas `deploy/vm1-transacional` e `deploy/vm2-telemetria` continuam valendo para a
topologia em duas VMs; esta pasta junta as duas.

## Topologia

```text
 navegador ─┐                                ┌─ /            SPA Angular
 Desktop  ──┼─ HTTPS 443 ─► caddy ─► front ──┼─ /api, /ws    backend ──► mysql
 da sonda   │  (TLS, Let's Encrypt)  (nginx) └─ /telemetria  telemetria ──► influxdb
            │                                                    ▲
            └─ MQTT 1883 ─► mosquitto ───────────────────────────┘
```

| Porta no host | Serviço | Quem acessa |
|---|---|---|
| 80, 443 | caddy | internet (usuários, Desktops das sondas, Let's Encrypt) |
| 1883 | mosquitto | Desktops das sondas |

MySQL, InfluxDB, backend e telemetria **não** publicam porta no host: só existem na rede interna do
compose. O front é compilado com a configuração `k8s` (caminhos relativos), então SPA, API, WebSocket e
telemetria saem do mesmo domínio, sem CORS.

| Arquivo | Papel |
|---|---|
| `docker-compose.yml` | Os sete serviços |
| `.env.example` | Variáveis; copie para `.env` (não versionado) |
| `caddy/Caddyfile` | TLS e redirecionamento HTTP → HTTPS |
| `mosquitto/mosquitto.conf` | Broker com autenticação obrigatória (SEC-009) |
| `mosquitto/passwd` | Gerado na VM (passo 4); não versionado |
| `backup.sh` | Backup diário de MySQL, InfluxDB e chave SMTP |

---

## Pré-requisitos

- **Linux** (Ubuntu 22.04/24.04 recomendado) com Docker Engine e o plugin `docker compose` v2. Em
  **Windows Server**, o Docker roda dentro do WSL2: use os scripts de
  [`deploy/vm1-transacional/windows`](../vm1-transacional/windows/README.md) e publique as portas 80, 443
  e 1883 (o `03-publicar-portas.ps1` publica uma porta por execução). Se o IIS ocupa a 80/443, o
  Let's Encrypt não funciona sem liberar essas portas.
- **8 GB de RAM** ou mais (o build do Angular e do Maven acontece na VM; depois rodam duas JVMs, MySQL e
  InfluxDB) e **40 GB de disco** livres.
- **DNS:** registro A de `geopetro.braservpetroleo.com.br` apontando para o IP público da VM.
- **Rede:** 80 e 443 abertas para a internet (o Let's Encrypt valida pela 80); 1883 aberta para as sondas.
- Acesso ao repositório Git a partir da VM.

---

## Passo 1 · Código

```bash
git clone <url-do-repositorio> ~/geopetroio
cd ~/geopetroio
git checkout <branch-de-producao>
cd deploy/vm-unica
```

Em WSL, clone dentro do Linux (`~`), não em `/mnt/c`: o build fica ordens de grandeza mais lento.

## Passo 2 · `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Preencha `ACME_EMAIL` e gere cada segredo na própria VM com o comando indicado acima da variável
(`openssl rand ...`). `DOMINIO` já vem com `geopetro.braservpetroleo.com.br`.

## Passo 3 · Conferir DNS e portas antes de subir

```bash
getent hosts geopetro.braservpetroleo.com.br     # deve dar o IP público da VM
curl -s https://ifconfig.me; echo                 # IP público desta máquina
sudo ss -ltnp | grep -E ':(80|443|1883)\s'        # nada deve estar escutando
```

Se a 80/443 já estiver ocupada (outro nginx, Apache, IIS), resolva antes. Se o domínio não for
alcançável da internet, o Let's Encrypt falha: use o certificado da empresa (comentário no `Caddyfile`).

## Passo 4 · Senha do broker MQTT

O broker não sobe sem este arquivo:

```bash
set -a; . ./.env; set +a
touch mosquitto/passwd
docker run --rm -v "$PWD/mosquitto:/m" eclipse-mosquitto:2 \
  mosquitto_passwd -b /m/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
sudo chown 1883:1883 mosquitto/passwd && sudo chmod 600 mosquitto/passwd
```

## Passo 5 · Banco de dados

**Não há criação automática de usuário.** Uma base vazia sobe com o schema completo (o Flyway cria tudo
no startup do backend), mas sem nenhum login. Escolha um caminho **antes** de subir o backend.

### 5A · Importar o banco existente (recomendado)

Gere o dump na máquina de origem:

```bash
mysqldump -u<usuario> -p --single-transaction --routines --triggers --databases geopetro_io > geopetro_io.sql
```

Na VM, suba só o MySQL e importe:

```bash
docker compose up -d mysql
docker compose ps mysql        # espere "healthy"
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < geopetro_io.sql
```

O dump precisa ser da base `geopetro_io` (o `DB_NAME` do `.env`): é nela que o usuário da aplicação
recebe acesso quando o container do MySQL é criado.

Bases antigas, com `utf8mb4_unicode_ci` ou sem histórico do Flyway, são aceitas: o backend aplica as
migrations pendentes na primeira subida. Leia antes os avisos de [`deploy/README.md`](../README.md#o-schema-do-banco)
(a `V2026.09.06.2` descarta vínculos regionais).

### 5B · Base nova e primeiro administrador

Suba tudo (passo 6). Com o backend `healthy`, o schema existe. Gere o hash BCrypt da senha e crie o
usuário (troque usuário, nome, e-mail, telefone e senha):

```bash
HASH=$(docker run --rm httpd:alpine htpasswd -nbBC 10 x 'SENHA-FORTE-AQUI' | cut -d: -f2 | sed 's/^\$2y/$2a/')
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' <<SQL
INSERT INTO usuarios (tipo_usuario, username, nome, email, telefone, matricula, password, status)
VALUES ('INTERNO', 'admin', 'Administrador', 'admin@braservpetroleo.com.br', '(82) 99999-0000', 1, '$HASH', 'ATIVO');
INSERT INTO usuario_roles (username, role) VALUES ('admin', 'INTERNO'), ('admin', 'ADMIN');
SQL
```

O login recusa o usuário se faltar uma destas regras do domínio: usuário interno com **matrícula maior
que zero** e **telefone com DDD e 9 dígitos** no formato `(DD) 9XXXX-XXXX`. O endereço é opcional.
Confira com:

```bash
curl -s -X POST https://geopetro.braservpetroleo.com.br/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"SENHA-FORTE-AQUI"}' | cut -c1-40
```

Deve começar com `{"token":`. Entre pela tela e cadastre os demais usuários por ela.

## Passo 6 · Subir

```bash
docker compose up -d --build          # a primeira vez compila backend, telemetria e front
docker compose ps                     # todos "running"/"healthy" em alguns minutos
docker compose logs -f backend        # Flyway e "Started"
```

## Passo 7 · Verificar

```bash
D=geopetro.braservpetroleo.com.br
docker compose exec backend curl -fsS localhost:8080/actuator/health/readiness; echo
docker compose exec telemetria curl -fsS localhost:8081/actuator/health; echo
docker compose logs telemetria | grep -E "Conectado ao broker|Assinado"
curl -sI http://$D | head -3                                  # 308 para https
curl -s -o /dev/null -w '%{http_code}\n' https://$D           # 200 (SPA)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://$D/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"x","password":"x"}'   # 401: API alcançada
curl -s -o /dev/null -w '%{http_code}\n' --http1.1 https://$D/ws \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H "Origin: https://$D"  # 101: WebSocket
```

E o teste que importa: **de outra máquina**, abrir `https://geopetro.braservpetroleo.com.br`, entrar,
abrir o simulador, o monitoramento e o tempo real.

## Passo 8 · Reinício da máquina

```bash
sudo systemctl enable docker
```

Os containers têm `restart: unless-stopped`: voltam sozinhos quando o Docker sobe. Reinicie a VM uma vez
e repita o passo 7. Em WSL, isso depende das tarefas agendadas do `03-publicar-portas.ps1`.

## Passo 9 · Backup

```bash
chmod +x backup.sh
sudo mkdir -p /var/backups/geopetro && sudo chown "$USER" /var/backups/geopetro
./backup.sh
( crontab -l 2>/dev/null; echo "30 2 * * * $PWD/backup.sh >> $HOME/geopetro-backup.log 2>&1" ) | crontab -
```

Restaurar o MySQL: `gunzip -c mysql-<data>.sql.gz | docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'`.
O backup fica na mesma VM; copie a pasta para fora com regularidade.

## Passo 10 · Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 1883/tcp      # melhor: sudo ufw allow from <faixa-das-sondas> to any port 1883
sudo ufw enable
```

⚠️ O Docker publica portas por fora do `ufw` (regras próprias no iptables). As únicas portas publicadas
pelo compose são 80, 443 e 1883; não acrescente outras sem necessidade. Restringir a 1883 por origem
exige o firewall da nuvem/rede ou a cadeia `DOCKER-USER`.

---

## Configurar as sondas (Geopetro-Desktop)

| Campo | Valor |
|---|---|
| URL do backend | `https://geopetro.braservpetroleo.com.br` (o Desktop deriva `wss://…/ws` e `/api/auth/login`) |
| Broker MQTT | `tcp://geopetro.braservpetroleo.com.br:1883` |
| Usuário / senha do broker | `MQTT_USERNAME` / `MQTT_PASSWORD` do `.env` |
| ID da Sonda/Unidade | exatamente o `nome` do cadastro (RN-018) |

## Atualizar

```bash
cd ~/geopetroio && git pull
cd deploy/vm-unica && ./backup.sh && docker compose up -d --build
```

As migrations rodam sozinhas. Nunca edite uma migration já aplicada (o startup recusa).

---

## Riscos que ficam

| Risco | Detalhe |
|---|---|
| **Um ponto de falha** | Telemetria e web dividem disco, memória e uptime. A perda de telemetria é permanente (OQ-019) |
| **`/telemetria` público sem autenticação** | O front chama a API de telemetria pelo nginx; com o domínio na internet, qualquer um consulta o histórico. Sem autenticação serviço-a-serviço ainda (OQ-029) |
| **MQTT sem TLS** | Usuário e senha das sondas trafegam em texto claro na 1883 |
| **Backup local** | Protege de erro e de migration ruim, não da perda da VM |
| **Retenção do InfluxDB** | 90 dias por padrão (OQ-028) |
