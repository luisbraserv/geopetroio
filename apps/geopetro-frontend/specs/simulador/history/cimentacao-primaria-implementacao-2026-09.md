# Historico de implementacao - cimentacao primaria

Registro datado das entregas P1-P12 e revisoes posteriores. Requisitos vigentes permanecem na [SPEC principal](../cimentacao-primaria.md).

## 13. Estado de implementação e verificação

**[FATO 2026-09-17 — entrevista consolidada]** Arquitetura do squeeze e contratos
de cenários inspecionados; referências, fórmulas e divergências registradas.
As 16 respostas e os dois complementos estão incorporados, inclusive liner,
múltiplos estágios, ordem livre, banco, dados medidos e os cinco gráficos anexados.
Implementação iniciada após autorização do usuário: **P1 a P12 concluídas**. Parâmetros de software propostos, como limites de importação, continuam
identificados no documento complementar.

**Base compartilhada ajustada na continuação de 2026-09-17:** squeeze/tampão
passam a apresentar diâmetro de furo editável por fase e um exemplo iniciado na
superfície, conforme [geometria-poco.md, §17](../geometria-poco.md#17-diâmetros-por-fase-e-exemplo-iniciado-na-superfície).
Esse ajuste da interface existente não implementa o motor nem a página da
primária; é uma correção anterior e independente das etapas P1–P12.

Verificação documental inicial: 18 valores numéricos recalculados independentemente.
Nesta revisão: três referências adicionais de volume de liner conferidas,
links locais/blocos de código verificados e requisitos antigos conflitantes
substituídos. A validação da correção anterior de squeeze/tampão está na SPEC de
geometria; validação física e visual do motor completo continua nas etapas futuras.

**A primária passou a ter tela em 2026-09-18.** P1–P6 continuam verificadas por
teste numérico; P7 acrescentou a página que mostra esse resultado. A inspeção
visual pedida em §11.3 — tela estreita, zoom/exportação, troca de unidades, duas
pastas, revestimento anterior e caso com cimento retornado — **ainda não foi
feita por uma pessoa**; o que existe é cobertura por teste de componente. Aqui,
"concluída" continua significando critério de pronto atendido e suíte verde, não
operação conferida por um usuário.

### 13.1 Entrega de implementação — contratos e geometria

| Arquivo / função | Estado |
|---|---|
| `models/primary-cementing.model.ts`, `primary-measurements.model.ts`, `primary-scenario.model.ts` | P1: modelos de entrada/resultado/inventário/eventos e origem dos dados; cenários/datasets versão 1 |
| `models/primary-cementing.examples.ts` | Exemplos independentes de convencional, liner e dois estágios, sem resultados simulados |
| `services/primary-scenario-codec.ts` | Validação estrutural/referências, JSON, proteção contra versão incompatível/NaN, payload e hidratação pela API existente; sem executar HTTP |
| `models/operation-hydraulics.model.ts`, `services/operation-hydraulics-adapter.ts` | DTO e adaptadores separados para legado/primária; volume legado não vira total bombeado; conexão dos componentes visuais em P7 |
| `WellGeometryService.resolveConventionalPrimaryGeometry` e `primaryVolumeBetween` | P2: segmentação e capacidades externas/internas, colar/sapata, cortes de survey e validação sem resultados parciais em erro |
| `WellGeometryService.resolvePrimaryAssemblyGeometry` e `resolvePrimaryStageGeometry` | P3: coluna + liner, geometria de cada circuito, capacidade de deslocamento, dardo/plugue e regiões fora da circulação preservadas |
| `services/primary-accessories.ts` | P3: cavidades em série com posse declarada por trecho e lado da conexão; o shoe track continua no volume tubular, sem soma dupla |
| `services/primary-connectivity.ts` e `WellGeometryService.resolvePrimaryConnectivity` | P3: grafo de comunicação por estado explícito de cada dispositivo, saída ativa única, rota de circulação e trechos estáticos/isolados sem pressão inventada |

`PrimaryGeometrySegment` descreve a geometria, sem fingir um `pathId` ativo.
O estágio referencia seu próprio circuito. Diâmetro medido tem capacidade nominal
`null`; capacidade efetiva vem diretamente da medição, sem excesso adicional.
Trechos fora da circulação não recebem pressão/conectividade inventada. O estado
hidráulico de cada dispositivo é entrada explícita: o grafo responde quem comunica
com quem, e **não** decide quando uma ferramenta abre ou fecha — isso é P5.

### 13.2 Entrega de implementação — dimensionamento, TOC e receitas

| Arquivo / função | Estado |
|---|---|
| `models/primary-volumes.model.ts` | P4: colocação dimensionada, passo, estágio, TOC ideal e receita por colocação, com origem de cada parcela separada |
| `services/primary-volumes.ts` | P4: volume por intervalo, volumes retidos atribuídos uma vez, frações de passo e de deslocamento, tempos e conflito de intervalo entre estágios |
| `primaryAnnularFillTop` | P4: topo a partir de um volume conhecido, consumindo da saída ativa para cima; excedente vira cimento retornado e o topo nunca fica negativo |
| `services/primary-recipes.ts` | P4: sacos, água de mistura e aditivos por colocação a partir do volume preparado; totais somam só produto e unidade compatíveis |
| `services/primary-program.service.ts` | P4: liga geometria, volumes e receitas reusando `SlurryCalculoService` e `CementSlurryRecipeService`, sem recriar a convenção de rendimento |
| `CementPlacement.mixingReserveBbl` | Campo opcional novo: reserva de mistura aumenta material preparado e não entra no bombeado; cenário salvo antes do campo continua válido |

**Duas reservas distintas, propositalmente.** A reserva de mistura
(`mixingReserveBbl`) só aumenta o material a preparar: os sacos sobem, o volume
bombeado e o TOC não mudam. A reserva bombeada (`reserve-extra`) é um passo do
programa, identificado como extra ao volume calculado por TOC, e por isso sobe o
topo do cimento ou retorna à superfície. Somar as duas no mesmo campo faria uma
sobra de silo parecer cimento colocado no anular.

**O TOC desta etapa é o ideal.** Vem do volume programado consumido de baixo para
cima numa bainha contínua. Ele não substitui a colocação de P5, que sai das
parcelas efetivamente transportadas e pode mostrar bolsão, pasta fragmentada ou
fluido incorreto no track. Enquanto P5 não existe, nenhum resultado deve ser
apresentado como colocação medida.

Dimensionamento com erro **não** é apagado: os volumes calculados continuam
visíveis com `valid: false` e o diagnóstico correspondente, porque a SPEC pede
mostrar o desvio. O que não acontece é dimensionar sobre geometria inválida —
aí o resultado sai vazio.

Verificação: **528 testes passaram em 52 arquivos**, usando
`npm.cmd test -- --watch=false`. Os 21 casos novos de P4 incluem o caso base
reproduzível de §11.1 (74.100075 bbl de anular, 2.510681114592 bbl de track,
185.790402479808 bbl de deslocamento e 52.480231718880 min a 5 bpm), excesso de
20% aplicado só à bainha, deslocamento do liner pela rota de lançamento
(162.287132 bbl), TOC na superfície com excedente retornado, reserva bombeada
subindo o topo em 100 m, reserva de mistura sem efeito no bombeado, divisão de
uma pasta entre passos, frações que não fecham, pasta sem passo, conflito de
intervalo entre estágios, track recusado no segundo estágio, override preservado
ao recalcular e totais por produto/unidade. Os valores esperados foram calculados
fora do código testado. Não houve inspeção visual da primária: página e gráficos
ainda não foram conectados.

### 13.3 Entrega de implementação — transporte, eventos e colocação real

| Arquivo / função | Estado |
|---|---|
| `models/primary-transport.model.ts` | P5: parcela, snapshot sem perfis de pressão, colocação real e resultado do transporte |
| `services/primary-transport.ts` | P5: fila de parcelas por célula, eventos exatos, estados de plugue/dardo, troca de estágio e diagnóstico da colocação |
| `primaryInternalAdvance` | P5: profundidade do corpo descendo pelo interior a partir de um volume, com cavidades consumindo volume sem deslocá-lo |
| `PrimaryProgramService.resolve` | P4+P5: geometria, volumes, receitas e transporte; programa inválido devolve `transport: null` em vez de simular |

**Cada célula tem sua própria fila.** O fluido entra pela entrada da célula e sai
pela saída, célula a célula, na ordem do circuito resolvido em P3. Um avanço maior
que uma célula atravessa, em vez de estourar a capacidade dela, e o que sai da
última vira retorno identificado por fluido. É isso que faz o balanço fechar sem
correção: em circuito cheio, o que entra na cabeça sai no retorno.

**Trechos fora da rota guardam o que têm.** Como o inventário é por célula, abrir
um estágio troca a rota sem tocar no que já foi colocado: nada é reenchido com
lama e nenhum acumulado é zerado. O relógio também é global e não reinicia.

**Interface é rotulada pelo fluido de montante.** Quando uma interface chega à
saída ativa, o evento nomeia o fluido que está chegando, não o que está sendo
empurrado. A própria injeção na cabeça cria uma interface; sem contá-la, um passo
longo o bastante levaria a frente além da saída sem gerar evento.

**Assentamento e sobredeslocamento.** O plugue superior fecha a passagem interna
ao assentar, e daí em diante nenhum volume atravessa: o excedente vira
`PRIMARY_OVERDISPLACEMENT` com o volume recusado, e não é contado como bombeado,
porque fisicamente não entrou. Deslocamento curto deixa o plugue acima do assento
e pasta dentro do revestimento, com `PRIMARY_UNDERDISPLACEMENT` e a profundidade
alcançada. Nenhum dos dois inventa perda para a formação.

**A colocação real substitui o TOC ideal.** Os intervalos vêm das parcelas que
sobraram no anular, não do volume planejado. Pasta em mais de um trecho é
reportada como bolsões, com `PRIMARY_PLACEMENT_FRAGMENTED`, e o shoe track que
terminou com outro fluido gera `PRIMARY_TRACK_CONTAMINATED`. O programa não é
reordenado para forçar o TOC esperado.

⚠️ **O snapshot de P5 não tem `profiles`.** Perfis carregam pressão, ECD e
Reynolds, que são P6. Emitir o campo com zeros faria um resultado não calculado
parecer calculado, então o tipo de P5 é `Omit<PrimarySnapshot, 'profiles'>` e P6
o completa.

Verificação: **538 testes passaram em 53 arquivos**, usando
`npm.cmd test -- --watch=false`. Os 10 casos novos de P5 incluem o transporte
isolado de §11.2 (120 bbl de lama retornados; interior com 60 de deslocamento e
40 de pasta; anular com 10 de pasta, 10 de espaçador e 60 de lama; inventário
final de 180 bbl), o balanço por fluido conferido em **todos** os snapshots e não
só no fim, a bainha do caso base terminando em TOC 500 com track cheio e nenhuma
pasta retornada, os instantes exatos de lançamento, chegada à sapata e
assentamento, sobredeslocamento recusado, deslocamento curto, ordem de bombeio
fragmentando a pasta, dois estágios preservando inventário e relógio, dardo e
plugue do liner contados uma vez só, pausa somando tempo sem volume e lançamento
fora de ordem recusado.

### 13.4 Entrega de implementação — hidráulica, janela e domínio de queda livre

| Arquivo / função | Estado |
|---|---|
| `services/primary-friction.ts` | P6: correlação de §7.3 como funções puras, com `D_eq` anular, corte laminar em Re nominal 400 e excentricidade opcional restrita às geometrias de referência |
| `primaryPressureBalance` | P6: balanço isolado de colunas e perdas; testável sem geometria, transporte ou correlação |
| `primaryNaturalRate` | P6: raiz positiva de `F_int+F_an+F_local = ΔP_motriz` por bissecção com tolerância explícita |
| `services/primary-hydraulics.ts` | P6: colunas por zona, atrito por fatia, referências, perfis, envelope, janela e alertas de limite |
| `PrimaryProgramService.resolve` | P4–P6: geometria, volumes, receitas, transporte e hidráulica em uma chamada |

**A primária não herda os limitadores do squeeze.** A correlação é a mesma, mas o
squeeze limita `n` entre 0.1 e 1.6, aplica fator de rugosidade qualitativo e um
fator de reologia. Nenhum deles entra aqui: reologia inválida devolve `null` com
diagnóstico, em vez de virar uma pasta padrão. O squeeze segue como está, e uma
revisão dele continua sendo entrega própria com testes de regressão.

**Cada ramo tem sua própria coluna.** A hidrostática anular é montada com os
fluidos que estão no anular, nunca copiada da interna. Abaixo de uma saída
inativa, o anular segue comunicante e parado: recebe hidrostática a partir da
pressão na conexão, com atrito zero, conforme §3.1.

**Limite excedido é alerta, não poda.** Pressão, vazão e potência fora do limite
do equipamento geram diagnóstico com início, fim, pico, estágio e passo, e as
séries continuam mostrando o valor demandado. Poro e fratura só são avaliados
onde há formação exposta; atrás de revestimento anterior a janela é `null`, sem
faixa verde fictícia. O envelope é uma síntese de instantes diferentes, e o perfil
simultâneo continua disponível por snapshot.

⚠️ **O caso base da SPEC entra em queda livre no deslocamento.** Pasta de 16 ppg
empurrando lama de 10 ppg com retorno atmosférico produz um desbalanço
hidrostático maior que as perdas, e a pressão requerida fica negativa antes de a
pasta chegar ao anular. Como a cabeça padrão é `closed-head`, isso está fora do
domínio de §7.5: as curvas físicas param com `outside-model` em vez de serem
truncadas em zero. O trecho inicial, ainda cheio de lama, continua calculado
normalmente. Isso não é defeito do caso base nem do motor; é o fenômeno real
aparecendo onde a SPEC mandou não escondê-lo.

⚠️ **O transporte conservativo com vazio não foi implementado.** P6 fecha o
*domínio* de queda livre: detecta a tendência, decide se ela cabe no modelo e
interrompe quando não cabe, que é o ramo que o critério de pronto admite. Mesmo
com a cabeça declarada `vented-free-surface` e sem plugue selante em trânsito, o
resultado hoje é `free-fall` com pressões indisponíveis e o diagnóstico
`PRIMARY_FREE_FALL_PENDING`, porque rastrear o vazio exige acoplar hidráulica e
transporte num passo só. Essa é a entrega própria que §7.5 já anunciava, e nenhum
resultado é apresentado como calculado enquanto ela não existir.

Verificação: **553 testes passaram em 54 arquivos**, usando
`npm.cmd test -- --watch=false`. Os 15 casos novos de P6 incluem o balanço
prescrito de §11.2 (`H_int=2559.0552`, `H_an=3104.986976`, `P_bomba=995.931776`,
`BHP=3404.986976` e `ECD=13.30564098812718 ppg`), a troca dos últimos 30 m
internos para 16 ppg mudando `P_bomba` para 965.2231136 sem mexer no BHP anular,
ECD igual à densidade sem atrito e sem contrapressão, a correlação de atrito
conferida termo a termo fora do código testado, vazão zero devolvendo perda zero
antes de calcular Reynolds, reologia inválida devolvendo `null`, a raiz da vazão
natural encontrada e recusada quando não existe no intervalo, as duas colunas
divergindo quando os fluidos diferem, atrito zero e pressão interna `null` após o
assentamento, janela `null` atrás de revestimento anterior com aviso ao atravessar
a fratura, envelope como mínimo e máximo entre instantes, limite de equipamento
excedido sem podar o programa e a coluna estática abaixo de uma saída inativa.

### 13.5 Entrega de implementação — página, gráficos e reprodução

| Arquivo / função | Estado |
|---|---|
| `pages/simulador-primaria/` | P7: página com as cinco abas, edição da operação e do programa, resultados e diagnósticos |
| `models/primary-operation.form.ts` | P7: formulário compacto → `PrimaryConfiguration`, derivando parede externa, caminhos e dispositivos; reordenar e repetir passos |
| `services/primary-playback.ts` | P7: seleção de instante sem interpolar por evento, navegação entre eventos e avanço de quadro |
| `components/charts/schematic-primaria.component.ts` | P7: esquemático 2D com cimento fora do OD, colar, sapata, topo do liner, plugues e TOC |
| `SqueezeOperationChartsComponent` | P7: migrado para o DTO comum; `primaryCharts` alimenta a primária e o caminho legado do squeeze/tampão segue intocado |
| `OperationHydraulicPoint` | Campos novos de queda livre, vazio e estado, todos `null` quando o motor não resolve |

**Os oito gráficos são os mesmos, com as grandezas trocadas.** Envelope, pressão
e deslocamento, BHP e ECD, free fall, hidrostática × fratura vieram do componente
compartilhado; cronograma, espessamento e UCA vieram dos componentes próprios.
No caminho da primária, as séries de volume passam a ser bombeado, pasta bombeada
e retornado, e a hidrostática de fundo usa a **coluna anular**, não a interna. As
grandezas legadas — volume no poço e injetado na formação — ficam `null` e não
aparecem, e a página não exibe canhoneados nem base do tampão.

**Queda livre continua marcada como indisponível.** O gráfico existe, mas vazão
adicional, volume acumulado e vazio são `null` enquanto o transporte conservativo
de §7.5 não existir. Em nenhum momento se desenha Q real igual a Q bomba para
preencher a curva.

**A reprodução navega em resultado já calculado.** O motor roda quando as entradas
mudam; mover o cursor não recalcula nada, e há teste para isso. Avançar um quadro
para exatamente no próximo evento em vez de pular por cima dele, e o estado entre
dois eventos é o do último snapshot válido, sem interpolação. Alterar qualquer
entrada pausa a reprodução e volta o cursor ao início. O mesmo `selectedTimeMin`
move a linha de cursor dos gráficos de tempo, o esquemático e a leitura de estado.

**A tela edita o que o motor consome.** Poço cadastrado pelo seletor compartilhado
ou fases editadas na própria página; alvo convencional ou liner; excesso anular ou
calibre medido; janela e limites de equipamento; fluidos com densidade e
composição; estágios acrescentados e removidos; e o programa reordenado, repetido,
acrescido de espaçador e de pausa. A parede externa continua **derivada das fases**:
ID do revestimento anterior acima da sua sapata, diâmetro do furo abaixo dela, sem
pedir que o usuário redigite o que já está no cadastro.

**O 3D reusa o componente do poço, com zona anular própria.** `WellOverlay` ganhou
`casing-annulus` com limites radiais vindos de `PrimaryFlowSegment`, mantendo a
semântica de `annulus` do squeeze. A bainha é desenhada no raio da parede externa
declarada, e não no raio genérico, que sugeriria cimento dentro do revestimento.
O controle **Corte / transparência** deixa o aço quase transparente para ver a
bainha atrás dele. A lama não vira overlay: pintá-la esconderia a operação.

**Remoção é recusada quando quebraria o programa.** O primeiro estágio não sai, e
um fluido referenciado por alguma colocação, passo ou pelo fluido inicial não é
removido — em vez de deixar o motor recusar depois com referência pendurada.

⚠️ **Duas pendências registradas.** Os **aditivos** da pasta continuam no catálogo
compartilhado e não são editados nesta tela; o que ela edita é densidade alvo,
classe, divisão de água, sílica, NaCl e temperatura de superfície. E a **inspeção
visual humana** pedida em §11.3 — tela estreita, zoom/exportação, troca de
unidades, duas pastas, revestimento anterior e caso com cimento retornado —
**ainda não foi feita**; o que existe é cobertura por teste de componente, build e
suite verdes. Ninguém abriu a página no navegador.

Verificação de P7: **590 testes passaram em 58 arquivos**, usando
`npm.cmd test -- --watch=false`. Os 37 casos novos cobrem o formulário virando
configuração com os volumes de referência da SPEC, a parede externa derivada das
fases e recalculada ao editar a sapata anterior, o excesso substituído pelo calibre
medido, a janela fora do trecho revestido, o shoe track atribuído uma vez e ausente
no segundo estágio, o caminho do liner pela coluna de assentamento, reordenar e
repetir passos sem mudar o total dimensionado, a reprodução sem interpolar por
evento, o cursor sem recalcular o motor, a alteração de entrada pausando e
rebobinando, a densidade digitada virando origem `entered` sem apagar as demais, a
composição alterando sacos sem mexer no volume bombeado, a divisão de água doce e
do mar fechando em 100%, a pausa somando tempo sem volume, a recusa de remover o
primeiro estágio e um fluido em uso, e os overlays com os limites radiais do anular
e sem lama.

`npm.cmd run build` também passou (exit 0). O bundle inicial foi de 525.00 kB para
525.33 kB por causa do card novo no índice; a página e o 3D são carregados sob
demanda e o CSS dela ficou dentro do orçamento. Os avisos de estilo do squeeze
(14.17 kB) e do tampão (13.72 kB) permanecem como antes. Nenhum é erro de build.

### 13.6 Entrega de implementação — dados medidos importados

| Arquivo / função | Estado |
|---|---|
| `services/primary-csv.ts` | P8: separador sugerido, aspas, decimal configurável e número de célula sem transformar vazio em zero |
| `services/primary-measurements-import.ts` | P8: mapeamento de colunas, conversão de unidades, diagnóstico por linha e dataset normalizado |
| `services/primary-comparison.ts` | P8: amostragem do calculado no tempo medido dentro do domínio válido, resíduo e lacunas preservadas |
| Aba **Dados medidos** da página | P8: arquivo, prévia, mapeamento, alinhamento, comparação e procedência |

**A vírgula decimal não vira separador de coluna.** Quando o decimal declarado é
vírgula, ela sai da disputa por separador, e o ponto passa a ser separador de
milhar. O separador continua sendo **sugestão**: a prévia mostra cabeçalho e
primeiras linhas antes de qualquer incorporação.

**Célula vazia é ausência, não zero.** Vazio vira `null` sem diagnóstico; valor
não numérico vira `null` **com** diagnóstico que guarda a linha do arquivo, o
campo, o valor original e o motivo. Linha sem tempo é descartada e listada, porque
o dataset inteiro depende do tempo. Texto entre aspas continua texto: uma célula
começada por `=` não é fórmula nem HTML.

**Unidade incompatível com a grandeza é erro, não palpite.** Vazão aceita bpm,
L/min e m³/min; pressão aceita psi, bar e MPa; densidade aceita ppg, kg/m³ e
g/cm³; volume aceita bbl, L e m³. Pressão **absoluta** exige a atmosférica
declarada para virar manométrica — sem ela a importação é recusada, em vez de
supor 14.7 psi. Timestamp exige fuso e origem declarados, porque a data seria
ambígua.

**Nada é ordenado nem imputado em silêncio.** Amostras fora de ordem são
preservadas e a prévia avisa; ordenar é escolha do usuário, e a ordenação é
estável, mantendo a ordem do arquivo entre tempos repetidos — tempo repetido pode
ser degrau. Passar do limite de amostras orienta recortar o arquivo; truncar,
nunca.

**O offset é de apresentação.** As amostras ficam gravadas relativas à origem,
antes do offset, e ele entra apenas na comparação. Assim recarregar o cenário não
aplica o offset duas vezes.

**A comparação não toca no cálculo.** O calculado é amostrado no tempo medido só
dentro do intervalo simulado, e **nunca atravessa** uma lacuna maior que o limite
declarado, uma troca de estágio ou um trecho `outside-model` ou `free-fall`. Fora
disso o lado calculado fica `null` e a curva corta. Grandeza medida sem série
calculada equivalente é dita como tal. Sem sobreposição temporal, a comparação
aparece com aviso. Diferença entre medido e calculado é **discrepância**: não vira
perda para a formação, não calibra propriedade e não gera percentual sobre
referência zero nem índice de qualidade, que não têm definição aprovada.

⚠️ **O que P8 não faz.** Não persiste o dataset no banco — isso é P10, e até lá
as medições vivem na sessão. Não há alinhamento por evento conhecido nem eixo X
por volume medido; o alinhamento disponível é origem mais offset. Perfis com
tempo e MD por amostra também não são importados nesta entrega.

Verificação de P8: **615 testes passaram em 60 arquivos**, usando
`npm.cmd test -- --watch=false`. Os 25 casos novos cobrem separador com decimal
vírgula, aspas e aspas escapadas, célula vazia sem virar zero, conversão de L/min,
bar, kg/m³ e m³, pressão absoluta recusada sem atmosférica, unidade incompatível
com a grandeza, linha sem tempo descartada e listada, tempo em segundos e
timestamp exigindo fuso e origem, ordem e tempos repetidos preservados, ordenação
estável sob demanda, offset fora das amostras, limite de lacuna sugerido como três
vezes a mediana, recusa de truncar acima do limite, amostragem do calculado, o
corte em lacuna longa, em `outside-model` e em troca de estágio, medição ausente
como lacuna, grandeza sem equivalente calculado, resíduo só onde há os dois lados,
o calculado devolvido intacto, e na página a prévia, a importação, a falha
preservando os conjuntos anteriores, o offset e a remoção sem mexer no programa.

`npm.cmd run build` também passou (exit 0), com os mesmos avisos de orçamento de
antes: bundle inicial 525.33 kB, estilos do squeeze 14.17 kB e do tampão 13.72 kB.
Nenhum é erro de build. A inspeção visual humana da página continua em aberto.

### 13.7 Entrega de implementação — os cinco gráficos anexados

| Arquivo / função | Estado |
|---|---|
| `services/primary-annex-charts.ts` | P9: G1 a G5 montados a partir do que o motor já calculou, com os dois modos de volume e a busca por volume |
| `components/charts/primary-annex-charts.component.ts` | P9: desenho dos cinco, uma escala por família física, lacuna como quebra e medido com traço próprio |
| Aba **Gráficos** da página | P9: seletor de volume, caminho do G3, referências de ECD e navegação por volume |

**Os dois modos de volume são acumulados de entrada na cabeça.** Pausa não
aumenta nenhum dos dois, troca de estágio não zera nenhum, e o volume de pasta
fica em patamar enquanto outro fluido é bombeado. Reserva extra bombeada entra
nos dois; reserva apenas preparada não entra em nenhum, porque nunca passou pela
bomba. O modo escolhido vale para a curva de volume de G1, o X de G2 e a busca
por volume.

**Volume→tempo não é função.** Num patamar, vários instantes têm o mesmo X. Os
pontos são preservados na ordem temporal, sem agrupar por volume nem reordenar
por Y, e a busca por volume devolve todos os instantes, começando pelo mais
próximo do cursor. O tooltip carrega tempo e **os dois** volumes, porque X igual
não significa mesmo instante.

**G1 usa o retorno, não a vazão de bomba.** Trocar um pelo outro esconderia
exatamente a diferença que a queda livre produz. Sem medição importada, a série
medida fica ausente em vez de receber uma cópia da calculada; quando existe, ela
vem com traço e marcador próprios, não só com outra cor.

**G3 herda os limites do motor.** O limite laminar 400 e o início do turbulento
6000 vêm dos perfis, junto do `correlationId`, e a tela diz que são **da
correlação**, não universais. Os 2000/3000 das imagens não aparecem. Em repouso
vale a convenção Re=0, sem avaliar a expressão num ponto singular; Reynolds não
resolvido continua lacuna, sem desenhar fluido fictício.

**G5 separa densidade local de densidade equivalente.** A densidade do fluido no
trecho e o ECD, que é pressão integrada dividida por TVD, são séries distintas e
não se substituem. A janela já chega em ppg equivalentes e é usada direto, sem
integrar de novo; atrás de revestimento anterior vira lacuna. Excedente é
sinalizado sem remover nem alterar o valor real.

⚠️ **O que P9 não faz.** O modo de volume ainda não é persistido no cenário,
porque a persistência inteira é P10. Perfis **medidos** por profundidade não são
desenhados: exigem dado em profundidade no instante compatível, e a importação de
P8 ainda não traz amostras com MD. O cursor comum em tela estreita usa os mesmos
dados, mas o alinhamento de painéis lado a lado não foi verificado por uma pessoa.

Verificação de P9: **635 testes passaram em 61 arquivos**, usando
`npm.cmd test -- --watch=false`. Os 20 casos novos cobrem o caso de aceitação de
10 bbl de espaçador, 20 de pasta e 30 de deslocamento com patamar de pasta durante
o deslocamento, o retorno vindo de `returnRateBpm`, a série medida ausente sem
cópia da calculada e presente com traço próprio quando importada, X repetido
preservado numa pausa com todos os instantes oferecidos, ECD lido da referência
pedida e nulo numa referência desconhecida, os dois acumulados em cada ponto,
Re=0 em repouso, os limites 400 e 6000 nomeados pela correlação, Reynolds nulo
como lacuna, a separação entre caminho interno e anular, densidade de entrada
nula em pausa, densidade local distinta do ECD, janela em lacuna atrás do
revestimento, excedente sinalizado sem alterar o valor, e na página a troca de
modo de volume, as referências adicionais calculadas pelo motor, o perfil de
Reynolds por caminho e a navegação por volume sem recalcular.

`npm.cmd run build` também passou (exit 0), com os mesmos avisos de orçamento de
antes. A inspeção visual humana da página continua em aberto.

### 13.8 Entrega de implementação — banco e cenários portáteis

| Arquivo / função | Estado |
|---|---|
| `services/primary-scenario-store.service.ts` | P10: CRUD pelo contrato existente com `operacao: 'primaria'`, estado de salvamento e conflito de poço |
| `services/primary-scenario-portable.ts` | P10: arquivo portátil com versão, resumo antes de adotar e recusa de versão não suportada |
| `primaryFormFromConfiguration` | P10: caminho de volta da configuração salva para o formulário da tela |
| Barra de cenário da página | P10: nome, estado, salvar, listar, abrir, exportar e importar |

**Nenhum endpoint novo.** A primária usa `/api/simulador/cenarios` com
`operacao: 'primaria'`, como a SPEC previa: `CenarioRequest.operacao` já é string
e `form_value` já é LONGTEXT, então não houve migração só para aceitar a operação.

**"Salvo" só aparece depois da resposta de sucesso.** Falha de rede mantém o
estado não salvo, guarda a mensagem e diz que o cenário pode ser exportado — o
trabalho não se perde por falta de rede. Payload que não valida **nem chega à
rede**, e o cenário aberto continua como está. Conflito de versão do poço é
apresentado, nunca resolvido por sobrescrita automática.

**O arquivo portátil carrega a geometria completa.** Um cenário vinculado envia ao
banco apenas `pocoId/pocoVersion`, sem duplicar as fases; o **arquivo**, ao
contrário, leva a geometria inteira como snapshot, porque precisa abrir numa
instalação onde aquele `pocoId` não existe. IDs de banco viajam só como
procedência e não recriam vínculo.

**Importar mostra o resumo antes de adotar.** Estágios, fluidos, passos, conjuntos
de medição, amostras e referências aparecem para conferência; cancelar descarta. O
cenário adotado nasce **rascunho e não salvo**, sem gravar no banco e sem herdar o
vínculo do arquivo. Arquivo inválido, de outra operação ou de versão não suportada
é recusado com mensagem e **não substitui** o que estiver aberto. Versão anterior
também é recusada, porque nenhuma migração foi declarada ainda.

**Reabrir recalcula.** O que se persiste são entradas, medições e configurações;
os resultados voltam do motor. Um `status` salvo não certifica o cenário depois de
mudança de geometria ou de versão do motor, então abrir do banco devolve rascunho.

⚠️ **O que P10 não faz.** Pastas não são gerenciadas por esta tela: o campo
`pastaId` existe no payload, mas criar, renomear e escolher pasta continuam no
fluxo do squeeze. Não há rascunho local em `localStorage`. **O filtro por operação
na listagem por pasta não foi conferido contra o backend**, como a SPEC pede: os
testes usam um dobrâ do serviço de API, e autorização, limite de payload e round-trip
HTTP reais continuam por verificar em integração.

Verificação de P10: **654 testes passaram em 62 arquivos**, usando
`npm.cmd test -- --watch=false`. Os 19 casos novos cobrem o envio com
`operacao: 'primaria'`, criar e depois atualizar pelo id, falha de rede sem marcar
salvo e com o cenário ainda exportável, conflito de versão do poço explicado,
payload inválido barrado antes da rede, geometria removida do cenário vinculado
com a versão preservada, edição derrubando o "salvo", abertura do banco como
rascunho, round-trip de medições com mapeamento, unidades originais, alinhamento e
diagnósticos, IDs como procedência, resumo antes de adotar, recusa de outra
operação e de versão futura, anterior e ausente, cenário inválido dentro de arquivo
bem formado, e na página o round-trip completo de TOC, volumes, amostras, modo de
volume e referências, o arquivo inválido não substituindo o aberto e o cancelamento
descartando a importação.

`npm.cmd run build` também passou (exit 0). O bundle inicial foi para 525.80 kB.
A inspeção visual humana da página continua em aberto.

### 13.9 Entrega de implementação — relatório completo

| Arquivo / função | Estado |
|---|---|
| `services/primary-report.ts` | P11: relatório como documento estruturado, com seções, catálogo de gráficos, snapshots, alertas e conclusão |
| `services/primary-report-html.ts` | P11: HTML de impressão, escapando texto e dizendo disponibilidade por escrito |
| Botões da barra de cenário | P11: abrir em nova aba e baixar `.doc`, reusando `RelatorioBuilderService` |

**O relatório é documento antes de ser HTML.** Montar a estrutura primeiro
permite conferir por teste o que entra em cada seção, e não só que a página
renderizou. O gerador do squeeze não foi tocado: dele se reaproveita apenas abrir
em nova aba e baixar em `.doc`.

**Onze seções cobrem o conteúdo de §8.3:** identificação com cliente, poço,
cenário e revisão; geometria e alvo; dispositivos e volumes retidos; fluidos com a
origem de cada propriedade; intervalos com volume dimensionado, reserva extra,
reserva de mistura e material preparado; programa por estágio; TOC ideal e real
com retornos; balanço por fluido com o residual; hidráulica, janela e limites
excedidos; medições comparadas com alinhamento e unidades originais; e as
convenções de eixos, unidades e correlação.

**Curva sem dado mostra o motivo.** O catálogo lista os **oito** tipos herdados do
squeeze, os **cinco** anexos G1–G5 e dois complementos — esquemático e comparação
com medições. Cada um traz eixos e unidades, e o indisponível traz a razão: queda
livre não resolvida, janela não informada, pasta sem composição, nenhum conjunto
de medição importado.

**Resultado interrompido sai como parcial.** O caso base, que entra em queda livre
no deslocamento, produz um relatório marcado `RESULTADO PARCIAL` cuja conclusão
diz que **não conclui** sobre a operação inteira. Nem o completo fala em
aprovação operacional. Snapshots saem no fim de cada estágio por padrão, e o
usuário marca instantes adicionais pelo cursor.

**Impressão e preto e branco continuam legíveis.** Situação, severidade e origem
aparecem como texto, não só como cor, e o texto do usuário é escapado antes de
entrar no HTML — um nome de cenário não vira marcação.

⚠️ **O que P11 não faz.** As **imagens** dos gráficos não são embutidas: o
relatório lista cada gráfico, seus eixos e sua situação, mas capturar os canvas e
inseri-los no documento ficou de fora. A capa ilustrada do squeeze também não é
reaproveitada. Nenhum relatório foi impresso nem aberto por uma pessoa.

Verificação de P11: **667 testes passaram em 63 arquivos**, usando
`npm.cmd test -- --watch=false`. Os 13 casos novos cobrem as onze seções na ordem,
o caso base saindo parcial com conclusão que não conclui, o catálogo com oito
herdados, cinco anexos e dois complementos, motivo obrigatório em cada gráfico
indisponível, a razão da queda livre, a comparação ausente explicada e depois
disponível após importar, o alinhamento e a unidade original registrados, os
snapshots de fim de estágio mais os marcados pelo usuário em ordem de tempo, a
reserva de mistura separada do bombeado, a correlação nomeada com os limites 400 e
6000, a origem de cada propriedade, o residual por fluido, o HTML dizendo
disponibilidade por escrito e o escape impedindo injeção de marcação.

`npm.cmd run build` também passou (exit 0). A inspeção visual humana continua em
aberto e é parte de P12.

### 13.10 Entrega de implementação — integração e regressão

| Arquivo | Estado |
|---|---|
| `pages/primary-integration.spec.ts` | P12: matriz física de §11.3 ponta a ponta, do dimensionamento à hidráulica |
| `pages/primary-regression.spec.ts` | P12: squeeze e tampão preservados, e cenário reaberto reproduzindo o resultado |
| `pages/simulador-primaria/simulador-primaria.render.spec.ts` | P12: cada aba renderizada, com o conteúdo esperado no DOM |

**A matriz rodou ponta a ponta.** Poço desviado conserva volume e só encurta a
hidrostática, na razão das TVDs. Lead e tail ficam na ordem certa, com o tail
levando o shoe track, e o balanço por fluido fecha em **todos** os snapshots.
Vazão zero não move volume e zera o atrito. Sem poro e fratura declarados, a
janela fica `null` e nenhum limite é violado. Três estágios mantêm inventário,
relógio global e o track contado uma vez. Geometria impossível não produz
resultado parcial: sai vazia.

**Squeeze e tampão continuam intocados.** O componente de gráficos aceita o tipo
legado como sempre aceitou, com volume no poço, injetado na formação e as séries
de queda livre do modelo antigo. A primária não toma emprestada nenhuma dessas
grandezas, e o caminho legado não é reaproveitado quando a operação é `primaria`.
Cenário de squeeze é recusado onde se espera um de primária, no banco e no arquivo.

**Três defeitos reais apareceram no teste de renderização**, e foram corrigidos:

1. `getContext('2d')` era assumido não nulo em quatro componentes de gráfico
   compartilhados. Canvas oculto, impressão ou ambiente sem canvas derrubavam a
   tela inteira. Agora o gráfico é apenas omitido.
2. A lista de diagnósticos usava código, mensagem e instante como chave de
   rastreio, e diagnósticos repetidos colidiam (NG0955). Passou a usar o índice.
3. `Well3dComponent` dispara `NG0100` em modo de desenvolvimento quando recebe
   overlays. É quirk pré-existente do componente compartilhado, não da primária.
   Em vez de mexer nele, o 3D passou a ser carregado **sob demanda**, o que também
   evita iniciar WebGL a cada visita à aba. O quirk continua lá e merece entrega
   própria, com regressão do squeeze.

⚠️ **A revisão visual humana não foi feita, e o teste de renderização não a
substitui.** jsdom não avalia layout, largura de tela, zoom, exportação de imagem
nem impressão em preto e branco. Não há biblioteca de automação de navegador neste
projeto, e instalar uma mexeria no lockfile que a SPEC descreve como frágil em
peer dependencies. O que o teste garante é que cada aba renderiza sem quebrar e
com o texto certo no DOM. **Falta uma pessoa abrir `/app/simulador/primaria`** e
percorrer: tela estreita, zoom e exportação, troca de unidades, duas pastas,
revestimento anterior e caso com cimento retornado.

⚠️ **A integração HTTP real continua por conferir.** Os testes de persistência
usam um dobrâ do serviço de API. Autorização, filtro por operação na listagem por
pasta, limite de payload do gateway e round-trip real do JSON só se verificam
contra o backend em execução.

Verificação de P12: **689 testes passaram em 66 arquivos**, usando
`npm.cmd test -- --watch=false`, e `npm.cmd run build` passou (exit 0). Os 22
casos novos cobrem poço desviado, lead/tail, vazão zero, janela ausente, cálculo
em metros independente da unidade exibida, os números de referência da SPEC ponta
a ponta, três estágios, geometria impossível, o caminho legado do squeeze e do
tampão, a recusa de cenário de outra operação, o round-trip completo reproduzindo
volumes, transporte e hidráulica, e a renderização de cada aba com volumes,
colocação real, duas pastas, janela só no trecho aberto, cimento retornado como
informação e não como perda, e esquemático no instante selecionado.

### 13.11 Revisão da hidráulica — caso de campo, atrito de R3 e queda livre (2026-09-23)

| Arquivo / função | Estado |
|---|---|
| `services/primary-friction.ts` | Atrito de R3 §4-6 (§7.3); limites de regime por `n`; interseção laminar×turbulento para `n` baixo; cache do fim da transição |
| `services/primary-transport.ts` | Passo no tempo com `Q_saída ≠ Q_bomba`, vazio no topo do interno, plugues que descem com o líquido, pausa que drena, amostra por passo, estado `pre-event` na chegada do plugue e parada no primeiro `outside-model` |
| `services/primary-hydraulics.ts` | `createPrimaryRateModel` (balanço de §7.5 por regula falsi), cabeça em vácuo na queda livre, `PRIMARY_RHEOLOGY_ESTIMATED`, busca binária de trecho e coluna |
| `models/primary-default-rheology.ts` | Reologia de referência do R3 §12-7 como partida de programa novo (§7.4) |
| `services/phase-survey.ts`, editor de survey | Limite de estações por fase de 50 para 1000: o survey do MINA-28BD tem 138 numa só fase |
| `services/minimum-curvature.ts`, `WellGeometryService.mdToTvdResolver` | Busca binária de arco e conversão MD→TVD sem reconferir o survey a cada chamada |
| `pages/primary-field-mina28bd.*` | Caso de campo de §11.5 como fixture e teste de regressão, com volta pelo formato do banco |

**O que a avaliação mostrou antes da revisão.** Geometria, TVD, volumes,
hidrostática e transporte volumétrico já batiam com a referência. Não batiam:
(1) o atrito, descontínuo no próprio Petroguia; (2) a queda livre, que deixava
50,6–84 min do job como `outside-model`; (3) as pausas com fluido pesado dentro,
tratadas como repouso; (4) o survey real, recusado pela tela com mais de 50
estações; (5) a amostragem só em eventos, que perdia a pressão final de
circulação sempre que nenhuma interface coincidia com o assentamento. Depois que
o revestimento reenche, o estado de circuito cheio só depende do volume
bombeado; por isso os pontos do motor antigo a partir de 84 min já estavam
corretos, e o problema estava no trecho em queda livre.

**Desempenho.** Com o survey cortando a geometria em cerca de 320 células, o
cálculo do MINA-28BD leva ~0,4 s com o JIT aquecido e ~0,8 s na primeira vez
(bancada em Node, sem Angular); os exemplos sem survey, 35–60 ms. O custo que
resta é estrutural — uma célula por estação de survey — e cair abaixo disso exige
fundir células de mesma capacidade no P3, fora desta entrega.

**Cenário gravado.** O caso de campo foi gravado no banco local de
desenvolvimento (`simulador_cenarios`, `operacao = primaria`, sem pasta), com o
`formValue` gerado por `primaryScenarioPayload`, o mesmo do botão Salvar, e
conferido de volta por `primaryScenarioFromApi` antes da gravação.

Verificação: **770 testes aprovados nos 77 arquivos**, rodados em cinco lotes
porque a máquina não tinha memória livre para a suíte inteira em paralelo;
`npm.cmd run build` exit 0, com os mesmos avisos de orçamento de antes. Casos
novos: os seis exemplos resolvidos de R3, Hagen-Poiseuille, continuidade nos
limites de regime e perda crescente para `n` de 0,2 a 1,2; balanço isolado de
queda livre de §11.2 (entram 2, saem 4, vazio +2), reenchimento sem vazio
negativo, plugue lançado sobre o vazio, drenagem na pausa, parada no primeiro
`outside-model`, igualdade com P5 sem queda livre; caso base de §11.1 resolvido
até o assentamento com balanço por fluido em todos os instantes; caso de campo
de §11.5. A revisão visual humana continua em aberto.

### 13.12 Comparação com o iCem — MINA-02 e gráficos no desenho do iCem (2026-09-23)

| Arquivo / função | Estado |
|---|---|
| `pages/primary-field-mina02.fixture.ts` | Programa v3 e versão dos gráficos do iCem como variantes (`MINA02_PROGRAM`, `MINA02_ICEM_CHARTS`), com fluidos do laboratório, survey dos centralizadores, caliper por zonas e janela |
| `pages/primary-field-mina02.spec.ts` | v3 contra os números do programa; versão dos gráficos contra 19 pontos digitalizados das curvas do iCem e o envelope; volta dos dois cenários pelo formato do banco |
| `services/primary-operation-charts.ts` | ECD em todo instante calculado (pausa = ESD, queda livre pela vazão real); SVG do relatório com hidrostática em psi e ECD em ppg |
| `components/charts/primary-operation-charts.component.ts` | Hidrostática em psi à esquerda e ECD em ppg à direita, escalas amarradas pela TVD da saída ativa; volume a partir de 0; envelope com TVD a partir de 0 |

Nenhuma fórmula do motor mudou nesta entrega: com as entradas da versão em que os
gráficos foram gerados, as curvas do motor já coincidiam com as do iCem (§11.6) —
a ~1% na hidrostática e a 0,1 ppg no ECD sem calibração, e a 2,9 psi e 0,047 ppg
com o poço aberto e a faixa de rpm calibrados contra o próprio iCem.
A divergência vista na tela vinha de três coisas: o cenário aberto era de outro
poço; o gráfico mostrava ESD e ECD em ppg, onde o iCem mostra pressão em psi e
ECD em ppg; e o ECD sumia nas pausas e na queda livre.

**Cenários gravados.** Os dois, programa v3 e versão dos gráficos, foram gravados
no banco local de desenvolvimento (`simulador_cenarios`, `operacao = primaria`,
sem pasta), com o `formValue` de `primaryScenarioPayload` e o caliper por zonas,
e conferidos de volta por `primaryScenarioFromApi`.

Verificação: **773 testes aprovados nos 78 arquivos**, em cinco lotes;
`npm.cmd run build` exit 0, com os mesmos avisos de orçamento. O teste de
reologia da página passou a procurar um ponto em circulação, já que o ECD agora
também aparece parado. A revisão visual humana continua em aberto.

### 13.13 Colchões calculados pelo simulador (2026-09-25)

Pedido do usuário: os fluidos de bombeio devem sair do volume de pasta calculado,
com campo para informar outro valor. O material de referência foi revisto
(R1, R2, R3, a norma EP-5EM-00002, as apostilas da CEP e do pré-sal e o manual de
revestimento e cimentação): nenhum dimensiona colchão como fração da pasta; R3
dá os dois critérios de §5.7, e a ligação com a pasta é a capacidade anular da
pasta de fundo. O programa da Halliburton do MINA-02 confirma o critério de
contato: 40 bbl a 5 bpm são 8 min, e os 50 bbl da versão anterior, 10 min.

**Motor:** quantidade `preflush` em
[`primary-cementing.model.ts`](../../../src/app/features/simulador/models/primary-cementing.model.ts)
(`PREFLUSH_DEFAULTS`, `defaultPreflushQuantity`); cálculo em
[`primary-volumes.ts`](../../../src/app/features/simulador/services/primary-volumes.ts)
(`preflushBasis`), que devolve no passo as duas parcelas, qual governa e o
informado. Formato do banco e validação em
[`primary-scenario-codec.ts`](../../../src/app/features/simulador/services/primary-scenario-codec.ts).

**Tela:** o botão "Espaçador" cria o passo calculado. No cartão do fluido (4.1), o
"Volume utilizado" mostra o calculado; digitar outro valor o substitui, e um botão
volta ao calculado. Abaixo, a base (`t·Q` e `L·C`, com a pasta de fundo) e os dois
critérios editáveis. No programa (4.2), o campo do passo diz "calculado" ou
"informado".

**Testes:** o MINA-02 v3 com o espaçador calculado dá 40,00 bbl e o mesmo total
bombeado e a mesma duração do programa informado; 10 min dão 50 bbl; 250 m passam
a governar pelo anular; o informado substitui sem perder a base. A página cria,
substitui, volta ao calculado, muda o critério e repete o passo sem mudar a soma.
O codec guarda e reabre o calculado e o informado e recusa `preflush` em pasta.

Verificação: **854 testes aprovados nos 88 arquivos**, em cinco lotes;
`npm.cmd run build` exit 0, com os avisos de orçamento de antes.
