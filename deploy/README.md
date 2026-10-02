# Deploy — GeopetroIO

> Artefatos de implantação em duas VMs · 2026-08-27

**[2026-10-02] Alternativa em uma máquina:** [`vm-unica/`](vm-unica/README.md) põe toda a pilha numa VM
só, atrás de `https://geopetro.braservpetroleo.com.br` (Caddy com Let's Encrypt), com a instrução para o
agente que faz a implantação em [`vm-unica/CODEX.md`](vm-unica/CODEX.md). O restante deste documento
descreve a topologia em duas VMs e continua valendo para ela; a seção do schema do banco vale para as duas.

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
│  geopetro-backend :8080     │              │  telemetria :8081        │
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
([SEC-004](../specs/security-findings.md#sec-004--segredo-jwt-sem-valor-padrão)).

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

**[FATO 2026-09-06]** O schema é do **Flyway**, e só dele. Antes conviviam três mecanismos —
`ddl-auto`, scripts SQL rodados à mão e um initializer em runtime; a fila de scripts pendentes era
conferida de memória, e esquecer um derrubava a subida da aplicação.

### Como funciona agora

As migrations vivem em `Geopetro-Backend/app/src/main/resources/db/migration/` e **rodam
sozinhas no startup do backend**, antes de o Hibernate validar. Nada a executar à mão, em base nova
ou existente.

```
V2026.09.04__baseline.sql                          schema anterior à entrevista de 2026-09-05
V2026.09.05__simulador_pocos.sql                   RN-059 · RN-067
V2026.09.06.1__unidade_sonda_tipo.sql              RN-065
V2026.09.06.2__usuario_sem_vinculo_organizacional.sql   RN-064
```

`ddl-auto=validate` em **todos** os perfis, dev incluído. O Hibernate não cria nem altera nada; ele
apenas confere se o schema bate com as entidades e recusa subir se não bater.

### Base nova

Sobe vazia. O Flyway aplica o baseline e as migrations seguintes na ordem. **Não há mais
`mysql-init/01-schema.sql`** — aquele arquivo virou o baseline `V2026.09.04`, e com ele foi embora a
obrigação de regenerá-lo a cada mudança de entidade.

### Base existente

Também não exige nada. Na primeira subida o Flyway encontra um schema sem histórico, cria a tabela
`flyway_schema_history` e **marca** `V2026.09.04` como aplicada sem executá-la — a estrutura daquela
versão já está lá. A migração começa de fato em `V2026.09.05`.

⚠️ **A `V2026.09.06.2` descarta dados**: as tabelas `usuario_interno_regionais` /
`usuario_interno_setores` e a coluna `usuarios.regional_id`. Não há backup do MySQL
([decisão de 2026-09-05](../specs/product-context.md#11-fechamentos-das-rodadas-3-a-6)). Para guardar
os vínculos antes, os `SELECT` de exportação estão no cabeçalho do script.

⚠️ **A `V2026.09.06.1` classifica toda a frota existente como `SONDA`.** Confira registro a registro
na tela de cadastro depois do deploy — o campo é editável para isso.

⚠️ Uma base existente pode conter tabelas de módulos removidos (`projetos`, `processos`, `anotacoes`,
`observacoes`, `quimicos`...). Elas **não quebram nada** — `validate` ignora tabelas extras — mas há
scripts de limpeza em `Geopetro-Backend/db/cleanup/`, comentados e **não executados**.

### Escrever uma migration nova

Crie `V<versão>__descricao.sql` na pasta acima, com versão maior que a última. Duas regras da casa:

1. **Idempotente**, no padrão `information_schema` + `PREPARE` que os scripts existentes usam. O
   Flyway já não reexecuta o que aplicou, mas as guardas cobrem a base que recebeu a estrutura por
   outro caminho — foi o que aconteceu com `simulador_pocos` no MySQL local.
2. **Nunca edite um script já aplicado.** `validate-on-migrate` está ligado: mexer no conteúdo quebra
   o startup em vez de divergir em silêncio. Corrija com um script novo.

`MigracaoFlywayTest` verifica a cadeia inteira contra um MySQL real, numa base descartável — base
vazia, base existente, e a base que já tinha estrutura criada pelo `ddl-auto`. Ele **pula** se não
houver MySQL alcançável.

### Scripts históricos

`Geopetro-Backend/db/historico/` guarda os `V2026.06.*`, aplicados à mão antes do Flyway
existir. **Não rodam mais** — seus efeitos estão dentro do baseline. Ficam como registro.

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

Cada instalação do Geopetro-Desktop precisa apontar para o broker da VM-2, na tela de Configurações:

| Campo | Valor |
|---|---|
| Broker MQTT de Telemetria | `tcp://<IP-DA-VM-2>:1883` |
| Usuário do broker | o mesmo `MQTT_USERNAME` do `.env` da VM-2 |
| Senha do broker | a mesma `MQTT_PASSWORD` do `.env` da VM-2 |
| ID da Sonda/Unidade | **Exatamente** o `nome` cadastrado em Unidades/Sondas (ex.: `SPT-144`) |

⚠️ **O ID precisa bater com o cadastro.** É a chave de correlação da telemetria
([RN-018](../specs/business-rules.md#rn-018--nome-da-unidadesonda-é-chave-de-integração)); renomear
uma unidade depois quebra a continuidade do histórico.

**[FATO 2026-08-27]** O suporte a credenciais MQTT foi **implementado no Geopetro-Desktop** durante esta
preparação. Antes disso o produtor conectava apenas de forma anônima, o que tornaria impossível
ativar a autenticação no broker sem derrubar a telemetria de toda a frota.

Se o usuário ficar vazio, o app conecta anonimamente e registra aviso no log — comportamento útil em
bancada, inviável em produção.

⚠️ **Ordem importa na frota:** ative a autenticação no broker **depois** de atualizar as instalações
do Geopetro-Desktop, ou as sondas com a versão antiga param de publicar.

---

## Kubernetes

Os `docker-compose.yml` são a via recomendada para duas VMs. Se migrar para Kubernetes:

- Os **nomes de Service** devem ser `geopetro-backend` e `telemetria` — o `nginx.conf` do frontend faz proxy por esses nomes.
- Probes: `/actuator/health/readiness` e `/actuator/health/liveness` nos dois backends.
- Use `Secret` (não `ConfigMap`) para as variáveis da tabela acima.
- MySQL e InfluxDB precisam de `PersistentVolumeClaim` — ou, preferencialmente, serviços gerenciados.
- O schema inicial vira um `Job` de inicialização, já que não há `docker-entrypoint-initdb.d`.

**[FATO]** Não há manifestos Kubernetes no repositório ([OQ-012](../specs/open-questions.md#oq-012--onde-vivem-os-manifestos-de-deploy)).

---

## Pendências conhecidas

| # | Item | Impacto |
|---|---|---|
| 1 | **Atualizar a frota antes de exigir autenticação no broker** | O suporte a credenciais já existe no Geopetro-Desktop, mas instalações antigas em campo ainda conectam anonimamente |
| 2 | **Sem TLS** — MQTT e HTTP em texto claro | Aceitável em rede privada; obrigatório se atravessar internet |
| 3 | **Sem autenticação serviço-a-serviço** entre VM-1 e VM-2 | Mitigado por firewall ([OQ-029](../specs/open-questions.md#oq-029--a-api-de-telemetria-precisa-de-autenticação-serviço-a-serviço)) |
| 4 | **Retenção do InfluxDB** default 90d | ~8,6 mi de pontos/dia com 20 sondas ([OQ-028](../specs/open-questions.md#oq-028--qual-é-a-política-de-retenção-do-influxdb)) |
| 5 | **Sem backup automatizado** | MySQL e InfluxDB precisam de rotina de backup |
| 6 | **Sem HTTPS no frontend** | O compose expõe `:80`. Coloque um proxy reverso com TLS à frente |
| 7 | **Repositório Git do Geopetro-Telemetria não existe** | Criar — preferencialmente fora do OneDrive ([DT-004](../specs/technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git)) |
