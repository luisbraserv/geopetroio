# Configuração da estação — regras vigentes

**[FATO 2026-09-10]** O Desktop separa a configuração da unidade, o alarme local e a publicação de telemetria. O [registro da entrevista e implementação](historico/features/configuracao-da-estacao-entrevista-2026-09.md) conserva decisões substituídas, análise do código e entregas. Contratos de integração estão em [cards](cards-configuraveis.md) e [limites do servidor](../../software/apis/configuracao-sonda.md).

## 1. Responsabilidades

| Ajuste | Autoridade | Persistência |
|---|---|---|
| Limites do alarme **local** | Pessoa na estação, pelo sininho, sem login | `config/alarmes-locais.json` |
| Conexão do CLP, cards, calibração, endereços e telemetria | `ADMIN` ou `SUPORTE` autenticado | Documento de cards da unidade e configuração local |
| Limites do alarme **remoto** | Quem pode ver a sonda, inclusive cliente autorizado | Documento do Backend |

O alarme local apenas sinaliza na estação. O Backend é o único produtor do histórico de alarmes e avalia seus próprios limites a partir do tempo real ([RN-104](../regras/business-rules.md#rn-104--a-estação-sinaliza-o-alarme-o-servidor-o-registra)).

## 2. Estado atual

A engrenagem edita a conexão do CLP e os parâmetros de publicação. A tela de Cards edita as grandezas. Ambas gravam metades do mesmo documento de cards da unidade; antes de salvar, relêem a metade alheia e recusam conflito na metade própria ([RN-112](../regras/business-rules.md#rn-112--cada-tela-grava-só-a-sua-metade-do-documento-da-unidade)). O antigo `plcIp` em `app-settings.json` não determina a conexão.

## 3. Alarme próprio da estação

Cada card ativo aparece no dashboard da estação, mesmo quando `visivel=false` para publicação remota. Seu sininho indica sem faixa, faixa ativa, disparo ou faixa desativada. Sem mínimo nem máximo, o alarme não pode ficar ativo. O ajuste local é a única configuração do Desktop sem login e não tem autoria.

A faixa é identificada por `dispositivoId` e `serie`, com mínimo, máximo e liga/desliga. A tela não expõe tempo mínimo: o motor usa **3 s para abrir** e **5 s para fechar**. Card desativado hiberna a faixa, sem apagá-la. O arquivo local não viaja ao Backend.

### 3.3 O Desktop para de receber o documento de limites

**[FATO]** O Desktop não assina limites do servidor. O tópico e o snapshot STOMP desse documento foram removidos do Backend; `GET`/`PUT /api/sondas/{id}/configuracao` e a avaliação no servidor permanecem. O canal `/cards` continua ativo e entrega o documento necessário à leitura do CLP.

## 4. Conexão do CLP na engrenagem

IP, rack, slot, DB e intervalo de leitura são editados na engrenagem e gravados no documento de cards da **unidade** ([RN-113](../regras/business-rules.md#rn-113--a-conexão-do-clp-mora-na-unidade-não-na-estação)). A cópia entre unidades leva rack/slot/DB/intervalo, mas **não o IP**: copiar IP poderia publicar leituras de uma unidade com a identidade de outra. A tela informa quais campos a cópia trouxe.

O painel antigo de conexão sai da tela de Cards. Os checkboxes legados “Cards visíveis no monitoramento” saem da engrenagem; visibilidade é propriedade de cada card.

## 5. Acesso à engrenagem

Toda a engrenagem exige sessão de configuração com `ADMIN` ou `SUPORTE`, inclusive URL/credenciais do broker, conexão do CLP, calibração e interruptores. A configuração inicial exige internet. O endereço do **Backend** pode ser informado na janela de login para permitir autenticar uma estação nova; só é salvo depois de credencial aceita. O sininho do §3 continua livre.

## 6. Publicação liga/desliga

A engrenagem oferece interruptores independentes para **MQTT histórico** e **WebSocket tempo real**, guardados em `app-settings.json`. Chave ausente vale **ligado**; só `false` explícito desliga. Desligar um caminho interrompe sua publicação, sem parar leitura do CLP, dashboard, histórico local, cache de cards ou alarme local. Desligar tempo real suspende a avaliação no servidor enquanto não chegam leituras.

Os interruptores não são informados ao Backend. Uma unidade calada de propósito pode parecer indisponível remotamente; essa limitação está registrada em [OQ-049](open-questions.md#oq-049--como-saber-quais-unidades-da-frota-já-foram-configuradas).

## 7. Prontidão da Frota

A tela de Prontidão da Frota foi removida. Ela classificava unidades a partir de contagens que não provavam cobertura de alarme. O crescimento da frota pode exigir observabilidade nova, mas não restaura aquela classificação.

## 8. Histórico da decisão

As quatro rodadas da entrevista, alternativas rejeitadas e detalhes das entregas estão no [registro histórico](historico/features/configuracao-da-estacao-entrevista-2026-09.md). Esta seção preserva a referência usada por documentos anteriores.

## 9. Regras de negócio

[RN-086](../regras/business-rules.md#rn-086--configurar-exige-admin-ou-suporte-autenticado-no-backend), [RN-104](../regras/business-rules.md#rn-104--a-estação-sinaliza-o-alarme-o-servidor-o-registra) e [RN-108 a RN-114](../regras/business-rules.md#rn-108--o-alarme-da-estação-é-configurado-na-estação) detalham autorização, alarme local, cards e publicação.

## 10. Pontos em aberto

A observabilidade remota da configuração e do silêncio voluntário da unidade permanece em [OQ-049](open-questions.md#oq-049--como-saber-quais-unidades-da-frota-já-foram-configuradas). A distribuição automática de novas versões do Desktop ainda depende de auto-update.

## 11. Verificação

Conferir: alarme local sem rede e sem login; card invisível ainda presente na estação; troca de unidade sem reutilizar cache errado; cópia de conexão sem IP; conflito entre edições da engrenagem e de Cards; primeira configuração online; interruptores desligando só a publicação e preservando leitura, cards e alarme local.
