# Cimentação primária — redesenho da tela

> **[REVISÃO R2 — 2026-09-19]** O alvo atual está em
> [Padrão do squeeze, cenários e relatório](../cimentacao-primaria-padrao-squeeze.md).
> Ele amplia esta entrega com grupos/subseções retráteis, cenários por pastas,
> dados completos do relatório, sequência operacional da primária e receitas com
> pasta/aditivos no documento. Prevalece sobre as restrições abaixo de não alterar
> persistência/relatório e de manter o modal sem pastas. T1–T7 ficam como histórico.

> Complementa [`cimentacao-primaria.md`](../cimentacao-primaria.md). Aqui está **só a
> tela**: layout, onde cada dado é editado, o que aparece no conteúdo, o menu
> flutuante e a receita da pasta. O motor não muda.

**[DECIDIDO 2026-09-18]** A página entregue em P7–P11 usa um layout próprio, com
abas, formulários e resultados empilhados na mesma coluna. O usuário pediu que ela
siga o **mesmo desenho do squeeze**. Esta SPEC descreve o alvo e a sequência para
chegar lá.

## 1. O que muda e o que não muda

| Camada | Situação |
|---|---|
| Motor (P1–P6) | **Não muda.** Geometria, volumes, transporte, hidráulica e diagnósticos continuam como estão |
| Persistência (P10) e relatório (P11) | **Não mudam** no conteúdo; mudam de lugar na tela |
| Importação de medições (P8) | Não muda; a comparação perde os gráficos junto com os demais |
| Gráficos (P7 e P9) | **Todos removidos da tela**, para voltarem um a um sob demanda |
| Receita da pasta (P4) | Ganha edição de aditivos como no squeeze |
| Layout | Passa a espelhar o squeeze: menu horizontal, sidebar vertical, dock flutuante |

⚠️ **Remover gráfico não é remover cálculo.** As séries de P6 e P9 continuam sendo
calculadas e continuam nos contratos, no cenário salvo e no relatório. O que sai é
o desenho. Sem isso, cada gráfico devolvido depois exigiria refazer o motor.

## 2. Layout alvo

Espelha `simulador-squeeze.component.html`, com os mesmos nomes de classe e a mesma
estrutura, para que os tokens visuais e o comportamento já validados sejam herdados
em vez de recriados.

```text
┌──────────────────────────────────────────────────────────┐
│ cabeçalho: título + estado do cálculo                     │
├──────────────────────────────────────────────────────────┤
│ .sim-tabs   ← menu HORIZONTAL de abas                     │
├───────────────┬──────────────────────────────────────────┤
│ .sim-sidebar  │ conteúdo da aba ativa                    │
│ (vertical,    │ — resultados, tabelas, esquemático        │
│  retrátil,    │ — nunca formulários de entrada            │
│  acordeões)   │                                           │
│ ← ENTRADAS    │                                           │
├───────────────┴──────────────────────────────────────────┤
│              .sidebar-dock  ← menu FLUTUANTE              │
│      [ocultar painel] [Cenários] [Relatório]              │
└──────────────────────────────────────────────────────────┘
```

**[DECIDIDO]** Regra que separa as duas áreas: **a sidebar recebe o que o usuário
digita; o conteúdo mostra o que o motor devolve.** Um campo editável no conteúdo é
desvio a corrigir, não exceção. A sidebar é retrátil pelo dock, como no squeeze.

### 2.1 Abas do menu horizontal

Numeradas como no squeeze, na ordem em que a operação é montada:

| Aba | Conteúdo (somente leitura) |
|---|---|
| 1. Volumes e programa | Volumes por colocação, deslocamento, TOC ideal e real, cronograma em tabela |
| 2. Receita da pasta | Composição resultante, rendimento, sacos, água e aditivos por colocação |
| 3. Simulador | Resumo das pressões, gráficos da operação (o de envelope inclusive) e limites excedidos |
| 4. Esquemático | Resumo do poço e do alvo, tabela de fases, desenho 2D com a reprodução, estado e ECD no instante selecionado, e 3D sob demanda |
| 5. Dados medidos | Conjuntos importados, proveniência, alinhamento e resíduo em tabela |

**[DECIDIDO]** Sem aba **Gráficos** enquanto não houver gráfico. Ela volta quando o
primeiro for reconstruído.

### 2.2 Acordeões da sidebar

Mesmo componente do squeeze (`tui-accordion` + `tui-expand`), numerados:

| Acordeão | Entradas |
|---|---|
| 1. Dados do relatório | Cliente, poço, nome do cenário |
| 2. Poço | Seletor de poço cadastrado e edição das fases |
| 3. Revestimento-alvo | Convencional ou liner, sapata, colar, topo do liner, ID/OD, coluna de assentamento |
| 4. Anular e retorno | Excesso ou calibre medido, contrapressão, condição da cabeça |
| 5. Fluidos e pastas | Lista de fluidos, densidade, reologia, origem de cada propriedade |
| 6. Estágios e intervalos | TOC alvo, intervalos por colocação, reserva de mistura |
| 7. Programa de bombeio | Passos, vazões, pausas, reordenar, repetir, remover |
| 8. Janela e equipamento | Poro, fratura, pressão e vazão máximas, potência, eficiência |
| 9. Apresentação e referências | Modo de volume e referências de ECD |
| 10. Importar medições | Arquivo, decimal, coluna de tempo, unidades, offset e canais |
| (T6) Aditivos da pasta | Catálogo, concentração e unidade — ver §5 |

**[PENDENTE]** A ordem dos acordeões pode mudar depois de ver a tela; o que não muda
é que **toda** entrada fica na sidebar.

### 2.3 Dock flutuante

**[DECIDIDO]** Três botões, como no squeeze, na parte de baixo:

| Botão | Ação |
|---|---|
| Ocultar/Exibir painel | Recolhe a sidebar |
| **Cenários** | Abre o modal de cenários: listar, abrir, salvar, exportar e importar |
| **Relatório** | Abre o relatório da primária |

A barra de cenário que hoje fica no topo da página **sai**. Salvar, listar, abrir,
exportar e importar passam todos para dentro do modal de Cenários. O indicador de
"salvo / não salvo" acompanha o botão, para não sumir da vista.

**[DECIDIDO em T5]** A primária usa modal próprio, `PrimaryScenarioModalComponent`.
O do squeeze monta payload genérico sem validar o cenário da primária e gerencia
pastas que esta tela não gerencia; a moldura visual foi copiada, a lógica não
([codec de P1](../cimentacao-primaria.md#131-entrega-de-implementação--contratos-e-geometria)).
Não forçar o modal do squeeze a entender o cenário da primária por gambiarra.

## 3. Remoção dos gráficos

**[DECIDIDO]** Saem da tela da primária, nesta ordem de arquivos:

| Item | O que fazer |
|---|---|
| `app-squeeze-operation-charts` na primária | Remover o uso; **o componente continua**, servindo squeeze e tampão |
| `app-primary-annex-charts` (G1–G5) | Remover o uso da página; manter o componente e o módulo de séries |
| `app-ops-chart` (cronograma) | Remover; o cronograma vira tabela na aba 1 |
| `app-thickening-chart`, `app-uca-chart` | Remover da primária |
| Aba **Gráficos** | Some enquanto não houver gráfico |
| Cursor de tempo | **Fica.** Continua sincronizando esquemático e leitura de estado |

**[DECIDIDO]** `primary-annex-charts.ts` (as séries) e `primary-annex-charts.component.ts`
(o desenho) **não são apagados**. Ficam sem uso na página, com teste, prontos para
voltar um a um. Apagar o que já está testado só criaria retrabalho.

**[DECIDIDO]** O catálogo de gráficos do relatório passa a marcar cada um como
indisponível com o motivo `gráfico ainda não reconstruído na tela`, em vez de
sumir. O relatório continua listando o que existirá.

**Reconstrução:** um gráfico por vez, quando pedido. Cada um entra com a sua
definição de eixos, séries e critério de indisponibilidade já escritos em
[§8 da SPEC principal](../cimentacao-primaria.md#8-gráficos-e-comportamento-de-tela) e
em [Gráficos e dados medidos](../cimentacao-primaria-graficos.md).

## 4. Dados na tela

**[DECIDIDO]** O conteúdo mostra número, não campo. Cada aba entrega tabelas e
blocos de métrica no padrão `.metrics` do squeeze. Onde hoje há `<input>` no
conteúdo, o valor passa a ser texto e o campo vai para a sidebar.

Continua valendo o que a SPEC principal já exige e que **não pode se perder no
redesenho**:

- valor indisponível aparece como indisponível, com o motivo, nunca como zero;
- unidade junto de cada número;
- diagnósticos visíveis, com código e severidade;
- resultado interrompido identificado como parcial.

## 5. Receita da pasta com aditivos

**[DECIDIDO]** A primária passa a ter o mesmo fluxo de aditivos do squeeze:
catálogo `ADITIVOS_CATALOGO`, adicionar por linha, concentração com unidade de
dosagem, e o modal `AditivoModalComponent` para importar e exportar.

Fluxo alvo:

```text
sidebar: escolher classe do cimento, água, sílica, sal
      →  adicionar aditivos (catálogo ou manual), com concentração e unidade
      →  motor de pasta calcula densidade, rendimento, FAC e FAM
conteúdo: rendimento e composição resultantes
      →  volume dimensionado por TOC e geometria
      →  sacos de 94 lb, água de mistura e quantidade de cada aditivo
```

⚠️ **Um ponto a decidir antes de implementar.** No squeeze, o usuário **digita** o
volume de pasta e a receita é calculada para ele. Na primária, a SPEC principal
proíbe isso: *"Volume: derivado de TOC + geometria + intervalos por pasta; não
editar total de cimento independentemente desses dados"*
([§4](../cimentacao-primaria.md#4-entradas-unidades-e-validação)). As duas coisas não
podem valer ao mesmo tempo para o mesmo número.

Encaminhamento proposto, a confirmar com o usuário:

| Opção | Efeito |
|---|---|
| **A (proposta)** | O volume bombeado continua vindo de TOC e geometria. Os aditivos mudam o **rendimento**, e daí saem sacos, água e aditivos para o volume dimensionado. Um campo separado de **receita por volume** existe como conferência de suprimento, claramente identificado, e **não** alimenta a simulação |
| B | O usuário digita o volume de pasta e a simulação passa a usá-lo, contrariando §4 da SPEC principal, que precisaria ser alterada com registro da decisão |

**[DECIDIDO em T6]** A opção **A** foi implementada. O usuário reafirmou o pedido
sem escolher entre as duas, e A é a única que não conflita com §4 da SPEC
principal. A receita por volume digitado, como conferência de suprimento, ainda
não existe; se for pedida, entra identificada e sem alimentar a simulação.

## 6. O que não pode regredir

**[DECIDIDO]** O redesenho não pode desfazer o que as etapas anteriores garantiram.
São as invariantes a manter sob teste:

| Invariante | Origem |
|---|---|
| Alterar entrada pausa a reprodução e invalida o resultado | P7 |
| Mover o cursor não recalcula o motor | P7 |
| Cimento desenhado fora do OD do revestimento | P7 |
| Medição importada não altera o cálculo | P8 |
| "Salvo" só depois da resposta da API | P10 |
| Arquivo inválido não substitui o cenário aberto | P10 |
| Relatório parcial não conclui sobre a operação | P11 |
| Squeeze e tampão intocados | P12 |

## 7. Sequência de implementação

| Ordem | Entrega | Critério de pronto |
|---|---|---|
| [x] T1 | Remover os gráficos | Nenhum componente de gráfico na primária; squeeze e tampão intactos; relatório marcando "não reconstruído"; suíte e build verdes |
| [x] T2 | Esqueleto do layout | `.sim-tabs`, `.sim-body`, `.sim-sidebar` e `.sidebar-dock` no padrão do squeeze, com a sidebar recolhendo |
| [x] T3 | Entradas para a sidebar | Todo campo editável migrado para os acordeões; conteúdo sem `<input>` |
| [x] T4 | Conteúdo por aba | As seis abas com tabelas e métricas, incluindo o cronograma que era gráfico |
| [x] T5 | Dock: cenários e relatório | Barra de cenário removida do topo; modal de cenários decidido e ligado; relatório pelo dock |
| [x] T6 | Aditivos e receita | Catálogo, modal, concentrações e quantidades por colocação; opção A de §5 |
| [ ] T7 | Regressão da tela | Invariantes de §6 sob teste; renderização de cada aba; revisão visual **com uma pessoa** |

**T7 fecha o redesenho.** Antes dele, a tela é considerada em obra.

## 7.1 T1 — concluído em 2026-09-19

**[FATO]** Saíram da página os cinco gráficos compartilhados, os cinco anexos
G1–G5, o cronograma, o espessamento e o UCA. A aba **Gráficos** desapareceu, e a
página não tem mais nenhum elemento `canvas`.

**Ficaram, como decidido:** o esquemático 2D, o 3D sob demanda, o cursor de tempo
e a reprodução. Os módulos `primary-annex-charts.ts` e o componente de desenho
continuam no repositório, com os seus testes, apenas sem uso na página.

**O que sobreviveu por ser entrada do motor, e não do gráfico:** o modo de volume
do cenário e as referências de ECD. Os dois alimentam a hidráulica e são
persistidos no cenário; perderam apenas o seletor, que volta na sidebar em T3. Há
teste garantindo que uma referência acrescentada continua chegando ao motor.

**[FATO]** O relatório continua listando os quinze gráficos, agora todos marcados
como indisponíveis com o motivo *"Gráfico ainda não reconstruído na tela após o
redesenho"*. Nenhum sumiu do documento.

⚠️ **Um descuido corrigido no caminho.** A primeira passagem removeu junto o
cálculo dos overlays do desenho, que ficava no meio do bloco dos gráficos. O teste
de renderização pegou, e ele foi restaurado.

**Verificação:** 685 testes em 66 arquivos aprovados e `npm run build` exit 0.
Seis casos que só existiam para os gráficos saíram; dois entraram, um garantindo
que a tela não tem `canvas` e outro que modo de volume e referências sobrevivem.
Squeeze e tampão intocados: o componente compartilhado segue servindo os dois.

## 7.2 T2 — concluído em 2026-09-19

**[FATO]** A página passou a usar as mesmas classes do squeeze: `.sim`,
`.page-head`, `.sim-tabs`/`.sim-tab`, `.sim-body`, `.sim-sidebar`, `.sim-main` e
`.sidebar-dock`. As regras de estilo foram copiadas do squeeze em vez de
reinventadas, para que os tokens da marca e o comportamento já validados venham
junto. A sidebar recolhe pelo dock, e o conteúdo ocupa a largura inteira quando
ela some.

**O cabeçalho ganhou o formato do squeeze:** *eyebrow*, título, subtítulo e, à
direita, o seletor de unidade de profundidade junto do indicador de resultado.

**Dock com os três botões previstos:** ocultar painel, Cenários e Relatório. O
Relatório já abre o documento de P11. **Cenários** abre, por enquanto, o painel que
antes ficava fixo no topo; ele vira modal em T5, quando a decisão sobre reusar ou
não o modal do squeeze estiver tomada.

⚠️ **A sidebar ainda está quase vazia.** Recebeu apenas o acordeão *1. Dados do
relatório*, com cliente e nome do cenário. As demais entradas continuam no
conteúdo até T3, e há um aviso na própria sidebar dizendo isso, para a tela não
parecer quebrada a quem abrir agora.

**Verificação:** 687 testes em 66 arquivos aprovados e `npm run build` exit 0. Três
casos novos conferem o esqueleto no DOM: as abas horizontais em número igual ao
das abas declaradas, os três botões do dock, a sidebar recolhendo com o conteúdo
preservado, e o painel de cenários só aparecendo depois do clique no dock.

## 7.3 T3 — concluído em 2026-09-19

**[FATO]** Toda entrada passou para a sidebar, em dez acordeões: dados do
relatório, poço, revestimento-alvo, anular e retorno, fluidos e pastas, estágios e
intervalos, programa de bombeio, janela e equipamento, apresentação e referências,
e importação de medições. O conteúdo passou a ser só leitura.

**Dois acordeões não estavam na lista de §2.2 e foram acrescentados**, porque a
regra "toda entrada fica na sidebar" não admite exceção:

| Acordeão | Por quê |
|---|---|
| 9. Apresentação e referências | O modo de volume e as referências de ECD perderam a interface em T1; são entrada do motor e do cenário, não do gráfico |
| 10. Importar medições | Arquivo, separador decimal, coluna de tempo, unidades, offset e mapeamento de canais são entrada; a prévia e a comparação ficam no conteúdo |

A numeração de §2.2 foi ajustada: o item *6. Aditivos da pasta* sai da lista
enquanto T6 não chega, e *Janela e equipamento* virou o 8.

**[DECIDIDO] Duas exceções conscientes à regra do conteúdo sem campo.** Os
controles de **reprodução** (cursor, velocidade, marcar instante) e os do
**visualizador 3D** (diâmetro visual, corte) continuam no conteúdo. Eles navegam o
resultado, não alteram entrada nenhuma; mandá-los para a sidebar separaria o
controle daquilo que ele move. O teste que proíbe campos no conteúdo exclui
explicitamente esses dois, e só esses dois.

**O conteúdo ganhou leitura onde antes havia formulário:** a aba do poço mostra a
tabela de fases e um resumo do alvo, do anular, da contrapressão e da janela; a
aba de sequência ganhou a tabela do programa por estágio, com fluido, origem da
quantidade, volume, vazão e duração — que é o **cronograma** antes desenhado como
gráfico, agora em números.

**Verificação:** 688 testes em 66 arquivos aprovados e `npm run build` exit 0. O
caso novo percorre as cinco abas e exige **zero** `input`, `select` ou `textarea`
no conteúdo, fora das duas exceções, e exige que a sidebar tenha campos. Regras de
estilo órfãs foram removidas, e o CSS da página voltou para dentro do orçamento.

## 7.4 T4 — concluído em 2026-09-19

**[FATO]** As seis abas de §2.1 existem, numeradas como no squeeze, e todas são
só leitura:

| Aba | O que mostra |
|---|---|
| 1. Volumes e programa | Resumo em métricas, volumes por colocação com reserva e preparado, TOC ideal ao lado do real, e o **cronograma em tabela** |
| 2. Receita da pasta | Fluidos com a origem de cada propriedade, quantidades com rendimento e sacos, composição linha a linha e total por produto |
| 3. Transporte | Inventário por fluido com o residual, eventos com instante e profundidade, e as parcelas no instante selecionado |
| 4. Hidráulica | Resumo, estado no instante, ECD nas referências, envelope por profundidade e limites excedidos |
| 5. Esquemático | Resumo do poço e do alvo, tabela de fases, desenho 2D e 3D sob demanda |
| 6. Dados medidos | Prévia do arquivo, comparação com unidade original e canônica, e procedência linha a linha |

**O cronograma voltou como números.** Era um gráfico de barras; agora é uma tabela
com estágio, passo, tipo, fluido, origem da quantidade, volume, vazão e duração.
As durações são as do motor, pausa inclusive.

**A aba de poço sumiu, e isso é proposital.** Com as fases editadas na sidebar, um
separador só para elas ficaria vazio. O resumo do poço e a tabela de fases foram
para a aba do **Esquemático**, que é onde se olha o poço.

**Transporte e hidráulica ganharam tela pela primeira vez.** Até aqui esses
resultados só apareciam como diagnóstico. Agora o inventário por fluido mostra o
residual do balanço, os eventos aparecem com instante exato, e a hidráulica anuncia
quantos instantes ficaram fora do modelo em vez de escondê-los.

**As três abas que dependem de instante** — transporte, hidráulica e esquemático —
trazem os controles de reprodução, para o cursor e a leitura andarem juntos.

**Verificação:** 690 testes em 66 arquivos aprovados e `npm run build` exit 0. Três
casos novos conferem o conteúdo das abas 1, 3 e 4; o caso que proíbe campos no
conteúdo passou a percorrer as seis. Mais uma regra de estilo órfã foi removida
para o CSS caber no orçamento.

## 7.5 T5 — concluído em 2026-09-19

**[DECIDIDO] A primária ganhou modal próprio, `PrimaryScenarioModalComponent`.**
§2.3 mandava avaliar se o modal do squeeze serviria. Serve para a moldura, não
para a lógica, por dois motivos concretos:

1. `SimuladorStateModalComponent` monta o payload com `scenarioPayload` **genérico**,
   que só remove os campos de geometria e serializa. Ele **não** valida o cenário da
   primária. Usar aquele caminho descartaria a validação de `primaryScenarioPayload`,
   que hoje barra payload inválido **antes da rede**, e deixaria o estado de
   salvamento de `PrimaryScenarioStoreService` desatualizado — justamente a
   garantia de que "salvo" só aparece após resposta de sucesso.
2. Ele gerencia **pastas**, que esta tela não gerencia, e o seu `operacao` é um
   par fechado `'tampao' | 'squeeze'`.

Alargar aquele componente para entender os dois contratos seria a gambiarra que a
própria §2.3 proibiu. O novo modal copia a moldura visual (fundo escurecido,
cartão, cabeçalho com *eyebrow*, botão de fechar) e é **apenas apresentação**:
recebe estado por `@Input` e emite eventos por `@Output`. Toda a lógica continua na
página, sobre o serviço de P10, que já tinha teste. O modal do squeeze não foi
tocado.

**[FATO]** A barra de cenário saiu do corpo da página. Listar, abrir, salvar,
exportar, importar com resumo e o `.doc` do relatório vivem dentro do modal, com o
indicador de salvo/não salvo ao lado do nome. Abrir o modal pelo dock já busca a
lista; falha de rede vira mensagem, não tela vazia. Adotar um cenário importado
fecha o modal.

**O botão Relatório do dock** abre o documento de P11 direto, sem passar pelo modal.

**Verificação:** 691 testes em 66 arquivos aprovados e `npm run build` exit 0. Dois
casos novos: um garante que nada da barra de cenário aparece no corpo antes do
clique e que o modal abre e fecha; outro que adotar um arquivo importado fecha o
modal. O CSS da página encolheu com a saída do painel e voltou a ficar bem dentro
do orçamento.

## 7.6 T6 — concluído em 2026-09-19

**[FATO] A opção A de §5 está implementada.** O acordeão *6. Aditivos da pasta*
usa o mesmo `ADITIVOS_CATALOGO` e o mesmo `AditivoModalComponent` do squeeze.
Acrescentar um químico muda o **rendimento** da pasta e, com ele, sacos, água de
mistura e a quantidade de cada aditivo por colocação. O **volume bombeado e o
dimensionado não se mexem**: continuam vindo do TOC e da geometria, como §4 da SPEC
principal exige. Há teste travando exatamente isso.

**As quantidades aparecem por colocação.** Cada aditivo entra como linha da
composição na aba 2, com concentração, unidade, massa e volume escalados, e soma no
total por produto — que continua somando só produto e unidade compatíveis.

**O modal compartilhado exige `FormArray`, e a página usa sinais.** A ligação é
explícita e num sentido só: as linhas são reconstruídas a partir da pasta
selecionada, e toda edição escreve de volta na composição e recalcula. Trocar de
pasta troca as linhas, sem misturar os aditivos de uma com os da outra.

⚠️ **Um defeito real apareceu no teste de round-trip.** As linhas de aditivo
carregam `catalogId`, `unidadeDosagem`, `misturadoEm` e `ativo`, e o codec do
cenário recusava esses campos como desconhecidos. O arquivo portátil ficava
inválido e **os aditivos se perdiam**. Em vez de recortar a linha para caber, o
contrato foi corrigido: `SlurryInputs.additivos` e o validador passaram a aceitar
esses campos como opcionais. Recortar teria mudado as quantidades calculadas
depois de salvar e reabrir, que é justamente o que não pode acontecer.

**Verificação:** 696 testes em 66 arquivos aprovados e `npm run build` exit 0. Cinco
casos novos: aditivo do catálogo mudando rendimento e sacos sem tocar no volume
bombeado; aditivo escrito só na pasta selecionada, com as linhas trocando junto com
a seleção; o aditivo virando linha da composição e entrando no total por produto;
remover devolvendo a receita ao que era; e os aditivos sobrevivendo ao arquivo
portátil.

## 7.7 T7 — parcial em 2026-09-19

**[FATO] As dez invariantes de §6 estão sob teste, conferidas depois do
redesenho**, em `simulador-primaria.redesign.spec.ts`. Cada caso nomeia a etapa
que a criou:

| Invariante | Origem | Como é conferida |
|---|---|---|
| Alterar entrada pausa e invalida | P7 | Editar a sapata com a reprodução rodando para o cursor em zero |
| Mover o cursor não recalcula | P7 | `result()` é a mesma instância depois de mover o cursor e pular eventos |
| Cimento fora do OD | P7 | Toda faixa de pasta no anular tem parede externa maior que o OD; lama não é pintada |
| Medição não altera o cálculo | P8 | Importar um CSV mantém volumes, transporte e número de pontos |
| "Salvo" só após a API | P10 | Estado nasce não salvo e uma edição o mantém assim |
| Arquivo inválido não substitui | P10 | JSON quebrado vira mensagem e o TOC aberto não muda |
| Relatório parcial não conclui | P11 | Conclusão diz que não conclui e nenhum gráfico aparece como disponível |
| Squeeze intocado | P12 | O componente compartilhado ainda entrega o modelo legado e o título do squeeze |
| Números do caso de referência | P4–P6 | Anular, retidos, deslocamento e total bombeado conferidos após a mudança de tela |
| Seis abas sem `canvas` | T1–T4 | Cada aba renderiza com conteúdo e nenhuma tem gráfico |

**Verificação:** 706 testes em 67 arquivos aprovados e `npm run build` exit 0.

⚠️ **T7 não fecha aqui: falta a revisão visual com uma pessoa.** jsdom não avalia
largura de tela, alinhamento dos acordeões, leitura das tabelas longas, impressão
nem o dock cobrindo conteúdo. O servidor de desenvolvimento foi iniciado para essa
revisão. Roteiro mínimo, de §8:

1. Recolher a sidebar pelo dock e conferir que nenhum dado some.
2. Editar um campo em cada acordeão e ver o número mudar no conteúdo.
3. Procurar um gráfico e não achar nenhum.
4. Acrescentar um aditivo e conferir que sacos mudam e o volume bombeado não.
5. Abrir Cenários e Relatório pelo dock.
6. Estreitar a janela e conferir tabelas, rótulos e unidades.
7. Abrir squeeze e tampão e confirmar que nada mudou neles.

Enquanto esse roteiro não for percorrido por uma pessoa, a caixa de T7 fica aberta.

## 7.8 Abas revistas em 2026-09-25

**[DECIDIDO]** Pedido do usuário, na revisão visual:

- A aba **Transporte** saiu. O motor continua transportando as parcelas; inventário,
  eventos e parcelas deixaram de ter aba própria porque não diziam nada que as outras
  abas não digam.
- **Hidráulica** passou a se chamar **Simulador**. O **envelope por profundidade**
  chegou a virar a aba 4 e, no mesmo dia, saiu da tela a pedido do usuário: a tabela
  não aparece mais; o gráfico de envelope continua no Simulador, com os outros dois.
  O Esquemático passou a ser a aba 4, e Dados medidos, a 5.
- A **reprodução** mora só no bloco do **Esquemático 2D**, a 3× por padrão (opções
  3×, 5×, 20× e 60×). O estado e o ECD no instante selecionado foram para logo abaixo
  do 2D, porque são eles que a reprodução move, junto com o 3D.
- No painel lateral, o `tui-expand` ganhou coluna `minmax(0, 1fr)`: a tabela do survey
  alargava a seção 3.1 além do painel e cortava o cadastro de poços. O painel tem
  500 px de largura (pedido do usuário); abaixo de 980 px de tela, vai para cima do
  conteúdo.

Isso substitui o que §7.4 diz das abas 3 e 4 e das "três abas que dependem de instante".

## 7.9 Relatório no desenho do squeeze e do tampão (2026-09-25)

**[DECIDIDO]** A pedido do usuário, o relatório da primária deixou de ser uma página
corrida de tabelas cinza. Ganhou o sistema visual do relatório do squeeze e do tampão:
capítulos numerados em azul com quebra de página (Identificação, Poço, Fluidos e volumes,
Sequência operacional, Resultados, Desenhos e gráficos, Convenções e alertas),
subseções N.M, tabelas com rótulo em destaque e borda escura, e sumário com a mesma
numeração. O texto continua correndo entre páginas, porque survey, programa e balanço
não têm tamanho fixo.

A **sequência operacional** virou passos numerados em linguagem de operação, com
volumes, vazões e densidades em negrito, a receita embutida no preparo da pasta, a
faixa de cada estágio e as observações em itálico
(`primaryOperationalSequenceItems`). A prévia da tela usa o mesmo texto. Também foram
corrigidos 21 trechos com acentuação quebrada ("Caliper nÃ£o importado").

## 7.10 Envelope revisto em entrevista (2026-09-25)

**[DECIDIDO pelo usuário]** O envelope do Simulador tem duas hidrostáticas mínimas: a de
cada profundidade (contínua) e a do poço, o menor valor do perfil (tracejada). Poro e
fratura aparecem só onde há formação exposta: da sapata anterior para baixo. Os gráficos de
ECD dão o ΔECD só do atrito, com a pressão de retorno à parte. É a mesma regra do squeeze e
do tampão ([§12.11](../squeeze-tampao-graficos-motor.md)).

## 7.11 Relatório sem folha por capítulo (2026-09-25)

**[DECIDIDO pelo usuário]** Os capítulos seguem na mesma folha quando cabem (o título não fica
sozinho no pé), e "Desenhos e gráficos" é um capítulo só, com os desenhos e gráficos
empilhados em retrato, cada um inteiro na folha e sem subtítulo numerado. A janela operacional
em verde entra no envelope (squeeze-tampão §12.13).

## 8. Aceitação

| Caso | Resultado esperado |
|---|---|
| Recolher a sidebar | Conteúdo ocupa a largura; nenhum dado some; o dock continua acessível |
| Editar qualquer campo | O campo está na sidebar, e o número correspondente muda no conteúdo |
| Procurar um gráfico | Não há nenhum; o relatório explica que ainda não foi reconstruído |
| Adicionar um aditivo | Rendimento e quantidades mudam; o volume bombeado **não** muda |
| Abrir Cenários pelo dock | Listar, abrir, salvar, exportar e importar, com o estado de salvamento visível |
| Abrir Relatório pelo dock | Mesmo conteúdo de P11, com os gráficos marcados como não reconstruídos |
| Tela estreita | Sidebar recolhe; tabelas rolam sem cortar unidade nem rótulo |
| Squeeze e tampão | Abrem e calculam como antes, sem nenhuma diferença visual ou numérica |

Semelhança com a tela do squeeze não valida cálculo. As equações e o transporte
continuam sendo julgados pela SPEC principal.
