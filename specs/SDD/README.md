# SDD — GeopetroIO

Este System Design Document descreve o comportamento esperado do sistema e os contratos entre aplicações. As specs nasceram de engenharia reversa em 2026-08-26: código é evidência do que existe, mas não valida sozinho uma regra de negócio.

## Estrutura

```text
SDD/
├── negocio/
│   ├── requisitos/
│   ├── regras/
│   └── usuarios/
├── software/
│   ├── backend/
│   ├── frontend/
│   ├── apis/
│   ├── dados/
│   ├── mqtt/
│   ├── seguranca/
│   ├── observabilidade/
│   └── testes/
└── infra/
    ├── vm/
    ├── docker/
    ├── rede/
    ├── backup/
    └── ci-cd/
```

## Onde encontrar a regra vigente

| Assunto | Fonte principal |
|---|---|
| Produto, usuários e operação de campo | [Contexto de produto](negocio/requisitos/product-context.md) |
| Arquitetura e responsabilidades | [Visão do sistema](software/system-overview.md) e [Mapa de domínios](software/dados/domain-map.md) |
| Comportamento existente | [Funcionalidades](negocio/requisitos/current-features.md) e [Regras de negócio](negocio/regras/business-rules.md) |
| Pendências de decisão | [Perguntas abertas](negocio/requisitos/open-questions.md) |
| Integrações entre aplicações | [APIs](software/apis/) e [MQTT](software/mqtt/) |
| Recursos transversais | [Features](negocio/requisitos/) |
| Segurança e manutenção | [Achados de segurança](software/seguranca/security-findings.md) e [Dívida técnica](software/technical-debt.md) |
| Detalhes de uma aplicação | `specs/` da aplicação correspondente |

**Precedência:** o contrato transversal define a interface entre aplicações; a spec da feature define o comportamento; os catálogos RN/OQ/DT mantêm identificadores e referências. Auditorias e registros de entrega são evidência datada. Quando uma decisão substitui outra, o texto vigente deve indicá-la e o histórico deve apontar para ela.

## Convenção de marcação

| Marcador | Significado |
|---|---|
| **[FATO]** | Comportamento conferido no código, com referência verificável |
| **[DECIDIDO data]** | Regra confirmada pela equipe |
| **[INFERÊNCIA]** | Dedução ainda não confirmada |
| **[PENDENTE]** | Decisão ou verificação necessária |

Uma entrega de código não transforma automaticamente uma **[INFERÊNCIA]** em regra aprovada. Use um estado explícito para distinguir comportamento implementado, requisito decidido e proposta.

## Como manter uma spec curta

1. Registre nela o comportamento vigente, entradas e saídas, exceções e critérios de aceite.
2. Mantenha contratos e fórmulas com a precisão necessária para implementação e verificação.
3. Coloque relato de investigação, decisões substituídas, contagens de testes e sequência de commits em um registro histórico, com link a partir da spec.
4. Atualize a spec junto com a mudança de comportamento. Não deixe duas instruções vigentes para o mesmo assunto.
5. Preserve IDs RN/OQ/DT e links existentes ao consolidar ou encerrar itens.

## Decisões que organizam o sistema

- A telemetria histórica usa **MQTT → Geopetro-Telemetria → InfluxDB**; o tempo real usa **Desktop → Backend → Front por WebSocket/STOMP**. Veja os contratos de [APIs](software/apis/) e [MQTT](software/mqtt/).
- Alarmes do **servidor** geram eventos e histórico a partir do tempo real. O alarme da **estação** usa limites locais independentes e apenas sinaliza no Desktop. Veja [alarmes](negocio/requisitos/alarmes.md) e [configuração da estação](negocio/requisitos/configuracao-da-estacao.md).
- Usuário, Empresa, Regional, Setor, Unidade e o login passam para o **Braserv-Core**, que emite o token para todas as aplicações. O cadastro passa a se chamar Unidade em todo o sistema. Decidido em 2026-10-06, ainda não implementado. Veja [Braserv-Core](software/backend/braserv-core.md).
- O simulador web e os dois desktops têm specs próprias. O relatório do simulador é entregável ao cliente; validação de entrada e rastreabilidade dos cálculos são requisitos.
- [GeoPetro Vision](negocio/requisitos/geopetro-vision.md) está especificado para uma integração futura. O [contrato proposto](software/apis/geopetro-vision.md) ainda depende das decisões marcadas como pendentes.

As entrevistas e auditorias datadas continuam disponíveis como histórico; para agir hoje, comece pelos documentos da tabela acima.
