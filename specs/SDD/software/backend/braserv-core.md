# Braserv-Core — cadastro organizacional e identidade

> Spec de arquitetura · 2026-10-06 · **Estado: implementada; documentação consolidada na fase 7**
>
> Contrato HTTP entre o core e as demais aplicações: [apis/braserv-core.md](../apis/braserv-core.md).
> Modelo de dados vigente: [entidade-relacionamento](../../../entidade-relacionamento/index.html).

## 1. Objetivo

O **Braserv-Core** é o único dono da estrutura organizacional da Braserv e da identidade dos
usuários. O Geopetro-Backend mantém monitoramento, alarmes e simulador e consome o Core sem copiar
tabelas ou regras de cadastro.

**Resultado esperado:** um sistema novo da Braserv (almoxarifado, compras, outro simulador) usa o
mesmo login e a mesma estrutura organizacional sem depender do Geopetro-Backend.

**Contexto que simplifica:** o sistema **ainda não está em produção** (2026-10-06). Não há corte com
janela de manutenção, nem compatibilidade com nomes antigos: a mudança entra inteira de uma vez.

## 2. Decisões

Todas tomadas em entrevista em 2026-10-06.

| Id | Decisão |
|---|---|
| [RN-115](../../negocio/regras/business-rules.md#rn-115--cadastro-organizacional-e-identidade-pertencem-ao-braserv-core) | Usuário, Empresa, Regional, Setor e Unidade pertencem ao Braserv-Core |
| [RN-116](../../negocio/regras/business-rules.md#rn-116--unidade-é-inativada-e-só-é-excluída-se-nunca-foi-usada) | Unidade é inativada. Exclusão física só se nunca foi usada, confirmada pelo backend |
| [RN-117](../../negocio/regras/business-rules.md#rn-117--só-o-braserv-core-emite-token) | Só o core emite token, para pessoas e para sistemas. Os demais validam pela chave pública |
| [RN-118](../../negocio/regras/business-rules.md#rn-118--gestão-de-unidades-exige-interno--unidade-ou-admin) | Gestão de unidades exige `ADMIN` ou `INTERNO` + `UNIDADE` (permissão nova) |
| [RN-119](../../negocio/regras/business-rules.md#rn-119--o-cadastro-se-chama-unidade) | O cadastro se chama **Unidade** em todo o sistema, inclusive na telemetria |
| D-1 | Dados do core no **mesmo servidor MySQL**, database próprio `braserv_core` |
| D-2 | O kernel compartilhado do Backend se chama `comum` |
| D-3 | Credenciais dos sistemas que chamam o core ficam **no banco do core**, com tela de ADMIN |
| D-4 | Core indisponível: o backend usa o **último acesso conhecido por até 5 min** e registra no log |
| D-5 | Dados do ambiente de teste são **movidos por script** para o core, sem recadastro |

## 3. Fronteira

### 3.1 O que pertence ao Core

| Assunto | Módulo/tabela no Core |
|---|---|
| Regional | `regional` · `regionais` |
| Setor | `setor` · `setores` |
| Unidade | `unidade` · `unidades` |
| Empresa | `empresa` · `empresas` |
| Usuário, roles e concessões | `usuario` · `usuarios`, `usuario_roles`, `usuario_cliente_unidades` |
| Login, recuperação, SMTP e clientes de serviço | `identidade` · `recuperacao_senha`, `configuracao_smtp`, `servicos_clientes` |
| Contratos internos e guarda de exclusão | `interno` e `comum` |

**[FATO]** O SMTP só é usado pela recuperação de senha (`SmtpRecoveryMail`). Por isso vai junto.

### 3.2 O que pertence ao Backend

Monitoramento, tempo real, alarmes, limites, cards e simulador. As tabelas `configuracao_sonda`,
`configuracao_cards`, `evento_alarme`, `episodio_alarme_extremo` e `simulador_*` continuam em
`geopetro_io`. Nas quatro primeiras, `unidade_id` é uma referência lógica ao id mantido no Core.

### 3.3 Telemetria

A Geopetro-Telemetria não consulta o Core. O contrato vigente usa o tópico MQTT
`telemetria/{idUnidade}/batch`, campo `idUnidade` no payload e tag `idUnidade` no InfluxDB. O valor
continua sendo o **nome** da unidade ([RN-018](../../negocio/regras/business-rules.md#rn-018--nome-da-unidade-é-chave-de-integração)).

## 4. Arquitetura

```text
             Front / Desktop
                   │  https://<domínio>/api/...
                   ▼
            proxy (nginx do Front)
     ┌─────────────┴─────────────────────┐
     │ /api/auth/**  /api/usuarios/**     │ /api/monitoramento/**
     │ /api/empresas/**  /api/regionais/**│ /api/simulador/**
     │ /api/setores/**  /api/unidades/**  │ /ws
     │ /api/configuracoes/email/**        │
     │ /api/servicos-clientes/**          │
     ▼                                    ▼
 Braserv-Core :8082  ◄── rede interna ──►  Geopetro-Backend :8080
   emite tokens         /.well-known/jwks.json     valida tokens
                        /internal/v1/** (core)
                        /internal/v1/** (backend)
   │                                                │
   ▼                                                ▼
 MySQL: braserv_core                       MySQL: geopetro_io
 (mesmo servidor MySQL, databases e usuários separados)
```

- O core chama **um** sistema: o backend, só para confirmar se uma unidade pode ser excluída (seção 8).
- As rotas `/internal/**` e `/.well-known/**` dos dois serviços **não são publicadas** pelo proxy.
- Cada aplicação acessa só o próprio database, com usuário MySQL próprio.

## 5. Banco

### 5.1 Databases

| Database | Dono | Usuário MySQL | Migrations |
|---|---|---|---|
| `braserv_core` | Braserv-Core | `braserv_core`, só neste database | Flyway do core |
| `geopetro_io` | Geopetro-Backend | o atual, sem acesso às tabelas que saem | Flyway do backend |

### 5.2 Referências que deixam de ser FK

As quatro colunas `unidade_id` do Backend são referências simples ao id do Core, sem FK entre
databases.

| Tabela (Backend) | Referência protegida pela guarda de exclusão |
|---|---|
| `configuracao_sonda` | `fk_configuracao_sonda` |
| `configuracao_cards` | `fk_configuracao_cards_unidade` |
| `evento_alarme` | `fk_evento_alarme_unidade` |
| `episodio_alarme_extremo` | `fk_episodio_extremo_unidade` |

**Por que não fica órfão:** uma unidade só é apagada se o backend confirmou que nenhuma dessas
tabelas a referencia (seção 8). Do contrário ela é inativada e o id continua existindo.

### 5.3 Esquema vigente

| Onde | Estado |
|---|---|
| Core · `unidades` | Possui `status VARCHAR(16) NOT NULL DEFAULT 'ATIVA'` (`ATIVA`, `INATIVA`) |
| Core · `usuario_cliente_unidades` | Usa `unidade_id` com FK interna para `unidades.id` |
| Core · `usuario_roles` | Aceita a permissão `UNIDADE` |
| Core · `servicos_clientes` | Guarda credenciais de sistemas (seção 6.5) |
| Backend · 4 tabelas da seção 5.2 | Usam `unidade_id`, sem FK entre databases |

### 5.4 Migração dos dados de teste (D-5)

As tabelas foram **movidas, não copiadas**, com `RENAME TABLE geopetro_io.x TO braserv_core.y`. No
MySQL essa é uma operação de metadados, atômica e sem duplicar dados.

Script executado uma vez, com `root`, versionado em `deploy/vm-unica/core/mover-para-core.sql`:

1. Conferir: as nove tabelas existem em `geopetro_io` e `braserv_core` está vazio.
2. Remover as quatro FKs da seção 5.2.
3. `RENAME TABLE` das nove tabelas, num único comando, com os nomes vigentes no Core.
4. Ajustar o schema para ficar **idêntico à estrutura inicial do Core** (`V2026.10.06.1`).
5. Conferir: nenhuma das nove sobrou em `geopetro_io`; contagens de linha iguais às do passo 1.

O Flyway do core sobe depois com `baseline-on-migrate` na versão da estrutura inicial: ela é marcada
como aplicada, e as migrations seguintes (coluna `status`, tabela `servicos_clientes`) rodam
normalmente sobre os dados movidos. Em base vazia, a estrutura inicial cria tudo. **[FATO 2026-10-06]**
Coberto por `MigracaoFlywayTest.baseMovidaRecebeAsMigrationsSeguintes`. As mudanças do lado do backend (remover FKs e renomear colunas) são
uma **migration Flyway do backend**, idempotente, como as demais
([DT-002](../technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema)).

O histórico de teste anterior à integração pôde ser descartado porque o sistema ainda não estava em
produção.

## 6. Autenticação

O token é um **crachá digital**: diz quem é o portador, o que ele pode fazer e até quando vale, e
leva uma assinatura que impede alteração. O Core assina com a chave privada e os consumidores
validam com as chaves públicas do JWKS.

### 6.1 Chaves

- **Chave privada:** assina. Fica só no core, num volume de segredo (como `smtp-secrets`).
- **Chave pública:** confere. O core a publica em `GET /.well-known/jwks.json` (o JWKS).
- Algoritmo **RS256**. O cabeçalho de cada token leva `kid`, que identifica a chave usada.
- Rotação: o JWKS publica a chave atual e a anterior. Gerar o par novo, publicar os dois, passar a
  assinar com o novo e retirar o anterior depois de 1 hora.

### 6.2 Token de pessoa

Emitido por `POST /api/auth/login`, com corpo de resposta `AutenticacaoResponse`. Validade de 1 hora sem renovação
([RN-045](../../negocio/regras/business-rules.md#rn-045--sessão-expira-em-1-hora-sem-renovação)).

| Claim | Valor |
|---|---|
| `iss` | `braserv-core` |
| `tipo` | `usuario` |
| `sub` | `username` |
| `roles` | roles no momento do login |
| `iat`, `exp` | emissão e expiração |

### 6.3 Token de serviço

Um sistema faz "login" no core com credencial própria e recebe um token que diz qual sistema ele é.
Detalhes do pedido em [apis/braserv-core.md](../apis/braserv-core.md#3-token-de-serviço).

| Claim | Valor |
|---|---|
| `iss` | `braserv-core` |
| `tipo` | `servico` |
| `sub` | id do cliente de serviço, ex.: `geopetro-backend` |
| `escopos` | lista de escopos concedidos (seção 6.5) |
| `iat`, `exp` | validade de **15 min**; o consumidor pede outro antes de vencer |

**Token de pessoa não abre rota interna, e token de serviço não abre rota pública.** Quem valida
confere o claim `tipo` antes de qualquer outra regra.

O core também precisa de token quando chama o backend (seção 8). Ele assina o próprio token de
serviço, com `sub` = `braserv-core` e escopo `unidades:vinculos`, sem passar por
`servicos_clientes`.

### 6.4 Validação nos consumidores

- O backend valida assinatura, `iss`, `tipo` e `exp` com as chaves do JWKS.
- O JWKS fica em memória e é buscado de novo quando chega um `kid` desconhecido.
- `JWT_SECRET` não existe no Backend.

### 6.5 Clientes de serviço (D-3)

Tabela `servicos_clientes` no `braserv_core`:

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `varchar(64)` PK | Identificador do sistema, ex.: `geopetro-backend` |
| `nome` | `varchar(255)` | Nome legível |
| `segredo_hash` | `varchar(255)` | BCrypt. O segredo em si nunca é gravado |
| `escopos` | `varchar(1024)` | Lista separada por vírgula |
| `ativo` | `boolean` | Desativar recusa novos tokens na hora. Tokens já emitidos valem até vencer (15 min) |
| `criado_em`, `atualizado_em`, `ultimo_uso_em` | `datetime(6)` | |

Escopos existentes:

| Escopo | Libera |
|---|---|
| `acesso:ler` | `GET /internal/v1/usuarios/{username}/acesso` no core |
| `unidades:ler` | `GET /internal/v1/unidades` e `/{id}` no core |

Tela de ADMIN, rotas `/api/servicos-clientes/**`: listar, cadastrar, gerar segredo novo e
desativar. **O segredo aparece uma única vez**, no momento em que é gerado. Gerar um novo invalida o
anterior.

**Primeira subida:** se não houver cliente `geopetro-backend`, o core o cria com o segredo da
variável `CORE_SEGREDO_INICIAL_BACKEND` e os escopos `acesso:ler` e `unidades:ler`. Depois disso a
variável pode sair do `.env`; o segredo passa a ser gerenciado pela tela.

### 6.6 Acesso atual do usuário (RN-062 e RN-107)

O crachá diz quais eram as roles no login, mas o usuário pode ter sido desativado ou alterado
depois. O backend pergunta ao core, com token de serviço:

`GET /internal/v1/usuarios/{username}/acesso` → `ativo`, `tipo`, `roles`, `unidadeIds`.

A mesma resposta alimenta as quatro decisões de acesso do backend:

| Decisão | Regra | Classe atual |
|---|---|---|
| Conta ainda ativa, no HTTP e a cada entrega no tempo real | RN-062, RN-107 | `ContaAtivaVerificador` |
| Quais unidades o usuário enxerga | RN-047, RN-048 | `UnidadeMonitoramentoService` |
| Quem configura cards | RN-086 | `ConfiguracaoCardsAccess` |
| Combinação tipo de conta + módulo | RN-099 | `RegrasDeAcesso`, `PermissoesDoUsuario` |

- Cache de **10 s**. É a janela normal do corte de acesso.
- **Core sem resposta (D-4):** o backend usa o último valor conhecido por até **5 min** e registra
  no log cada uso desse valor. Passados os 5 min sem resposta, nega. Um usuário desativado durante
  uma queda do core pode entrar por até 5 min; é o custo aceito para que um reinício do core não
  derrube o tempo real das operações em andamento.

## 7. Como o Backend lê o cadastro

| Necessidade | Contrato vigente |
|---|---|
| Conta ativa, roles e concessões | `AcessoDoUsuarioPort`, via `GET /internal/v1/usuarios/{username}/acesso` |
| Catálogo e detalhe de unidade | `CatalogoDeUnidadesPort`, via `GET /internal/v1/unidades` e `/{id}` |
| Autenticidade do token | Validação RS256 pelo JWKS do Core |
| Vínculos que bloqueiam exclusão | Endpoint interno do Backend, consultado pelo Core |

- **Leitura:** o catálogo de unidades fica em cache por 60 s. Uma unidade criada ou inativada aparece
  no Backend em até 60 s.
- **Escrita:** gravar limites ou cards consulta `GET /internal/v1/unidades/{id}` **sem cache**.
- **Acesso:** o último acesso conhecido pode ser usado por até cinco minutos durante indisponibilidade
  do Core; sem valor válido, o Backend nega.

## 8. Unidade: inativar e excluir

### 8.1 Inativar (OQ-055)

| Lugar | Efeito de `INATIVA` |
|---|---|
| Nova concessão a cliente | Recusada com `400` |
| Concessões existentes | Mantidas. Voltam a valer se a unidade for reativada |
| `/api/monitoramento/unidades/minhas` e catálogo do Desktop | A unidade não aparece |
| Histórico de séries e de alarmes | Continua consultável por quem já tinha acesso |
| Tempo real e MQTT | Não são bloqueados |
| Cópia de cards ([RN-092](../../negocio/regras/business-rules.md#rn-092--a-unidade-nasce-sem-cards-e-se-configura-copiando-outra)) | Pode copiar de uma unidade inativa |

### 8.2 Excluir (OQ-057)

`DELETE /api/unidades/{id}` apaga **só se a unidade nunca foi usada**:

1. O core confere os vínculos dele: concessões a clientes.
2. O core chama `GET /internal/v1/unidades/{id}/vinculos` **no backend**, com o próprio token de
   serviço (6.3). O backend confere limites, cards, eventos e episódios de alarme, e pergunta à
   Telemetria se há série gravada (`TelemetriaVinculoAdapter`).
3. Havendo qualquer vínculo, responde `409` com **todos** os impedimentos numa mensagem só, como em
   [RN-063](../../negocio/regras/business-rules.md#rn-063--exclusão-bloqueada-por-vínculo-em-todos-os-cadastros).
4. **Backend ou Telemetria sem resposta em 5 s: a exclusão é recusada.** Assumir "não tem uso" porque
   ninguém respondeu apagaria uma unidade que não podia ser apagada; só um dos dois erros tem volta.
5. Sem vínculo, apaga.

**Risco aceito:** entre a conferência (passo 2) e a exclusão (passo 5), o backend poderia gravar um
limite novo para a unidade. A janela é de milissegundos e a escrita no backend consulta o core sem
cache (seção 7), então só um pedido simultâneo ao segundo escapa.

Quando um sistema novo passar a referenciar unidades, ele também precisa responder pelo próprio uso.
O desenho previsto é o core consultar uma lista de endpoints de vínculo, um por sistema; até lá, o
backend é o único.

## 9. Contrato de Unidade (RN-119)

| Superfície | Contrato vigente |
|---|---|
| Domínio e banco do Core | `Unidade`, `TipoUnidade`, tabela `unidades` |
| Referências | `unidade_id` no banco e `unidadeId` nos payloads de configuração |
| Cadastro | `/api/unidades/**` |
| Monitoramento | `/api/monitoramento/unidades/**`, sempre com id numérico |
| WebSocket | `/topic/realtime/unidades/{id}` e `/topic/config/unidades/{id}/cards` |
| MQTT e InfluxDB | `telemetria/{idUnidade}/batch` e tag `idUnidade`, cujo valor é `Unidade.nome` |
| Telas | “Unidade” e “Unidades” |

O Backend traduz o id numérico para o nome antes de consultar a Telemetria. A lista
`/api/monitoramento/unidades/minhas` devolve `id`, `nome`, `apelido` e `tipo`. Assim o Front
usa um único identificador numérico nas rotas, enquanto o contrato de coleta preserva o nome como
chave de integração.

O tipo `SONDA` continua sendo um dos tipos de unidade, ao lado de `UNIDADE_BOMBEIO`,
`SLICKLINE_WIRELINE`, `CIMENTACAO` e `UCAQ`. A tabela `configuracao_sonda` mantém o nome por
ser um detalhe interno do módulo de limites.

## 10. Estrutura do projeto

Pasta `apps/core/`, ao lado das demais aplicações do monorepo. Mesma base técnica do
backend: Spring Boot 4.0.5, Java 21, Maven, arquitetura hexagonal por módulo.

```text
apps/core/
├── pom.xml              (agregador)
├── comum/               exceções, PaginaResponse, portas de vínculo e GuardaDeExclusao
├── regional/
├── setor/
├── unidade/
├── empresa/
├── usuario/
├── identidade/          login, tokens RS256, JWKS, clientes de serviço, recuperação de senha, SMTP
├── interno/             rotas /internal/v1/** e cliente HTTP do backend
├── app/                 Spring Boot, Flyway, configuração
├── specs/               specs exclusivas do core
└── Dockerfile
```

Pacote raiz `com.braserv.core`: o serviço é da Braserv, não de um produto. Porta interna `8082`. No
Backend, o pacote compartilhado é `com.geopetro.comum` (D-2), para não sugerir que é
parte do Braserv-Core.

**Sobre D-2:** depois da separação, o `comum` do backend fica só com `BusinessException`,
`RegraNegocioException`, `ResourceNotFoundException` e `PaginaResponse`. O core começa com a
**própria cópia** dessas quatro classes, porque o Docker constrói cada aplicação a partir da própria
pasta e um artefato Maven compartilhado exigiria um repositório de pacotes. Extrair uma biblioteca
comum fica para quando um terceiro serviço precisar dela.

## 11. Entregas realizadas

Implementação realizada numa única branch, com validação ao final de cada fase.

| Fase | Entrega | Estado |
|---|---|---|
| 1 | Projeto Braserv-Core, Flyway, tokens RS256 e JWKS | ✅ Concluída |
| 2 | Estado da unidade, guarda de exclusão, permissão `UNIDADE`, clientes de serviço e rotas internas | ✅ Concluída |
| 3 | Backend consumidor do Core, referências lógicas e contratos de monitoramento | ✅ Concluída |
| 4 | Telemetria e Desktop alinhados ao contrato de Unidade | ✅ Concluída |
| 5 | Front integrado ao Core e ao Backend | ✅ Concluída |
| 6 | Compose, bancos, chaves e proxy do ambiente de VM única | ✅ Concluída |
| 7 | Specs de sistema, domínios, dados, MQTT, WebSocket, monitoramento e configuração | ✅ Concluída |

## 12. Critérios de aceite

1. Login pelo Front e pelo Desktop funciona, servido pelo core.
2. Um token emitido pelo core abre `/api/monitoramento/unidades/minhas`; um token adulterado recebe `401`.
3. Token de pessoa em `/internal/**` recebe `401`; token de serviço em rota pública também.
4. O backend não tem `JWT_SECRET` nem acesso às tabelas da seção 3.1.
5. Desativar um usuário no core corta HTTP e tempo real no backend em até 10 s.
6. Com o core parado por 1 min, o tempo real continua para quem já estava conectado; com o core
   parado por 6 min, o acesso é negado.
7. Um CLIENTE vê no monitoramento exatamente as unidades **ativas** concedidas no core.
8. Inativar uma unidade não apaga limites, cards, alarmes nem telemetria dela.
9. Excluir unidade com qualquer vínculo responde `409` listando todos; sem vínculo, apaga; com o
   backend parado, responde `409`.
10. `INTERNO` sem `UNIDADE` lê o cadastro de unidades, mas não cria, edita, inativa nem exclui.
11. Desativar um cliente de serviço na tela faz o próximo pedido de token dele falhar.
12. `/internal/**` e `/.well-known/**` não respondem pela URL pública.
13. Recuperação de senha e teste de SMTP funcionam, servidos pelo core.
14. Desktop publica em `telemetria/{idUnidade}/batch` e a série aparece no monitoramento.

## 13. O que esta spec não faz

- Não cria cadastros novos (cargo, colaborador, centro de custo como entidade).
- Não muda as regras de acesso existentes (RN-047, RN-048, RN-086, RN-099). Elas leem o Core; a
  permissão adicional é `UNIDADE` (RN-118).
- Não resolve a revogação de token individual ([SEC-008](../seguranca/security-findings.md#sec-008--token-não-revogável-e-desacoplado-do-estado-do-usuário)).
- Não autentica o MQTT nem as consultas à Telemetria.
