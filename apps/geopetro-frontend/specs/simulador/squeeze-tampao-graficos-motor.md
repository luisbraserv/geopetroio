# Squeeze e tampão — gráficos e motor da cimentação primária

> SPEC de feature · 2026-09-23 · **Revisada em entrevista; S1 a S8 concluídas (§12).
> Gráficos revistos em entrevista em 2026-09-25 (§12.11), volume de pasta do squeeze
> corrigido na tela (§12.12), relatório, janela operacional e risco de fratura (§12.13).
> O módulo de janela operacional (§12.14) foi decidido e implementado em
> [janela-operacional.md](janela-operacional.md). Falta a revisão visual das duas telas pelo
> usuário (§12.8).**
>
> Depende de [Cimentação primária](cimentacao-primaria.md) (§6 transporte, §7
> hidráulica, §11.5–§11.6 casos de campo), [Fase de trabalho](fase-operacao.md) e
> [Geometria de poço](geometria-poco.md). Substitui, para o squeeze e o tampão, a
> regra de [redesenho da primária](cimentacao-primaria-tela.md) que mantinha os dois
> "intactos".

## 1. Pedido e decisões

**[DECIDIDO 2026-09-23]** Pedido do usuário: *"A gente vai fazer uma alteração no
tampão e squeeze e eu quero que tenha os mesmos gráficos com o mesmo comportamento
no simulador. Retire todos os gráficos do squeeze e do tampão e coloque os iguais à
cimentação primária. Primeiro registre o spec, depois vamos fazer as
alterações/implementações."* Na sequência: *"O squeeze e o tampão não precisam ter
caliper"* e *"não é pra colocar excesso no tampão"*.

**[DECIDIDO 2026-09-23 — entrevista]**

| Tema | Decisão |
|---|---|
| Motor | Squeeze e tampão passam a usar **o motor da primária**: transporte conservativo, atrito de R3 §4-6 e queda livre com vazio. Equilíbrio do tampão, retirada da coluna e compressão para a formação entram como extensões desse motor |
| Desenho do poço | Cada simulador **mantém os esquemáticos próprios e o 3D** e ganha o **perfil direcional e a planta** da primária |
| Caliper | **Sem caliper no squeeze e no tampão**: sem importação LAS, sem curva por MD e sem arrombamento. O poço aberto usa o diâmetro da fase |
| Excesso | **Sem excesso no tampão**, nem no squeeze, que também não tem hoje. O volume de pasta sai do diâmetro da fase como está, ao contrário dos 30% que o Petroguia recomenda (F-18) |
| Técnicas de squeeze | **Bradenhead**, sem ferramenta: a coluna sobe acima do topo do cimento antes de pressurizar. **Com ferramenta**: packer recuperável e retentor perfurável. **Sai** a injeção com a coluna imersa na pasta que o motor atual faz |
| Compressão | Blocos alternados de injetar e pressurizar, para a compressão com hesitação (R3 §14-9.4) |
| Volume injetado | Sai do poço como **pasta inteira** nos canhoneados; o reboco não é modelado |
| Contrapressão no anular | Com ferramenta fixada, campo **opcional** de pressão aplicada no anular acima dela |
| Retirada da coluna | Até a **mesma extremidade do relatório de retirada** |
| Equilíbrio do tampão | Depois do deslocamento, o motor **drena até as colunas equilibrarem** |
| Reologia | **Mantém as entradas atuais** (viscosidade da água e reologia da pasta), convertidas internamente para n e k |
| Coluna combinada / stinger | **Só no modelo** por enquanto; a tela continua com um tubo |
| Cronograma, espessamento e UCA | Saem como gráfico e voltam como **tabelas** |
| Referência do gráfico de ECD no squeeze | **Seletor** entre canhoneados (padrão) e extremidade da coluna |
| Série extra | "Injetado na formação" no gráfico de volume × tempo do squeeze |
| Componentes antigos | **Apagados** quando nenhuma página os usar |
| Ordem | **Tampão primeiro**, depois squeeze; cada página fica pronta e testada antes da outra |
| Janela de poro e fratura | Violações só contam **onde há formação exposta** (poço aberto ou canhoneado) |
| Fora desta entrega | Circulação reversa no motor (fica o cartão de volume) e método de dois plugues/dardos no tampão |

**[DECIDIDO]** Os gráficos são **os mesmos componentes** da primária, não cópias. Assim
o comportamento fica igual por construção e uma correção vale para os três simuladores.

## 2. As três operações e o que cada uma pede ao motor

**Fontes.** R3 = Nelson e Guillot, *Well Cementing*, 2ª ed., cap. 14 (§14-3.1
tampão balanceado, §14-4.2.3 volume de deslocamento, §14-4.4 limites de pressão,
§14-7 a §14-9 squeeze, Tabelas 14-6 a 14-8; PDF 537–555). R2 = *Petroguia*, 2ª ed.,
F-18 a F-20 (tampão balanceado, cálculo e exemplo; PDF 268–270). R1 = *Halliburton
Cementing 1*, cap. 7 (tampão balanceado) e cap. 8 (squeeze). Todos estão na pasta de
pós-graduação do usuário.

**O que as três têm em comum.** Nas três, fluidos de densidades diferentes descem por
um tubo, saem por uma extremidade e sobem por um anular. É o mesmo tubo em U, com a
mesma hidrostática, o mesmo atrito e a mesma queda livre quando o lado do tubo fica
mais pesado. Os limites de segurança também são os mesmos (R3 §14-4.4): pressão
dinâmica diante da formação abaixo da fratura, pressão estática acima do poro, e
diferencial nos tubulares abaixo de ruptura e colapso. Por isso um motor só serve às três.

**O que as distingue:**

| | Cimentação primária | Tampão balanceado | Squeeze |
|---|---|---|---|
| Objetivo | Bainha de cimento no anular revestimento × poço: é o revestimento sendo cimentado | Volume limitado de pasta num ponto do poço, formando um selo: abandono, perda de circulação, desvio, apoio (R3 P-2; R2 F-18) | Forçar a pasta sob pressão contra a formação, em canhoneados, canais ou falhas da primária, para desidratá-la e selar (R3 P-2, §14-8; R1 cap. 8) |
| Tubo por onde se bombeia | O próprio revestimento, que fica no poço | Coluna de trabalho (drill pipe ou tubing), extremidade aberta, até a base do tampão; sai do poço depois | Coluna de trabalho, com ou sem ferramenta (§6.6) |
| Dispositivos | Plugues de fundo e de topo, colar e sapata | Nenhum | Nenhum (Bradenhead), packer recuperável ou retentor perfurável |
| Retorno | Pelo anular até a superfície | Pelo anular até a superfície | No posicionamento, pelo anular; na compressão, **retorno fechado**: o que entra vai para a formação |
| Como termina | Plugue superior assenta no colar | Deslocamento levemente abaixo do equilíbrio (2–3 bbl, R3 §14-3.1) e drenagem até o equilíbrio; coluna retirada devagar; o cimento que sobra acima do topo é revertido (R2 F-18) | Posiciona a pasta nos canhoneados, isola e comprime, contínuo ou com hesitação (R3 §14-9.3–§14-9.4) |
| Volume de pasta | Anular do intervalo + shoe track | Intervalo pelo diâmetro da fase, **sem excesso**; altura com a coluna imersa Htci = Vp / (Can + Ctp) (R2 F-19) | **[ALTERADO 2026-10-08]** Volume do intervalo (o tampão); o volume a injetar sai de dentro dele (§2.1). Com retentor, conta própria (§6.6) |

**A diferença que o motor precisa representar.** No tampão a pasta só é posicionada e
equilibrada. No squeeze, **uma parte do volume de pasta é forçada para dentro da
formação**, com o retorno fechado. É o que o squeeze de hoje chama de
"Injeção/pressurização final" e que o dimensionamento já desconta como `expectedLoss` /
`volMaxInjetadoBbl`
([squeeze-calculo.service.ts](../../src/app/features/simulador/services/squeeze-calculo.service.ts)).

**O que o motor não modela.** No squeeze de baixa pressão, quase só o filtrado entra na
formação e o reboco fica nos canhoneados (R3 §14-8, §14-9.1; R1 Fig. 8.2). Acima da
pressão de quebra, entra a pasta inteira (squeeze de alta pressão, R3 §14-9.2). O motor
retira o volume injetado **como pasta inteira na profundidade dos canhoneados**. Não
simula desidratação, reboco nem nodes (Eq. 14-2 a 14-11), e o relatório diz isso. Um
modelo de reboco pode vir depois, com o filtrado API da pasta.

### 2.1 Volume de pasta do squeeze: o injetado sai do tampão

**[DECIDIDO 2026-10-08, pelo usuário]** Vale para Bradenhead e packer. Substitui a regra de
2026-09-25 (§12.12), em que o injetado vinha **a mais** do intervalo.

| Grandeza | Regra |
|---|---|
| Tampão | Volume do intervalo da operação pela capacidade interna cheia (sem a coluna), trecho a trecho |
| Pasta bombeada | **O tampão.** Com "Volume de pasta", o valor informado é o bombeado |
| Injetado na formação | Soma dos blocos de injeção. **Sai de dentro da pasta bombeada** |
| Pasta que fica no poço | Bombeada − injetado |
| Injetado ≥ bombeado | **Erro, bloqueia o cálculo**: não sobraria cimento no poço |

Exemplo: tampão de 10 bbl e 2 bbl a injetar. Bombeiam-se 10 bbl, 2 vão para a formação e
ficam 8 bbl; o topo final fica abaixo do topo do intervalo.

**Desenhos.** Os esquemáticos com e sem tubing mostram o **tampão inteiro, antes da
injeção**: topo e volumes da pasta bombeada. O estado depois da injeção (pasta que fica)
continua como informação no 3D ("depois"), no topo após o squeeze e no relatório.

**Retentor:** não muda. A pasta é o injetado mais o revestimento entre o retentor e a base dos
canhoneados (§6.6); com retentor não há tampão calculado.

**Divergência conhecida.** O programa 109/2026 do 7-PIR-259D-AL (squeeze 1, intervalo de
1470 a 1542 m, 9,30 bbl, 2 bbl a injetar) pede 11,0 bbl de pasta e "topo esperado 1470 m após
injeção de 2 bbl", o que corresponde à regra antiga. Pela regra vigente, o simulador bombeia
9,30 bbl e o topo depois da injeção fica em cerca de 1485,5 m.

## 3. O que existe hoje

**[FATO] Gráficos do squeeze**
([simulador-squeeze.component.html](../../src/app/features/simulador/pages/simulador-squeeze/simulador-squeeze.component.html)):
cronograma operacional (`app-ops-chart`, duas vezes: programa e receita por volume),
consistência × tempo (`app-thickening-chart`), UCA × tempo (`app-uca-chart`) e os cinco
de `app-squeeze-operation-charts`: envelope de pressão, pressão e deslocamento ×
tempo, BHP e ECD, free fall/tubo em U e hidrostática × fratura. Há ainda um bloco
oculto fora da tela que renderiza esquemático, cronograma e gráficos de pressão só para
capturar imagem para o relatório.

**[FATO] Gráficos do tampão**
([simulador-tampao.component.html](../../src/app/features/simulador/pages/simulador-tampao/simulador-tampao.component.html)):
os mesmos, mais `app-pressure-chart` (envelope e free fall), com o bloco oculto de
captura equivalente.

**[FATO] Gráficos da primária**
([operation-charts.component.ts](../../src/app/features/simulador/components/charts/operation-charts.component.ts)),
na aba Simulador:

1. **ECD e pressão hidrostática na saída ativa.** Hidrostática em psi à esquerda e ECD
   em ppg à direita, com as escalas amarradas pela TVD, de modo que as duas curvas
   coincidem sem atrito. Volume a partir de 0. O ECD aparece em todo instante
   calculado (na pausa é igual à ESD). Marca em laranja onde o ECD está indisponível.
   Métricas de hidrostática máxima, ECD máximo, ΔECD e ΔP dinâmica. Avisos de ECD
   indisponível, de curvas sobrepostas e de reologia simplificada.
2. **Perfil de pressão — envelope.** Poro e fratura pontilhados; gradiente hidrostático
   mínimo e ECD máximo contínuos; TVD a partir de 0, da superfície para baixo. Seletor
   de fase, com a fase da operação como padrão, e linha da sapata anterior.
3. **Volume injetado × tempo.** Acumulado total e de cada fluido da sequência.

Os três têm botões **Ampliar** e **Salvar**. O relatório usa as versões SVG
([primary-operation-charts.ts](../../src/app/features/simulador/services/primary-operation-charts.ts),
`primaryOperationReportVisuals`). Na aba Esquemático, `app-primary-well-2d` mostra o
perfil direcional com cimento e revestimento, a planta da trajetória e, quando há
caliper, as curvas por MD.

**[FATO] Diferenças do motor atual do squeeze/tampão que impedem o mesmo comportamento**
([squeeze-hydraulic-simulation.service.ts](../../src/app/features/simulador/services/squeeze-hydraulic-simulation.service.ts)):

| Primária | Motor atual do squeeze/tampão |
|---|---|
| ECD e hidrostática pelo **anular** na saída (§7.1–§7.2 da primária) | BHP pela coluna: `aplicada + hidrostática da coluna − atrito da coluna + atrito do anular` (linha 254). Quando as colunas estão desbalanceadas, isso diverge do lado do anular. Parado com pasta na coluna e lama no anular, dá o gradiente da pasta no fundo |
| Hidrostática do anular em cada ponto | É calculada, mas não guardada no ponto (`annularHydrostaticPsi` é local; o adaptador a entrega nula) |
| Queda livre conservativa: vazio, vazão de saída diferente da de bombeio, pausas que drenam (§7.5) | O volume avança só pela vazão programada; a queda livre é uma vazão extra estimada, limitada por `freeFallMaxFactor` |
| Atrito de R3 §4-6 | Petroguia F-40 com correção de standoff, que a primária abandonou por ser descontínua em Re = 400 (§12.1 da primária) |
| Envelope com hidrostática mínima por profundidade | Envelope só com pressão anular máxima e mínima |
| Amostra no passo do transporte e em cada evento | Passo de 1 min por fase |
| — | A compressão é feita com a coluna na extremidade, imersa na pasta; nem Bradenhead nem ferramenta |

Mudar só o desenho, sem trocar o motor, daria gráficos com a forma da primária e outro
comportamento das curvas. Por isso a decisão de §1 troca os dois juntos.

## 4. Tela: o que sai e o que entra

**[DECIDIDO]** Saem do squeeze e do tampão:

| Componente | Destino |
|---|---|
| `app-squeeze-operation-charts` (5 gráficos) | Removido das duas páginas. **Apagado**, com `adaptLegacyHydraulics` e seus testes, quando o squeeze migrar (S7) |
| `app-pressure-chart` (tampão) | Removido e apagado em S4 |
| `app-ops-chart` (cronograma, programa e receita por volume) | Removido e apagado quando as duas páginas migrarem. O cronograma volta **como tabela**, como na primária (T4): passo, fluido, volume, vazão, duração e tempo acumulado, com o tempo total ao lado do TT 50 Bc e da margem. O da receita por volume ganha a mesma tabela |
| `app-thickening-chart`, `app-uca-chart` | Removidos das duas páginas. As métricas que já existem (TT 30/50/100 Bc, água livre) ficam. O UCA vira uma **tabela de marcos**: tempo até 50 e 500 psi e resistência em 12 e 24 h, lidos da mesma curva `UCAResult` de hoje. Os componentes são apagados se nenhuma outra página os usar |
| Blocos ocultos de captura para o relatório | Removidos; o relatório passa a usar SVG (§7) |

**[DECIDIDO]** Entram:

| Onde | O quê |
|---|---|
| Aba de resultados hidráulicos | Os três gráficos da primária (§5), com o mesmo componente |
| Aba de esquemático | Perfil direcional e planta da primária (`app-primary-well-2d`), **sem caliper**: sem a figura de curvas por MD, sem a mensagem "Esta fase não possui amostras de caliper" e sem o item "Caliper" na legenda. O cimento desenhado é o do tampão ou do squeeze (§5.4) |
| Aba de esquemático, mantidos | `app-squeeze-schematics` / `app-schematic-tampao`, `app-well-schematic` e `app-well-3d`, passando a ler o resultado do motor novo e a desenhar a ferramenta do squeeze quando houver |

**[IMPLEMENTADO NA S4 no tampão]** Como ficou a tela do tampão:

- Cronograma em tabela nas abas 1 e 2: passo, fluido, volume, vazão, duração e
  acumulado, com tempo total, TT 50 Bc e margem. A última linha é o **equilíbrio do tubo
  em U**, com o tempo que o motor levou para drenar; o diagnóstico de TT da aba 1 passou
  a comparar o TT 50 Bc com esse tempo total (antes, só bombeio e pausas).
- Aba 3: a curva de consistência e a de UCA saíram; as métricas de TT e água livre
  ficaram, e o UCA virou a tabela de marcos (50 e 500 psi, 12 e 24 h). O item "Fator
  hidráulico" saiu (§6.2) e no lugar entram o n e o k que o motor usa.
- Aba 4: índice operacional, botões de cálculo e métricas continuam, agora com os
  números do motor (§7.1); entram o quadro "Equilíbrio e retirada" (desbalanço no fim do
  bombeio, drenado, tempo, resíduo, extremidade e topo da pasta depois da retirada, ESD
  na base antes e depois), os avisos do motor e os três gráficos comuns.
- Aba 5: perfil e planta sem caliper abaixo do esquemático do tampão, com a pasta do
  topo sem coluna à base, no poço cheio.
- Painel "8. Simulador": sai o "Free fall máx." (o valor fica no formulário para os
  cenários antigos); entra a condição da cabeça, padrão fechada; o texto da rugosidade
  diz que ela multiplica a perda inteira.

## 5. Os três gráficos no squeeze e no tampão

### 5.1 Um componente para os três simuladores

**[PROPOSTO]** `PrimaryOperationCharts` e `app-primary-operation-charts` viram o módulo
comum `operation-charts` (tipos, montagem das séries, SVG do relatório e componente).
A primária passa a usá-lo sem nenhuma mudança visível: os testes atuais dos gráficos e
dos SVGs da primária continuam passando sem alteração de valor. O que muda por
operação entra como entrada do componente, não como ramificação dentro dele:

| Entrada | Primária | Tampão | Squeeze |
|---|---|---|---|
| Referências do gráfico 1 | Saída ativa (sapata ou porta do estágio) | Base do tampão | **Seletor**: canhoneados (padrão) ou extremidade da coluna. Com retentor, a extremidade é o próprio retentor |
| Título do gráfico 1 | "… na saída ativa" | "… na base do tampão" | "… nos canhoneados" ou "… na extremidade da coluna", conforme o seletor |
| Séries do gráfico 3 | Total e por fluido | Total e por fluido | Total, por fluido e **Injetado na formação** |
| Linha do envelope | Sapata anterior | Topo da fase da operação | Topo da fase da operação |

O seletor de referência é genérico: aparece quando a operação oferece mais de uma
referência. Na primária e no tampão há uma só, e ele não aparece. Trocar a referência
não recalcula o motor; só escolhe qual série das referências já calculadas é desenhada.

### 5.2 Grandezas

**[PROPOSTO]** As grandezas são as da primária, na referência escolhida:

- Hidrostática e ECD pelo lado **por onde o fluido sai**:
  `ECD = P(z) / (0,17060368 · TVD(z))`. Com retorno aberto,
  `P = hidrostática do anular + atrito anular acima + pressão de retorno`
  (§7.1 da primária); parado, ECD = ESD. Com retorno fechado (compressão), P é a
  pressão no ponto pelo percurso de §6.7.
- As referências do motor ganham `hydrostaticPsi` e `ecdPpg` além de `pressurePsi`, para
  o gráfico 1 funcionar numa profundidade que não é a saída ativa. É o caso dos
  canhoneados, e da extremidade depois da retirada.
- Envelope: pressão máxima e hidrostática mínima em cada profundidade ao longo de todo o
  job, com poro e fratura da janela da operação.
- Volume × tempo: volume bombeado pela unidade, total e por fluido, nas durações do
  motor (pausa e pressurização somam tempo; retirada soma a duração informada ou zero).
  "Injetado na formação" é o acumulado que saiu pelos canhoneados. Não é o "volume no
  poço" do squeeze atual, que desconta a injeção.

### 5.3 Janela de poro e fratura

**[DECIDIDO]** Os gradientes de poro e fratura do cenário viram uma linha de janela
(`pressureWindow`) do topo da seção de interesse ao fundo, que é o domínio de hoje
(`windowTopMD`). O gráfico prolonga poro e fratura até a superfície como na primária. As
violações de limite **só contam onde a formação está exposta**: canhoneados, e poço
aberto dentro da seção. Tampão todo dentro de revestimento não gera violação de poro nem
de fratura. No squeeze, passar da fratura na compressão é **squeeze de alta pressão**
(R3 §14-9.2): vira alerta explícito, não bloqueio.

### 5.4 Perfil e planta sem caliper

**[PROPOSTO]** `buildPrimaryWellVisualModel` recebe o cimento como lista de intervalos
com local (`annulus` na primária; `wellbore` no tampão; `wellbore` + canhoneados no
squeeze), em vez de TOC + sapata, e a ferramenta do squeeze como marcador. Com
`caliper = null` e a opção "sem caliper" da operação, o componente não mostra a terceira
figura, o aviso nem o item da legenda. O furo aparece com o diâmetro da fase.

### 5.5 Aviso de reologia simplificada

**[DECIDIDO NA S1]** Hoje o aviso dispara quando lama, espaçador ou pasta têm
exatamente a reologia de água de 1 cP. No squeeze e no tampão, água à frente, água
atrás e fluido de completação podem legitimamente ser água. Por isso o aviso passa a ser
um **texto que cada montador entrega** (`rheologyWarning`), e o componente só o mostra:

- Primária: mantém a regra pelo valor, sem mudança visível. Não troca para a origem
  porque todo programa novo parte da reologia de referência, de origem estimada, e a
  página já tem o próprio aviso de reologia de referência.
- Squeeze e tampão: o aviso olha a **origem** da reologia da pasta, que vem de
  `OrigemReologia`: `laboratorio` e `theta` → medida; `catalogo`, `estimado` e `base` →
  estimada. A água usa a viscosidade informada (origem informada) e nunca gera o aviso.

## 6. Motor: squeeze e tampão no motor da primária

### 6.1 Alvo "coluna de trabalho"

**[IMPLEMENTADO NA S2]** Novo tipo de alvo em
[primary-cementing.model.ts](../../src/app/features/simulador/models/primary-cementing.model.ts),
`{ kind: 'work-string' }`, que **reaproveita os campos do alvo convencional** para não
ramificar o motor inteiro: `casingAssemblyId` é a coluna, e `shoeMD` e `floatCollarMD`
são os dois a extremidade aberta (`floatCollarMD === shoeMD`, sem shoe track). O
dispositivo do estágio é `open-end`, que não assenta plugue, não fecha e não tem
retenção. A montagem tem papel `work-string` (seções de ID/OD). A tela continua com um
único tubing; o modelo já aceita coluna combinada ou stinger (R2 F-18 recomenda cauda
de tubing em poço ≤ 8½"). A ferramenta do squeeze (packer, retentor) entra na S6.

O montador é
[work-string-config.ts](../../src/app/features/simulador/services/work-string-config.ts)
(`buildWorkStringConfiguration`, `workStringOuterWall`). No dimensionamento, a coluna de
trabalho não tem intervalo de pasta (`placements` vazio; recusado se vier) e a pasta
entra com volume informado, que vem do dimensionamento do tampão/squeeze. A geometria
recusa colar acima da extremidade e ignora o caliper do poço, se houver.

- Percurso aberto: desce pela coluna de 0 a `openEndMD`, sai na extremidade e sobe pelo
  anular coluna × parede até a superfície. Não há colar, shoe track nem plugues. A saída
  ativa é a extremidade.
- Parede externa: revestimentos das fases (ID do cadastro) e poço aberto com o
  **diâmetro da fase** (`holeDiameterIn`), como o dimensionamento faz hoje. Sem excesso e
  sem `measured`: o mesmo diâmetro vale para o volume de pasta e para a hidráulica.
- Abaixo da extremidade fica o rathole, estático, como na primária, até a base da seção
  (tampão viscoso, bridge plug ou fundo).
- Fluido inicial: o de completação, na coluna e no poço.
- O contexto vem de `OperationContextService` com a fase da operação (fase-operacao §4).

### 6.2 Fluidos e reologia

**[DECIDIDO]** As entradas de hoje continuam; o adaptador as converte:

| Fluido de hoje | Tipo no motor | Reologia no motor |
|---|---|---|
| Completação | `mud` | Newtoniana: n = 1, k = `viscosidadeAguaCp` convertida |
| Água à frente, água atrás | `wash` | Newtoniana com `viscosidadeAguaCp` |
| Pasta | `cement` | n e k da reologia da pasta de hoje (leituras 300/200/100, de laboratório, θ, catálogo ou estimadas), com a origem de §5.5 |
| Deslocamento | `displacement` | Newtoniana com `viscosidadeAguaCp` |

O fator hidráulico da reologia estimada (`rheologyPressureFactor`, "Fator hidráulico"
na aba de reologia) deixa de multiplicar o atrito: no motor da primária o atrito sai de
n e k de cada fluido.

### 6.3 Programa

**[PROPOSTO]** O dimensionamento de hoje continua dono dos volumes (frente, pasta,
atrás, deslocamento operacional, alturas e topos): `squeeze-calculo.service` e
`tampao-calculo.service` não mudam para o tampão e para a Bradenhead. Um adaptador
traduz esses volumes e as vazões por fluido em passos do motor, todos com quantidade
`entered`:

| Hoje | Passo no motor |
|---|---|
| Água à frente (volume físico, vazão da frente) | `pump` do fluido de frente |
| Pausa 1, 2, 3 | `pause` |
| Pasta (volume bombeado; no squeeze, o injetado sai dela, §2.1) | `pump` da pasta |
| Deslocamento do squeeze Bradenhead e packer | **[ALTERADO NA S7]** o que equilibra a pasta inteira bombeada, e não o de hoje; ver abaixo |
| Água atrás | `pump` do fluido de atrás |
| Deslocamento (`operationalDisplacementVolumeBbl`) | `pump` do deslocamento |
| Fim do deslocamento no tampão | drenagem até o equilíbrio (§6.4) |
| Retirada da coluna (tampão; squeeze Bradenhead e packer) | `pull-string` (§6.5) |
| Injeção/pressurização final (squeeze) | fechamento do retorno + blocos `inject` / `pressurize` (§6.6–§6.7) |

**[DECIDIDO NA S7, por critério técnico] Deslocamento da Bradenhead e do packer.** O
`squeeze-calculo.service` equilibra só a pasta que cobre o intervalo: o volume a injetar
ficava a mais no anular, para o motor antigo injetá-lo com a coluna imersa, técnica que
saiu (§1). No motor novo isso é sobredeslocamento: no cenário padrão da tela o anular
ficava 54 psi mais pesado e o aviso de retorno pela coluna saía em todo squeeze. O
adaptador passou a equilibrar a pasta inteira, como R3 §14-9.5 descreve para a
Bradenhead (tampão balanceado nos canhoneados): no padrão, 24,84 bbl em vez de 25,42 bbl
(`balancedSqueezeDisplacement`). O topo que a retirada usa também passou a ser o da pasta
inteira em poço cheio, para a coluna subir acima do topo real do cimento. O dimensionamento
de hoje (volumes de pasta, águas e alturas) não mudou.

### 6.4 Equilíbrio do tampão

**[DECIDIDO]** Ao fim do deslocamento, se o circuito está aberto e as colunas não
equilibram, o motor continua a drenagem (queda livre com vazio, §7.5 da primária) até o
equilíbrio, num estado final explícito com o tempo que levou. O subdeslocamento
intencional de 2–3 bbl (R3 §14-3.1) deixa o lado da coluna mais pesado e **deve
aparecer** como essa drenagem, não como erro. A diferença de hidrostática na extremidade
no fim do bombeio e o volume drenado viram grandezas do resumo ("desbalanço do tampão").
A retirada (§6.5) só começa depois do equilíbrio.

**[IMPLEMENTADO NA S2] Como a drenagem termina.** A pausa ganhou `untilBalanced`: com
ele, `durationMin` vira o teto e a pausa acaba quando a vazão de drenagem cai abaixo de
**0,001 bpm** (0,16 L/min), com o evento `balance-reached` e o diagnóstico informativo
`PRIMARY_SETTLE` (volume drenado e tempo). Se o teto chega antes, `PRIMARY_SETTLE_TIMEOUT`.
Nesse modo cada passo drena no máximo 0,02 bbl, para o nível não passar do ponto. Com
lei de potência (n < 1), a vazão cai com uma potência do desbalanço e a drenagem
desacelera sem parar de vez; o critério de vazão encerra com um **desbalanço residual**
pequeno (2,4 psi no caso T-06, contra mais de 20 psi no fim do bombeio), que o resumo
deve mostrar. Fluido real com gel para antes, com resíduo maior, sustentado pelo limite
de escoamento, que o modelo não representa.

**[DECIDIDO NA S2] Anular mais pesado.** A coluna aberta não tem retenção, mas o motor
herda a do colar (vazão de saída ≥ 0). Quando o anular fica mais pesado com a bomba
parada, o motor não simula o retorno e avisa com `PRIMARY_WORKSTRING_BACKFLOW` e o
desbalanço, em dois casos: coluna cheia (sobredeslocamento; o fluido voltaria até a
mesa com a cabeça aberta) e coluna com vazio no topo (o anular encheria o vazio, e as
interfaces ficam onde a queda livre parou). A prática subdesloca justamente para evitar
isso (R3 §14-3.1).

### 6.5 Retirada da coluna

**[DECIDIDO]** Novo passo `pull-string { toMD, durationMin }`. `toMD` é a **extremidade
do relatório de retirada**
([retirada-tubos-report.service.ts](../../src/app/features/simulador/services/retirada-tubos-report.service.ts)):
base − (tubos do tampão + seções acima do topo × tubos por seção) × comprimento do tubo,
com os padrões de hoje (2 seções × 2 tubos de 9,4 m). Motor e relatório usam a mesma
função, para os dois números não divergirem.

O passo encurta a coluna até `toMD` e reacomoda os fluidos: o conteúdo da coluna abaixo
da nova extremidade e o aço retirado passam a ocupar o poço de diâmetro cheio, mantendo
a ordem ao longo do poço. É a movimentação de interfaces da Fig. 14-22 de R3. É um
estado estático, sem bombeio. No gráfico 3 aparece como trecho horizontal, com a
duração informada ou zero.

**[IMPLEMENTADO NA S3]** A regra da extremidade saiu do relatório para uma função pura,
[retirada-tubos.ts](../../src/app/features/simulador/services/retirada-tubos.ts)
(`retiradaTubos`), que o relatório passou a chamar. A retirada não virou passo do
transporte, porque encurtar a coluna muda a geometria no meio do cálculo. Ela é um
estado estático calculado a partir do fim do programa:
[work-string-pull.ts](../../src/app/features/simulador/services/work-string-pull.ts)
(`resolveWorkStringPull`). A compressão da Bradenhead, que precisa do circuito com a
coluna encurtada, fica para a S5. Hipóteses do estado, na ordem:

1. Abaixo da nova extremidade o poço fica cheio. O que estava dentro e fora da coluna
   nessa faixa se junta e é reempilhado pela ordem de profundidade: o mais fundo
   embaixo e, na mesma profundidade, o mais pesado embaixo.
2. O aço retirado deixa um vão logo abaixo da extremidade, preenchido pelo fluido que
   estava logo acima dela, descendo a mesma altura por dentro e por fora da coluna.
   Num tampão balanceado isso mantém o equilíbrio.
3. O poço é completado na superfície durante a manobra (trip tank), com o fluido inicial.
   Se a coluna já tinha vazio no topo, ela não é completada, e o vazio cresce.

No caso do Petroguia sem excesso: extremidade de 2510 para 2331,4 m (15 tubos do tampão
+ 2 seções de 2 tubos de 9,4 m), 3,19 bbl de aço retirado, descida de 15,0 m dos dois
lados, pasta de 2370 a 2510 m em poço cheio. A pressão na base cai de 4017,8 para
4004,5 psi (ESD de 9,383 para 9,352 ppg), porque a pasta passa de 151,8 m de altura com
a coluna para 140 m sem ela.

**[ALTERADO NA S3] Aceite dos topos.** O topo do cimento bate com o dimensionamento
(`topCementWithoutTubing` do tampão, `topCementAfterPullMD` do squeeze), que também é
volume em poço cheio a partir da base. O `topDisplacementAfterPullMD` do squeeze **não**
é critério: ele empilha o deslocamento inteiro e os dois espaçadores logo acima do
cimento, como se a coluna saísse toda e o conteúdo dela descesse. Retirando só até a
extremidade do relatório, o deslocamento continua dentro e ao lado da coluna, acima da
extremidade. Pela mesma razão, o topo da água do tampão sem coluna do dimensionamento
(topo do cimento − altura da água com coluna, 2262,8 m no caso) é uma aproximação: pelo
volume, a água fica de 2266,1 m, ao lado da coluna, até o topo do cimento. Os critérios
passam a ser a conservação de volume por fluido, o aço retirado igual ao completado na
superfície e a hidrostática na base conferida à mão.

A circulação reversa e a contagem de tubos continuam como hoje, fora do motor: cartão de
volume mínimo (1,5 × capacidade da coluna) e relatório de retirada.

### 6.6 Técnicas de squeeze

**[DECIDIDO]** O cenário escolhe uma de três técnicas. A injeção com a coluna imersa,
que o motor atual faz, deixa de existir.

| Técnica | Sequência no motor | Isolamento na compressão |
|---|---|---|
| **Bradenhead** (sem ferramenta; R3 §14-9.5) | Posiciona como o tampão, com retorno aberto → drena até o equilíbrio → `pull-string` até a extremidade de §6.5, acima do topo do cimento → `close-return` na superfície (BOP) → blocos de compressão | Retorno fechado na superfície. **Todo o revestimento** acima dos canhoneados fica sob a pressão (R3 Tabela 14-8) |
| **Packer recuperável** (R3 §14-9.6.1) | Posiciona com o bypass aberto, como o tampão → drena até o equilíbrio → `pull-string` até o packer ficar acima do topo do cimento → `set-tool` (fixa o packer e fecha o bypass) → blocos de compressão | Anular isolado na profundidade do packer; acima dele, estático, com a contrapressão opcional |
| **Retentor perfurável** (R3 §14-9.6.2) | **[ALTERADO 2026-09-24]** Retentor já fixado acima dos canhoneados. Posiciona com o **stinger desencaixado** e o retorno pelo anular acima do retentor, até a frente da pasta chegar à ferramenta → encaixa o stinger (`set-tool`) → blocos de compressão | Anular isolado no retentor depois de encaixar. **Só o fluido abaixo do retentor vai para a formação antes da pasta**, como R3 descreve |

**[DECIDIDO 2026-09-24] Retentor: stinger desencaixado no posicionamento.** A primeira
versão desta seção punha o stinger encaixado desde o primeiro passo. O caso numérico de
S6 mostrou o custo: no poço do teste da S5 (retentor a 1830 m, canhoneados de 1850 a
1860 m, coluna 2⅞" com 34,75 bbl até o retentor), entrariam na formação uns 38,5 bbl de
fluido de completação e água antes da pasta. R3 §14-9.6.2 diz que a vantagem do retentor
é justamente o contrário: *"a smaller volume of fluid below the packer is displaced
through the perforations ahead of the cement slurry"*. O usuário escolheu posicionar com
o stinger desencaixado e encaixar quando a pasta chega à ferramenta: antes da pasta, só
entram os 3,77 bbl de revestimento abaixo do retentor.

**Dimensionamento com retentor.** O de hoje é o do tampão balanceado, que não vale para
o retentor. Pasta = volume a injetar + volume do revestimento entre o retentor e a base
dos canhoneados (a pasta que fica abaixo da ferramenta); deslocamento total =
capacidade da coluna até o retentor menos a água atrás, sem passar dele (R3 §14-4.2.3
contra sobredeslocamento). No caso acima, com 5 bbl a injetar: pasta de 8,77 bbl. O
usuário escolheu a opção B sem objeção a esses volumes; ficam como proposto.

**[IMPLEMENTADO NA S6]** A compressão virou uma só função para as três técnicas,
`resolveSqueezeCompression`
([work-string-compression.ts](../../src/app/features/simulador/services/work-string-compression.ts)),
com o isolamento como entrada: `bradenhead` (anular fechado na BOP e ligado à
extremidade) ou `tool` (packer ou retentor na extremidade, anular isolado com a
contrapressão). A parede abaixo da extremidade vem do cadastro das fases
(`wellWallSections`), porque abaixo do retentor não há segmento do motor.

- **Packer**: o posicionamento é o do tampão, com o bypass aberto; o packer fica na
  extremidade depois da retirada (a regra do relatório de retirada) e é fixado no início
  da compressão.
- **Retentor**
  ([squeeze-retainer.ts](../../src/app/features/simulador/services/squeeze-retainer.ts),
  `runRetainerSqueeze`): o posicionamento é a coluna de trabalho com a extremidade no
  retentor e o retorno pelo anular acima dele; abaixo do retentor, o fluido inicial fica
  isolado. Com a coluna mais pesada, a pasta cai livre e chega à ferramenta antes do
  volume programado. O motor corrige o deslocamento do posicionamento pelo desvio
  medido (pasta que passou para o anular menos o fluido que ainda está entre a frente da
  pasta e o retentor) até ficar abaixo de 0,01 bbl; o que falta do deslocamento total
  vai para a compressão, e os blocos podem ser dados em função desse plano. O vazio que a
  queda livre deixou na coluna é enchido primeiro, sem vazão no percurso e sem atrito.
- Avisos: `PRIMARY_SQUEEZE_TOOL_DIFFERENTIAL` (diferencial acima do limite da
  ferramenta), `PRIMARY_RETAINER_SLURRY_ABOVE` (pasta no anular acima do retentor antes
  de encaixar), `PRIMARY_RETAINER_OVERDISPLACED` (água atrás ou deslocamento abaixo do
  retentor) e `PRIMARY_RETAINER_SPOT` (pasta e água atrás maiores que a coluna: encaixar
  durante o bombeio da pasta não é modelado).
- As referências passaram a usar a hidrostática **pelo percurso** (coluna e revestimento
  abaixo da extremidade): pressão − hidrostática é a pressão de superfície menos o atrito,
  nas três técnicas. Na extremidade, a pressão é a de saída da coluna, abaixo da
  ferramenta.

**[DECIDIDO] Contrapressão no anular.** Com packer ou retentor fixado, o cenário pode
informar a pressão aplicada no anular acima da ferramenta (padrão zero). O motor mostra o
diferencial na ferramenta (pressão abaixo − pressão acima) e, se o cenário informar os
limites, compara com o diferencial máximo da ferramenta e com a pressão de ruptura do
revestimento. Na Bradenhead, a comparação de ruptura vale para todo o revestimento
exposto.

### 6.7 Compressão para a formação

**[PROPOSTO]** Passos novos, que só o squeeze usa:

- `close-return` (Bradenhead) e `set-tool` (packer): fecham o retorno na superfície ou
  na ferramenta. No retentor, o retorno já nasce fechado. Com o retorno fechado não há
  queda livre, porque o circuito não tem para onde cair.
- `inject { rateBpm, volumeBbl, surfacePressurePsi }`: o volume sai do poço **pelos
  canhoneados**, na vazão de bombeio, retirando o fluido que está nessa profundidade. O
  motor registra o inventário injetado por fluido.
- `pressurize { durationMin, surfacePressurePsi }`: pressão aplicada sem vazão, como a
  pressurização de hoje.
- **Hesitação**: o programa aceita vários blocos `inject` e `pressurize` em sequência,
  cada um com volume, vazão, pressão e tempo próprios (R3 §14-9.4: ¼ a ½ bpm, pausas de
  10 a 20 min). Os blocos de hoje (uma injeção e uma pressurização) viram o caso de um
  bloco de cada.

**Condição de contorno (decidida por critério técnico, a pedido do usuário).** O motor não
sabe quanto a formação aceita; isso só um teste de injetividade diria, e o simulador não
tem esse dado. A abordagem que funciona com o que o usuário tem é a de hoje: o programa
informa a **pressão de operação na superfície** e a **vazão** de cada bloco, e o motor
calcula a pressão nos canhoneados pelo percurso:

```
P_canhoneados = P_superfície + Σ hidrostática − Σ atrito
```

ao longo de coluna → extremidade (ou ferramenta) → revestimento até os canhoneados, com o
atrito na vazão do bloco (zero na pressurização). Com isso o motor também devolve **a
maior pressão de superfície que mantém o squeeze de baixa pressão**, isto é, a que leva
os canhoneados até a fratura:

```
P_superfície,máx = P_fratura(canhoneados) − Σ hidrostática + Σ atrito
```

Esse limite aparece no resumo de cada bloco. É o número que falta para o usuário planejar
a pressão de operação. Se um dia houver teste de injetividade (pares vazão × pressão), ele
entra como alternativa: dada a vazão, o motor calcula a pressão de superfície.

Conservação: volume bombeado = variação no poço + injetado, por fluido, com erro de
balanço ≤ 1·10⁻⁸ bbl em todo instante, como na primária.

**[IMPLEMENTADO NA S5 — Bradenhead]**
[work-string-compression.ts](../../src/app/features/simulador/services/work-string-compression.ts)
(`resolveBradenheadCompression`, `resolveSqueezeCompression` desde a S6). Escolhas da implementação:

- **Estágio próprio, depois da retirada**, e não passo do transporte, pela mesma razão da
  §6.5: a coluna encurtada muda o circuito. Com o retorno fechado e a vazão imposta não há
  tubo em U nem queda livre, e o movimento é determinado pelo volume: o que entra na
  coluna sai pelo canhoneado. `close-return` fica implícito no início da compressão.
- **Percurso**: coluna de 0 à extremidade depois da retirada, revestimento da extremidade
  ao **canhoneado de base**, que é a saída. Abaixo dele o poço fica parado. Assim o
  intervalo canhoneado inteiro está no percurso: o que está nele sai primeiro e a pasta
  que desce passa a cobri-lo, o que o retentor (S6) precisa. Três avisos separados:
  `PRIMARY_SQUEEZE_FLUID_AHEAD` (informativo) para o que entra na formação antes da
  pasta; `PRIMARY_SQUEEZE_PERFS_UNCOVERED` quando o topo da pasta passa do canhoneado de
  topo, com o volume injetado nesse momento; e `PRIMARY_SQUEEZE_OVERDISPLACED` para o
  fluido de trás que entra na formação depois da pasta. (Na primeira versão da S5 a saída
  era o canhoneado de topo; mudou quando o caso do retentor mostrou que, assim, o fluido
  do intervalo nunca seria deslocado.)
- **Anular** coluna × revestimento, fechado na BOP: parado, ligado à extremidade. A
  pressão na cabeça do revestimento é a da extremidade menos a hidrostática do anular.
- **Referências** do gráfico 1: "canhoneados" no meio do intervalo (o padrão de hoje,
  `profundidadeReferenciaSqueezeMD`) e a extremidade da coluna. A hidrostática da
  referência é a coluna de fluidos pelo percurso (coluna e revestimento abaixo da
  extremidade; na S5 era pelo lado do poço, e mudou na S6 para valer igual com
  ferramenta).
- **Atrito**: R3 §4-6 como tubo, no ID da coluna e no ID do revestimento, com o nível
  interno para a coluna e o anular para o revestimento. Sem excentricidade, porque não
  há anular em fluxo.
- **Fluido bombeado**: o de deslocamento, salvo se o bloco disser outro. Se a coluna
  tiver vazio no topo, o bombeio enche o vazio primeiro, sem injetar e com a superfície
  do líquido a zero psi; esses pontos saem com o tipo `fill`.
- **Limite de baixa pressão**: calculado no canhoneado de topo, no de base e em cada
  interface entre eles, e o menor vale. Com pressão de superfície acima dele,
  `PRIMARY_SQUEEZE_HIGH_PRESSURE` (aviso, com o limite), e o cálculo segue.
- **Revestimento exposto**: envelope da maior pressão interna em cada profundidade.
  Com `casingBurstPsi`, compara sem contrapressão externa, a favor da segurança (os
  campos de limite entram na tela em S7, §11).
- Coluna com pasta na altura da extremidade ou acima: `PRIMARY_SQUEEZE_STRING_IN_CEMENT`.
  Canhoneados fora do trecho entre a extremidade e a base do tampão:
  `PRIMARY_SQUEEZE_PERFORATIONS`, sem calcular.
- A série "Injetado na formação" (`injectedVolumeSeries`, tipo `extra`) sai do acumulado
  que passou pelo canhoneado.

### 6.8 Atrito, excentricidade e limites

**[PROPOSTO]**

- Atrito: R3 §4-6, igual à primária. Os números do squeeze e do tampão mudam em relação
  ao F-40, e os casos de §10 registram quanto.
- `standoffPct` corrige o atrito anular por excentricidade, `1 − (a + b·n)(1 − Sto/100)`
  (Petroguia F-40). O `primaryEccentricityFactor` da primária só tem coeficientes para
  8½" × 7" (0,44; 0,18) e 12¼" × 9⅝" (0,43; 0,19). O squeeze usa hoje os de 8½" × 7"
  para qualquer coluna e revestimento, e continua assim; o resumo avisa quando a
  geometria não é uma das duas do Petroguia.
- `rugosidadeTubo` vira o nível de atrito da primária. Os valores são os mesmos
  (baixa 1,00×, média 1,15×, alta 1,35×), mas o squeeze os aplica só ao fator de atrito
  turbulento e a primária, à perda inteira. Vale a regra da primária, e em laminar a
  perda muda nos níveis média e alta.
- `freeFallMaxFactor` deixa de existir no cálculo, porque a queda livre conservativa não
  precisa de teto. O valor fica guardado nos cenários antigos e sai da tela.
- `motorHP`, `pumpEff`, `maxSurfacePressure` e `maxPumpRate` viram `equipmentLimits`.
- Condição da cabeça: o mesmo campo da primária (cabeça fechada ou aberta), padrão cabeça
  fechada.

### 6.9 O que não muda

Dimensionamento de volumes e topos do tampão e da Bradenhead, receitas e aditivos,
temperatura, TT e reologia da pasta, cálculo de circulação reversa, relatório de
retirada de tubos, seleção da fase da operação, cenários e pastas. Os esquemáticos
próprios continuam, mas leem os topos e intervalos do resultado novo onde hoje leem
`SqueezeHydraulicSimulation`.

## 7. Relatório

**[PROPOSTO]**

- O catálogo de gráficos do relatório do squeeze e do tampão passa a ser o da primária:
  `hydrostatic-ecd` (na referência selecionada), `pressure-envelope-<fase>`,
  `injected-volume-time`, `profile` e `plan`. Não entra `caliper`. Os gráficos saem em
  **SVG vetorial**, sem capturar canvas.
- O cronograma e os marcos de UCA entram como tabelas.
- No squeeze: técnica, profundidade da ferramenta, extremidade após a retirada, blocos de
  compressão com pressão, vazão, volume e tempo, pressão nos canhoneados e limite de
  pressão de superfície do squeeze de baixa pressão.
- Seleções antigas de `dadosRelatorio` são convertidas na abertura: `pressao` → os três
  gráficos hidráulicos; `cronograma` → tabela do cronograma. Nada é gravado no banco só
  por abrir.
- O relatório identifica o motor e diz o que ele não modela: compressão como remoção de
  pasta inteira nos canhoneados, sem reboco (§2).

**[IMPLEMENTADO NA S4 no tampão]** O modal do relatório continua com as duas caixas de
hoje, e as seleções gravadas continuam valendo (T-18), com o conteúdo novo: `pressao` →
premissas da simulação (o que o motor faz e o que ele não modela: mistura nas
interfaces, gel, retorno pela coluna, circulação reversa), os três gráficos, perfil e
planta da fase da operação; `cronograma` → tabela do cronograma e tabela dos marcos de
UCA. Tudo em SVG como imagem da página (`data:image/svg+xml`), com o texto sem acento
como nos SVGs da primária. O modal ganhou `graficoLabels` para o tampão dizer o que
cada caixa gera; o squeeze mantém os textos até S7.

### 7.1 Relatório de conformidade

**[DECIDIDO NA S4]** A §4 não o citava, mas a aba 4 do tampão e a do squeeze abrem o
relatório de conformidade (ECD, BHP, hidrostática × fratura, queda livre, score de
risco, interfaces e sub-deslocamento), que lê `SqueezeHydraulicSimulation`. Ele fica, lendo
o motor novo:

- `tampaoLegacyHydraulics` entrega o resultado do motor com os nomes de campo antigos.
  BHP e ECD são os da primária, pelo anular na base do tampão; a pressão de poro e a de
  fratura continuam as do gradiente do formulário nessa profundidade (critério do
  relatório, que não segue a regra de violação só em formação exposta de §5.3). "Free
  fall acumulado" é a integral de máx(0, vazão de saída − vazão bombeada), como antes;
  enquanto a bomba enche o vazio, a saída fica abaixo da bombeada.
- A varredura do score (4 vazões × 4 standoffs × 3 densidades = 48 simulações) roda o
  motor novo: 0,93 s no caso do teste.
- Com `motor: 'primaria'`, os textos mudam onde a física mudou: composição do BHP (sem a
  fricção da coluna), origem da queda livre, fonte e nota da varredura.
- Interfaces e sub-deslocamento: o topo previsto é o do motor depois do equilíbrio e da
  retirada (`predictedTopMD`), não "planejado + Vff / capacidade". No motor conservativo
  a queda livre durante o bombeio não empurra o trem além do volume bombeado; só a
  drenagem depois do bombeio muda as posições. Cada linha da tabela de sensibilidade é
  uma simulação com o deslocamento da linha (`predictTopMD`).
- **[DECIDIDO 2026-09-24 pelo usuário] Queda livre é alerta.** Os limites de queda livre
  (vazão extra ≤ 50% da bombeada, volume ≤ 10% do bombeado) vinham da simulação antiga,
  que estimava a queda livre; com o motor novo, o cenário padrão do tampão passou de
  9,5% para 13,6% do volume e 59% da vazão, e reprovava com a pasta no lugar certo. Com
  `motor: 'primaria'`:
  - relatório de Free Fall: vazão extra e volume ficam como alerta (referências 50% e
    10%); os critérios são o topo final da pasta dentro da tolerância (15 m e 10% da
    coluna, a do relatório de interfaces) e o BHP dentro da janela poro × fratura;
  - score de risco: o fator de queda livre continua pesando, mas só é reprovação dura se
    o topo final sair da tolerância;
  - movimento de interfaces: sai o critério "controlável pela bomba".
  A simulação antiga continua com os limites de antes.

## 8. Persistência e compatibilidade

**[PROPOSTO]** Os campos de entrada do tampão continuam os mesmos, e o adaptador de §6.3
lê o `formValue` atual. O squeeze ganha campos novos: técnica, profundidade e tipo da
ferramenta, contrapressão no anular, limites da ferramenta e do revestimento, e a lista
de blocos de compressão. Um cenário antigo abre como **Bradenhead** com um bloco de
injeção e um de pressurização, montados a partir de `volMaxInjetadoBbl`,
`pressaoOperacao` e `tempoPressurizacaoMin`. A tela avisa que a técnica foi assumida e
nada é gravado até o usuário salvar.

**[IMPLEMENTADO NA S7]** Campos novos do squeeze: `tecnicaSqueeze`, `retentorMD`,
`retentorFundoMD`, `contrapressaoAnularPsi`, `diferencialFerramentaPsi`,
`rupturaRevestimentoPsi`, `headCondition` e a lista `blocosCompressao` (tipo, volume,
vazão, tempo e pressão de superfície). Os três campos de hoje (`volMaxInjetadoBbl`,
`pressaoOperacao`, `tempoPressurizacaoMin`) passaram a ser derivados dos blocos
(`squeezeInjectionFields`), porque o dimensionamento e o relatório de injetividade os leem.
Um cenário sem `tecnicaSqueeze` abre como Bradenhead e mostra o aviso. **[ALTERADO NA
S7]** A fase de hoje é uma injeção só, sob a pressão de operação, ao longo do tempo de
pressurização (mínimo de 1 min); ela vira **um** bloco de injeção com o mesmo volume, a
mesma pressão e a mesma duração, e não um de injeção e outro de pressurização, que
dobraria o tempo. Sem volume, vira um bloco de pressurização (`legacySqueezeBlocks`).

Resultados não são salvos: são recalculados. Um cenário antigo reabre com números
diferentes, porque o motor mudou (ECD pelo anular, atrito de R3, queda livre
conservativa e, no squeeze, a coluna retirada antes da compressão). O resumo mostra a
versão do motor, e a diferença esperada fica registrada pelos casos de §10.

## 9. Entregas

Tampão primeiro; cada página sai pronta, com relatório, antes da outra.

| Entrega | Conteúdo | Pronto quando |
|---|---|---|
| [x] S1 — Gráficos comuns (§12.1) | Módulo `operation-charts` extraído da primária; referências com seletor, título e séries extras; aviso de reologia por origem; perfil/planta sem caliper e com cimento por intervalo | Primária sem mudança visível: testes e SVGs atuais iguais (T-19); componente testado com dados sintéticos de tampão e squeeze |
| [x] S2 — Alvo coluna de trabalho (§12.2) | `work-string` em geometria, transporte e hidráulica; referências com hidrostática e ECD; drenagem até o equilíbrio | T-01 a T-06 |
| [x] S3 — Retirada da coluna (§12.3) | `pull-string` com a extremidade do relatório de retirada, na mesma função | T-07, T-08 |
| [x] S4 — Tampão na tela nova (§12.4) | Adaptador tampão → configuração; página sem os gráficos antigos, com os três novos, perfil/planta e tabelas de cronograma e UCA; relatório do tampão em SVG; `app-pressure-chart` apagado | T-09, T-17 (tampão), T-18 |
| [x] S5 — Compressão Bradenhead (§12.5) | `close-return`, blocos `inject` / `pressurize`, limite de pressão de superfície, revestimento exposto, série "Injetado na formação" | T-10 a T-14 |
| [x] S6 — Packer e retentor (§12.6) | `set-tool`, retentor posicionado com o stinger desencaixado e encaixado quando a pasta chega à ferramenta, contrapressão no anular, diferencial na ferramenta, dimensionamento com retentor | T-15, T-16 |
| [x] S7 — Squeeze na tela nova (§12.7) | Adaptador squeeze → configuração; migração dos cenários antigos para Bradenhead; página e relatório como em S4; seletor de referência; componentes antigos apagados | T-17 (squeeze), T-18, T-20 |
| [x] S8 — Validação (§12.8) | Casos de §10 contra cálculo à mão e contra o motor atual onde os dois devem coincidir; diferenças documentadas; revisão visual | Registro na SPEC com números; a revisão visual fica com o usuário, nos cenários de exemplo |

## 10. Casos de aceitação

| ID | Caso | Esperado |
|---|---|---|
| T-01 | Tampão em poço vertical revestido, todos os fluidos com a mesma densidade | Sem tubo em U; pressão de bombeio = atrito da coluna + do anular; ECD = ESD + atrito anular / (K · TVD); na pausa, ECD = ESD |
| T-02 | Pasta pesada na coluna com o circuito aberto | Queda livre com vazio; vazão de saída > vazão de bombeio; balanço por fluido ≤ 1·10⁻⁸ bbl em todo instante; mesmo comportamento da primária |
| T-03 | Geometria do exemplo do Petroguia (R2 F-20), **sem o excesso de 50% do livro**: tampão de 2370 a 2510 m em 8½" (0,2303 bbl/m), coluna 4½" 16,6 lb/pé de extremidade aberta a 2510 m (Ctp 0,0467 bbl/m; aço fechado 0,0645 bbl/m), fluidos à frente e atrás de mesma densidade | Pelas fórmulas de F-19: Vp = 32,2 bbl; Can = 0,1658 bbl/m; Htci = 151,7 m (topo com a coluna imersa a 2358,3 m); Vfa = 5 bbl (Hfa = 107,1 m); Vff = 17,8 bbl; Vd = 105,1 bbl. No motor, as interfaces no fim do deslocamento nessas alturas, iguais na coluna e no anular |
| T-04 | Referência acima da extremidade | Hidrostática e ECD da referência iguais ao cálculo à mão da coluna de fluidos no anular |
| T-05 | Tampão deslocado exatamente até o equilíbrio | No fim, hidrostáticas dos dois lados na extremidade iguais (≤ 0,5 psi) e drenagem nula |
| T-06 | Tampão subdeslocado em 2–3 bbl | Drenagem após o bombeio até a vazão cair abaixo de 0,001 bpm; resíduo de desbalanço abaixo de 10% do desbalanço do fim do bombeio (§6.4); volume drenado e tempo no diagnóstico |
| T-07 | Retirada até a extremidade do relatório | Extremidade do motor = `openEndDepthM` do relatório de retirada, com os mesmos parâmetros |
| T-08 | Topos depois da retirada | Topo do cimento = topo sem coluna do dimensionamento (≤ 0,1 m); volume de cada fluido conservado; fluido completado na superfície = aço retirado; hidrostática na base igual ao cálculo à mão (§6.5) |
| T-09 | Tampão atual aberto na tela nova | Três gráficos, perfil e planta; nenhum caliper; cronograma e UCA em tabela; fase da operação como padrão do envelope |
| T-10 | Bradenhead: posicionamento, retirada e compressão | Na compressão, coluna acima do topo do cimento, retorno zero, anular estático; "Injetado na formação" = volume programado |
| T-11 | Bloco de injeção com pressão de operação P e vazão Q | Pressão nos canhoneados = P + Σ hidrostática − Σ atrito(Q) pelo percurso coluna → extremidade → revestimento; ECD da referência sobe com P |
| T-12 | Bloco de pressurização | Atrito zero; ECD = (P + hidrostática) / (K · TVD), constante no bloco |
| T-13 | Hesitação com três blocos injetar/pressurizar | Tempo e volume somados bloco a bloco; ECD e série de injeção em degraus coerentes |
| T-14 | Pressão de operação acima do limite de baixa pressão | Alerta de squeeze de alta pressão, com o limite de superfície calculado; cálculo não bloqueado |
| T-15 | Packer recuperável com contrapressão no anular | Anular acima do packer estático na contrapressão informada; diferencial na ferramenta = pressão abaixo − pressão acima; comparação com o limite quando informado |
| T-16 | Retentor | Posicionado com o stinger desencaixado até a frente da pasta chegar ao retentor; encaixado, só o fluido abaixo do retentor sai pelos canhoneados antes da pasta; deslocamento não passa do retentor |
| T-17 | Relatório de tampão e de squeeze | Gráficos em SVG; sem caliper; cronograma e UCA em tabela; texto do que o motor não modela; no squeeze, técnica e blocos |
| T-18 | Cenário antigo com `pressao` e `cronograma` selecionados | Abre com a seleção convertida, sem gravação automática |
| T-19 | Primária depois de S1 | Todos os testes e SVGs da primária inalterados |
| T-20 | Squeeze antigo aberto | Assume Bradenhead com um bloco de injeção e um de pressurização a partir dos campos de hoje; aviso na tela; nada gravado até salvar |

## 11. Pendências para a implementação

- **Limites de ruptura e de diferencial**: o cadastro das fases não tem pressão de
  ruptura do revestimento. Os campos entram no cenário do squeeze como opcionais; se um
  dia o cadastro de tubulares tiver a classe do aço, o valor passa a vir de lá.
- **Reboco e desidratação no squeeze** (R3 §14-8): fora desta entrega (§2).
- **Circulação reversa no motor** e **dardos no tampão**: fora desta entrega (§1).
- **[DECIDIDO NA S7] Envelope em ppg na compressão**: com pressão na superfície, a ECD
  perto da superfície cresce sem limite (1000 psi a 100 m são 58 ppg). A compressão entra
  no envelope só onde há formação exposta (os canhoneados), a mesma regra de §5.3 para as
  violações; o revestimento exposto vai para o resumo da aba (cabeça do revestimento e
  maior pressão interna) e para a tabela de compressão do relatório.

## 12. Registro de implementação

**[FATO 2026-09-25]** As entregas S1–S8 foram concluídas. O [histórico integral](history/squeeze-tampao-implementacao-2026-09.md) guarda provas de cálculo, arquivos alterados, exemplos e resultados de teste.

### Ajustes vigentes das revisões posteriores

- Envelope: duas hidrostáticas mínimas (por profundidade e do poço); poro e fratura só em formação exposta; compressão como série própria nos canhoneados.
- Squeeze: eixo de ECD por tempo, delta ECD apenas do atrito, pressão aplicada separada e marcador do estado depois da retirada. Tampão e primária mantêm eixo por volume.
- Pasta do squeeze (Bradenhead e packer): o bombeado é o tampão e o injetado sai de dentro dele (§2.1). Os esquemáticos mostram o tampão antes da injeção; o topo após injeção usa a pasta que fica.
- Janela operacional: faixa poro-fratura no envelope e gráfico de risco de fratura no squeeze, com limite de pressão de superfície e pressão aplicada. Detalhes atuais em [janela operacional](janela-operacional.md).
- Relatório: seleção individual de gráficos, tópicos e figuras compactados em A4; a pressão máxima de injeção controla os blocos sem apagar degraus menores.

### Entregas e revisões datadas

### 12.1 S1 — gráficos comuns (2026-09-23)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.2 S2 — alvo coluna de trabalho no motor (2026-09-23)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.3 S3 — retirada da coluna (2026-09-23)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.4 S4 — tampão na tela nova (2026-09-24)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.5 S5 — compressão Bradenhead (2026-09-24)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.6 S6 — packer e retentor (2026-09-24)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.7 S7 — squeeze na tela nova (2026-09-24)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.8 S8 — validação (2026-09-24)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.9 Reologia fora das telas e avaliação dos gráficos (2026-09-25)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.10 Atrito e ECD como na primária (2026-09-25)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.11 Gráficos revistos em entrevista (2026-09-25)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.12 Volume de pasta do squeeze na tela (2026-09-25)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.13 Relatório, janela operacional e risco de fratura (2026-09-25)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.14 Módulo de janela operacional: especificação recebida (2026-09-25)

[Registro datado](history/squeeze-tampao-implementacao-2026-09.md).

### 12.15 Injetado sai do tampão (2026-10-08)

Regra em §2.1. [Registro datado](history/squeeze-tampao-implementacao-2026-09.md).
