# Specs — Geopetro-Desktop

O Desktop roda na unidade, lê o CLP, mostra o dashboard e publica telemetria por dois caminhos: **MQTT** para histórico e **WebSocket/STOMP** para tempo real. Mantém registro local e alarme da estação mesmo sem conexão. O [inventário histórico](history/README-2026-09.md) guarda mapeamentos antigos, investigações e entregas datadas.

## Contratos vigentes

| Assunto | Fonte |
|---|---|
| Endereços e tipos de card | [Cards configuráveis](../../../specs/SDD/negocio/requisitos/cards-configuraveis.md) |
| Engrenagem, autenticação e alarme local | [Configuração da estação](../../../specs/SDD/negocio/requisitos/configuracao-da-estacao.md) |
| Mensagem histórica | [MQTT](../../../specs/SDD/software/mqtt/mqtt-telemetria.md) |
| Estado ao vivo | [WebSocket](../../../specs/SDD/software/apis/websocket-realtime.md) |
| Regras RN e pendências | [Regras de negócio](../../../specs/SDD/negocio/regras/business-rules.md) · [Perguntas OQ](../../../specs/SDD/negocio/requisitos/open-questions.md) |

## Leitura e configuração

O documento de **cards da unidade** define quais grandezas e endereços são lidos. IP, rack, slot, DB e intervalo do CLP são editados na engrenagem, mas persistem nesse documento. `CardsState` mantém o snapshot válido e `CardsStore` o grava em `config/cards-da-unidade.json` para reinício sem rede. Unidade sem cards configurados não lê grandezas nem publica telemetria ([RN-088](../../../specs/SDD/negocio/regras/business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada)).

A engrenagem exige `ADMIN` ou `SUPORTE` autenticado. A URL do Backend pode ser informada na tela de login inicial. Calibração de peso/torque é local e vinculada à identidade do card. O sininho é a única configuração sem login: mínimo, máximo e liga/desliga do **alarme local**, persistidos em `config/alarmes-locais.json`.

O Desktop não recebe limites de alarme do servidor. Ele assina somente `/cards`; o Backend avalia os limites remotos a partir das leituras recebidas em tempo real.

## Publicação e continuidade

MQTT e tempo real têm interruptores independentes na engrenagem. A ausência da chave vale **ligado**; desligar suspende a publicação daquele caminho sem parar CLP, dashboard, registro local, cache de cards ou alarme local. O tempo real envia o estado mais recente na reconexão; o histórico MQTT conserva sua política de contingência própria.

Card ativo e invisível continua visível no dashboard da estação e pode alarmar localmente; ele não integra a publicação de tempo real. Uma unidade que não publica pode parecer indisponível remotamente, inclusive quando foi desligada de propósito.

## Situação operacional

Instalações de campo só recebem código novo por atualização do Desktop. O auto-update necessário à frota continua pendente; a instalação deve ocorrer com o CLP desconectado. Correções de fórmula compartilhada com o Horus precisam ser conferidas nos dois produtos, que permanecem separados.

## Verificação

Conferir leitura com documento de cards, restauração offline, isolamento ao trocar unidade/servidor/conta, conversão e calibração, publicação independente por caminho, alarme local sem rede e bloqueio da engrenagem. Evidências de testes antigos e detalhes de arquivos estão no [histórico](history/README-2026-09.md).