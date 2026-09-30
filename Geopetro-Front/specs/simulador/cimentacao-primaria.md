# Simulador de cimentação primária

> **[COLCHÕES CALCULADOS — 2026-09-25]** Lavador e espaçador passam a ter volume
> calculado pelo simulador a partir da pasta dimensionada, com campo para informar
> outro volume: V = máx(t·Q, L·C) (§5.7). Registro e conferência contra o programa
> da Halliburton do MINA-02 em §13.13.

> **[REVISÃO DA HIDRÁULICA — 2026-09-23]** Avaliação contra um poço real
> (survey Gyrodata do MINA-28BD) e um modelo de referência independente. Duas
> decisões mudam o motor: o atrito passa do Petroguia F-40 para o método de R3
> §4-6 (§7.3 e §12.1), e a queda livre deixa de interromper o cálculo e passa a
> ser resolvida pelo transporte conservativo com vazio (§7.5). Caso de campo e
> números de aceitação em §11.5; registro em §13.11. Comparação com o iCem da
> Halliburton no MINA-02 em §11.6 e §13.12.

> **[REVISÃO DE INTERFACE E RELATÓRIO — 2026-09-19]** O alvo atual de layout,
> agrupamento lateral, cenários por pastas, identificação, sequência operacional
> e receitas no relatório está em
> [Padrão do squeeze, cenários e relatório](cimentacao-primaria-padrao-squeeze.md).
> A revisão preserva o motor e complementa §§8–9; implementação R2 pendente.

> SPEC de feature · 2026-09-17 · **P1/P2 implementadas; P3 em andamento.**
>
> Revisão após entrevista: cálculos e interface no `Geopetro-Front`; cenários salvos
> no banco pela API do simulador, conforme decisão do usuário. Contratos e geometria
> já têm implementação; motor completo, página e integração de persistência seguem
> nas etapas abaixo. Nenhuma gravação no banco é realizada pelas novas funções.

## 1. Objetivo e convenções

Criar **Cimentação primária**, em `/app/simulador/primaria`, com os mesmos tipos de
gráfico do squeeze e uma física própria: os fluidos descem **pelo interior do
revestimento que será cimentado**, atravessam a sapata e sobem **por trás desse
revestimento**, entre seu OD e a parede do poço ou o ID de um revestimento anterior.

O resultado deve mostrar TOC previsto, volumes por fluido, pasta retida entre colar
e sapata, deslocamento até o colar, retornos, pressões e posição dos fluidos ao longo
da operação. TOC significa topo do cimento; shoe track é o trecho entre colar
flutuante e sapata. A sapata é a referência inicial de BHP/ECD. Em liner, a descida
inclui a coluna de assentamento; em estágios posteriores, a saída é o dispositivo
aberto do estágio. O cimento ocupa o anular externo do revestimento/liner.

Neste documento, **[EXISTENTE]** descreve o código inspecionado;
**[PROPOSTO]** é o contrato de implementação desta feature. As referências técnicas
fundamentam os conceitos e equações; arquitetura, tolerâncias e divisão de entregas
são decisões de software, não prescrições dos livros.

### 1.1 Primeira versão completa

As respostas da entrevista são requisitos da primeira versão completa:

| Respostas | Decisão confirmada |
|---|---|
| 1, 2 e 5 | Convencional (superfície, intermediário e produção), liner e múltiplos estágios; editar estrutura completa e selecionar revestimento-alvo |
| 3 e 6 | Calcular volumes pelo TOC e pelos intervalos de colocação de cada pasta; várias pastas, sem modo alternativo de volume total manual |
| 4 e 7 | Adicionar, repetir, remover e reordenar fluidos livremente; vazão por passo e pausas; comparar colocação obtida com a desejada |
| 8 | Reprodução, pausa e seleção de instante, sincronizando gráficos e animação |
| 9 | Liner com coluna de assentamento até seu topo, colar, sapata e circuito completo |
| 10 | Quantidade configurável de estágios; cada um com dispositivo, TOC e programa próprios |
| 11 | Diâmetro nominal com excesso por trecho ou diâmetro medido, sem duplicar excesso |
| 12 | Receitas/estimativas existentes e propriedades medidas em laboratório, com origem identificada |
| 13 | Sem perdas para a formação nesta versão; alertar pressão sem inferir vazão de perda |
| 14 | Continuar ao exceder limites de pressão, vazão ou potência, destacando instante e local |
| 15 | Salvar no banco de dados e exportar/importar cenários |
| 16 | Relatório completo, gráficos do squeeze adaptados e os cinco gráficos anexados |
| Complemento: volume | Seletor entre volume total bombeado e volume somente de pasta, com eixo explícito |
| Complemento: retorno | Comparar resultados calculados com dados medidos importados |

Modelo: fluido incompressível, transporte 1D, interfaces sem mistura, temperatura
e reologia informadas por fluido. Plugues/dispositivos são separadores ideais;
volumes deslocados por seus corpos são desprezados e pressões de ruptura não são
inferidas. A configuração deve declarar os caminhos abertos e fechados.

Cimentação reversa, inner string até a sapata, perdas dinâmicas, gás,
compressibilidade, gelificação/transiente térmico, canalização, eficiência real de
remoção de lama, movimento e resistência estrutural do revestimento ficam para
expansões. Rathole abaixo da sapata fica fora do circuito e do volume calculado,
com indicação na tela. Geometria impossível e estado fora do domínio do modelo
continuam bloqueando resultados; não são simples excedências operacionais.

### 1.2 Diferenças que não podem ser herdadas do squeeze

| Item | Squeeze atual | Primária proposta |
|---|---|---|
| Caminho descendente | Interior da coluna de trabalho | ID do revestimento-alvo ou coluna de assentamento + liner |
| Caminho ascendente | Anular da coluna no poço/revestimento | Anular externo do revestimento-alvo |
| Referência principal | Canhoneados/zona de squeeze | Sapata ou saída ativa do estágio; referências adicionais configuráveis |
| Destino da pasta | Colocação e eventual injeção na formação | Bainha anular e shoe track |
| Final | Injeção/pressurização; desenhos com retirada de tubing | Assentamento do plugue superior e parada |
| Volume de deslocamento | Depende da colocação/balanço do squeeze | Capacidade do caminho de lançamento até o assento ativo |
| Estado final | Regras específicas de squeeze | Cimento atrás do revestimento e no shoe track |

Não chamar `SqueezeHydraulicSimulationService.simulate()` passando a primária como
se fosse um tampão. Não fabricar tubing/canhoneados para satisfazer seus tipos.

## 2. Referências e rastreabilidade

Materiais fornecidos pelo usuário, consultados como referências técnicas:

| ID | Documento | Uso nesta SPEC |
|---|---|---|
| R1 | `506808603-Halliburton-Cementing-1-Book.pdf` | Sequência da primária, acessórios, volumes, deslocamento e receitas |
| R2 | `Petroguia 2a Ed - (2009) Petrobras.pdf` | Capacidades, hidrostática, reologia e perda de carga |
| R3 | `well-cementing-book.pdf` | Colocação de fluidos, projeto da primária, hidráulica, queda livre e limitações do modelo |

Localização das páginas verificadas e detalhes das equações: seção 12.

Conferência complementar de terminologia: [SLB, Defining Cementing](https://www.slb.com/resource-library/oilfield-review/defining-series/defining-cementing),
[shoe track](https://glossary.slb.com/en/terms/s/shoe_track) e
[float collar](https://glossary.slb.com/en/terms/f/float_collar).
Essas fontes confirmam a colocação de cimento no anular, a retenção de pasta no
shoe track e a função antirretorno do colar. Não são fonte das escolhas de software.

## 3. Arquitetura e reaproveitamento

Os caminhos de código abaixo são relativos a `src/app/features/simulador/`,
exceto `src/app/app.routes.ts`, que é relativo à raiz `Geopetro-Front`.

| Componente existente | Reaproveitamento / mudança proposta |
|---|---|
| `models/well-geometry.model.ts` e `services/well-geometry.service.ts` | Manter a fonte única de geometria, segmentação e MD→TVD; acrescentar resolução explícita do anular externo |
| `models/well-geometry.form.ts`, formulário de estrutura e trajetória | Reusar edição e validação; acrescentar montagem do revestimento-alvo |
| `services/well-fluid-distribution.ts` | Reusar distribuição volumétrica com capacidades corretas e identidade do fluido; manter balanço separado de entrada/saída |
| `services/slurry-calculo.service.ts`, `cement-slurry-recipe.service.ts` | Receitas independentes e escala pelo volume de cada pasta |
| `services/rheology-adjustment.service.ts` | Reusar com rastreabilidade entre reologia informada e estimada |
| `components/charts/squeeze-operation-charts.component.ts` | Extrair contrato de apresentação comum e admitir `operation: 'primaria'`; manter compatibilidade de squeeze/tampão |
| `components/charts/ops-chart.component.ts` | Cronograma por `OpsPhase[]`, usando a mesma sequência do motor |
| `components/charts/thickening-chart.component.ts`, `uca-chart.component.ts` | Reusar gráficos; identificar origem medida/estimada e selecionar qualquer pasta |
| `components/well/well-schematic.component.ts`, `well-3d.component.ts` | Criar geometria visual explícita do anular externo antes de reusar overlays |
| `pages/simulador-index/` e `src/app/app.routes.ts` | Card e rota lazy `primaria`, herdando os perfis de acesso existentes |

**[EXISTENTE]** `CapacityKind = 'annulus'` usa o diâmetro interno efetivo do segmento
menos o OD da coluna. `WellOverlay.zone = 'annulus'` e o 3D não representam hoje
a bainha externa do revestimento-alvo. Apenas trocar legendas deixaria cálculo e
desenho incorretos. O motor de squeeze também contém canhoneados, injeção final,
semântica própria de volume e estimativa de queda livre que não transporta o
volume adicional nas interfaces. Não reutilizar essas regras como física da primária.

**[PROPOSTO]** Arquivos novos:

```text
models/primary-cementing.model.ts
models/operation-hydraulics.model.ts             # DTO comum de gráficos
services/primary-cementing-calculo.service.ts    # volumes, TOC, receitas
services/primary-cementing-hydraulics.service.ts # transporte, pressões, eventos
services/primary-cementing-state.service.ts      # API de cenários + exportação/importação
services/primary-measurements-import.service.ts # dados medidos e normalização
services/hydraulic-friction.ts                  # funções puras auditadas
pages/simulador-primaria/simulador-primaria.component.{ts,html,css}
components/charts/primary-cementing-schematic.component.ts
```

A resolução dos trechos da primária deve ser adicionada ao `WellGeometryService`,
com método próprio, sem mudar o significado do anular usado por squeeze/tampão.
O desenho consome os mesmos trechos e interfaces calculados pelo motor.

### 3.1 Revestimentos sobrepostos

`WellPhase` descreve fases por intervalo de profundidade; isso não basta para
inferir todas as paredes de um anular entre revestimentos sobrepostos. O contrato
proposto contém `targetCasing` separado e uma montagem externa explícita, vinculada
à geometria. Cada trecho informa se a parede externa é o poço ou um revestimento
anterior. O usuário confirma os IDs e os intervalos; não inferir o ID anterior
usando o ID do próprio revestimento-alvo.

O método de geometria produz `PrimaryFlowSegment[]`, segmentando em toda mudança
de parede, OD/ID, caliper, colar, sapata, TOC alvo e pontos necessários do survey.
Cada segmento guarda a origem da parede externa (`phaseId`/`outerCasingId`) para
que cálculo e esquema sejam rastreáveis. Resolver OD/ID por trecho desde a primeira
versão, inclusive transições entre coluna de assentamento e liner.

No liner, acima de `linerTopMD`, o caminho descendente usa o ID da coluna de
assentamento e o retorno usa seu OD contra o ID do revestimento anterior. Abaixo
do topo, usar ID/OD do liner e a parede externa declarada. Modelar a conexão no
topo e o overlap; não prolongar o OD do liner até a superfície. O TOC pode subir
pelo overlap e alcançar o anular da coluna acima do topo do liner.

Cada estágio declara saída ativa (`outletMD`), assento de fechamento (`seatMD`),
caminhos conectados e volumes retidos. Não confundir estágio de cimentação com
passo de bombeio. Só um circuito de circulação fica ativo por vez; comunicação
simultânea por várias portas fica fora do domínio inicial. Abrir um novo estágio
preserva os inventários já colocados. Trechos isolados ficam sem transporte; sua
pressão exige condição de contorno, não deve ser copiada da porta ativa. Abaixo
de uma porta aberta, uma coluna estática ainda comunicante recebe hidrostática
a partir da pressão nessa conexão, com atrito zero.

### 3.2 Contratos de implementação

**[IMPLEMENTADO P1]** Os contratos completos e versionados estão em
[`primary-cementing.model.ts`](../../src/app/features/simulador/models/primary-cementing.model.ts),
[`primary-measurements.model.ts`](../../src/app/features/simulador/models/primary-measurements.model.ts)
e [`primary-scenario.model.ts`](../../src/app/features/simulador/models/primary-scenario.model.ts).
O trecho abaixo é um resumo; os arquivos de código são a referência exata de tipos.
`schemaVersion=1`; `engineVersion=null` no rascunho sem motor calculado.

```ts
type PrimaryFluidKind = 'mud' | 'wash' | 'spacer' | 'cement' | 'displacement';
type PrimaryPhaseKind = 'pump' | 'pause' | 'tool-event' | 'plug-landed' | 'static';

interface PrimaryFlowSegment {
  id: string; pathId: string; equipmentId: string;
  topMD: number; bottomMD: number; topTVD: number; bottomTVD: number;
  casingIDIn: number; casingODIn: number;
  outerBoundary: 'open-hole' | 'previous-casing';
  outerDiameterIn: number; // limite externo do fluido, não OD do revestimento anterior
  outerBoundaryId: string;
  pipeCapacityBblM: number;
  annularCapacityBblM: number; // capacidade efetiva usada em TODO o transporte
  nominalAnnularCapacityBblM: number | null; // null para diâmetro medido
}

interface PrimaryFluid {
  id: string; kind: PrimaryFluidKind; name: string; densityPpg: number;
  rheology: { model: 'power-law'; n: number; kLbfSnFt2: number };
  propertySources: Record<string, {
    source: 'measured' | 'estimated' | 'entered';
    reference?: string; measuredAt?: string; originalValue?: number;
    originalUnit?: string; temperatureC?: number; pressurePsi?: number;
  }>;
  // Newtoniano: n=1, k=viscosidadeCp * 2.0885e-5.
}

interface CementPlacement {
  id: string; fluidId: string; topMD: number; bottomMD: number;
  retainedVolumeIds: string[]; // volumes físicos atribuídos uma única vez
}

interface CementingStage {
  id: string; name: string; deviceId: string;
  outletMD: number; seatMD: number; targetTocMD: number;
  activePathId: string; placements: CementPlacement[];
  steps: PrimaryPumpStep[];
}

type PrimaryPumpStep =
  | { id: string; kind: 'pump'; fluidId: string; rateBpm: number;
      quantity: { source: 'entered'; volumeBbl: number }
        | { source: 'placement'; placementId: string; fraction: number }
        | { source: 'displacement'; deviceId: string; fraction: number }
        | { source: 'reserve-extra'; placementId: string; volumeBbl: number }
        | { source: 'preflush'; contactTimeMin: number; annularLengthM: number;
            overrideBbl: number | null } }
  | { id: string; kind: 'pause'; durationMin: number }
  | { id: string; kind: 'tool-event'; deviceId: string;
      action: 'launch-bottom' | 'launch-top' | 'launch-dart'
        | 'open-stage' | 'close-stage' };

interface PrimaryEvent {
  timeMin: number; stageId: string; stepId: string; deviceId?: string;
  kind: 'bottom-plug-launched' | 'bottom-plug-opened'
    | 'top-plug-launched' | 'top-plug-landed' | 'interface-at-shoe'
    | 'interface-at-return' | 'outside-model' | 'dart-launched'
    | 'liner-wiper-released' | 'stage-opened' | 'stage-closed'
    | 'interface-at-outlet';
  md: number; fluidId?: string;
}

interface PrimaryHydraulicPoint {
  timeMin: number; stageId: string; stepId: string; phase: PrimaryPhaseKind;
  pumpedVolumeBbl: number; cementPumpedVolumeBbl: number;
  returnedVolumeBbl: number; cementReturnedBbl: number;
  activeOutletMD: number;
  pumpRateBpm: number; outletRateBpm: number | null; returnRateBpm: number | null;
  requiredPumpPressurePsi: number; pumpPressurePsi: number | null;
  annularHydrostaticPsi: number; internalHydrostaticPsi: number;
  pipeFrictionPsi: number; annularFrictionPsi: number; localLossPsi: number;
  bhpPsi: number | null; ecdPpg: number | null;
  porePsi: number | null; fracturePsi: number | null;
  voidVolumeBbl: number | null; uTubeDrivePsi: number;
  state: 'full' | 'free-fall' | 'plug-landed' | 'outside-model';
  references: { id: string; md: number; tvd: number;
    pressurePsi: number | null; ecdPpg: number | null }[];
}
```

`PrimaryInputs` reúne geometria do poço, montagem externa, revestimento-alvo,
tipo convencional/liner, coluna de assentamento, topo do liner, colar e sapata,
`CementingStage[]`, fluidos, contrapressão no retorno, janela e limites de equipamento.
Os contratos implementados também guardam caminhos, dispositivos, estado inicial
e volumes retidos com IDs estáveis. A configuração persistida fica em `primary`;
`PrimaryInputs` é a entrada do futuro motor, com a geometria efetiva separada.
`PrimaryPhaseKind` classifica a ação; a identidade/natureza do fluido vem de `fluidId`.
`PrimaryResult` reúne volumes planejados/efetivos, interfaces por snapshot, séries,
envelope, `PrimaryEvent[]`, balanços de volume e diagnósticos com severidade e código.
Cada snapshot inclui posições MD dos plugues/dardos por dispositivo e seus estados
(`not-launched`, `travelling`, `landed-open`, `landed-closed`), além das posições
fixas de colar e sapata. A condição da cabeça para queda livre é entrada explícita
(`closed-head` por padrão; `vented-free-surface` apenas se declarada).

`outletRateBpm` é a vazão na saída ativa; no caso base equivale a `Q_sapata` das
equações. Não chamar vazão em porta de estágio de vazão na sapata. `bhpPsi/ecdPpg`
mantêm referência identificada, com os demais pontos no array `references`.
Para cimento dimensionado, `quantity.source` deve ser `placement`; `entered`
fica para outros fluidos e `reserve-extra` identifica a reserva adicional. Frações
de deslocamento também somam 1, salvo programa parcial identificado como tal.
Lavador e espaçador usam `preflush` (§5.7): o volume sai do critério, e
`overrideBbl`, quando presente, é o volume informado que o substitui.

O DTO dos gráficos deve admitir `null` para grandeza indisponível. Não preencher
canhoneados falsos nem inventar volume injetado para encaixar o resultado no tipo
`SqueezeHydraulicSimulation`. Um adaptador preservará o contrato dos consumidores
existentes durante a extração do DTO comum.

## 4. Entradas, unidades e validação

| Grupo | Entradas e regra |
|---|---|
| Geometria | MD e TVD em metros internamente; diâmetros em polegadas; edição m/ft converte só na borda |
| Alvo | Convencional: `0 < floatCollarMD < shoeMD <= finalMD`; liner: `0 < linerTopMD < floatCollarMD < shoeMD`; caminho contínuo desde a cabeça |
| Paredes | Em cada trecho, `0 < casingID < casingOD < outerDiameter`; cobertura contínua até a sapata |
| Volume | Derivado de TOC + geometria + intervalos por pasta; não editar total de cimento independentemente desses dados |
| Pastas | Intervalos contíguos e sem sobreposição no estágio entre TOC e saída ativa; volumes retidos atribuídos uma vez; fluidos com IDs independentes |
| Estágios | Número inteiro ≥1, sem limite de dois; `0 <= targetTocMD < outletMD <= shoeMD`; dispositivo/assento compatíveis com o caminho; sem saída simultânea por várias portas |
| Fluidos | Densidades positivas e finitas; viscosidade ou `n,k` positivos; volume não negativo |
| Programa | Volume positivo exige vazão positiva; pausa tem volume zero; assentamento bloqueia o caminho fechado até abertura válida do próximo estágio |
| Janela | Gradientes em ppg equivalentes, poro < fratura; ausência de dado resulta em `null`, sem janela verde fictícia |
| Retorno | Pressão manométrica na saída em psi; zero é retorno atmosférico |
| Equipamento | Pressão máxima, vazão máxima, HP e eficiência (0 < η <= 1) opcionais |
| Reologia | Propriedades medidas podem substituir estimativas explicitamente, com fonte/condições; standoff entre 0 e 100%; sem extrapolação silenciosa |

Valores não finitos, gaps, diâmetros invertidos e survey inválido bloqueiam cálculo
e limpam resultados anteriores. Não ordenar profundidades nem trocar diâmetros
automaticamente para produzir um resultado aparente. Limites de plausibilidade
seguem [faixas-validacao.md](faixas-validacao.md); ausência de faixa aprovada não
autoriza criar uma faixa de campo arbitrária.

O datum inicial é a cabeça do revestimento, com TVD=0 e pressão manométrica.
Primeira versão sem coluna d'água marinha, offset de RKB ou armazenamento das
linhas de superfície. O volume bombeado e o deslocamento são medidos na cabeça;
não somar volume de linhas sem modelar sua localização e o ponto de lançamento
do plugue. Perdas locais opcionais seguem §7.3.

## 5. Fórmulas de geometria, volumes e receitas

### 5.1 Convenções numéricas

Usar as constantes compartilhadas existentes, sem arredondar resultados intermediários:

```text
C = BBL_M = 0.0031871                  [bbl / (m · in²)]
K = HYDRO_M = 0.052 * 3.28084         [psi / (ppg · m)]
1 bbl = 42 gal US = 9702/1728 ft³
1 ft = 0.3048 m
```

`C` é a forma arredondada de `π·0.0254²/(4·0.158987294928)`.
`K = 0.17060368`; não criar outra constante `0.1706` na primária. A forma de
campo `0.052·ρ·TVD_ft` é aproximada e consistente com a aplicação existente.
Volumes e atrito usam **MD**; hidrostática usa incrementos de **TVD**.

### 5.2 Capacidades por trecho

Para trecho `i`, `L_i = bottomMD_i - topMD_i`:

```text
c_int,i = C · ID_alvo,i²
c_an,i  = C · (D_externo,i² - OD_alvo,i²)
V_int(a,b) = Σ c_int,i · comprimentoMD(interseção(i,[a,b]))
V_an(a,b)  = Σ c_an,i  · comprimentoMD(interseção(i,[a,b]))
```

`D_externo` é o caliper/diâmetro efetivo em poço aberto ou o **ID do revestimento
anterior** em trecho revestido. A parede de aço não é volume disponível para fluido.
Nunca usar `ID_alvo² - OD_tubing²` como capacidade da cimentação primária.

### 5.3 Excesso, sobrecalibre e reserva

Dois modos mutuamente exclusivos por trecho aberto:

1. **Caliper medido:** capacidade calculada pelo diâmetro medido; excesso geométrico
   adicional igual a zero.
2. **Nominal com excesso anular estimado:** `e = excessoPct/100`,
   `c_an,efetivo = c_an,nominal·(1+e)` e
   `D_efetivo = sqrt(OD_alvo² + (1+e)·(D_nominal² - OD_alvo²))`.

O modo 2 representa uma hipótese de sobrecalibre do anular, e deve alimentar
dimensionamento, transporte, TOC e atrito com a **mesma geometria efetiva**.
O percentual não é aumento do diâmetro. Não aplicar ao interior do revestimento,
shoe track ou anular entre revestimentos. Não reaplicar ao caliper medido.

Reserva de mistura é um campo separado: aumenta material preparado, não pasta
bombeada. Uma adição explícita da reserva ao programa fica identificada como
extra ao volume calculado por TOC e recalcula colocação/retornos; não cria um
modo alternativo de dimensionamento manual. Excesso não equivale a perda para a formação.

### 5.4 Pasta, shoe track e duas pastas

Caso convencional de um estágio, usado como referência analítica:

```text
V_track = V_int(floatCollarMD, shoeMD)
V_anular_alvo = V_an(targetTocMD, shoeMD)
V_pasta_bombeada = V_anular_alvo + V_track       # uma pasta, sem perdas

V_tail = V_an(tailTopMD, shoeMD) + V_track
V_lead = V_an(targetTocMD, tailTopMD)
V_total_pastas = V_lead + V_tail
```

No template lead→tail, tail ocupa o anular inferior e o shoe track ao final
ideal. São nomes de pastas, não uma ordem imposta. Para qualquer quantidade de
pastas, por intervalo de colocação `j` no estágio `s`:

```text
V_pasta(s,j) = ∫[topMD_j,bottomMD_j] c_an,s(z) dz + Σ V_retido_atribuido(s,j)
V_pastas(s) = Σ_j V_pasta(s,j)
V_bombeio_passo = fracao_passo · V_pasta(s,j)
Σ fracao_passo(s,j) = 1
```

O shoe track é um volume retido do primeiro circuito; não somá-lo novamente em
todos os estágios. Volumes de acessórios entram somente se identificados na
geometria, sem sobrepor o volume de tubos. Repetir uma pasta divide seu volume
calculado entre passos; o editor exige repartição das frações, sem duplicar
silenciosamente o total. Remover todos os passos de uma pasta planejada gera
programa incompleto. Subdimensionamento não é apresentado como conclusão bem-sucedida.

Os intervalos definem a intenção. A ordem livre efetivamente bombeada determina
a colocação calculada pelo transporte, inclusive pasta fragmentada, retorno e
fluido incorreto no track. Mostrar esses desvios; não reorganizar o programa para
forçar o TOC esperado. Intervalos já ocupados em estágios anteriores não podem
ser novamente dimensionados como se estivessem cheios de lama: sinalizar conflito
de projeto e exigir ajuste dos intervalos, preservando todo o inventário anterior.

Ao final ideal sem retorno de cimento:
`V_pasta_bombeada = V_cimento_anular + V_cimento_track`.
Com retorno à superfície, acrescentar `V_cimento_retornado` ao lado direito.
Durante o bombeio, contabilizar todo cimento ainda dentro do revestimento, não
apenas o volume final do shoe track.

### 5.5 Deslocamento e TOC calculado

```text
V_deslocamento_alvo = V_int(0, floatCollarMD)
V_capacidade_ate_sapata = V_deslocamento_alvo + V_track
```

O volume alvo é contado **depois do lançamento do plugue superior**. Não subtrair
pasta, lavador ou espaçador bombeados antes do plugue. O editor permite outros
fluidos antes do lançamento; transportar sua posição real e avisar se ocuparem
o track ou alterarem a colocação desejada.

Para liner com dardo lançado na cabeça e liberação ideal do plugue no topo:

```text
V_deslocamento_liner = ∫[0,linerTopMD] c_int,coluna(z) dz
                    + ∫[linerTopMD,floatCollarMD] c_int,liner(z) dz
                    + V_acessorios_na_rota_sem_sobreposicao
V_track_liner = ∫[floatCollarMD,shoeMD] c_int,liner(z) dz
V_deslocamento_estagio_s = capacidade do caminho de lançamento até seatMD_s
```

Contar o trajeto do dardo na coluna e o do plugue no liner uma vez cada. A
liberação no topo é evento de posição, sem reiniciar o acumulado global. Não
usar `outletMD` como `seatMD` se forem profundidades distintas. Assento, saída e
comunicação dos dispositivos são parâmetros explícitos; não inferir ferramenta
real apenas pela profundidade. Cada novo estágio calcula o próprio deslocamento.

Para volume conhecido no anular, partir da sapata e consumir os trechos de baixo
para cima. Em um trecho parcialmente preenchido:
`topMD = bottomMD - V_restante/c_an`. Subtrair integralmente trechos já preenchidos.
Esse atalho vale para bainha contínua no caso base; a ordem livre exige obter
todos os intervalos ocupados a partir das parcelas transportadas. Exibir topo mais
raso e intervalos descontínuos, sem confundir um bolsão com bainha contínua.
Converter o topo encontrado em TVD pelo serviço de geometria. Se chegar à
superfície, o excedente é cimento retornado, TOC=0; nunca TOC negativo.

Menor deslocamento deixa o plugue acima do colar e pasta adicional no interior.
O modelo ideal para no assentamento; deslocamento programado maior que o alvo
gera diagnóstico de sobredeslocamento e não avança fluido através de plugue fechado.

### 5.6 Cronograma e receitas

```text
t_etapa[min] = V_etapa[bbl] / Q_etapa[bbl/min]
t_total = Σ t_etapa + Σ t_pausa
N_sacos94 = V_pasta[bbl] · (9702/1728) / Y[ft³/saco94]
Agua_mistura[gal] = N_sacos94 · Agua_por_saco[gal/saco94]
Quantidade_aditivo = N_sacos94 · Quantidade_por_saco
```

Usar `CementSlurryRecipeService` e a convenção de rendimento da
[SPEC de receitas](receitas-pasta.md). Não confundir `yieldFt3PerFt3Cement` com
`ft³/saco`. Quantidades de todas as pastas são calculadas separadamente; totalizar só
produtos e unidades compatíveis. Arredondamento de sacos para suprimento não
muda automaticamente o volume da simulação.

Propriedades medidas têm precedência somente nos campos substituídos pelo usuário.
Guardar valor, unidade original, fonte, data e condições de ensaio quando
disponíveis; identificar condição não informada. Recalcular receita não apaga o
override. Oferecer restaurar estimativa por campo. Curvas medidas de espessamento
e UCA permanecem distintas das estimadas, sem extrapolação automática.

### 5.7 Colchões lavador e espaçador

**[DECIDIDO 2026-09-25]** O volume de cada passo de lavador ou espaçador é calculado
pelo simulador a partir da pasta dimensionada, e a tela oferece um campo para
informar outro volume:

```
V_colchão = máx( t_c · Q ,  L_min · C_fundo )
C_fundo   = V_anular(pasta de fundo) / (base − topo da pasta de fundo)     [bbl/m]
```

- `Q` é a vazão do passo (bpm) e `t_c` o tempo de contato mínimo (min): o volume
  que passa por um ponto do anular durante `t_c` é `t_c·Q`, qualquer que seja a
  geometria (manual de revestimento e cimentação, eq. 10.7, `V = t_c·Q`).
- `C_fundo` é a capacidade anular da pasta que cobre a saída ativa do estágio (o
  tail, quando há duas pastas), tirada do próprio dimensionamento: volume anular
  do intervalo sobre a altura dele, com caliper e excesso (§5.3). É a zona de
  interesse da regra de R3, a que a pasta precisa isolar.
- `L_min` é o comprimento anular mínimo (m) que o colchão deve ocupar nessa zona.

| Colchão | `t_c` de partida | `L_min` de partida | Fonte |
|---|---:|---:|---|
| Lavador | 8 min | 0 | R3, cap. 5, diretrizes de remoção de lama (p. 189): contato de pelo menos 8 min na zona de interesse |
| Espaçador | 8 min | 152,4 m (500 ft) | R3, mesma página: pelo menos 500 ft de anular; R3, Tabela 9-3 (p. 301): o espaçador também conta tempo de contato |

A prática de 10 min (apostila de cimentação primária da CEP, 2009; R3 p. 164,
"A 10-min contact time is recommended") fica como escolha do usuário, no campo
do critério. Nenhuma das fontes dimensiona colchão como fração do volume de pasta;
a ligação com a pasta é `C_fundo`.

**Conferência no MINA-02 v3 (§11.6):** espaçador a 5 bpm, tail de 24,83 bbl de
anular em 100 m. `t_c·Q = 8 × 5 = 40,00 bbl`; `L_min·C_fundo = 152,4 × 0,2483 =
37,84 bbl`; governa o contato, e o calculado é **40,00 bbl, o volume do programa**.
Com 10 min, 50 bbl, o da versão dos gráficos do iCem.

Regras:

1. Só `wash` e `spacer` aceitam `preflush` (`PRIMARY_PREFLUSH_FLUID`); `t_c` e
   `L_min` finitos, não negativos e não ambos nulos (`PRIMARY_PREFLUSH_CRITERIA`).
2. Sem pasta dimensionada no estágio (coluna de trabalho), `L_min` não entra e só o
   contato vale, com aviso (`PRIMARY_PREFLUSH_NO_ZONE`).
3. Volume informado (`overrideBbl`) substitui o calculado no programa, no
   transporte e na hidráulica; o critério e a base do cálculo continuam guardados
   e visíveis, e "Usar o volume calculado" limpa o informado.
4. Repetir um passo divide o critério ao meio em cada um, e a soma dos dois é o
   colchão inteiro.
5. O volume do lavador não é limitado pela hidrostática aqui: a janela de poro da
   hidráulica (§7) acusa um lavador que deixe o poço abaixo do poro, como R3 (p. 179)
   e a apostila do pré-sal alertam.
6. Cenários salvos com volume digitado (`entered`) continuam com o valor salvo; a
   tela oferece passar para o calculado.

## 6. Transporte, sequência e conservação

```mermaid
flowchart LR
    A[Entrada na cabeça] --> B[Interior do revestimento]
    B --> C[Colar e shoe track]
    C --> D[Sapata]
    D --> E[Anular externo: subida]
    E --> F[Retorno na superfície]
```

Estado inicial: lama em todo o circuito. Sequência padrão: condicionamento
opcional com lama → lavador opcional → espaçador opcional → lançamento do plugue
inferior → lead opcional → tail → lançamento do plugue superior → deslocamento
→ assentamento → estado estático. Este é apenas o template inicial. Passos de
fluido podem ser adicionados, repetidos, removidos e reordenados livremente, com
vazão própria e pausas. Eventos de lançamento são explícitos no programa; o
motor valida a sequência física dos dispositivos e não os move silenciosamente.

Em liner, incluir lançamento do dardo, chegada ao topo e liberação do plugue.
Em múltiplos estágios, repetir programa por estágio após abertura válida da
porta correspondente, mantendo o estado de todos os fluidos e o relógio global.
A transição não reenche o poço com lama nem zera os volumes acumulados. Sem
modelo de cura, não inferir endurecimento do cimento durante a pausa entre estágios.

Condicionamento é entrada de lama com `volumeBbl` e `rateBpm`; sua duração é V/Q.
Se a interface oferecer duração como entrada, converter uma única vez para
`volumeBbl=rateBpm·durationMin` e não persistir dois valores independentes.
Pausas usam `pauseMin` e não injetam volume. `plug-landed` e `static` são estados
gerados pelo motor, não etapas editáveis de bombeio.

No circuito cheio, a posição de cada plugue durante o trajeto é a inversa da
capacidade interna para o volume que entrou desde seu lançamento. O inferior
chega ao colar quando esse volume é `V_int(0,floatCollarMD)`; abre idealmente nesse
instante, permitindo passagem da pasta sem rampa de ruptura calculada. O superior
chega ao mesmo limite e permanece fechado. No modo de queda livre, essa relação
volumétrica só é válida se o inventário e as condições dos plugues forem modelados;
aplicar a restrição de domínio de §7.5.

No circuito convencional cheio, para cada passo (em outro estágio usar a saída
ativa no lugar de `Q_sapata`):

```text
ΔV_bombeado = Q_bomba · Δt
Q_sapata = Q_retorno = Q_bomba
```

Usar fila de parcelas com `fluidId`; entrada nova desloca volumes preexistentes.
Preencher o revestimento de cima para baixo; o fluido que sai da sapata entra
no anular de baixo para cima; o que sai do anular vira retorno identificado por
fluido. Não simplesmente despejar toda a pasta no anular no instante em que é
bombeada na cabeça.

Equação obrigatória **por fluido f**, em todos os snapshots:

```text
V_inicial,f + V_bombeado,f = V_interno,f + V_anular,f + V_retornado,f
```

Nos múltiplos estágios, `V_interno` e `V_anular` somam também os trechos retidos
ou isolados; não descartá-los quando mudar o circuito ativo.
Com soma sobre os fluidos, obter o balanço total. Volume acumulado bombeado é uma
grandeza monotônica; volume ocupado no poço não cresce em circuito cheio e com
retorno aberto. Retorno de lama, retorno de pasta e perda à formação são grandezas
distintas; perda é zero nesta versão e não vira uma série "injetado".

Criar amostras exatas em t=0, fim/início de etapa, pausa, chegada de interfaces à
sapata e à superfície, lançamento dos plugues, chegada/abertura do inferior no
colar, assentamento do superior e fim. Usar integração adaptativa
ou interpolação conservativa que nunca ultrapasse esses eventos. Repartir slices
nas mudanças de fluido/geometria/survey, preservando MD e TVD.

## 7. Hidráulica

As equações abaixo descrevem o circuito convencional conectado. Para liner,
integrar cada trecho com ID/OD da montagem real. Para outro estágio, substituir
a sapata pela saída ativa nas integrais do circuito de circulação; calcular
referências adicionais e ramos estáticos conforme sua conectividade (§3.1).
Não comparar pressão de lados isolados por um dispositivo como se houvesse
continuidade hidráulica. Quando faltar condição de contorno, pressão/ECD são
`null` com diagnóstico, mesmo que o volume retido seja conhecido.

### 7.1 Hidrostática e pressão anular

Para cada slice de fluido até MD `z`, com densidade em ppg:

```text
H_int(z,t) = K · Σ ρ_int,j(t) · ΔTVD_j
H_an(z,t)  = K · Σ ρ_an,j(t)  · ΔTVD_j
P_an(z,t)  = P_retorno(t) + H_an(z,t) + F_an(0,z,t)   # retorno ascendente
BHP(t)    = P_an(shoeMD,t)
ECD(t)    = BHP(t) / (K · TVD_sapata)
```

`F_an` é perda positiva acumulada no retorno desde a superfície até a profundidade
consultada. ECD inclui a contrapressão quando informada; mostrar essa condição no
gráfico. Se TVD da referência é zero, ECD é `null`. No estado estático, atrito=0.

Não usar a densidade da pasta multiplicada pela profundidade inteira enquanto
lama/espaçador/pasta ocupam trechos diferentes. O anular precisa de sua própria
distribuição: não copiar a coluna hidrostática interna.

### 7.2 Pressão de bombeio e balanço na sapata

```text
P_bomba_requerida = P_retorno + H_an - H_int + F_int + F_an + F_local
P_int_sapata = P_bomba + H_int - F_int - F_local
P_int_sapata = P_an_sapata                    # circuito cheio e comunicante
ΔP_motriz = H_int - H_an - P_retorno
P_bomba_requerida = F_int + F_an + F_local - ΔP_motriz
```

Esse balanço vale durante circulação com caminho aberto, antes do assentamento.
O colar é antirretorno: só barra o fluxo do anular para o interno. Em pausa com
o anular mais pesado, ele fecha e sustenta o diferencial; com o interno mais
pesado, a coluna **drena** pela sapata mesmo sem bomba, e isso é queda livre
(§7.5), não repouso. Após o assentamento, o plugue superior isola os ramos. Em
repouso de fato, Q=0, BHP anular=`P_retorno+H_an`, e a pressão interna real é
uma condição informada ou indisponível, não inferida pela igualdade entre ramos.

Todas as colunas/atritos são avaliados até a sapata; `P_bomba` tem referência na
cabeça, imediatamente antes das restrições locais modeladas. Sem linhas de
superfície nesta versão. Não subtrair o atrito interno do BHP anular: ele já entra
no balanço que determina a pressão de bombeio.

Pressão requerida abaixo da pressão do vazio (§7.5) indica que a hipótese de
circuito cheio com a vazão imposta não se sustenta. Não truncar a pressão e
continuar divulgando o mesmo estado como solução física: o modelo de queda livre
assume. Só um transporte sem modelo de vazão (P5 isolado, usado em testes)
marca o intervalo como fora do modelo e encerra as curvas físicas.

### 7.3 Perdas de carga por slice

**[DECIDIDO 2026-09-23]** A primária usa o método de R3 (Nelson e Guillot,
*Well Cementing*, §4-6.1 e §4-6.2) para fluido de lei de potência, em
[`primary-friction.ts`](../../src/app/features/simulador/services/primary-friction.ts),
`correlationId = r3-guillot-4-6`, versão `primaria-2`. A tabela F-40 do Petroguia
deixou de ser a correlação da primária; o squeeze mantém a sua, e uma revisão
dele continua sendo entrega própria com testes de regressão.

```text
Tubo:    Re = ρ·v^(2−n)·d^n / (8^(n−1)·k_tubo),     k_tubo = k·((3n+1)/4n)^n
         f_laminar = 16/Re
Anular:  Re = ρ·v^(2−n)·(D−OD)^n / (12^(n−1)·k_an), k_an = k·((2n+1)/3n)^n
         f_laminar = 24/Re                                  # fenda
Turbulento (Dodge e Metzner):
         1/√f = (4/n^0,75)·log10(Re'·f^(1−n/2)) − 0,4/n^1,2
         Re' = Re no tubo;  Re' = (2/3)·Re no anular          # R3 Eq. 4-158
Fim do laminar:     Re1 = 3250 − 1150·n                       # R3 Eq. 4-148
Fim da transição:   Re2 = 4150 − 1150·n                       # R3 Eq. 4-151
Transição:          f interpolado em log-log entre f_lam(Re1) e f_turb(Re2)
ΔP = 4·τ_parede·L/D_h,  τ_parede = f·ρ·v²/2                    # R3 Eqs. 4-135, 4-17
```

Unidades internas SI (ρ kg/m³, k Pa·sⁿ, v m/s, d m); a entrada continua em ppg,
lbf·sⁿ/ft², bpm, in e m, e a saída em psi. `D_h = d` no tubo e `D_h = D−OD` no
anular (fenda), com `D` o diâmetro externo efetivo do trecho (§5.3). Com `n`
baixo, o turbulento pode ficar abaixo do laminar em `Re2`; R3 (p. 133–134) manda
usar a interseção das duas curvas como fim da transição, e o código faz isso.
Em Q=0 a perda é zero antes de calcular Reynolds. Reologia inválida devolve
`null`: não se limita `n` nem se troca por uma pasta padrão.

**Por que o Petroguia saiu.** Conferido na página impressa (R2, PDF 290, F-40):
a coluna laminar usa `f = 16/NRe` para `NRe < 400` e a transitória
`f = 0,11·n^0,616·NRe^−0,287` a partir de 400. As duas não se encontram em 400
para nenhum `n` — com n=1 o fator cai de 0,040 para 0,0197 — e a coluna
turbulenta não traz fórmula. Resultado: a perda **diminui** quando a vazão sobe.
No MINA-28BD, a lama no anular de 12¼" caía de 59,5 para 18,5 psi por 1000 m ao
passar de 6 para 8 bpm, e o solver de queda livre, que depende de perdas
crescentes, deixava de ser bem posto. R3 é uma das referências desta SPEC, traz
critério de regime dependente de `n` e seis exemplos numéricos resolvidos, que o
código reproduz (§11.5).

O standoff pode corrigir o atrito conforme correlação e geometria de referência;
não representa eficiência de remoção de lama ou garantia de isolamento zonal.
A correção de excentricidade do Petroguia (§12.1) continua disponível e restrita
às duas geometrias da tabela. Fatores de rugosidade qualitativos do squeeze não
são rugosidade medida; não adotá-los como coeficientes físicos sem identificá-los
como hipótese.

Na seção **Janela e equipamento**, a primária oferece uma sensibilidade operacional
de atrito independente para o interior do tubo/revestimento e para o retorno
anular/parede do poço: baixo `1,00×`, médio `1,15×` e alto `1,35×`. Trata-se de
uma hipótese declarada sobre a condição média das superfícies, não de rugosidade
medida. Para cada slice, primeiro calcular `ΔP_slice` com densidade e reologia
`n/k` do fluido presente e depois aplicar `ΔP_corrigida=m·ΔP_slice`. Assim, o
nível interno altera a pressão requerida da bomba; o nível anular também altera
BHP e ECD. Os dois níveis pertencem ao cenário, usam médio como padrão e qualquer
alteração recalcula imediatamente a hidráulica, os gráficos e o relatório. Um
fluido sem volume e que não seja o fluido inicial não participa do circuito e sua
reologia não pode alterar o resultado até entrar na sequência operacional.

Perdas locais opcionais em acessórios, quando houver coeficiente informado:
`ΔP_local[Pa] = Σ ζ · ρ[kg/m³] · v[m/s]² / 2`, convertendo Pa/6894.757293
para psi. Exigir área de passagem e fluido presente. Sem dados, usar zero e
informar a omissão; não inventar perda no colar/sapata. `F_local(0)=0`.
Aqui `F_local` contém somente acessórios no caminho interno/cabeça→sapata.
Uma restrição no retorno requer parcela anular própria, que também entra no
BHP e no perfil de pressão; esse recurso fica fora do contrato inicial.

### 7.4 Reologia

Lei de potência: `τ=k·γ̇^n`, com unidades explícitas. Para fluido newtoniano:
`n=1` e `k=μ_cp·2.0885e-5` em lbf·s/ft². Cada slice usa a reologia de seu
fluido; lama e espaçador não recebem automaticamente 1 cP.

Ajuste Fann de três leituras de R2, F-41, adotado para a primária:

```text
n = 0.81·ln(θ300) + 0.15·ln(θ200) - 0.96·ln(θ100)
k = 1.06·θ100^5.84·θ200^(-0.53)·θ300^(-4.32) / 100
```

Leituras positivas; preservar temperatura/condição do ensaio. Resultado inválido
ou fora do domínio bloqueia a correlação ou exige dados válidos; não trocar por
uma pasta padrão nem limitar `n` silenciosamente. As estimativas da biblioteca
de aditivos continuam identificadas como estimativas, separadas de dados medidos.

**[DECIDIDO 2026-09-23] Reologia de partida de um programa novo.** Em vez de
água a 1 cP, os fluidos de um programa novo nascem com a reologia de referência
de [`primary-default-rheology.ts`](../../src/app/features/simulador/models/primary-default-rheology.ts):
os fluidos do R3 §12-7 (Tabela 12-5), com a reologia de fundo Herschel-Bulkley do
livro ajustada à lei de potência entre 10 e 300 1/s — lama e deslocamento
n=0,348 e k=0,0360; espaçador n=0,248 e k=0,0775; lavador n=1 e k=1,04·10⁻⁴
(5 cP); pasta n=0,330 e k=0,0797 (tail de 15,9 ppg), em lbf·sⁿ/ft². Continuam
com origem `estimated` e a referência gravada; a tela avisa que são ponto de
partida, e a hidráulica emite `PRIMARY_RHEOLOGY_ESTIMATED` (resultado parcial)
enquanto n e k de um fluido do circuito não forem informados ou medidos.

### 7.5 Queda livre / tubo em U

**[IMPLEMENTADO 2026-09-23]** R3 §12-6 (p. 448) descreve a queda livre como
fenômeno normal da primária: a pasta entra mais pesada que a lama, "tende a cair
livre e puxa vácuo na parte superior do revestimento", o retorno pode superar
muito o bombeado e, depois, o revestimento reenche; o exemplo de projeto de §12-7
mostra vazões de entrada e saída diferentes "durante grande parte do job". O
domínio anterior desta SPEC — só com cabeça ventilada e sem plugue em trânsito —
deixava fora do modelo praticamente todo job real: no MINA-28BD, um terço do
tempo. O motor agora resolve:

```text
Circuito cheio:  P_req = P_retorno + H_an − H_int + F(Q_bomba)
                 se P_req ≥ P_vazio  → Q_saída = Q_bomba, P_bomba = P_req
Queda livre:     F_int(Q) + F_an(Q) = P_vazio + H_int,líquido − H_an − P_retorno
                 Q_saída = raiz ≥ 0 (colar antirretorno; sem raiz positiva, Q = 0)
                 dV_vazio/dt = Q_saída − Q_bomba,   0 ≤ V_vazio
                 P_bomba = P_vazio;  BHP = P_retorno + H_an + F_an(Q_saída)
P_vazio = −14,696 psi (cabeça fechada: vácuo pleno) | 0 psi (superfície livre ventilada)
```

`H_int,líquido` é medida do topo do líquido para baixo: o vazio não pesa. O vazio
fica sempre no topo do interno; o fluido bombeado cai por ele até o líquido. Com
vazio e bomba ligada, o nível sobe; ao chegar a zero, o circuito volta a ficar
cheio. A pausa com o interno mais pesado continua drenando. Plugues e dardos são
separadores ideais sem volume: descem com o líquido, e um corpo lançado sobre o
vazio cai até o topo do líquido. Por isso o plugue superior assenta quando
`bombeado desde o lançamento + vazio = V_deslocamento`, e o restante do programa
enche o vazio sobre o plugue assentado — o volume de deslocamento de §5.5 fecha
exatamente com o vazio zerado.

Integração no tempo com passo limitado por volume (≈ 1 bbl, ou 1/400 do
circuito), cortado em todo evento: fim de passo, plugue no assento, interface na
saída e no retorno, vazio zerando. Uma amostra por passo, mais o estado dinâmico
no instante em que o plugue superior chega (`pre-event`), antes de fechar a
passagem: é ali que ficam a pressão final de circulação e, em geral, o maior ECD.
Pausa com o interno mais leve também inicia amostra própria, para a pressão cair
no instante certo em vez de numa rampa pela pausa inteira.

Fora do modelo continuam: vazão de queda livre sem raiz até 2000 bpm, atrito
indisponível, vazio alcançando a saída ativa (entraria gás no anular) e geometria
sem parcela. Ao primeiro desses estados, o transporte **para** (`halted`): nenhum
ponto posterior é produzido, e o relatório sai parcial. A hipótese é quase
estática — sem inércia, gás comprimido, pressão de vapor nem dinâmica mecânica
dos plugues. `PRIMARY_FREE_FALL` registra, como informação, cada período de queda
livre com o retorno e o vazio máximos; retorno acima do bombeado nesse período
não é ganho nem perda de fluido.

### 7.6 Janela, envelope, potência e eventos finais

Para gradientes equivalentes constantes a partir do datum:

```text
P_poro(z) = K · G_poro[ppg] · TVD(z)
P_fratura(z) = K · G_fratura[ppg] · TVD(z)
P_an,min(z) = min_t P_an(z,t)
P_an,max(z) = max_t P_an(z,t)
Margem_fratura(z,t) = P_fratura(z) - P_an(z,t)
Margem_poro(z,t) = P_an(z,t) - P_poro(z)
HHP_requerido(t) = P_bomba(t)[psi] · Q_bomba(t)[bpm] / 40.8
HHP_disponivel = HP_motor · η
Uso_potencia_pct = 100 · max_t(HHP_requerido) / HHP_disponivel
```

Janela por trecho significa gradiente equivalente na profundidade, não um
gradiente incremental a integrar novamente. Aceitar perfil pressão×TVD em expansão
futura com um contrato distinto. Só avaliar poro/fratura onde há formação exposta;
atrás de um revestimento anterior as séries de janela são `null`. Atravessar a
janela gera aviso; não inventa automaticamente perda, influxo ou fratura.

**Decisão da entrevista:** continuar a simulação ao exceder poro/fratura ou
limites de pressão, vazão e potência do equipamento. Manter o programa solicitado,
sem limitar automaticamente Q ou pressão para caber no equipamento. Registrar
limite, valor, início/fim, pico, estágio, passo e MD/TVD quando aplicável. É uma
demanda calculada fora do limite, não garantia de que a bomba consiga executá-la.
Geometria inválida e estados `outside-model` seguem bloqueio/interrupção próprios.

Avaliar todo o trecho aberto, não apenas a sapata. Reportar a menor margem com
MD, TVD, tempo e etapa. Envelope é uma síntese de instantes diferentes, não um
perfil simultâneo; fornecer também o perfil do snapshot selecionado. Dados ausentes
ou intervalos fora do modelo impedem classificar toda a operação como dentro da janela.

Assentamento é evento de volume/posição: ao chegar ao colar, o plugue superior
fecha a passagem, Q=0 e o deslocamento termina. Pressão de batida/teste, se
informada, é uma condição de superfície separada. Sem compressibilidade e
rigidez do sistema, não calcular pico nem rampa de pressão de batida. Não aplicar
esse valor ao anular nem criar uma fase de injeção na formação.

## 8. Gráficos e comportamento de tela

⚠️ **[DECIDIDO 2026-09-18] A tela está sendo redesenhada.** O usuário pediu o mesmo
desenho do squeeze: menu horizontal, entradas numa sidebar vertical, dados no
conteúdo e cenários/relatório num menu flutuante. Todos os gráficos saem da
primária e voltam um a um sob demanda. O alvo, a sequência T1–T7 e a aceitação
estão em [redesenho da tela](cimentacao-primaria-tela.md). Esta seção continua
valendo como definição do **conteúdo** de cada gráfico quando ele for reconstruído.



A página segue as abas, tokens visuais e controles Taiga do simulador: **Poço e
operação**, **Pastas e fluidos**, **Volumes e sequência**, **Gráficos** e
**Esquemático**. Recalcular por sinais/formulários reativos, com debounce semelhante
ao squeeze; limpar resultados em caso de erro. Exibir unidade junto de cada campo.

| Gráfico existente no squeeze | Conteúdo da primária / critério de aceite |
|---|---|
| Envelope de pressão × profundidade | Poro, fratura e pressão anular máxima/mínima; referência sapata, janela só em poço aberto, indicação MD/TVD |
| Pressão e deslocamento × tempo | Volume bombeado e retornado em eixo bbl; pressão de bombeio, BHP anular, hidrostática anular, atrito interno e anular, poro/fratura na sapata em psi |
| BHP e ECD × tempo | BHP na sapata em psi e ECD em ppg, eixos distintos; informar contrapressão |
| Free fall / tubo em U | Q bomba, Q sapata, Q retorno em bpm; pressão motriz e perdas em psi; vazio instantâneo e estado disponíveis no detalhe |
| Hidrostática × fratura | Hidrostática anular e BHP durante cada etapa, contra poro/fratura na sapata |
| Cronograma operacional | Mesmas etapas e durações do motor, incluindo pausas e marco de assentamento; TT com origem identificada |
| Espessamento | Consistência Bc, temperatura, pressão e tempo; selecionar qualquer pasta; origem medida/estimada identificada |
| UCA | Resistência estimada × tempo, por pasta; sem declarar ensaio de laboratório ou tempo de liberação certificado |

Sapata é a referência inicial desses gráficos. Em outros estágios, o usuário
pode selecionar saída ativa ou referência adicional, com nome e MD/TVD visíveis.
A curva de vazão usa a saída ativa. Não alterar a referência física mantendo
legenda de sapata; referências isoladas seguem a regra de indisponibilidade.
Espessamento/UCA podem sobrepor ensaios medidos quando fornecidos, identificando
condições e sem converter uma estimativa em ensaio.

Reusar ampliar/salvar imagem; prefixo de exportação `primaria-*`. Não exibir
"canhoneados", "injetado na formação", "retirada de tubing" ou "base do tampão"
na página primária. As grandezas físicas, e não apenas os títulos, devem mudar.

Eixo de tempo deve ser numérico, em minutos reais; amostras desigualmente espaçadas
não podem ter espaçamento visual uniforme. Pausas mantêm duração. Usar `null` e
interrupção da curva para resultado indisponível, sem unir o intervalo com uma
reta. Tooltip mostra instante, etapa e unidades. Ao primeiro `outside-model`,
encerrar transporte e séries físicas no último snapshot válido; registrar evento,
causa e instante limite. O cronograma planejado pode continuar visível, claramente
separado do resultado calculado. Não produzir pontos futuros repetindo pressões
antigas nem reconstruir um estado final supostamente atingido. No ponto limite,
hidrostáticas/perdas documentam o último estado válido e Q real/BHP/ECD ficam
`null` quando não resolvidos. A queda livre é resultado calculado (§7.5): Q na
saída, vazio e pressão da cabeça no vácuo aparecem nas séries; não se desenha
Q real=Q bomba onde a coluna está caindo.

**[EXISTENTE]** `TestsCalculoService` usa heurísticas para espessamento/UCA e
hipóteses próprias de temperatura/pressão. Reaproveitar os componentes gráficos
não valida essas curvas pelos livros. Adaptar o contexto de pressão/temperatura
por pasta; não transportar silenciosamente sua lama fixa de 9 ppg. TT informado
por laboratório tem fonte e condição de ensaio; estimativas permanecem separadas.
O índice operacional heurístico do squeeze não é critério de qualidade da
cimentação. Preferir margens de pressão, balanço de volumes, TOC alcançado e uso
de potência, com significado explícito.

### 8.1 Esquemático e 3D

Mostrar no mínimo estado inicial, instante selecionado e estado final. Desenhar
parede do revestimento-alvo, parede externa, lama, lavador/espaçador, lead, tail,
fluido de deslocamento, plugue, colar, sapata e TOC. Incluir coluna de assentamento,
topo do liner, dispositivos/portas e caminho ativo. Setas: descida interna,
subida externa. Colorir cimento **fora do OD do revestimento-alvo**; no estado
final ideal convencional, só o shoe track recebe cimento internamente. Nos
demais casos, mostrar os volumes retidos e desvios efetivamente calculados.

Acrescentar zona explícita `casing-annulus` com limites radiais vindos de
`PrimaryFlowSegment`, mantendo a semântica de `annulus` do squeeze. O 3D deve
permitir transparência/corte para ver a bainha atrás do aço. Não usar a geometria
visual genérica para sugerir cimento dentro do revestimento. Se o 3D ainda não
estiver pronto, mostrar apenas o 2D correto e registrar a entrega pendente.

### 8.2 Reprodução e gráficos adicionais

Implementar reproduzir/pausar, velocidade, voltar ao início, avançar entre eventos
e cursor de tempo numérico. Um `selectedTimeMin` sincroniza gráficos, perfis 2D/3D,
interfaces, plugues e estágio ativo. Reproduzir navega em resultados já calculados;
não executa o motor a cada quadro. Buscar instante usa estado conservativo entre
eventos e nunca interpola através de uma abertura/fechamento. Alterar entradas
invalida resultados, pausa reprodução e sinaliza necessidade de recálculo.

Os cinco anexos são requisitos funcionais adicionais, detalhados em
[Gráficos e dados medidos](cimentacao-primaria-graficos.md). Esse documento define
eixos, séries, Reynolds, snapshots e importação/comparação. As imagens orientam
as grandezas, sem copiar valores, marca ou curvas da operação ilustrada.

### 8.3 Relatório completo

Reaproveitar o fluxo de relatório do squeeze adaptando o contexto da operação:
cliente, poço, identificação do cenário/revisão, data, geometria e trajetória,
revestimento-alvo/liner, dispositivos, pastas/receitas e propriedades com origem,
intervalos desejados, volumes calculados/preparados, programa por estágio, resultados
de TOC/retornos/balanços e todos os alertas/limitações.

Incluir os oito tipos de gráfico da tabela de §8 e os cinco novos, esquemático
inicial/final e snapshots no fim de cada estágio por padrão; usuário pode escolher
instantes adicionais. Curvas sem dados mostram motivo da indisponibilidade.
Registrar eixos/unidades, referências de profundidade, contrapressão, correlação
de atrito, dados medidos comparados e seu alinhamento. Relatório usa entradas e
resultados da mesma revisão; resultado interrompido é parcial, sem conclusão
fictícia. Exportação/print deve preservar legendas, eixos e identificação
calculado/medido, inclusive em preto e branco.

## 9. Cenários no banco, exportação e dados importados

**Decisão 15B:** o banco é a persistência dos cenários. Cálculos continuam no
front; armazenamento local pode recuperar um rascunho, mas não substitui salvar
no banco. Esta decisão substitui o escopo inicial de cenários apenas locais.

**[EXISTENTE]** `SimuladorStateApiService` já utiliza `/api/simulador/pastas` e
`/api/simulador/cenarios`, com CRUD e campos `operacao`, `formValue` (JSON como
string), `dadosRelatorio`, `pastaId`, `pocoId` e `pocoVersion`. No backend,
`CenarioRequest.operacao` é string; a entidade usa VARCHAR(16), e `form_value`
é LONGTEXT. Não há enum que exija migração apenas para aceitar `primaria`.
Os seletores/labels do front ainda precisam admitir a nova operação explicitamente.

**[PROPOSTO]** Reusar esse contrato com `operacao: 'primaria'`. Não criar endpoint
ou tabela por antecipação. Verificar no trabalho de integração autorização,
filtro de operação/pasta, limites do payload e round-trip do JSON. A listagem por
pasta existente precisa respeitar a operação; não presumir que já faz esse filtro.
Operação do cenário é imutável; importar squeeze não converte para primária.

Conteúdo versionado do `formValue`:

| Campo | Conteúdo |
|---|---|
| `schemaVersion`, `engineVersion`, `operation` | Versões de formato/cálculo e `primaria` |
| Geometria compartilhada | Campos já usados pelo poço: `wellFinalMD`, `wellFinalTVD`, `fases`, `trajectory`, respeitando vínculo descrito abaixo |
| `primary` | Montagens, alvo, dispositivos, estágios, intervalos, fluidos/receitas/overrides, programa, janela e limites |
| `measurements` | Datasets normalizados, metadados e configuração de alinhamento do documento de gráficos |
| `presentation` | Unidades, referências de ECD, eixo de volume, séries visíveis e snapshots selecionados |
| `status` | Rascunho ou configuração validada; não equivale a aprovação operacional |

Usar `dadosRelatorio` para metadados/configuração do relatório, sem imagens de
gráficos nem séries calculadas completas. Persistir entradas e dados medidos;
recalcular resultados ao carregar. Informar mudança de versão do motor, nunca
apresentar recálculo como reprodução exata de versão anterior.

Para cenário vinculado, `scenarioPayload` remove os quatro campos geométricos e
envia `pocoId/pocoVersion`; `scenarioForm` recompõe pela geometria atual do poço.
Não esconder uma cópia conflitante em `primary`. Montagens específicas da operação
referenciam IDs da geometria; mudança do poço exige revalidação, inclusive de
referências removidas. O backend já trata conflito de versão do poço; apresentar
o conflito sem sobrescrever automaticamente. Não alegar proteção de concorrência
do cenário: a entidade atual não tem versão otimista própria.

Salvar rascunho estruturalmente válido mesmo com configuração incompleta, exibindo
pendências; simular exige validação física. Mostrar salvo somente após resposta
de sucesso da API. Falha/rede indisponível mantém estado não salvo e permite
exportar; rascunho local deve ser identificado como tal. Reabrir em outra sessão
deve recuperar programa, propriedades e dados medidos pelo banco.

Exportar JSON portátil com versão, entradas, geometria completa como snapshot,
dados medidos e configurações de relatório. A importação valida tipo, esquema,
unidades e referências, mostra resumo e cria um novo cenário editável; IDs do
banco são apenas proveniência, sem sobrescrever cenário/poço existente. Vincular
a um poço existente exige compatibilidade/revalidação da geometria. Versão futura
não suportada é rejeitada com mensagem; migrações de versões antigas são explícitas.
Importar arquivo não salva automaticamente no banco. Dados inválidos não substituem
o cenário aberto. Exportar/importar não perde metadados ou alinhamento das medições.

Arquivos dos livros são fontes de consulta; não incorporar livros, extrações
integrais ou bibliotecas de extração ao bundle. A implementação atual monta e
valida payloads, sem HTTP nem gravação automática. Integração pertence a P10.

## 10. Sequência de implementação e definição de pronto

Cada entrega termina com seus critérios atendidos e atualização desta SPEC.
As caixas refletem os critérios efetivamente concluídos. **P1–P12 estão fechadas**,
com uma ressalva registrada em P12: a revisão visual por uma pessoa não foi feita. O transporte conservativo de queda livre continua sendo a
entrega própria anunciada em §7.5, fora desta lista.

| Ordem | Entrega | Dependências | Critério de pronto |
|---|---|---|---|
| [x] P1 | Contratos versionados | Entrevista consolidada | Tipos, exemplos convencional/liner/dois estágios, validação e round-trip, payload vinculado ao poço e adaptador comum testados; consumidores existentes preservados |
| [x] P2 | Geometria convencional | P1 | Anular externo por trecho, ID anterior, excesso/caliper, MD→TVD, track/deslocamento e validações implementados no serviço de geometria |
| [x] P3 | Liner e circuitos por estágio | P2 | Coluna, overlap, dardo/plugue, portas/assentos e ramos retidos; saídas e conectividade explícitas para quantidade configurável de estágios |
| [x] P4 | TOC, várias pastas e receitas | P3 | Volumes derivados de intervalos, track contado uma vez, deslocamento pela rota, reservas e overrides rastreáveis |
| [x] P5 | Programa livre e transporte | P4 | Adicionar/repetir/remover/reordenar, dividir volumes, vazões/pausas, eventos exatos, conservação entre estágios e diagnóstico da colocação real |
| [x] P6 | Hidráulica e domínio de queda livre | P5 | Balanços, atrito/Reynolds, referências de ECD, janela, envelope, alertas sem limitar programa; transporte conservativo ou interrupção fora do domínio |
| [x] P7 | Página e reprodução | P6 | Card/rota, formulários, oito gráficos reaproveitados, TT/UCA com origem, 2D/3D e play/pause/cursor sincronizados |
| [x] P8 | Dados medidos importados | P1 + P7 | CSV com mapeamento/unidades/prévia, alinhamento, lacunas, proveniência e comparação sem alterar o cálculo |
| [x] P9 | Cinco gráficos anexados | P6–P8 | G1–G5 do documento complementar, dois modos de volume, perfis por instante, referências configuráveis e exportação |
| [x] P10 | Banco e cenários portáteis | P1 + P3; integrar P7–P9 | CRUD `primaria` pela API, vínculo/versionamento do poço, round-trip de dados medidos/configurações, export/import e falhas sem falso salvamento |
| [x] P11 | Relatório completo | P7–P10 | Conteúdo de §8.3, todos os gráficos, snapshots, dados medidos, alertas e limites; revisão coerente com as entradas |
| [x] P12 | Integração e regressão | P1–P11 | Casos físicos, cenários salvos/reabertos, revisão visual, testes Angular e build; squeeze/tampão preservados |

Só P12 encerra a primeira versão completa. P10 pode iniciar o contrato de API
após P1/P3; seu aceite final inclui os dados produzidos por P8/P9. Entregas
intermediárias não tornam liner/múltiplos estágios opcionais nem autorizam
apresentar queda livre fora do domínio como calculada.

**A primeira versão completa está implementada.** O que continua em aberto não é
etapa da lista, e sim: a **revisão visual humana** de §11.3, a conferência da
integração HTTP contra o backend, as imagens dos gráficos embutidas no relatório,
os aditivos da pasta na tela da primária e os perfis medidos por profundidade. O
transporte conservativo de queda livre foi entregue em 2026-09-23 (§13.11). Cada
um está descrito na sua entrega em §13.

## 11. Casos de aceitação e verificação

### 11.1 Caso base reproduzível

Usar `C=0.0031871` e `K=0.17060368`. Poço vertical, sapata a 1500 m,
colar a 1480 m, TOC a 500 m, caliper 8.5 in, alvo OD=7 in e ID=6.276 in,
uma pasta, sem excesso, sem perda, sem volume de linhas, retorno atmosférico:

| Resultado | Valor esperado |
|---|---:|
| Capacidade interna | 0.1255340557296 bbl/m |
| Capacidade anular externa | 0.074100075 bbl/m |
| Volume anular de cimento (1000 m) | 74.100075 bbl |
| Shoe track (20 m) | 2.510681114592 bbl |
| Pasta a bombear | 76.610756114592 bbl |
| Deslocamento após lançamento do plugue | 185.790402479808 bbl |
| Capacidade interna até a sapata | 188.301083594400 bbl |

Sem lavador/espaçador, depois de bombear a pasta e o deslocamento: TOC=500 m,
track cheio de pasta, interior acima do colar com deslocamento, cimento
retornado=0. Volume retornado total=262.401158594400 bbl (lama), incluindo lama
inicialmente dentro do revestimento. Isso não é capacidade do poço nem volume
de cimento. Aos 5 bpm, tempo de pasta+deslocamento=52.480231718880 min.

### 11.2 Casos independentes de transporte e pressão

**Transporte:** capacidade interna 100 bbl, capacidade anular 80 bbl, ambas com
lama inicialmente. Bombear 10 bbl de espaçador, 50 bbl de pasta e 60 bbl de
deslocamento, antes de qualquer bloqueio de plugue. Esperado: 120 bbl de lama
retornados; interior com 60 bbl de deslocamento e 40 bbl de pasta; anular com
10 bbl de pasta, 10 bbl de espaçador e 60 bbl de lama. Inventário final=180 bbl.
Usar como teste de transporte isolado, não como geometria de plugue já assentado.

**Balanço de pressão:** poço vertical de 1500 m, interior com 10 ppg; anular com
10 ppg nos primeiros 500 m, 12 ppg nos 700 m seguintes e 16 ppg nos últimos
300 m. Retorno a 100 psi; perdas internas/anulares/locais prescritas de
100/200/50 psi, respectivamente, para isolar o teste de balanço do teste de atrito:

```text
H_int = 2559.0552 psi
H_an = 3104.986976 psi
P_bomba = 995.931776 psi
BHP_anular = 3404.986976 psi
ECD_incluindo_contrapressao = 13.30564098812718 ppg
```

Trocar apenas os últimos 30 m internos para 16 ppg aumenta H_int para
2589.7638624 psi e reduz P_bomba para 965.2231136 psi, mantendo o mesmo BHP
anular neste teste de perdas prescritas. Isso detecta uso indevido da densidade
interna como pressão anular.

**Queda livre, teste do balanço isolado:** durante 1 min, Q_bomba=2 bpm e
Q_sapata=Q_retorno=4 bpm, com inventário suficiente. Entram 2 bbl, saem 4 bbl,
inventário interno diminui 2 bbl e vazio aumenta 2 bbl; residual global zero.
O teste prescreve as vazões para conferir conservação; o teste do solver deve
encontrá-las a partir de um caso que satisfaça a equação de pressão e seu domínio.

### 11.3 Matriz de casos obrigatórios

| Caso | Resultado/invariante esperado |
|---|---|
| Revestimento anterior | Trocar parede externa por ID anterior só no intervalo declarado; nunca usar OD anterior nem ID alvo como parede |
| Excesso 20% em poço aberto | Capacidade externa ×1.2; track e deslocamento inalterados; caliper medido não recebe novo excesso |
| Reserva bombeada | Volume adicional sobe o TOC ou retorna; não desaparece |
| Poço desviado | Mesma MD e diâmetros conservam volumes; TVD menor reduz hidrostática; atrito mantém comprimento MD |
| Template lead/tail | Lead acima de tail; tail no track; soma por fluido fecha em cada snapshot |
| Menos/mais deslocamento | Plugue acima do colar ou parada no colar com diagnóstico; não simular passagem pelo plugue fechado |
| TOC na superfície | TOC=0; excedente como cimento retornado identificado |
| Vazão zero | Volume não aumenta; circuito estático cheio tem F=0; pausa em queda livre segue regra de inventário |
| Mesmo fluido nos dois ramos | H_int=H_an; P_bomba=P_retorno+F_int+F_an+F_local |
| Sem atrito, 10 ppg e TVD=1500 m | H=2559.0552 psi; retorno zero ⇒ ECD=10 ppg |
| Balanço com retorno | P_bomba+H_int−F_int−F_local = P_retorno+H_an+F_an na sapata |
| Queda livre | Q_sapata>Q_bomba reduz inventário interno; retorno pode superar bombeado; balanço total continua fechado |
| Reenchimento | V_vazio cai até zero sem ficar negativo; retoma regime cheio |
| Poro/fratura ausentes | Sem linhas nem aprovação da janela; valores null |
| Assentamento | Nenhum fluxo posterior pelo plugue; pressão de batida não vira BHP anular |
| Troca m/ft | Apenas apresentação muda; volumes, psi, ppg e posição física invariantes |
| Gráficos | Tempo numérico, fases nas datas corretas, lacunas preservadas, unidades corretas |
| Desenho | Bainha fora do OD; track dentro; mesma interface MD/TVD do motor |
| Regressão | Contratos de squeeze/tampão e cenários existentes preservados |
| Liner | Capacidade interna por coluna + liner; anular superior pelo OD da coluna; dardo e plugue sem volume contado duas vezes |
| Três ou mais estágios | Sem limite artificial de dois; portas corretas; inventário/tempo/acumulados preservados; track não somado novamente |
| Ordem livre e repetição | Alterar ordem muda colocação; frações somam 1; pasta fragmentada não aparece como bainha contínua |
| Propriedades medidas | Override preservado ao recalcular receita; restauração de estimativa explícita; origem no relatório |
| Limites excedidos | Séries continuam e mantêm valores demandados; alerta com instante/local; nenhum volume de perda inventado |
| Playback | Mesmo instante em todos os gráficos/desenhos, sem interpolar evento de ferramenta; alteração de entrada invalida resultado |
| Eixos de volume | Soma só de cimento versus soma de todos os fluidos; patamares/repetições de X preservados, sem descartar pontos |
| Medições | Conversão de unidades e alinhamento conhecidos; lacunas não unidas; comparação não altera resultado nem implica perda |
| Banco e portabilidade | Salvar/reabrir preserva estágios, ordem, dados medidos e metadados; falha não marca salvo; importação não sobrescreve poço |
| Relatório | Oito tipos herdados + cinco novos; dados indisponíveis identificados; snapshots, eixos e versão correspondem à simulação |

Tolerâncias propostas de software: balanço volumétrico por snapshot
`max(1e-8 bbl, 1e-8·volume_movimentado)`; fechamento de pressão
`max(0.01 psi, 1e-6·pressao_referencia)`; interfaces estáticas `1e-6 m`.
São critérios numéricos, não precisão de engenharia. Refinar Δt e malha pela
metade deve alterar picos em no máximo 1% e TOC em no máximo 0.1 m nos casos de
referência, preservando eventos. Estes limiares de convergência não validam a
correlação de campo; casos analíticos devem atender tolerâncias mais estritas.

Comandos após implementar, a partir de `Geopetro-Front`:

```powershell
npm.cmd test -- --watch=false
npm.cmd run build
```

Usar o builder Angular (`ng test`), conforme [README dos SPECs](../README.md).
Não executar Vitest diretamente. Testes devem conferir invariantes físicos e
valores calculados independentemente do método testado. Verificação visual deve
incluir tela estreita, zoom/exportação, troca de unidades, duas pastas, revestimento
anterior e caso com cimento retornado.

### 11.4 Referência numérica de liner

Caso geométrico sintético, sem volumes adicionais de acessórios: topo do liner
a 1000 m, colar a 1970 m e sapata a 2000 m; coluna de assentamento ID=4 in,
OD=5 in; liner ID=6 in, OD=7 in. Revestimento anterior ID=9 in até 1200 m;
abaixo dele, furo nominal 8.5 in sem excesso. Todos os comprimentos são MD.

```text
V_deslocamento = C · (4²·1000 + 6²·970) = 162.287132 bbl
V_track = C · 6²·30 = 3.442068 bbl
V_anular_acima_topo_liner = C · (9² - 5²)·1000 = 178.477600 bbl
```

O overlap 1000–1200 m usa ID anterior de 9 in contra OD liner de 7 in; acima de
1000 m usa OD da coluna de 5 in. Esses resultados testam segmentação e conversão,
não dimensionamento de ferramenta de campo. O motor deve chegar ao mesmo volume
de deslocamento contando lançamento do dardo e liberação do plugue uma única vez.

### 11.5 Caso de campo MINA-28BD e referência independente

Trajetória real, programa e fluidos de referência. O survey é o giroscópico
Gyrodata RUN #8 do MINA-28BD (fase 12¼", 159 estações até 824 m MD, mínima
curvatura, mesa rotativa como datum, air gap 5 m), transcrito em
[`primary-field-mina28bd.fixture.ts`](../../src/app/features/simulador/pages/primary-field-mina28bd.fixture.ts)
com a TVD do relatório como gabarito. O resto são **hipóteses declaradas**, não
dados do job: 13⅜" 68 lb/ft (ID 12,415") até 200 m; 9⅝" 47 lb/ft (ID 8,681") com
sapata a 820 m e colar a 796 m; poço nominal 12¼" com 20% de excesso, sem caliper;
lead 11,5 ppg de 0 a 670 m e tail 15,9 ppg de 670 a 820 m; fluidos e programa do
R3 §12-7 (lavador 10 bbl a 3 bpm, espaçador 40 bbl a 6 bpm, plugue inferior e
pausa de 5 min, lead a 4 bpm, tail a 5 bpm, plugue superior e pausa de 5 min,
deslocamento 65,1/15,1/10,8/9,0% a 6/4/3/2 bpm); cabeça fechada; atrito no nível
baixo (1,00×); poro 8,5 e fratura 13,0 ppg no poço aberto.

A referência é um programa à parte, em Python, sem código do simulador: mínima
curvatura própria, capacidades com π/4 exato, atrito de R3 conferido nos seis
exemplos do livro e transporte lagrangiano por coordenada de volume, com Δt de
0,025 min. Resultado:

| Grandeza | Referência | Motor |
|---|---:|---:|
| TVD nas 159 estações × Gyrodata | 0,005 m | 0,006 m |
| Lead / tail / deslocamento (bbl) | 142,413 / 38,706 / 191,182 | idem (C arredondado) |
| Queda livre | 10,00–78,27 min | 10,00–78,24 min |
| Retorno máximo | 6,337 bpm aos 56,7 min | 6,337 bpm aos 56,7 min |
| Vazio máximo | 30,96 bbl | 31,24 bbl (+0,9%) |
| Plugue inferior abre / superior assenta | 55,82 / 106,79 min | 55,82 / 106,79 min |
| Pressão final de circulação (2 bpm) | 410,97 psi | 410,97 psi |
| BHP / ECD máximos na sapata | 1766,07 psi / 12,932 ppg | idem |
| Colocação | lead 0–670, tail 670–820 m | idem |

A diferença no vazio é do passo de integração: dividir o passo do motor pela
metade leva o pico a 31,31 → 31,24 → 31,16 → 31,07 → 31,01 bbl, em direção à
referência, e muda menos de 0,3% a cada divisão (critério de §11.3: ≤ 1%). Os
demais picos variam menos de 1·10⁻⁴. O caso é teste de regressão em
[`primary-field-mina28bd.spec.ts`](../../src/app/features/simulador/pages/primary-field-mina28bd.spec.ts).
Não é comparação com o job executado: o survey não traz pressões, vazões nem
volumes medidos. Com o relatório pós-job (carta de pressão e retorno), a
comparação passa a ser pela aba **Dados medidos** (P8).

### 11.6 Caso de campo MINA-02 contra o iCem (Halliburton)

Programa técnico de cimentação da Halliburton para o 9⅝" 36 lb/ft na fase de
12¼" do MINA-02 (Braskem, sonda OIL-122, CP-BRK-HAL-CMT-2020-001, versão 3 de
15/11/2020), com os gráficos do iCem® 2D. Transcrito em
[`primary-field-mina02.fixture.ts`](../../src/app/features/simulador/pages/primary-field-mina02.fixture.ts).

**O documento tem duas versões do job.** As tabelas (§1.4, §1.5 e §2.2 do
programa) são da versão 3: sapata a 494,5 m MD / 494,11 m TVD, 13⅜" até 35 m,
rathole até 501 m, 40 bbl de espaçador bombeados e deslocamento de 100/12/6,37
bbl a 8/4/2 bpm. Os gráficos (§1.6) ficaram da versão anterior: o título diz
"at 489m MD"; no eixo de volume o lead começa aos 50 bbl, não aos 40; a tabela
de estágios põe o lead aos 15,0 min (50 bbl a 5 bpm + 5 min de parada); a linha
"Previous Casing Shoe" do envelope está a ~20 m; e as proporções de deslocamento
lidas no gráfico de vazões não são as do v3. A própria revisão 3 diz ter mudado
"a posição da sapata de 489 metros para 494,5 metros e as vazões de deslocamento".
Por isso o fixture tem duas variantes com os mesmos fluidos e o mesmo survey:
`MINA02_PROGRAM`, o job do programa, e `MINA02_ICEM_CHARTS`, os dados que geram
os gráficos, para comparar curva a curva.

Não dá para levar uma na outra deslocando o eixo em 10 bbl. A frente do
espaçador chega à sapata com o mesmo volume total bombeado nas duas (~97,6 bbl),
porque isso depende do volume do revestimento e do vazio da queda livre, não do
tamanho do espaçador; a do lead chega 10 bbl antes no v3. Deslocando o eixo, a
ESD do v3 fica até 0,17 ppg abaixo da do iCem durante o lead e as duas voltam a
coincidir no deslocamento (12,585 × 12,602 ppg a 315/325 bbl). É outro job, não
erro do motor.

**Entradas e origem de cada uma.** Nenhuma fórmula do motor foi ajustada ao
iCem; o atrito de R3 e a queda livre vieram antes, conferidos contra o livro e a
referência independente de §11.5. As entradas têm três origens:

| Origem | Entradas |
|---|---|
| Dados do programa | Densidades, vazões e volumes; revestimentos, sapata, colar e shoe track; survey (as 25 estações da tabela de centralizadores, 58,4 a 489 m); leituras Fann R1B1 a 80 °F do laboratório; anular de 149,98 bbl com 5% de excesso no poço aberto (157,1 bbl); 32 bbl de tail cobrindo o intervalo mais os 7,17 bbl do shoe track, o que fixa o diâmetro do fundo (13,06" no v3; 13,03" na versão de 489 m) |
| Lidas dos gráficos do iCem, porque as tabelas não trazem a versão que os gerou | Sapata a 489 m, 50 bbl de espaçador, sapata anterior a 20,6 m, proporções do deslocamento, forma da janela de poro e fratura, cabeça aberta (0 psi) na queda livre. São o que o iCem usou, não parâmetros de ajuste |
| **Calibradas contra resultados do iCem** | **(1)** A divisão do poço aberto acima do tail em duas zonas (15,5" até 160 m e o diâmetro do meio que fecha o volume), escolhida pela menor diferença da curva de hidrostática; o caliper LAS não está no documento. **(2)** A faixa de rpm do ajuste de lei de potência de cada fluido (3–100 rpm na lama e no espaçador, 30–300 no lead, 6–100 no tail), escolhida para reproduzir a hierarquia reológica do iCem a 488,99 m: fica a 1% na lama e no espaçador e a 8–10% nas pastas. A causa de fundo é de modelo: o iCem usa Herschel-Bulkley e o motor, lei de potência; o tail é quase Bingham (n = 1 no ajuste HB do laboratório) |

**Programa v3 contra os números do próprio programa:**

| Grandeza | Programa | Motor |
|---|---:|---:|
| TVD da sapata | 494,11 m | 494,14 m |
| Deslocamento | 118,37 bbl (inclui 0,11 bbl de linhas de superfície) | 118,26 bbl até o colar |
| Total bombeado / duração | 332,37 bbl / 82,85 min | 332,26 bbl / 82,83 min |
| Tail | 32 bbl, topo a 394,5 m | 32,00 bbl, de 394,5 a 494,5 m |
| Lead | 142 bbl, topo na superfície, retorno de pasta esperado | 132,28 bbl no anular, 9,72 bbl retornados |
| Pressão final de bombeio (2 bpm) | 348 psi | 341,7 psi (−1,8%) |
| Diferencial estático no fim do deslocamento | 314 psi | 316,1 psi (+0,7%) |
| ECD máximo na sapata / fratura | — / 16,0 ppg | 13,39 ppg, sem ruptura |

**Versão dos gráficos contra as curvas do iCem** (digitalizadas das imagens do
programa; RMS sobre 19 volumes de 5 a 340 bbl). A coluna calibrada foi medida
contra as mesmas curvas usadas para calibrar e não é validação independente; a
sem calibração troca as duas zonas por um poço uniforme de 14,21" acima do tail,
com o mesmo volume, e ajusta a lei de potência às sete leituras Fann:

| Curva | Calibrado | Sem calibração |
|---|---:|---:|
| Hidrostática a 489 m (749 → 1090 psi) | 2,9 psi | 7,1 psi |
| ECD a 489 m, bombeando | 0,047 ppg | 0,105 ppg |
| Pressão na cabeça | 2,1 psi | 3,9 psi |
| Pressão no assentamento (iCem 333,7 psi) | 338,6 psi | 343,1 psi |
| Vazão de saída, fora do fim da queda livre | 0,07 bpm | 0,14 bpm |
| Envelope, ECD máximo de 100 a 488 m TVD | 0,036 ppg | 0,124 ppg |
| Hidrostática final | 1095,4 psi | 1095,4 psi |

Sem calibração, o motor fica a ~1% da hidrostática do iCem e a 0,1 ppg no ECD;
esse é o número a citar como concordância entre os dois simuladores. O que só
depende de densidade, topo e TVD, como a hidrostática final e o diferencial
estático do v3, não muda com a calibração. No fim da queda livre, o motor volta
aos 8 bpm ~10 bbl antes do iCem nas duas colunas. Para dispensar a calibração:
o caliper LAS do poço e o modelo Herschel-Bulkley no motor, cujos parâmetros
estão nos relatórios de laboratório do programa.

Diferenças que ficam: logo abaixo da sapata anterior (25 m TVD) o ECD máximo do
motor é 12,96 ppg e o do iCem 12,64, porque o caliper real tem arrombamentos
irregulares que três zonas não reproduzem. O eixo de tempo do iCem soma ~4,6 min
no lead que o programa de bombeio não explica (15 + 142/4 = 50,5 min, e o iCem
inicia o tail aos 55,1); no eixo de volume isso não aparece. O caso é teste de
regressão em
[`primary-field-mina02.spec.ts`](../../src/app/features/simulador/pages/primary-field-mina02.spec.ts),
que também confere a volta dos dois cenários pelo formato do banco.

**Apresentação alinhada ao iCem.** Na comparação apareceram diferenças de
apresentação, não de cálculo, que faziam os gráficos parecerem divergentes. O
gráfico de hidrostática e ECD passou a mostrar a pressão hidrostática em psi à
esquerda e o ECD em ppg à direita, com as escalas amarradas pela TVD da saída
ativa: sem atrito, as duas curvas coincidem. O ECD aparece em todo instante
calculado: na pausa é igual à ESD, e na queda livre acompanha a vazão real de
saída. Antes o ECD só aparecia com a bomba ligada. O eixo de volume começa em 0 e
o envelope, em TVD 0. O SVG do relatório segue o mesmo desenho.

## 12. Páginas técnicas e domínio das correlações

As páginas PDF abaixo são contadas a partir de 1, incluindo capa e folhas iniciais.
Leitura por extração de texto e inspeção visual das páginas de fórmulas; os livros
não foram copiados para o código ou para os ativos do front.

| Referência | Página PDF / impressa | Conteúdo verificado |
|---|---|---|
| R1, Halliburton, *Cementing 1 Student Workbook*, 2003 | 68–69 / 4-3–4-4 | Circulação descendente no revestimento, ascendente no anular; figura 4.1 e plugues |
| R1 | 93–95 / 5-8–5-10 | Cálculos de volume anular |
| R1 | 105, 109–111 / 5-20, 5-24–5-26 | Volume de pasta, shoe track e deslocamento até o colar |
| R1 | 159–160 / 8-3–8-4 | Squeeze como cimentação remedial, distinto da primária |
| R2, Petrobras, *Petroguia*, 2ª ed., 2009 | 15 / A-13 | Pressão hidrostática e coeficientes de unidade |
| R2 | 18 / A-16 | Capacidades interna e anular em bbl/m |
| R2 | 290–291 / F-40–F-41 | Velocidade, atrito, Reynolds, ajuste reológico e correção de standoff |
| R3, Nelson e Guillot (eds.), *Well Cementing*, 2ª ed., Schlumberger, 2006 | 689–692 / 664–667 | Apêndice C, §§C-3.1–C-3.6: pasta, excesso, shoe track, deslocamento, hidrostática e pressão de assentamento |
| R3 | 473 / 448 | §12-6: U-tubing e diferença entre vazão de entrada e retorno |
| R3 | 495 / 470 | Sequência, assentamento e verificação dos flutuadores |
| R3 | 194, 200 / 169, 175 | Limitações de modelos 1D e efeitos da excentricidade |
| R3 | 155–161 / 130–136 | §4-6: Reynolds de Metzner e Reed, Dodge e Metzner, critérios de regime, fenda anular e exemplos resolvidos |
| R3 | 473–480 / 448–455 | §12-6 U-tubing e §12-7 exemplo de projeto de 9⅝" (fluidos, programa e simulação) |
| R3 | 214 / 189 | Cap. 5, diretrizes: lavador com contato ≥ 8 min; espaçador com ≥ 500 ft de anular (§5.7) |
| R3 | 189 / 164 e 326 / 301 | "A 10-min contact time is recommended"; Tabela 9-3, "10-min spacer contact time" |
| Manual de Revestimento e Cimentação (MaterialHenrique/07) | 230–232 / 10-38–10-40 | Tempo de contato do colchão, eq. 10.7 `V = t_c·Q` |

R3 inclui linhas de superfície quando a medição começa na bomba. O domínio da
primeira versão desta SPEC começa na cabeça; por isso seu volume de linhas é
zero (§4). A expressão de ECD em §7.1 é derivada da pressão equivalente e da
hidrostática, não uma transcrição literal dessas páginas.

### 12.1 Divergências entre impresso e legado: convenção adotada

Conferido em 2026-09-23 na página renderizada do Petroguia (PDF 290–291):

| Item | O que está impresso (R2 F-40/F-41) | Decisão para a primária |
|---|---|---|
| Velocidade no tubo | `V = 117,158·Q/D_i²`; no anular, `17,158` | Tipografia: `17,158` é a conversão de bpm/in² para ft/s. Irrelevante após R3, que calcula em SI |
| Diâmetro equivalente anular | `D_eq = 0,861·(D_p − D_e)`, igual nas três colunas | O código transcrevia corretamente. R3 usa a folga `D−OD` com o fator de fenda no Reynolds; a primária segue R3 |
| Reynolds | `1,86·V^(2−n)·D_eq^n·ρ / (k·96)`, **sem** expoente no 96 | O código usava `96^n` por análise dimensional. Irrelevante após R3 (Metzner e Reed) |
| Faixas de Reynolds | laminar `< 400`; transitório `400 ≤ NRe ≤ 6000`; turbulento `> 6000` | Descontínuo em 400 (fator cai à metade ou menos) e sem fórmula na coluna turbulenta. **Substituído por R3** (§7.3) |
| Unidade de velocidade | F-41 lista `V = velocidade, lb/gal` | Erro de legenda; velocidade é ft/s |
| Ajuste k de Fann | `k = 1,06·θ100^5,84·θ200^−0,53·θ300^−4,32 / 100`; código do squeeze usa 1,066 | É ajuste por mínimos quadrados em log-log (os pesos 0,81/0,15/−0,96 conferem); o fator de conversão Fann R1B1 é 1,0678, e 1,06 é o arredondado. Primária mantém 1,06 como impresso |
| Standoff | `N` maiúsculo sem definição | A interpretação `N=n` é hipótese explícita de modelagem, com correção opcional restrita às geometrias indicadas |

Correção opcional de excentricidade, com `Sto` em porcentagem:

```text
8½ in × 7 in:     ΔP_ecc/ΔP_conc = 1 - (0.44 + 0.18·n)·(1 - Sto/100)
12¼ in × 9⅝ in:   ΔP_ecc/ΔP_conc = 1 - (0.43 + 0.19·n)·(1 - Sto/100)
```

Na primeira implementação, o padrão é anular concêntrico (`Sto=100`). Ativar
correção só com escolha explícita da correlação para sua geometria de referência.
Se o diâmetro efetivo mudar por caliper/excesso, não assumir que ainda coincide
com a geometria da tabela. Outras geometrias permanecem sem correção, com essa
limitação informada; coeficiente negativo/fora de domínio não é limitado a zero
silenciosamente. Menor atrito com excentricidade não significa melhor cimentação.

### 12.2 Referências analíticas para conferir atrito

Além das contas pela correlação, usar a solução newtoniana laminar como conferência
independente de unidade e ordem de grandeza:

```text
Tubo: ΔP = 128·μ·L·Q / (π·D⁴)
Anular concêntrico:
ΔP = 8·μ·L·Q / {π·[Ro⁴-Ri⁴-(Ro²-Ri²)²/ln(Ro/Ri)]}
```

Todas as unidades são SI: μ em Pa·s, Q em m³/s, L/D/R em m, ΔP em Pa.
Para μ=0.1 Pa·s, L=100 m e Q=0.00001 m³/s: tubo D=0.1 m resulta em
40.7436654315 Pa; anular Ro=0.05 m e Ri=0.03 m resulta em 594.2704049493 Pa.
A correlação por diâmetro equivalente é aproximada; não exigir identidade com
a solução exata anular nem ajustar fatores silenciosamente para forçá-la.

## 13. Estado de implementação e verificação

**[FATO 2026-09-25]** A primeira versão P1–P12 foi implementada. As regras atuais de geometria, transporte, hidráulica, colchões, gráficos, persistência e relatório estão nas seções 3–9; os casos de aceite e referências numéricas estão na seção 11.

**[PENDENTE]** Revisão visual humana e conferência da integração HTTP com o backend, conforme o registro das entregas. O [histórico integral](history/cimentacao-primaria-implementacao-2026-09.md) guarda evidências, arquivos alterados e resultados de teste.

### Registro das entregas e revisões

### 13.1 Entrega de implementação — contratos e geometria

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.2 Entrega de implementação — dimensionamento, TOC e receitas

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.3 Entrega de implementação — transporte, eventos e colocação real

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.4 Entrega de implementação — hidráulica, janela e domínio de queda livre

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.5 Entrega de implementação — página, gráficos e reprodução

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.6 Entrega de implementação — dados medidos importados

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.7 Entrega de implementação — os cinco gráficos anexados

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.8 Entrega de implementação — banco e cenários portáteis

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.9 Entrega de implementação — relatório completo

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.10 Entrega de implementação — integração e regressão

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.11 Revisão da hidráulica — caso de campo, atrito de R3 e queda livre (2026-09-23)

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.12 Comparação com o iCem — MINA-02 e gráficos no desenho do iCem (2026-09-23)

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
### 13.13 Colchões calculados pelo simulador (2026-09-25)

[Registro datado](history/cimentacao-primaria-implementacao-2026-09.md).
