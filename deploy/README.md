# Deploy — GeopetroIO

> Artefatos de implantação em duas VMs · 2026-08-27

## Topologia

**[DECIDIDO 2026-08-27]** Duas VMs, agrupadas por **caminho de dados** — cada uma dona do próprio
armazenamento.

```
        USUÁRIOS                                    SONDAS EM CAMPO
           │ HTTPS                                        │ MQTT 1883
           ▼                                              ▼
┌──────────────────────────┐              ┌──────────────────────────┐
│  VM-1 · TRANSACIONAL     │              │  VM-2 · TELEMETRIA       │
│                          │   REST 8081  │                          │
│  front (nginx :80)       │─────────────►│  mosquitto  :1883        │
│  backend-sonda :8080     │              │  telemetria :8081        │
│  mysql :3306 (loopback)  │              │  influxdb :8086 (loop.)  │
└──────────────────────────┘              └──────────────────────────┘
     read-heavy, intermitente                write-heavy, contínuo 24/7
```

### Por que separar

| Motivo | Detalhe |
|---|---|
| **Domínio de falha** | Perda de telemetria é **permanente** (não há buffer no produtor — [OQ-019](../specs/open-questions.md#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável)); indisponibilidade do web é recuperável. Não faz sentido acoplar os uptimes |
| **Perfil de I/O** | Escrita contínua do InfluxDB competiria com o MySQL transacional |
| **Exposição de rede** | A VM-2 recebe conexões das sondas em campo. Isolar isso da máquina que guarda o banco de usuários é postura correta |
| **Escala independente** | Mais sondas escalam a ingestão; mais usuários escalam o web |

### Por que InfluxDB fica com o consumidor

Se o broker e o consumidor ficassem na VM-2 mas o InfluxDB na VM-1, **cada escrita atravessaria a
rede continuamente** — trocaria um gargalo de I/O por um de rede, pior. O único tráfego entre VMs é a
consulta REST: baixo volume, com timeout de 5s e degradação graciosa já implementados.

---

## Ordem de implantação

A VM-2 sobe primeiro: a VM-1 precisa do endereço dela na configuração.

## VM-2 · Telemetria

```bash
cd deploy/vm2-telemetria
cp .env.example .env
```

### 1. Gerar credenciais

```bash
# Token do InfluxDB
openssl rand -hex 32
```

Preencha no `.env`: `MQTT_PASSWORD`, `INFLUX_ADMIN_PASSWORD`, `INFLUX_TOKEN`.

### 2. Gerar o arquivo de senhas do Mosquitto

⚠️ **Passo obrigatório.** O broker está configurado com `allow_anonymous false`
([SEC-009](../specs/security-findings.md#sec-009--broker-mqtt-sem-autenticação)) e **não sobe** sem
este arquivo.

```bash
source .env
touch mosquitto/passwd
docker run --rm -v "$PWD/mosquitto:/m" eclipse-mosquitto:2 \
  mosquitto_passwd -b /m/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
chmod 600 mosquitto/passwd
```

### 3. Subir

```bash
docker compose up -d
docker compose logs -f telemetria
```

Esperado no log: `Conectado ao broker` e `Assinado topico 'telemetria/+/batch' com QoS 1`.

### 4. Verificar

```bash
curl -s localhost:8081/actuator/health | jq
```

Deve mostrar `mqtt.estado: "conectado"` e `influx.estado: "acessivel"`.

⚠️ **Firewall:** restrinja a porta `1883` à faixa de IPs das sondas e a `8081` ao IP da VM-1. O broker
não deve ficar aberto na internet, e a API de telemetria ainda não tem autenticação
serviço-a-serviço ([OQ-029](../specs/open-questions.md#oq-029--a-api-de-telemetria-precisa-de-autenticação-serviço-a-serviço)).

---

## VM-1 · Transacional

```bash
cd deploy/vm1-transacional
cp .env.example .env
```

### 1. Gerar o segredo JWT

```bash
openssl rand -base64 48
```

⚠️ A aplicação **falha no startup** se `JWT_SECRET` estiver vazio — deliberado
([SEC-004](../specs/security-findings.md#sec-004--segredo-jwt-padrão-no-código)).

### 2. Apontar para a VM-2

No `.env`, ajuste `TELEMETRIA_HOST_IP` e `MONITORAMENTO_BASE_URL` para o endereço real da VM de
telemetria.

### 3. Subir

```bash
docker compose up -d
docker compose logs -f backend
```

### 4. Verificar

```bash
docker compose exec backend curl -s localhost:8080/actuator/health/readiness
```

---

## O schema do banco

⚠️ **Ponto crítico.** O projeto **não usa Flyway/Liquibase**, e em produção roda com
`ddl-auto=validate` — o Hibernate **não cria tabelas**. Sem schema, a aplicação não sobe.

### Base nova

`mysql-init/01-schema.sql` está montado em `/docker-entrypoint-initdb.d` e roda **automaticamente na
primeira inicialização** do container MySQL (volume vazio).

**[FATO]** Esse arquivo foi **gerado a partir das entidades JPA** — Hibernate `ddl-auto=create` contra
um MySQL 8 real, exportado via `mysqldump`, e validado por replay em base limpa seguido de boot da
aplicação com `validate`. Contém as 10 tabelas do escopo atual, com 10 FKs.

### Base existente

**Não** use o `01-schema.sql`. A base já foi criada e evoluída pelos scripts manuais em
`Backend-Sonda-Geopetro-IO/app/src/main/resources/db/migration/`, que devem continuar sendo aplicados
na ordem documentada em [DT-002](../specs/technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema).

⚠️ Uma base existente pode conter tabelas de módulos removidos (`projetos`, `processos`, `anotacoes`,
`observacoes`, `quimicos`...). Elas **não quebram nada** — `validate` ignora tabelas extras — mas há
scripts de limpeza em `Backend-Sonda-Geopetro-IO/db/cleanup/`, comentados e **não executados**.

### Regenerar o schema após mudar entidades

```bash
docker run -d --name schemagen -e MYSQL_ROOT_PASSWORD=x -e MYSQL_DATABASE=geopetro_io \
  -p 13306:3306 mysql:8
# aguarde o MySQL responder, então:
cd Backend-Sonda-Geopetro-IO
./mvnw -pl app -am -DskipTests package
java -jar app/target/*.jar --spring.profiles.active=dev \
  --spring.datasource.url="jdbc:mysql://127.0.0.1:13306/geopetro_io?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=America/Sao_Paulo" \
  --spring.datasource.username=root --spring.datasource.password=x \
  --spring.jpa.hibernate.ddl-auto=create --spring.sql.init.mode=never \
  --security.jwt.secret=apenas-para-gerar-ddl-000000000000000000 --server.port=18080
# interrompa após "Started", então:
docker exec schemagen mysqldump -uroot -px --no-data --skip-comments \
  --skip-add-drop-table --compact geopetro_io > /tmp/schema.sql
docker rm -f schemagen
```

Depois, reaplique o cabeçalho de documentação do arquivo atual.

---

## Segredos

| Variável | Onde | Gerar com |
|---|---|---|
| `JWT_SECRET` | VM-1 | `openssl rand -base64 48` |
| `MYSQL_ROOT_PASSWORD` · `DB_PASSWORD` | VM-1 | `openssl rand -base64 24` |
| `INFLUX_TOKEN` | VM-2 | `openssl rand -hex 32` |
| `INFLUX_ADMIN_PASSWORD` | VM-2 | `openssl rand -base64 24` |
| `MQTT_PASSWORD` | VM-2 + sondas | `openssl rand -base64 24` |

**Os arquivos `.env` e `mosquitto/passwd` estão no `.gitignore` e não devem ser versionados.**

⚠️ **Pendência independente deste deploy:** há uma credencial MySQL em texto plano no histórico do Git
do Braserv-Horus-Desktop, apontando para um banco `braservone`. Deve ser **rotacionada**
([SEC-006](../specs/security-findings.md#sec-006--credencial-mysql-no-histórico-do-git)).

---

## Configurar as sondas

Cada instalação do Desktop-Sonda precisa apontar para o broker da VM-2, na tela de Configurações:

| Campo | Valor |
|---|---|
| Broker MQTT de Telemetria | `tcp://<IP-DA-VM-2>:1883` |
| Usuário do broker | o mesmo `MQTT_USERNAME` do `.env` da VM-2 |
| Senha do broker | a mesma `MQTT_PASSWORD` do `.env` da VM-2 |
| ID da Sonda/Unidade | **Exatamente** o `nome` cadastrado em Unidades/Sondas (ex.: `SPT-144`) |

⚠️ **O ID precisa bater com o cadastro.** É a chave de correlação da telemetria
([RN-018](../specs/business-rules.md#rn-018--nome-da-unidadesonda-é-chave-de-integração)); renomear
uma unidade depois quebra a continuidade do histórico.

**[FATO 2026-08-27]** O suporte a credenciais MQTT foi **implementado no Desktop-Sonda** durante esta
preparação. Antes disso o produtor conectava apenas de forma anônima, o que tornaria impossível
ativar a autenticação no broker sem derrubar a telemetria de toda a frota.

Se o usuário ficar vazio, o app conecta anonimamente e registra aviso no log — comportamento útil em
bancada, inviável em produção.

⚠️ **Ordem importa na frota:** ative a autenticação no broker **depois** de atualizar as instalações
do Desktop-Sonda, ou as sondas com a versão antiga param de publicar.

---

## Kubernetes

Os `docker-compose.yml` são a via recomendada para duas VMs. Se migrar para Kubernetes:

- Os **nomes de Service** devem ser `backend-sonda` e `telemetria` — o `nginx.conf` do frontend faz proxy por esses nomes.
- Probes: `/actuator/health/readiness` e `/actuator/health/liveness` nos dois backends.
- Use `Secret` (não `ConfigMap`) para as variáveis da tabela acima.
- MySQL e InfluxDB precisam de `PersistentVolumeClaim` — ou, preferencialmente, serviços gerenciados.
- O schema inicial vira um `Job` de inicialização, já que não há `docker-entrypoint-initdb.d`.

**[FATO]** Não há manifestos Kubernetes no repositório ([OQ-012](../specs/open-questions.md#oq-012--onde-vivem-os-manifestos-de-deploy)).

---

## Pendências conhecidas

| # | Item | Impacto |
|---|---|---|
| 1 | **Atualizar a frota antes de exigir autenticação no broker** | O suporte a credenciais já existe no Desktop-Sonda, mas instalações antigas em campo ainda conectam anonimamente |
| 2 | **Sem TLS** — MQTT e HTTP em texto claro | Aceitável em rede privada; obrigatório se atravessar internet |
| 3 | **Sem autenticação serviço-a-serviço** entre VM-1 e VM-2 | Mitigado por firewall ([OQ-029](../specs/open-questions.md#oq-029--a-api-de-telemetria-precisa-de-autenticação-serviço-a-serviço)) |
| 4 | **Retenção do InfluxDB** default 90d | ~8,6 mi de pontos/dia com 20 sondas ([OQ-028](../specs/open-questions.md#oq-028--qual-é-a-política-de-retenção-do-influxdb)) |
| 5 | **Sem backup automatizado** | MySQL e InfluxDB precisam de rotina de backup |
| 6 | **Sem HTTPS no frontend** | O compose expõe `:80`. Coloque um proxy reverso com TLS à frente |
| 7 | **Repositório Git do Backend-Telemetria não existe** | Criar — preferencialmente fora do OneDrive ([DT-004](../specs/technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git)) |
