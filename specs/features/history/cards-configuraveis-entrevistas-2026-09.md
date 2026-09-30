# Histórico — cards configuráveis

Entrevistas, ordem das entregas e riscos de virada. A [SPEC vigente](../cards-configuraveis.md) prevalece.

## 12. A entrevista de 2026-09-07

**[DECIDIDO 2026-09-07]** Quatro rodadas. O que mudou em relação à primeira versão desta spec:

| Tema | Antes | Depois da entrevista |
|---|---|---|
| Onde se configura | Suposto Desktop | **Confirmado: só Desktop.** Front só lê |
| Documento | Um, com cards e limites | **Dois**, com autoridades e revisões próprias |
| Tanque | Publicava nível ou volume, em aberto | **Volume, em bbl** |
| Contador de stroke | Uma série, com vazão derivada | **Três séries**, e **várias bombas por unidade** |
| Exclusão de card | Em aberto | **Não existe** — só desativação, com o limite hibernando junto |
| Frota atual | Proposto nascer configurada | **Nasce vazia**, com cópia entre unidades como mitigação |
| Conferência ao vivo | Proposta | **Recusada** |
| Mesmo endereço em dois cards | Proposto recusar | **Permitido** |
| Horus | Em aberto | **Continua separado** |

## 13. Ordem de implementação sugerida

1. ✅ **Modelo e contrato** — documento de cards separado do de limites, com `conexao` e `cards`.
   Entregue em 2026-09-07: `/api/sondas/{id}/cards`, tabela própria, revisão, tópico STOMP e guarda
   de saída dedicada. ⚠️ **A calibração de peso e torque ficou de fora** — os 8 parâmetros da cadeia
   do sargento vivem na configuração local do Desktop, medidos na unidade, e trazê-los para o
   documento é migração de valores calibrados, não acréscimo de campo. O card diz **onde ler**; o
   Desktop aplica a calibração que já tem
2. ✅ **Cache persistente no Desktop** (§8) — antes de qualquer card depender dele
3. ✅ **Leitura em bloco dirigida por configuração** — entregue em 2026-09-08. `BlocoDeLeitura` lê a
   faixa de uma vez e fatia; `LeituraDeCards` decide **quais** endereços entram nela, a partir do
   documento em vez das constantes. Card desativado não entra na faixa — o que também encolhe a
   leitura quando alguém desativa o card do endereço mais alto
4. ✅ **Estado de stroke e vazão por card** (§3) — entregue em 2026-09-07, antes de existir
   configuração que declare duas bombas: é refatoração sem mudança de comportamento
5. ✅ **Role `SUPORTE` + sessão de configuração no Desktop** (§9) — entregues
6. ✅ **UI de configuração de cards** no Desktop, com cópia entre unidades (§10) — entregue em
   2026-09-07. Botão **Cards** na barra do Desktop, ao lado da engrenagem e não dentro dela: são
   autoridades diferentes. Configurações ajusta *esta estação* e não pede login; Cards altera o que a
   *unidade* lê, só por ADMIN ou SUPORTE, com login. Lista à esquerda, formulário à direita com os
   parâmetros trocando conforme o tipo, painel de conexão do CLP e rodapé fixo.
   ⚠️ **Não há botão de excluir** (RN-091) e **não há leitura ao vivo do endereço** (§10)
7. ✅ **Temperatura e nível de tanque** — entregue em 2026-09-08, em duas metades: a conversão
   (`ConversaoTemperatura`, `ConversaoTanque`) e depois os desenhos (`TermometroView`, `TanqueView`),
   que traçam a **escala configurada** e não uma fixa — um sensor de motor (0..150) e um de lama
   (−20..80) desenham diferente para a mesma temperatura

   **[CORRIGIDO 2026-09-09]** O monitoramento do Desktop agora monta os indicadores pelo documento,
   antes da primeira leitura do CLP, com `--` enquanto não há medição. O cache de cards é restaurado
   antes do login de rede. Reabrir a página, renomear e desativar cards atualiza a tela sem deixar
   nós antigos ou timers duplicados. Ver [auditoria do Desktop](../../auditoria-desktop-cards-2026-09.md).

   ⚠️ **Junto veio a virada do H2 local.** `SondaReading`, de colunas fixas, deu lugar a uma linha
   por grandeza ([RN-100](../../business-rules.md#rn-100--o-histórico-local-é-por-grandeza-e-tem-prazo)):
   a tabela antiga não conseguia representar um terceiro card de torque, um de temperatura ou um de
   tanque. E como uma linha por grandeza multiplica o crescimento pelo número de cards, entrou
   **retenção de 180 dias**, configurável. ⚠️ **Isso apaga dado local** passado o prazo
8. ✅ **Front dinâmico** — monitoramento e tempo real montados a partir da configuração da unidade.
   Entregue em 2026-09-08. As duas telas leem `GET /api/sondas/{id}/cards` e derivam as grandezas em
   `services/grandezas-de-card.ts` — único ponto do front que sabe que um card de stroke rende três
   séries. Unidade sem cards mostra o motivo em vez de uma tela vazia (RN-088).

   ⚠️ **Junto veio o filtro `serie` no caminho de leitura do histórico**, nos três projetos: sem ele
   uma consulta a um card de stroke devolvia as três séries misturadas na mesma linha do tempo. Era a
   pendência que [mqtt-telemetria §4](../../contracts/mqtt-telemetria.md#as-três-séries-do-contador-de-stroke)
   apontava, e o contrato de leitura agora a expõe
   ([rest-monitoramento §2](../../contracts/rest-monitoramento.md#o-filtro-serie--fato-2026-09-08)).

⚠️ O passo 3 é o de maior risco: troca o caminho de leitura de toda a frota. Como a frota nasce vazia
(§10), o comportamento observável **vai** mudar no dia do deploy — a telemetria só volta unidade a
unidade, conforme cada uma for configurada.

⚠️ **Por isso o passo 3 não pode ser concluído antes dos passos 5 e 6.** Enquanto não houver sessão de
configuração e UI no Desktop, ninguém consegue configurar unidade nenhuma: fechar o passo 3 antes
deixaria a frota sem telemetria **e sem meio de restabelecê-la**. A ordem numérica não é a ordem de
entrega — a dependência real é 5 e 6 antes de 3b.

## 14. A entrevista de 2026-09-08 — o contrato por unidade

**[DECIDIDO 2026-09-08]** Seis decisões que reescreveram
[`mqtt-telemetria.md`](../../contracts/mqtt-telemetria.md) e
[`websocket-realtime.md`](../../contracts/websocket-realtime.md).

| # | Pergunta | Resposta | Consequência |
|---|---|---|---|
| 1 | "Remover card" contradiz RN-091. O que significa? | **Continua só desativando** | RN-091 fica como está. É ela que sustenta o histórico: série gravada continua tendo o que a explique |
| 2 | Como as três séries do stroke se identificam? | **Delegado** — proposta aceita | [RN-098](../../business-rules.md#rn-098--as-três-séries-do-contador-de-stroke-se-distinguem-por-serie): um `dispositivoId` + campo `serie` |
| 3 | O que fazer com o histórico já gravado? | **Não há dado relevante** | Quebra limpa. Sem mapa de equivalência para manter para sempre |
| 4 | Quem descreve a leitura para a Telemetria? | **A mensagem se descreve** | [RN-097](../../business-rules.md#rn-097--a-mensagem-de-telemetria-se-descreve). `CatalogoDispositivos` morre |
| 5 | Unidade sem cards, o que faz? | **Não lê nada** (RN-088) | Um caminho de leitura só. ⚠️ A frota fica muda no deploy até ser configurada |
| 6 | Card sem calibração publica o quê? | **Nada — lacuna no gráfico** | [RN-099](../../business-rules.md#rn-099--grandeza-sem-valor-não-é-publicada) |
| 7 | Tempo real acompanha o MQTT? | **Sim, lista de leituras** | ⚠️ Quebra o Angular até o passo 8 |
| 8 | Dashboard do Desktop vira agora? | **Depois, com o passo 7** | Por um tempo o Desktop lê e publica cards que a própria tela não mostra |

### O que a soma dessas decisões produz

Três delas — **5**, **7** e a **quebra de ids** — valem individualmente e se somam num deploy que
muda Desktop, Backend e Front ao mesmo tempo, com a frota inteira muda até ser configurada unidade a
unidade.

Está registrado com o custo à vista em
[`mqtt-telemetria.md §10`](../../contracts/mqtt-telemetria.md#10-o-que-a-virada-quebra), com as
alternativas recusadas e o motivo de cada uma. As mitigações: a tela de configuração e a cópia entre
unidades, entregues em 2026-09-07, e ✅ **saber de fora quais unidades já viraram**, entregue em
2026-09-09 pela tela de prontidão da frota
([OQ-049](../../open-questions.md#oq-049--como-saber-quais-unidades-da-frota-já-foram-configuradas)).

⚠️ **A prontidão fala de configuração, não de publicação.** Uma unidade configurada e com o CLP
desligado aparece como pronta — a virada pode estar completa e a sonda, mesmo assim, muda.
