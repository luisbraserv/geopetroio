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
| Volume de pasta | Anular do intervalo + shoe track | Intervalo pelo diâmetro da fase, **sem excesso**; altura com a coluna imersa Htci = Vp / (Can + Ctp) (R2 F-19) | Volume que cobre o intervalo + volume a injetar na formação |

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
([primary-operation-charts.component.ts](../../src/app/features/simulador/components/charts/primary-operation-charts.component.ts)),
na aba Hidráulica:

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
| Pasta (volume bombeado, com o injetável no squeeze) | `pump` da pasta |
| Deslocamento do squeeze Bradenhead e packer | **[ALTERADO NA S7]** o que equilibra a pasta inteira (a do intervalo e a que vai para a formação), e não o de hoje; ver abaixo |
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
[primary-work-string.spec.ts](../../src/app/features/simulador/services/primary-work-string.spec.ts):
parede externa pelo cadastro, T-01 a T-06, aviso de sobredeslocamento e recusa de colar
e de intervalo de pasta na coluna de trabalho.

### 12.3 S3 — retirada da coluna (2026-09-23)

| Arquivo | O que mudou |
|---|---|
| `services/retirada-tubos.ts` (novo) | `retiradaTubos`: a regra da extremidade depois da retirada, a mesma do relatório |
| `services/retirada-tubos-report.service.ts` | `buildCalculation` passou a chamar `retiradaTubos`. Corrigido: campo vazio da sequência (comprimento do tubo, seções, tubos por seção) virava 0 em vez do padrão, porque `Number('')` é 0; com tubo de 0 m, a conta dividia por zero e a extremidade ia para 0 m |
| `services/work-string-pull.ts` (novo) | `resolveWorkStringPull`: estado depois da retirada, com camadas dentro, fora e abaixo da nova extremidade, aço retirado, descida, volume completado na superfície e hidrostática do lado do poço em qualquer profundidade (§6.5) |

Casos novos em
[primary-work-string.spec.ts](../../src/app/features/simulador/services/primary-work-string.spec.ts):
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

Casos novos: [tampao-engine.spec.ts](../../src/app/features/simulador/services/tampao-engine.spec.ts)
(programa pelos volumes de hoje; alturas de projeto e topo depois da retirada; drenagem
do subdeslocado; os três gráficos; aviso pela origem; formato antigo; 48 simulações da
varredura; excentricidade; textos do relatório de conformidade com e sem o motor novo) e
[simulador-tampao.render.spec.ts](../../src/app/features/simulador/pages/simulador-tampao/simulador-tampao.render.spec.ts)
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

Casos em [primary-squeeze-bradenhead.spec.ts](../../src/app/features/simulador/services/primary-squeeze-bradenhead.spec.ts):
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

Casos em [primary-squeeze-tools.spec.ts](../../src/app/features/simulador/services/primary-squeeze-tools.spec.ts):
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

Casos novos: [squeeze-engine.spec.ts](../../src/app/features/simulador/services/squeeze-engine.spec.ts)
(deslocamento equilibrado e o aviso que o de hoje daria; Bradenhead, packer e retentor no
poço da tela; gráficos com o seletor e a série do injetado; formato antigo com a injeção;
migração; 48 simulações da varredura) e
[simulador-squeeze.render.spec.ts](../../src/app/features/simulador/pages/simulador-squeeze/simulador-squeeze.render.spec.ts)
(tela, troca de técnica, blocos alimentando os campos de hoje, tabelas, perfil e planta,
T-17, T-18, T-20 e o relatório de conformidade). Em
[geometry-validation.spec.ts](../../src/app/features/simulador/pages/geometry-validation.spec.ts),
a retirada com receita por volume passou a contar os 2 bbl a injetar.

Verificação: **839 testes aprovados em 86 arquivos** (eram 831 em 85: entram os 16 casos
novos e saem os 8 dos componentes apagados), em cinco lotes (238 + 194 + 154 + 102 + 151);
`npm.cmd run build` exit 0.

### 12.8 S8 — validação (2026-09-24)

**Casos de aceitação.** Todos têm teste automático com o número conferido:

| Caso | Onde | Evidência |
|---|---|---|
| T-01 | [primary-work-string.spec.ts](../../src/app/features/simulador/services/primary-work-string.spec.ts) | Mesma densidade: pressão de bombeio = atrito da coluna + do anular; ECD − ESD = atrito anular / (K · TVD) a 1·10⁻⁹; parado, ECD = ESD |
| T-02 | idem | Queda livre com vazio acima de 1 bbl e saída acima da bombeada; balanço por fluido ≤ 1·10⁻⁸ bbl em todo instante |
| T-03 | idem | Vp 32,2 bbl, Htci 151,7 m, Vff 17,8 bbl, Vd 105,1 bbl; interfaces nas alturas de projeto a 0,1 m, na coluna e no anular |
| T-04 | idem | Hidrostática a 2400 m igual à coluna de fluidos à mão a 0,5 psi |
| T-05 | idem | Hidrostáticas iguais na extremidade a 0,5 psi; nada drena |
| T-06 | idem | Subdeslocado em 2,5 bbl: drena até 0,001 bpm; resíduo de 2,4 psi, abaixo de 10% dos mais de 20 psi do fim do bombeio |
| T-07 | idem | Extremidade = a do relatório de retirada, inclusive com campos vazios; 19 tubos, 2331,4 m |
| T-08 | idem e [tampao-engine.spec.ts](../../src/app/features/simulador/services/tampao-engine.spec.ts) | Topo sem coluna a 0,1 m; conservação por fluido; completado = aço retirado; hidrostática na base à mão a 0,5 psi |
| T-09 | [simulador-tampao.render.spec.ts](../../src/app/features/simulador/pages/simulador-tampao/simulador-tampao.render.spec.ts) | Três gráficos, perfil e planta sem caliper, cronograma e UCA em tabela, fase da operação no envelope |
| T-10 | [primary-squeeze-bradenhead.spec.ts](../../src/app/features/simulador/services/primary-squeeze-bradenhead.spec.ts) | Coluna acima do cimento; anular inalterado; injetado = programado; conservação ≤ 1·10⁻⁸ bbl |
| T-11 | idem | Pressão no canhoneado igual ao percurso à mão a 1·10⁻⁶ psi; ECD sobe 1000 / (K · TVD) |
| T-12 | idem | Atrito zero; ECD = (P + hidrostática) / (K · TVD), constante no bloco |
| T-13 | idem | Três ciclos: 4 e 10 min por bloco, 1 bbl por injeção, 42 min no total, injeção em degraus |
| T-14 | idem | Limite de superfície igual à conta à mão a 1·10⁻⁶ psi; aviso de alta pressão; cálculo segue |
| T-15 | [primary-squeeze-tools.spec.ts](../../src/app/features/simulador/services/primary-squeeze-tools.spec.ts) | Anular na contrapressão; diferencial = abaixo − acima à mão; 1000 psi de contrapressão reduzem o diferencial em 1000 psi |
| T-16 | idem | Antes da pasta, só os 3,77 bbl abaixo do retentor (mais ≤ 0,01 bbl do ajuste); 5,00 bbl de pasta na formação; nada passa do retentor |
| T-17 | render de tampão e de squeeze | Relatório em SVG, sem caliper, com premissas, tabelas e, no squeeze, a tabela de compressão |
| T-18 | idem | Seleções antigas `pressao` e `cronograma` geram o conteúdo novo; nada gravado |
| T-19 | S1 (§12.1) e os testes da primária | SVGs da primária idênticos; nenhum teste de valor da primária mudou |
| T-20 | [squeeze-engine.spec.ts](../../src/app/features/simulador/services/squeeze-engine.spec.ts) e render do squeeze | Cenário antigo abre como Bradenhead, com um bloco de injeção de mesmo volume, pressão e tempo, e o aviso; nada gravado |

**Contra o motor antigo, onde os dois devem coincidir**
([squeeze-tampao-examples.spec.ts](../../src/app/features/simulador/pages/squeeze-tampao-examples.spec.ts)):

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
[squeeze-tampao-examples.fixture.ts](../../src/app/features/simulador/pages/squeeze-tampao-examples.fixture.ts)
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
([primary-hydraulics.ts](../../src/app/features/simulador/services/primary-hydraulics.ts)); a
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
[squeeze-calculo.service.spec.ts](../../src/app/features/simulador/services/squeeze-calculo.service.spec.ts);
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

Decidido em entrevista no mesmo dia e implementado: [janela-operacional.md](janela-operacional.md)
(perfil por TVD em ppg ou psi/ft, classes no cenário, ponto crítico no poço todo com o critério
de cada trecho).

**Pressão máxima de injeção (2026-09-25, a pedido do usuário).** No topo de "4.5 Técnica e
compressão", um campo só, "Pressão máxima de injeção (psi)", que mostra a maior "P sup." dos
blocos. Mudar o valor leva a ele os blocos que estavam no máximo e limita um bloco acima dele;
degraus menores (hesitação) ficam como estão. Logo abaixo, a maior pressão de superfície sem
fraturar calculada, com "usar", em vermelho quando a pressão digitada passa dela. Os 2000 psi que
o PIR-259D (id 8) mostrava eram o padrão dos blocos da tela nova, não um valor do programa
(que pede no máximo 1500 psi).
