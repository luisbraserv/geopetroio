# Specs — Geopetro-Backend

O Backend autentica usuários, mantém os cadastros de organização, persiste cenários do simulador, autoriza consultas de telemetria e retransmite tempo real. O [registro anterior](history/README-2026-09.md) conserva inventários, entregas e decisões datadas.

## Documentos por recurso

| Recurso | SPEC |
|---|---|
| Contas, cadastro e revogação | [Identidade e cadastro](identidade-e-cadastro.md) |
| Recuperação de senha | [Recuperação por e-mail](recuperacao-senha.md) · [SMTP](configuracao-smtp.md) |
| Poços e cenários | [Simulador](simulador-pocos.md) |
| Prefixo HTTP | [API /api](api-prefix.md) |
| Telemetria histórica e tempo real | [MQTT](../../../specs/SDD/software/mqtt/) e [APIs](../../../specs/SDD/software/apis/) |
| Cards e limites | [Cards configuráveis](../../../specs/SDD/negocio/requisitos/cards-configuraveis.md) · [Contrato de configuração](../../../specs/SDD/software/apis/configuracao-sonda.md) |
| Alarmes | [Feature transversal](../../../specs/SDD/negocio/requisitos/alarmes.md) |

## Arquitetura e acesso

Os nove módulos Maven são `core`, `empresa`, `regional`, `setor`, `unidade-sonda`, `usuario`, `simulador`, `security` e `app`. `core` guarda contratos e portas; `app` compõe a aplicação. Dependências cíclicas entre módulos são evitadas com ports.

Permissão de módulo sozinha não abre recurso: `MONITORAMENTO`, `MONITORAMENTO_REAL`, `SIMULADOR` e `CIMENTACAO` combinam com `CLIENTE` ou `INTERNO`, além dos privilégios de `ADMIN` e `SUPORTE` ([RN-099](../../../specs/SDD/negocio/regras/business-rules.md#rn-099--acesso-por-combinação-tipo-de-conta--permissão-de-módulo)). O escopo do cliente é por unidade concedida; perfis internos operacionais veem a frota.

A ordem dos matchers em `SecurityConfig` importa: rotas específicas, como `/api/usuarios/me`, vêm antes das gerais. O handshake `/ws` é seguido de autenticação e autorização no STOMP. Assinaturas e entregas conferem acesso à unidade vigente.

## Persistência e integração

MySQL usa **Flyway no startup** e Hibernate `ddl-auto=validate` em todos os perfis. Migration aplicada não deve ser editada. O Backend não consome MQTT nem acessa o schema do InfluxDB: o serviço de Telemetria é dono da ingestão e da consulta REST. Leituras ao vivo chegam pelo WebSocket e não são persistidas por esse canal.

O documento de **limites do servidor** é lido/gravado por REST e avaliado pelo motor de alarmes. O antigo STOMP de limites foi removido; o documento de **cards** continua sincronizado com o Desktop pelo canal `/cards`. O alarme local da estação tem configuração independente.

## Módulos removidos

Projetos, Processos, Observações e Químicos saíram do Backend. Seus IDs de requisitos permanecem no [inventário](../../../specs/SDD/negocio/requisitos/current-features.md) e nos [registros históricos](history/README-2026-09.md). Tabelas órfãs e limpeza de produção seguem [OQ-026](../../../specs/SDD/negocio/requisitos/open-questions.md#oq-026--o-que-fazer-com-as-tabelas-órfãs).

## Verificação

Mudanças de autorização precisam de testes HTTP de `SecurityConfig`; mudanças de schema, testes Flyway em MySQL descartável. Contratos transversais devem ser atualizados com os consumidores correspondentes. Resultados antigos de teste e a sequência das remoções estão no [histórico](history/README-2026-09.md).
