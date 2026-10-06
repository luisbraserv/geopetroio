# Historico de implementacao - squeeze e tampao

Entregas S1-S8 e revisoes posteriores. Requisitos vigentes permanecem na [SPEC principal](../squeeze-tampao-graficos-motor.md).

## 12. Registro de implementação

### 12.1 S1 — gráficos comuns (2026-09-23)

| Arquivo | O que mudou |
|---|---|
| `services/operation-charts.ts` (novo) | Tipos e funções comuns: `OperationCharts` com `operation`, lista de `references` (cada uma com título, descrição, TVD que amarra as escalas, pontos e resumo), `envelopeMarker` com rótulo, séries de volume com `kind` (`total`, `fluid`, `extra`) e `rheologyWarning` em texto; `summarizeHydroEcd`, `synchronizedHydroEcdAxes(referência)`, `pressureEnvelopeForPhase` e `operationReportVisuals(dados, fase, referência)` |
| `services/primary-operation-charts.ts` | Só o montador da primária, que devolve o formato comum com uma referência ("saída ativa"), marcador "Sapata anterior" e o aviso de reologia pela regra de sempre |
| `components/charts/operation-charts.component.ts` (novo, `app-operation-charts`) | Os três gráficos para qualquer operação: seletor de referência quando há mais de uma (troca só o desenho), título e descrição da referência, marcador do envelope, traço por tipo de série e nome do arquivo salvo com a operação (`primaria-…`, `tampao-…`, `squeeze-…`). Substitui `app-primary-operation-charts`, que foi apagado |
| `services/primary-well-visuals.ts` | `buildWellVisualModel` genérico: cimento por intervalo, na bainha (`annulus`) ou no poço cheio (`wellbore`), trechos de tubo, marcadores e `showCaliper`. `buildPrimaryWellVisualModel` virou uma camada fina sobre ele |
| `components/charts/primary-well-2d.component.ts` | Com `showCaliper = false`, sem figura de caliper, sem o aviso "Esta fase não possui amostras de caliper", sem o item da legenda e com a nota do diâmetro da fase |
| Página da primária | Passa a usar `app-operation-charts` e `operationReportVisuals` |

**Primária sem mudança visível (T-19).** Antes de extrair, foi gravada uma foto da saída
da primária no caso MINA-02 (programa v3): dados dos três gráficos, os 12 SVGs do
relatório (perfil, planta e caliper nas vistas "todas as fases" e "fase da operação";
hidrostática/ECD, envelope e volume × tempo nas duas vistas) e os dois modelos do perfil.
Depois da extração, a mesma foto saiu idêntica: 12 de 12 SVGs iguais byte a byte, os 554
pontos de ECD e hidrostática, o resumo, a TVD de referência (494,135 m), o envelope, as
séries de volume e os modelos do perfil. O teste temporário que gravava a foto foi apagado.

**Testes novos.** Duas referências no SVG, com as escalas amarradas na TVD da referência
desenhada e não na mais funda; marcador com rótulo da operação; série `extra` com traço
próprio; aviso de reologia da primária pela regra de sempre; seletor que aparece só com
duas referências e troca título e descrição; nome do arquivo salvo com a operação;
perfil sem caliper mesmo recebendo um caliper, com o tampão ocupando o poço inteiro no
intervalo; componente do perfil sem nada de caliper, e a primária avisando como antes.

Verificação: **782 testes aprovados em 80 arquivos** (eram 773 em 78), rodados em cinco
lotes; `npm.cmd run build` exit 0, com os mesmos avisos de orçamento. O squeeze e o tampão
ainda não usam nada disso: a tela deles só muda em S4 e S7.

### 12.2 S2 — alvo coluna de trabalho no motor (2026-09-23)

| Arquivo | O que mudou |
|---|---|
| `models/primary-cementing.model.ts` | Alvo `work-string`; montagem de papel `work-string`; dispositivo `open-end`; pausa com `untilBalanced`; evento `balance-reached`; referências com `hydrostaticPsi` |
| `services/primary-geometry.ts` | Coluna de trabalho: extremidade no lugar de colar e sapata, papel `work-string`, caliper ignorado |
| `services/primary-stage-geometry.ts`, `services/primary-connectivity.ts` | O estágio da coluna circula pela extremidade aberta, que nunca fecha; um estágio só |
| `services/primary-volumes.ts` | Sem intervalo de pasta na coluna de trabalho; pasta por volume informado; sem TOC ideal de anular cheio |
| `services/primary-transport.ts` | Pausa até o equilíbrio (§6.4) |
| `services/primary-hydraulics.ts` | Hidrostática nas referências; aviso de retorno pela coluna (§6.4) |
| `services/work-string-config.ts` (novo) | Configuração da coluna de trabalho a partir do cadastro das fases, com a parede externa trecho a trecho |
| `services/primary-playback.ts` | Rótulo do evento novo |

**Caso do Petroguia sem excesso** (8½" aberto abaixo de um 9⅝" até 1000 m; coluna 4½"
16,6 lb/pé aberta a 2510 m; tampão de 2370 a 2510 m; água de 8,33 ppg à frente e atrás,
pasta de 15,8 ppg, lama de 9,0 ppg). Pelas fórmulas de F-19 com as capacidades do motor:
Vp = 32,24 bbl, Htci = 151,79 m, Vfa = 5 bbl, Hfa = 107,17 m, Vff = 17,76 bbl, Vd = 105,02
bbl. No motor, a pasta pesada na coluna cai livre de 9,6 a 51,7 min, com saída de até
5,2 bpm e vazio de até 17 bbl no topo da coluna. O vazio fecha antes do fim, e as
interfaces terminam nas alturas de projeto nos dois lados: pasta de 2358,2 a 2510 m, água
de 2251,0 a 2358,2 m. Hidrostáticas iguais na extremidade (diferença de 2·10⁻¹² psi) e
nada drena depois.

**O que não mudou.** Tudo é condicionado ao alvo novo: a primária segue pelos mesmos
caminhos, e os casos MINA-28BD e MINA-02 continuam passando com os mesmos números.

Verificação: **791 testes aprovados em 81 arquivos** (eram 782 em 80), em cinco lotes;
`npm.cmd run build` exit 0. Casos novos em
[primary-work-string.spec.ts](../../../src/app/features/simulador/services/primary-work-string.spec.ts):
parede externa pelo cadastro, T-01 a T-06, aviso de sobredeslocamento e recusa de colar
e de intervalo de pasta na coluna de trabalho.

### 12.3 S3 — retirada da coluna (2026-09-23)

| Arquivo | O que mudou |
|---|---|
| `services/retirada-tubos.ts` (novo) | `retiradaTubos`: a regra da extremidade depois da retirada, a mesma do relatório |
| `services/retirada-tubos-report.service.ts` | `buildCalculation` passou a chamar `retiradaTubos`. Corrigido: campo vazio da sequência (comprimento do tubo, seções, tubos por seção) virava 0 em vez do padrão, porque `Number('')` é 0; com tubo de 0 m, a conta dividia por zero e a extremidade ia para 0 m |
| `services/work-string-pull.ts` (novo) | `resolveWorkStringPull`: estado depois da retirada, com camadas dentro, fora e abaixo da nova extremidade, aço retirado, descida, volume completado na superfície e hidrostática do lado do poço em qualquer profundidade (§6.5) |

Casos novos em
[primary-work-string.spec.ts](../../../src/app/features/simulador/services/primary-work-string.spec.ts):
o dimensionamento atual do tampão (`TampaoCalculoService.calcPlug`) dá, para o poço do
teste, os mesmos volumes de pasta, água à frente, água atrás e deslocamento do programa
do motor; T-07 (extremidade igual à do relatório, inclusive com campos vazios); T-08
(topo do cimento igual ao do dimensionamento, conservação por fluido, completado = aço);
hidrostática na base conferida à mão; sem retirada, o estado do fim do bombeio.

Verificação: **797 testes aprovados em 81 arquivos** (eram 791), em cinco lotes;
`npm.cmd run build` exit 0.

### 12.4 S4 — tampão na tela nova (2026-09-24)

| Arquivo | O que mudou |
|---|---|
| `services/tampao-engine.ts` (novo) | `buildTampaoConfiguration` / `runTampaoEngine`: o `PlugGeometry` de hoje vira o programa da coluna (frente, pausa 1, pasta, pausa 2, atrás, pausa 3, deslocamento e equilíbrio com teto de 120 min), com os fluidos de §6.2, a janela da seção de interesse e os limites do equipamento; roda o motor, a retirada pela regra do relatório e o estado depois dela. `buildTampaoOperationCharts`: os três gráficos na base do tampão, com o estado depois da retirada como último ponto e no envelope, a série de volume no tempo do transporte e o aviso de reologia pela origem. `tampaoLegacyHydraulics`: §7.1 |
| `services/work-string-config.ts` | `fannPowerLaw`: n e k pelas leituras 300/200/100 (F-41), a conversão da simulação antiga, para o squeeze usar em S7 |
| `models/primary-cementing.model.ts`, `services/primary-hydraulics.ts` | `frictionSettings.standoffPct`: com valor, o atrito anular é multiplicado por 1 − (0,44 + 0,18·n)(1 − Sto/100). A primária não o preenche e não muda |
| `services/operation-tables.ts` (novo) | Cronograma com tempo acumulado, marcos de UCA por interpolação da curva e tabela em SVG para o relatório |
| `services/conformidade-operacional-report.service.ts` | `motor`, `predictedTopMD` e `predictTopMD` (§7.1) |
| `components/relatorio/relatorio-capa-modal.component.ts` | `graficoLabels` |
| `pages/simulador-tampao/*` | §4 e §7; saíram `SqueezeHydraulicSimulationService`, `calcPressureProfile` na página e os blocos ocultos de captura, exceto o do esquemático do tampão |
| `components/charts/pressure-chart.component.ts` | Apagado |

**Números no cenário padrão da tela** (tampão de 1400 a 1500 m em poço aberto de 8,535",
coluna 3½" × 2,764", fluidos aquosos de 8,4 ppg, pasta de 15,8 ppg com n = 0,749 e
k = 0,0171 pelas leituras θ, 3 bpm, rugosidade média, standoff 80%, cabeça fechada):

| Grandeza | Simulação antiga | Motor novo |
|---|---|---|
| BHP máx. / mín. na base | 2521 / 1954 psi | 2290 / 2150 psi |
| ECD máx. | 9,85 ppg | 8,95 ppg |
| Free fall acumulado | 7,29 bbl | 10,39 bbl (10,61 com cabeça ventilada) |
| HHP máx. exigido | 20,4 | 12,9 |
| Tempo total | 25,5 min | 25,5 min (equilíbrio em 0 min: frente, atrás e deslocamento de mesma densidade) |

A BHP antiga era a do lado da coluna, com a fricção da coluna subtraída; a nova é a do
anular (§5.2), por isso a faixa estreitou. No motor, a saída chega a 4,76 bpm com 3 bpm
bombeados e o vazio a 10,4 bbl; o topo da pasta depois da retirada ficou em 1400,0 m, o
topo sem coluna do dimensionamento. Nos dois motores o alerta é "abaixo do poro",
porque o fluido de completação padrão (8,4 ppg) é mais leve que o poro padrão (9 ppg).

Casos novos: [tampao-engine.spec.ts](../../../src/app/features/simulador/services/tampao-engine.spec.ts)
(programa pelos volumes de hoje; alturas de projeto e topo depois da retirada; drenagem
do subdeslocado; os três gráficos; aviso pela origem; formato antigo; 48 simulações da
varredura; excentricidade; textos do relatório de conformidade com e sem o motor novo) e
[simulador-tampao.render.spec.ts](../../../src/app/features/simulador/pages/simulador-tampao/simulador-tampao.render.spec.ts)
(T-09, T-17 do tampão, T-18 e a ligação com o relatório de conformidade).

Verificação: **815 testes aprovados em 83 arquivos** (eram 797 em 81), em cinco lotes
(222 + 190 + 150 + 102 + 151); `npm.cmd run build` exit 0.

### 12.5 S5 — compressão Bradenhead (2026-09-24)

| Arquivo | O que mudou |
|---|---|
| `services/work-string-compression.ts` (novo) | `resolveBradenheadCompression`: blocos de injeção e pressurização depois da retirada, com pressões em cada profundidade, referências, cabeça do revestimento, limite de baixa pressão, envelope do revestimento, inventário injetado por fluido e estado final (§6.7). `injectedVolumeSeries` |

Caso do teste: poço vertical com 7" 26 lb/pé (ID 6,276") até 2000 m, canhoneados de 1850
a 1860 m, tampão de 1780 a 1880 m (12,55 bbl de pasta de 15,8 ppg) posicionado por coluna
2⅞" (ID 2,441") com fluido de completação e deslocamento de 9,0 ppg. O posicionamento é o
do tampão (S4) e termina equilibrado. A coluna sobe de 1880 para 1739 m (11 tubos do tampão
+ 2 seções de 2 tubos). Injetando 2 bbl a 0,5 bpm com 1000 psi na superfície:

| Grandeza | Valor |
|---|---|
| Pressão no meio dos canhoneados (1855 m) | 3916,5 psi (ECD 12,38 ppg; hidrostática 2928,7 psi) |
| Atrito na coluna / no revestimento até o canhoneado de base | 11,5 / 0,7 psi |
| Pressão na cabeça do revestimento | 988,5 psi |
| Limite de superfície do squeeze de baixa pressão (fratura 15 ppg) | 1829,9 psi |
| Topo da pasta | de 1780,0 para 1795,9 m (2 bbl no revestimento de 7") |
| Pressurização seguinte, 1500 psi por 15 min | 4411,8 psi no canhoneado (ECD 13,94 ppg), constante |

Casos em [primary-squeeze-bradenhead.spec.ts](../../../src/app/features/simulador/services/primary-squeeze-bradenhead.spec.ts):
T-10 (coluna acima do cimento, anular parado, injetado = programado, conservação por
fluido ≤ 1·10⁻⁸ bbl, série extra), T-11 (pressão no canhoneado conferida à mão pelo
percurso, ECD sobe 1000 / (K · TVD)), T-12, T-13 (três ciclos de injeção e pressurização),
T-14 (limite conferido à mão; aviso com o limite, sem bloquear), topo dos canhoneados
descoberto e fluido de trás na formação, envelope do revestimento com limite de ruptura e
recusa de canhoneado acima da extremidade.

Verificação: **823 testes aprovados em 84 arquivos** (eram 815 em 83), em cinco lotes
(230 + 190 + 150 + 102 + 151); `npm.cmd run build` exit 0.

### 12.6 S6 — packer e retentor (2026-09-24)

| Arquivo | O que mudou |
|---|---|
| `services/work-string-compression.ts` | `resolveSqueezeCompression` (era `resolveBradenheadCompression`): isolamento `bradenhead` ou `tool`, contrapressão no anular, diferencial na ferramenta em cada ponto e por bloco, parede abaixo da extremidade pelo cadastro, hidrostática das referências pelo percurso, sem atrito enquanto enche o vazio da coluna |
| `services/squeeze-retainer.ts` (novo) | `retainerSqueezeVolumes` (dimensionamento de §6.6) e `runRetainerSqueeze` (posicionamento com o stinger desencaixado, ajuste pela queda livre, encaixe e compressão) |
| `services/work-string-config.ts` | `wellWallSections`: a parede de `workStringOuterWall` em diâmetros |
| `services/tampao-engine.ts` | `workStringFluids` exportado, para o squeeze usar os mesmos fluidos |

Casos no poço da S5 (7" até 2000 m, canhoneados de 1850 a 1860 m, coluna 2⅞"):

**Packer** fixado a 1739 m (a extremidade depois da retirada), 2 bbl a 0,5 bpm com
1500 psi e pressurização a 2000 psi:

| | Sem contrapressão | 500 psi no anular |
|---|---|---|
| Cabeça do revestimento | 0 psi | 500 psi |
| Diferencial no packer, injeção / pressurização | 1490 / 2002 psi | 990 / 1502 psi |
| Pressão no meio dos canhoneados, injeção / pressurização | 4417 / 4912 psi | igual |

A pressurização a 2000 psi passa do limite de baixa pressão (1835 psi) e sai com o aviso
de squeeze de alta pressão. Na Bradenhead, com os mesmos blocos, a cabeça do revestimento
iria a cerca de 2000 psi.

**Retentor** a 1830 m, 5 bbl a injetar, 5 bbl de água à frente e 2 bbl atrás:

| Grandeza | Valor |
|---|---|
| Capacidade da coluna até o retentor | 34,75 bbl |
| Revestimento abaixo do retentor até a base dos canhoneados | 3,77 bbl |
| Pasta | 8,77 bbl |
| Deslocamento total / de projeto antes de encaixar | 32,75 / 23,99 bbl |
| Deslocamento antes de encaixar, depois do ajuste (3 simulações) | 22,29 bbl: a queda livre adiantou a pasta 1,70 bbl, o vazio que ficou na coluna |
| Bombeado com o stinger encaixado | 10,47 bbl (1,70 de vazio + 8,77 pelo retentor) |
| Entrou na formação antes da pasta | 3,77 bbl de fluido de completação + 0,003 bbl de água (resíduo do ajuste) |
| Pasta na formação | 5,00 bbl |
| No fim | pasta do retentor à base dos canhoneados; água atrás na coluna; nada passou do retentor |
| Diferencial no retentor na pressurização a 1500 psi | 1494 psi |

Casos em [primary-squeeze-tools.spec.ts](../../../src/app/features/simulador/services/primary-squeeze-tools.spec.ts):
T-15 (anular na contrapressão, diferencial = abaixo − acima conferido à mão, limite da
ferramenta e o efeito da contrapressão, revestimento exposto só abaixo do packer) e T-16
(dimensionamento, posicionamento com o stinger desencaixado até a frente da pasta chegar
ao retentor, só o fluido abaixo do retentor antes da pasta, deslocamento que não passa
dele, conservação por fluido, enchimento do vazio sem atrito e aviso de bombeio além do
deslocamento total).

Verificação: **831 testes aprovados em 85 arquivos** (eram 823 em 84), em cinco lotes
(238 + 190 + 150 + 102 + 151); `npm.cmd run build` exit 0.

### 12.7 S7 — squeeze na tela nova (2026-09-24)

| Arquivo | O que mudou |
|---|---|
| `services/squeeze-engine.ts` (novo) | `runSqueezeEngine`: Bradenhead e packer pelo posicionamento do tampão com a pasta inteira equilibrada, retirada e compressão; retentor por `runRetainerSqueeze`, com o que está entre a pasta e os canhoneados acrescentado antes dos blocos. `buildSqueezeOperationCharts` (referências canhoneados e extremidade, estado depois da retirada, compressão no envelope só nos canhoneados, série do injetado), `squeezeLegacyHydraulics` (fases "Injeção N" e "Pressurização N" para o relatório de injetividade), `legacySqueezeBlocks`, `squeezeInjectionFields`, `balancedSqueezeDisplacement` |
| `models/primary-cementing.model.ts`, `services/primary-hydraulics.ts` | `pressureWindow[].exposed`: canhoneado conta como formação exposta mesmo atrás do revestimento |
| `services/tampao-engine.ts` | Entrada com `TampaoPlacement` (o recorte do dimensionamento que o motor lê), janela e referências extras, para o squeeze reusar o posicionamento |
| `services/work-string-compression.ts` | Profundidades limitadas ao trecho antes da TVD (o levantamento direcional recusava −1·10⁻¹⁰ m) |
| `pages/simulador-squeeze/*` | "4.5 Técnica e compressão" com a técnica, o retentor, a contrapressão, os limites e os blocos; cronograma com a compressão e UCA em tabela; aba 4 com o quadro de compressão, a tabela de blocos, os avisos do motor e os três gráficos com seletor; perfil e planta; relatório em SVG com premissas e tabela de compressão; migração dos cenários antigos; "Free fall máx." sai da tela e entra a condição da cabeça |
| `pages/simulador-base.component.ts` | Sai `manualRecipeOpsPhases` |
| Apagados | `squeeze-operation-charts.component.ts`, `ops-chart.component.ts`, `thickening-chart.component.ts`, `uca-chart.component.ts`, `operation-hydraulics-adapter.ts` e o teste dele; em `primary-regression.spec.ts` e `simulador-primaria.redesign.spec.ts`, os casos que protegiam esses componentes |
| Mantido | `squeeze-hydraulic-simulation.service.ts` (o motor antigo), sem uso na tela: a S8 compara com ele |

**Números no cenário padrão da tela** (5½" até 1500 m, pasta de 1400 a 1500 m, canhoneados
de 1420 a 1440 m, 2 bbl a injetar; blocos padrão de 2 bbl a 0,5 bpm com 2000 psi e 15 min
a 2000 psi):

| Grandeza | Motor antigo | Motor novo |
|---|---|---|
| Deslocamento | 25,42 bbl | 24,84 bbl (pasta inteira equilibrada) |
| BHP máx. / mín. no meio dos canhoneados | 4097 / 1939 psi | 4114 / 2049 psi |
| ECD máx. | 16,79 ppg | 16,86 ppg |
| Free fall acumulado | 4,81 bbl | 3,85 bbl |
| Topo da pasta depois do squeeze | 1427,5 m | 1400,0 m |

O topo antigo descontava o volume injetado duas vezes (pasta do intervalo menos o
injetado); no motor, entra a pasta inteira, sai o injetado, e fica a do intervalo. A
coluna sobe para 1330,8 m (topo da pasta inteira em poço cheio a 1372,5 m). O limite de
superfície do squeeze de baixa pressão é 1789 psi: os 2000 psi de hoje saem com o aviso de
alta pressão (o motor antigo já acusava "acima da fratura").

Casos novos: [squeeze-engine.spec.ts](../../../src/app/features/simulador/services/squeeze-engine.spec.ts)
(deslocamento equilibrado e o aviso que o de hoje daria; Bradenhead, packer e retentor no
poço da tela; gráficos com o seletor e a série do injetado; formato antigo com a injeção;
migração; 48 simulações da varredura) e
[simulador-squeeze.render.spec.ts](../../../src/app/features/simulador/pages/simulador-squeeze/simulador-squeeze.render.spec.ts)
(tela, troca de técnica, blocos alimentando os campos de hoje, tabelas, perfil e planta,
T-17, T-18, T-20 e o relatório de conformidade). Em
[geometry-validation.spec.ts](../../../src/app/features/simulador/pages/geometry-validation.spec.ts),
a retirada com receita por volume passou a contar os 2 bbl a injetar.

Verificação: **839 testes aprovados em 86 arquivos** (eram 831 em 85: entram os 16 casos
novos e saem os 8 dos componentes apagados), em cinco lotes (238 + 194 + 154 + 102 + 151);
`npm.cmd run build` exit 0.

### 12.8 S8 — validação (2026-09-24)

**Casos de aceitação.** Todos têm teste automático com o número conferido:

| Caso | Onde | Evidência |
|---|---|---|
| T-01 | [primary-work-string.spec.ts](../../../src/app/features/simulador/services/primary-work-string.spec.ts) | Mesma densidade: pressão de bombeio = atrito da coluna + do anular; ECD − ESD = atrito anular / (K · TVD) a 1·10⁻⁹; parado, ECD = ESD |
| T-02 | idem | Queda livre com vazio acima de 1 bbl e saída acima da bombeada; balanço por fluido ≤ 1·10⁻⁸ bbl em todo instante |
| T-03 | idem | Vp 32,2 bbl, Htci 151,7 m, Vff 17,8 bbl, Vd 105,1 bbl; interfaces nas alturas de projeto a 0,1 m, na coluna e no anular |
| T-04 | idem | Hidrostática a 2400 m igual à coluna de fluidos à mão a 0,5 psi |
| T-05 | idem | Hidrostáticas iguais na extremidade a 0,5 psi; nada drena |
| T-06 | idem | Subdeslocado em 2,5 bbl: drena até 0,001 bpm; resíduo de 2,4 psi, abaixo de 10% dos mais de 20 psi do fim do bombeio |
| T-07 | idem | Extremidade = a do relatório de retirada, inclusive com campos vazios; 19 tubos, 2331,4 m |
| T-08 | idem e [tampao-engine.spec.ts](../../../src/app/features/simulador/services/tampao-engine.spec.ts) | Topo sem coluna a 0,1 m; conservação por fluido; completado = aço retirado; hidrostática na base à mão a 0,5 psi |
| T-09 | [simulador-tampao.render.spec.ts](../../../src/app/features/simulador/pages/simulador-tampao/simulador-tampao.render.spec.ts) | Três gráficos, perfil e planta sem caliper, cronograma e UCA em tabela, fase da operação no envelope |
| T-10 | [primary-squeeze-bradenhead.spec.ts](../../../src/app/features/simulador/services/primary-squeeze-bradenhead.spec.ts) | Coluna acima do cimento; anular inalterado; injetado = programado; conservação ≤ 1·10⁻⁸ bbl |
| T-11 | idem | Pressão no canhoneado igual ao percurso à mão a 1·10⁻⁶ psi; ECD sobe 1000 / (K · TVD) |
| T-12 | idem | Atrito zero; ECD = (P + hidrostática) / (K · TVD), constante no bloco |
| T-13 | idem | Três ciclos: 4 e 10 min por bloco, 1 bbl por injeção, 42 min no total, injeção em degraus |
| T-14 | idem | Limite de superfície igual à conta à mão a 1·10⁻⁶ psi; aviso de alta pressão; cálculo segue |
| T-15 | [primary-squeeze-tools.spec.ts](../../../src/app/features/simulador/services/primary-squeeze-tools.spec.ts) | Anular na contrapressão; diferencial = abaixo − acima à mão; 1000 psi de contrapressão reduzem o diferencial em 1000 psi |
| T-16 | idem | Antes da pasta, só os 3,77 bbl abaixo do retentor (mais ≤ 0,01 bbl do ajuste); 5,00 bbl de pasta na formação; nada passa do retentor |
| T-17 | render de tampão e de squeeze | Relatório em SVG, sem caliper, com premissas, tabelas e, no squeeze, a tabela de compressão |
| T-18 | idem | Seleções antigas `pressao` e `cronograma` geram o conteúdo novo; nada gravado |
| T-19 | S1 (§12.1) e os testes da primária | SVGs da primária idênticos; nenhum teste de valor da primária mudou |
| T-20 | [squeeze-engine.spec.ts](../../../src/app/features/simulador/services/squeeze-engine.spec.ts) e render do squeeze | Cenário antigo abre como Bradenhead, com um bloco de injeção de mesmo volume, pressão e tempo, e o aviso; nada gravado |

**Contra o motor antigo, onde os dois devem coincidir**
([squeeze-tampao-examples.spec.ts](../../../src/app/features/simulador/pages/squeeze-tampao-examples.spec.ts)):

- Tampão: mesmas etapas, volumes e vazões dão o mesmo tempo total (52,9 min no exemplo,
  a 0,1 min) e o mesmo volume bombeado; a drenagem até o equilíbrio do tampão balanceado é
  menor que 0,01 bbl.
- Squeeze: frente, pasta e água atrás são as do dimensionamento de hoje; o deslocamento
  difere exatamente pela pasta inteira equilibrada, Ctp · Vinj / (Can + Ctp) (§6.3).

**Onde os dois diferem, e por quê** (números em §12.4 e §12.7): BHP e ECD pelo anular, e
não pela coluna (§5.2); atrito de R3 §4-6 no lugar do F-40; queda livre conservativa,
sem teto (maior no motor novo, e tratada como alerta, §7.1); no squeeze, a pasta inteira
equilibrada, a coluna retirada antes da compressão e o topo final sem a dupla contagem do
volume injetado.

**Cenários de exemplo** (pasta de 15,8 ppg), gravados no MySQL local do perfil dev, em
`simulador_cenarios`, como o modal de cenários grava (sem pasta, `dados_relatorio` nulo):

| Id | Nome | Resultado |
|---|---|---|
| 6 | Exemplo — tampão de abandono 8½" (2370–2510 m), pasta 15,8 ppg | 32,24 bbl de pasta; coluna 4½" retirada até 2331,4 m; topo da pasta 2370,0 m; BHP 3847–4034 psi na base, dentro da janela; queda livre de 19,1 bbl (alerta); 52,9 min contra TT 50 Bc de 4,15 h |
| 7 | Exemplo — squeeze Bradenhead 7" (canhoneados 1850–1860 m), pasta 15,8 ppg | 15,55 bbl de pasta (12,55 do intervalo + 3 para a formação); coluna 2⅞" retirada até 1720,2 m; 3 ciclos de 1 bbl a 0,25 bpm e 800–1200 psi; pressão nos canhoneados até 4140 psi; limite de baixa pressão 1951 psi; topo final 1780,0 m; 73,9 min |

Os dois foram gerados pela própria página a partir de
[squeeze-tampao-examples.fixture.ts](../../../src/app/features/simulador/pages/squeeze-tampao-examples.fixture.ts)
e reabertos pelo formato do banco com os mesmos resultados (teste acima).

**Revisão visual.** O jsdom não avalia layout nem impressão. Falta o usuário abrir os
cenários 6 e 7 nas telas de tampão e de squeeze e conferir abas, gráficos, tabelas e
relatório.

**[CORRIGIDO NA REVISÃO VISUAL, 2026-09-24] Poro e fratura sumiam no envelope do squeeze.**
No cenário 7, o gráfico de envelope não mostrava poro nem fratura. A malha do envelope do
motor é a das fronteiras dos segmentos mais 61 pontos iguais até a extremidade (a cada
31,3 m, com 1848,7 m e 1880 m), e nenhum caía no canhoneado de 1850 a 1860 m, o único
trecho com janela (§5.3). Além do gráfico, a verificação de poro e fratura no canhoneado
durante o posicionamento também não acontecia. Na coluna de trabalho, os limites da
janela passaram a entrar na malha
([primary-hydraulics.ts](../../../src/app/features/simulador/services/primary-hydraulics.ts)); a
primária não muda. Com isso, poro (8,5 ppg) e fratura (15,5 ppg) aparecem, e a compressão
entra no envelope nos canhoneados (cerca de 13,1 ppg). Caso no teste dos cenários de
exemplo.

Verificação: **844 testes aprovados em 87 arquivos** (eram 839 em 86; mais 2 do relatório
de conformidade com a queda livre como alerta e 3 dos cenários de exemplo), em cinco lotes
(238 + 196 + 157 + 102 + 151); `npm.cmd run build` exit 0.

### 12.9 Reologia fora das telas e avaliação dos gráficos (2026-09-25)

**Reologia retirada, a pedido do usuário.** Saíram a aba "3. Reologia" e as leituras
Fann da lateral (θ300…θ3), nas duas telas. A reologia da pasta passa a ser a da pasta
base com o efeito dos aditivos (`applyAdditiveRheologyEffects` sem leituras); é ela que
dá n e k ao motor e as leituras equivalentes ao tempo de espessamento
(`estimatedThetaReadings`, com 20 e 10 rpm interpolados em log-log entre 30 e 6 rpm).
TT 30/50/100 Bc, água livre e marcos de UCA foram para a aba de receita. Cenários
salvos com leituras Fann abrem sem elas. Os cenários de exemplo 6 e 7 continuam com os
mesmos volumes, topos e janela.

**Avaliação dos gráficos de ECD e envelope** nos cenários de exemplo, contra conta à mão:

| Conferência | Motor | À mão |
|---|---:|---:|
| Tampão, ESD inicial na base (9,0 ppg a 2510 m) | 3853,9 psi | 3853,9 psi |
| Tampão, atrito anular a 3 bpm na completação (1 cP, 8½" × 4½", 2510 m, Blasius) | 4,0 psi | 4,1 psi |
| Tampão, base depois da retirada | 4005,3 psi | ≈ 4005,8 psi |
| Squeeze, ECD nos canhoneados a 1200 psi de compressão | 13,05 ppg | (2930,9 + 1200) / (K · 1855) = 13,05 ppg |

Os números conferem. O que parece estranho vem do desenho, e fica para decisão:

1. **Hidrostática mínima do envelope é um valor só**, o menor em qualquer profundidade,
   em linha vertical (regra herdada da primária). Diz 8,97 ppg a 80 m, onde a mínima
   é 9,00. Proposta: o perfil por profundidade.
2. **Poro e fratura se prolongam até a superfície.** No squeeze, a formação só está
   exposta nos canhoneados, e o gráfico mostra fratura de 15,5 ppg em 1300 m de
   revestimento cimentado. Proposta: desenhar só onde há formação exposta.
3. **A compressão entra no ECD máximo só nos canhoneados**, ligada ao resto da linha:
   vira uma cunha horizontal. Proposta: série própria no intervalo canhoneado.
4. **ECD × volume esconde a compressão**: ~47 min cabem em 3 bbl, as pausas viram
   saltos verticais, e o "ΔECD máx 3,78 ppg / 1196 psi" mistura pressão aplicada com
   atrito. Proposta: ECD × tempo no squeeze, ΔECD só do atrito, pressão aplicada à parte.
5. **O fim do tampão é uma linha vertical** (para, retira): 9,415 → 9,385 → 9,353 ppg no
   mesmo volume. Proposta: marcar "depois da retirada" como ponto.
6. **Queda livre em quase todo o job** (163 de 194 pontos no tampão), com a cabeça fechada
   em −14,7 psi e retorno de até 5,1 bpm para 3 bombeados. É coerente com 15,8 ppg dentro
   do DP (≈ 800 psi de desbalanço), mas o iCem desenha a cabeça ventilada (0 psi).
   Decisão do usuário: padrão ventilado ou fechado.

### 12.10 Atrito e ECD como na primária (2026-09-25)

**[DECIDIDO]** A pedido do usuário, squeeze e tampão calculam atrito e ECD como a
primária. O motor já era o mesmo (R3 §4-6 por fluido, ECD = BHP / (K · TVD)); mudaram as
entradas:

| Entrada | Antes | Agora (igual à primária) |
|---|---|---|
| Reologia da pasta | estimada pelos aditivos (leituras 300/200/100, F-41) | referência da primária: R3 §12-7, pasta tail, n = 0,330, k = 0,0797 lbf·sⁿ/ft² |
| Multiplicador de atrito | um só, "estado do tubo" | interior e anular separados, 1,00 / 1,15 / 1,35, padrão médio nos dois |
| Excentricidade | fator do Petroguia F-40 pelo standoff (80%) | não entra; o campo de standoff saiu |
| Aviso de reologia no gráfico | sempre que a pasta era estimada | só quando a pasta é a água simplificada de 1 cP (a regra da primária) |

Os fluidos aquosos (completação, água à frente e atrás, deslocamento) seguem newtonianos
pela viscosidade informada, como a água simplificada da primária. Cenários salvos com
"estado do tubo" abrem com esse nível no interior e no anular. A varredura do relatório de
conformidade passou a vazão × densidade (12 combinações): sem excentricidade, variar o
standoff não mudava mais o resultado. O tempo de espessamento continua com a reologia
estimada pelos aditivos, que não é atrito.

Efeito nos exemplos: no tampão (id 6), atrito máximo de 13,0 para 18,9 psi, ΔECD máximo
de 0,030 para 0,044 ppg e BHP máximo de 4031,6 para 4037,5 psi, dentro da janela; no
squeeze (id 7), ECD de até 9,43 ppg no posicionamento e 13,07 ppg na compressão.

### 12.11 Gráficos revistos em entrevista (2026-09-25)

**[DECIDIDO pelo usuário]** As seis propostas de §12.9, nas três operações (primária,
squeeze e tampão), onde se aplicam:

| Tema | Decisão | Como ficou |
|---|---|---|
| Hidrostática mínima do envelope | Duas linhas | "Hidrostática mínima (perfil)", a menor em cada profundidade, contínua; e "Hidrostática mínima do poço", o menor valor do perfil, tracejada (`withWellMinimumHydrostatic`) |
| Poro e fratura | Só onde há formação exposta | Poço aberto ou trecho `exposed` (canhoneados); atrás de revestimento, nada. Na primária, da sapata anterior para baixo |
| Cabeça no tampão e no squeeze | Ventilada, 0 psi | Padrão `vented-free-surface`, como o iCem. Cenários salvos com cabeça fechada (inclusive os exemplos 6 e 7 do banco) abrem fechados até serem salvos de novo |
| Compressão no envelope | Série própria nos canhoneados | "ECD na compressão" (`compressionEcdPpg`) só no intervalo canhoneado; o ECD máximo é o do bombeio |
| Eixo do ECD no squeeze | Tempo (min) | `axis: 'time'`; tampão e primária seguem pelo volume |
| ΔECD | Só atrito, pressão aplicada à parte | ΔECD = atrito (a pressão aplicada não entra); métrica "Pressão aplicada máx." e faixa "Compressão (até N psi aplicados)" |
| Fim do tampão e do squeeze | Ponto marcado | "Depois da retirada" é um marcador fora da linha do bombeio, no volume (ou tempo) do fim |

No SVG do relatório, a legenda passou a medir cada rótulo e quebrar em duas linhas quando
não cabe (com seis itens, os rótulos se sobrepunham). Poro, fratura e compressão cobrem
só os canhoneados (10 m em 2000 m no exemplo 7): quando a série ocupa até 4% da
profundidade, cada ponto ganha marcador, na tela e no SVG, porque a linha sumia.

Nos exemplos: squeeze (id 7) com ΔECD máximo de 0,0585 ppg / 18,50 psi, pressão aplicada
máxima de 1200 psi e 9,345 ppg depois da retirada; tampão (id 6) com 0,0442 ppg /
18,92 psi e 9,353 ppg depois da retirada.

### 12.12 Volume de pasta do squeeze na tela (2026-09-25)

**O problema.** No cenário salvo do 7-PIR-259D-AL (id 8; programa 109/2026, §9.50), o
squeeze 1 tem extremidade a 1542 m, "topo esperado do cimento: 1470,0 m (após injeção de
2 bbl de pasta)" e 11,0 bbl de pasta nos recursos (§11). Pela conta: 72 m × 0,12916 bbl/m
(7" 23 lb/pé, 6,366") = 9,30 bbl + 2 bbl a injetar = **11,30 bbl**. A opção "Altura do
tampão" mostrava **9,30 bbl**.

**A causa.** O motor já fazia a conta certa desde a S7 (bombeia 11,30 bbl; topo a 1454,5 m
antes da compressão e a 1470,0 m depois). A geometria da tela (`squeeze-calculo.service`)
ficou como estava (§12.7, "o dimensionamento de hoje não mudou"):

- a opção lateral e o card "Pasta cimento" mostravam só a pasta do intervalo;
- os topos "depois da injeção" descontavam o injetado da pasta do intervalo, que já não
  o tinha: 1485,5 m em vez de 1470,0 m, no 3D "depois" e nos valores de reserva do
  relatório e do perfil;
- os topos "antes" (com e sem coluna) e o deslocamento da geometria usavam só a pasta do
  intervalo, diferente do motor;
- a **receita do relatório** (`pastaBombeioVolumeBbl`) saía para 9,30 bbl, enquanto a da
  tela e o programa de bombeio usavam 11,30 bbl.

**[DECIDIDO, por critério técnico]** A geometria da tela segue o motor:

| Grandeza | Agora |
|---|---|
| Pasta bombeada (`slurryTotal`) | intervalo + a injetar; com "Volume de pasta", o valor informado **é** o bombeado |
| Pasta no intervalo (`slurryPhysicalVolumeBbl`) | bombeada − a injetar: o cimento que fica |
| Topos antes da injeção (com e sem coluna) | da pasta bombeada inteira |
| Topos depois da injeção | da pasta do intervalo (o injetado sai uma vez só) |
| Deslocamento da geometria | o que equilibra a pasta inteira, igual ao do programa (`balancedSqueezeDisplacement`) |

Na tela, "Altura do tampão" mostra 11,30 bbl com "9,30 bbl do intervalo + 2,00 bbl a
injetar"; o campo "Volume de pasta" avisa que é o total bombeado; "Vol. físico pasta"
virou "Pasta no intervalo"; o card do esquemático e o SVG ("Cimento bombeado") mostram a
pasta bombeada. Antes, 5 bbl informados em "Volume de pasta" bombeavam 7 bbl; agora
bombeiam 5, dos quais 3 ficam.

PIR-259D, id 8, depois da correção: 11,30 bbl (42 sacos), topo antes da compressão a
1449,2 m com a coluna e 1454,5 m sem ela, 1470,0 m depois, extremidade a 1419,8 m,
deslocamento de 26,57 bbl, igual ao do motor. Duas diferenças entre o cenário e o
programa ficaram como estão, porque são dados de entrada: a compressão a 2000 psi (o
programa limita a 1500 psi por até 30 min), que dispara o aviso de squeeze de alta
pressão; e o gradiente de poros de 9,0 ppg (PE de 1820,2 psi a 1497,7 m TVD dá
≈ 7,1 ppg), que dispara o aviso de poro com a completação de 8,4 ppg.

Testes: caso novo do PIR-259D em
[squeeze-calculo.service.spec.ts](../../../src/app/features/simulador/services/squeeze-calculo.service.spec.ts);
a opção lateral e a pasta do relatório no exemplo 7; e os casos que tinham a conta antiga
(topos, deslocamento de 26,2 → 25,58 bbl no SMC-29, rótulo do esquemático, retirada com
"Volume de pasta").

Verificação (§12.11 e §12.12 juntas): **860 testes aprovados em 89 arquivos**, em cinco
lotes (240 + 197 + 161 + 111 + 151); `npm.cmd run build` concluído, com os avisos de
orçamento de sempre.

### 12.13 Relatório, janela operacional e risco de fratura (2026-09-25)

**Atrito no ECD, revisto a pedido do usuário.** O ECD do squeeze e do tampão usa o atrito:
o motor dá o atrito anular fluido a fluido (água newtoniana de 1 cP; pasta pela lei de
potência da referência, §12.10) com o multiplicador do nível, e ele bate com a conta à mão:

| Caso | Motor | À mão |
|---|---:|---:|
| PIR-259D (id 8), 2 bpm, 7" × 2⅞", água no anular | 4,0 psi | ≈ 3,7 psi (Blasius × 1,15) |
| PIR-259D, com 93 m de pasta no anular | 14,8 psi | ≈ 14,4 psi |
| Tampão (id 6), 3 bpm, 8½" × 4½", água / máximo | 4,6 / 18,9 psi | 4,7 psi / — |

O ECD fica colado na hidrostática porque, nessas vazões e anulares largos, o atrito é 0,01 a
0,05 ppg (5 a 19 psi) sobre 2000 a 4000 psi. A perda grande (100 a 400 psi) é dentro da
coluna de 2⅞": entra na pressão de bombeio, não no fundo.

**[DECIDIDO pelo usuário] Janela operacional no envelope.** Nas três operações, a faixa entre
poro e fratura, onde há formação exposta, é pintada de verde claro; o ECD que passa por dentro
está na janela. Pontos fora ganham marcador: "Acima da fratura" (ECD do bombeio ou da
compressão) e "Abaixo do poro" (hidrostática mínima). Um trecho curto (canhoneados) ganha
altura mínima no desenho.

**[DECIDIDO pelo usuário] Risco de fratura no squeeze** ("como saber se vai fraturar na
compressão?"). Gráfico novo, só do squeeze, na tela e no relatório: pressão no poço na
referência dos canhoneados pelo tempo, do posicionamento ao fim da compressão, com a janela
em verde, a zona de fratura em vermelho e o abaixo dos poros em azul. A borda de cima é a
pressão na referência com que **o ponto mais crítico do intervalo** (topo, base ou referência)
chega à fratura; na compressão, a folga é a do motor (maior pressão de superfície sem
fraturar − aplicada), a mesma regra do aviso de squeeze de alta pressão (§6.7). O motor ganhou
as referências `perforation-top` e `perforation-base` no posicionamento para isso. O gráfico
marca o início da fratura (interpolado) e diz a maior pressão de superfície sem fraturar e a
aplicada. No PIR-259D: limite de 1837 psi, 2000 psi aplicados, fratura desde o início da
compressão; no exemplo 7, a 1200 psi, fica na janela.

**Pressão de injeção.** Os 2000 psi não são calculados: são a "P sup." de cada bloco (4.5).
A lateral mostra agora a maior pressão de superfície sem fraturar calculada, com "aplicar nos
blocos" (arredondada para baixo de 50 em 50 psi). Os blocos viraram cartões com rótulo: a
tabela de 7 colunas em 320 px cortava o valor da pressão.

**[DECIDIDO pelo usuário] Relatório do squeeze e do tampão.**

| Pedido | Como ficou |
|---|---|
| Selecionar gráfico por gráfico | Um checkbox por item do catálogo (`report-chart-selection.ts`: cronograma, UCA, premissas, compressão, ECD, envelope, risco de fratura, volume × tempo, perfil, planta), com "todos / nenhum". A seleção antiga por grupo ("pressao", "cronograma") abre com os itens do grupo marcados |
| Um tópico "Simulação" com os gráficos | Os gráficos são figuras dentro de "N. Simulação", sem título próprio |
| Sumário enxuto | Uma linha por tópico (sem capa, ficha, índice nem um item por gráfico) |
| Gráficos um embaixo do outro | Dois por folha quando cabem (165 mm de largura) |
| Tópicos na mesma folha quando cabem | O texto técnico virou blocos; um script no relatório os distribui em folhas A4 depois de carregar imagens e fontes, sem deixar título sozinho no pé, com "(continuação)" e a página de cada tópico no sumário. Sem o script, o texto fica corrido e a impressão pagina |

No PIR-259D, com todos os gráficos, o relatório tem 11 folhas. A primária seguiu a mesma regra:
capítulos na mesma folha quando cabem e os desenhos e gráficos empilhados, em retrato, cada um
inteiro na folha.

Verificação: **874 testes aprovados em 91 arquivos**, em cinco lotes (240 + 204 + 163 + 116 +
151); `npm.cmd run build` concluído, com os avisos de orçamento de sempre. O relatório e os SVGs
foram conferidos impressos (Chrome); os gráficos da tela (Chart.js) só por teste, sem canvas.

### 12.14 Módulo de janela operacional: especificação recebida (2026-09-25)

O usuário colou uma especificação de um módulo de janela operacional de pressão. Comparação
com o que o motor já faz, para decidir o escopo antes de implementar:

| Item da especificação | Hoje |
|---|---|
| Hidrostática por segmento de fluido, Σ(MW · ΔTVD) | Feito (motor da primária, nas três operações) |
| Poro e fratura pela TVD; volumes e comprimentos pela MD | Feito |
| Estática: hidrostática + superfície; bombeio: + atrito anular; ECD = BHP / (K · TVD) | Feito (K = 0,052 × 3,28084) |
| Análise ponto a ponto, não só no fundo, conforme os fluidos andam | Feito nos limites do motor (`PRIMARY_LIMIT_PORE/FRACTURE`) e no envelope; no squeeze, no ponto mais crítico do canhoneado |
| Psup_max = Pfrac − Phidrostática no squeeze, e alerta quando a operacional passa | Feito (`maxLowPressureSurfacePsi`, `PRIMARY_SQUEEZE_HIGH_PRESSURE`, gráfico de risco de fratura) |
| Poro e fratura com vários pontos por TVD, interpolação linear | **Falta no squeeze e no tampão** (um gradiente só); o motor aceita linhas por trecho (`pressureWindow`) |
| Entrada em psi/ft além de ppg | **Falta** |
| Painel do ponto crítico por etapa (TVD, MD, pressões, ECD, margens em psi e ppg, status, elemento: sapata/canhoneado) | **Falta** (há os avisos e os gráficos, não o painel) |
| Classes de margem configuráveis (Normal, Atenção, Alerta, Crítico, Fratura) pelo usuário ou administrador | **Falta**; decidir onde ficam (cenário, usuário ou administração no backend) |
| "Poro/fratura só onde há formação exposta" (§12.11) | Mantido; a especificação fala em percorrer todo o poço, especialmente sapatas |

Decidido em entrevista no mesmo dia e implementado: [janela-operacional.md](../janela-operacional.md)
(perfil por TVD em ppg ou psi/ft, classes no cenário, ponto crítico no poço todo com o critério
de cada trecho).

**Pressão máxima de injeção (2026-09-25, a pedido do usuário).** No topo de "4.5 Técnica e
compressão", um campo só, "Pressão máxima de injeção (psi)", que mostra a maior "P sup." dos
blocos. Mudar o valor leva a ele os blocos que estavam no máximo e limita um bloco acima dele;
degraus menores (hesitação) ficam como estão. Logo abaixo, a maior pressão de superfície sem
fraturar calculada, com "usar", em vermelho quando a pressão digitada passa dela. Os 2000 psi que
o PIR-259D (id 8) mostrava eram o padrão dos blocos da tela nova, não um valor do programa
(que pede no máximo 1500 psi).
