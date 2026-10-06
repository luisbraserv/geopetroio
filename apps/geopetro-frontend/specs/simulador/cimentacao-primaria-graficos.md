# Cimentação primária — gráficos e dados medidos

> Contrato complementar · 2026-09-17 · **Implementação pendente (P8/P9/P10/P11).**
> Decisões do usuário: acrescentar os cinco gráficos anexados aos gráficos do
> squeeze, permitir eixos de volume total/pasta e comparar com dados medidos
> importados. Demais detalhes de interface/importação abaixo são propostas de
> implementação. Fórmulas e etapas: [SPEC principal](cimentacao-primaria.md).

## 1. Convenções compartilhadas

Os anexos são identificados G1–G5 na ordem enviada. Representam grandezas e
interações requeridas, não resultados a reproduzir. Não fixar limites dos eixos,
profundidades, volumes ou limiares numéricos a partir das imagens. Reusar tema,
ampliar, exportar e tooltip do simulador; manter cor e estilo consistentes por
grandeza. Distinguir calculado/medido também por traço/marcador, não só cor.

| Família | Unidade interna / apresentação inicial |
|---|---|
| Tempo | minutos desde o início global da operação |
| Volume | bbl |
| Vazão | bbl/min (bpm) |
| Pressão | psi manométrico |
| Densidade / densidade equivalente | ppg, com nomes distintos |
| Profundidade | m MD por padrão; conversão m/ft explícita; TVD disponível no tooltip |
| Reynolds generalizado | adimensional, identificado pela correlação |

Escalas contínuas numéricas; profundidade crescente para baixo. Uma escala por
família física: duas vazões compartilham escala; pressão e densidade não. Reservar
espaço para títulos dos eixos; em tela estreita usar painéis alinhados com X e
cursor comuns, preservando as séries. Legenda permite ocultar séries, informa
unidades e origem. Séries descontínuas usam patamares/quebras; sem suavização que
invente extremos. `null` é lacuna, nunca zero. Dataset medido pode continuar além
do domínio calculado, mas sem preencher o trecho ausente do modelo.

Um cursor global `selectedTimeMin` controla gráficos e esquemático. Hover pode
ser transitório; clique/arraste seleciona o instante persistente. Perfis mostram
tempo, estágio, passo e volumes acumulados correspondentes. Não recomputar
hidráulica durante playback; conservar eventos exatos ao amostrar a exibição.

## 2. Dois modos de volume

```text
V_total(t) = ∫[0,t] Q_bomba(u) du
V_pasta(t) = ∫[0,t] Q_bomba(u) · I(fluido_bombeado.kind = cement) du
```

São acumulados de entrada na cabeça, não volume anular, preparado ou retornado.
Pausas não aumentam nenhum deles. Lavador, espaçador, lama e deslocamento aumentam
somente o total. Não zerar acumulados na mudança de estágio. Extras de cimento
explicitamente bombeados entram em ambos; reserva apenas preparada não entra.

Oferecer seletor **Volume total bombeado (bbl)** / **Volume de pasta bombeada
(bbl)**, persistido no cenário. Vale para a curva de volume de G1, X de G2 e
anotação/navegação por volume de G3/G5; gráficos temporais mantêm tempo no X.
Não deixar apenas “Slurry Volume” quando total estiver selecionado.

Volume de pasta fica constante durante outros fluidos e ambos ficam constantes
em pausas. Portanto volume→tempo não é função unívoca. Preservar todos os pontos
na ordem temporal, inclusive X repetido; não agrupar por volume nem ordenar
novamente por Y. Ao buscar um volume de patamar, oferecer os instantes/eventos
correspondentes, mantendo o mais próximo do cursor como seleção inicial. Tooltip
sempre inclui tempo e ambos os volumes; não alegar sincronização apenas pelo X.

## 3. G1 — retorno, volume e pressão no tempo

Referência: primeiro anexo, `Ret Rate`, `Calc Ret Rate`, `Slurry Volume`, `Pressure`.

| Eixo | Séries |
|---|---|
| X: tempo decorrido (min) | Instante global |
| Y vazão (bpm) | Retorno calculado; retorno medido quando importado |
| Y volume (bbl) | Acumulado calculado conforme seletor total/pasta; medido somente se canal correspondente estiver disponível |
| Y pressão (psi) | Pressão de bombeio calculada; medida no mesmo ponto de referência quando disponível |

Retorno calculado usa `returnRateBpm`, não `pumpRateBpm`. Diferenças por queda
livre só aparecem quando resolvidas pelo modelo conservativo. Na ausência de
medição, a série medida fica indisponível, sem copiar a calculada. Identificar
ponto do sensor e datum: pressão de linha antes de perdas de superfície não é
automaticamente a pressão na cabeça modelada; se diferentes, sinalizar comparação
de pontos distintos. Nenhuma correção oculta é aplicada.

## 4. G2 — ECD por volume em referências de profundidade

Referência: segundo anexo, ECD na sapata e em profundidades adicionais.

X é o volume selecionado em §2. Y compartilhado em ppg representa `ECD(z,t)` nas
referências escolhidas. Criar referência inicial na sapata do alvo e permitir
adicionar/remover referências com nome e MD, inclusive saídas dos estágios. Não
copiar valores “3000/3250” nem assumir sua unidade. Converter MD→TVD pelo survey.

```text
ECD(z,t)[ppg] = P_anular(z,t)[psi] / (0.17060368 · TVD(z)[m])
```

Inclui a contrapressão no retorno conforme SPEC principal. TVD zero, referência
fora da geometria ou pressão não resolvida → `null` com motivo. Referência válida
em ramo estático recebe ECD a partir da pressão estática conectada; referência
isolada sem pressão conhecida não recebe ECD do circuito ativo por cópia.

Mostrar nome, MD/TVD, estágio, tempo e volume no tooltip. Referências compartilham
a mesma escala ppg; eixos duplicados por lado são dispensáveis. Curva medida só
aparece com profundidade, datum e canal compatíveis declarados; não transformar
pressão de superfície medida em ECD de fundo por suposição.

## 5. G3 — Reynolds generalizado por profundidade

Referência: terceiro anexo, perfil calculado e limites de regime em um snapshot.
X é o Reynolds generalizado da correlação; Y é MD. Seletor de caminho **anular** (padrão) / **interno**.
Representar cada segmento/fluido do instante selecionado, incluindo os limites
das correlações usadas no mesmo segmento.

```text
Tubo:   Re = ρ·v^(2−n)·ID^n / (8^(n−1)·k·((3n+1)/4n)^n)
Anular: Re = ρ·v^(2−n)·(D_externo−OD)^n / (12^(n−1)·k·((2n+1)/3n)^n)
Limites: fim do laminar 3250 − 1150n; fim da transição 4150 − 1150n
```

**[REVISTO 2026-09-23]** É o Reynolds generalizado de R3 §4-6, a correlação da
primária desde a revisão de §7.3 da SPEC principal (`r3-guillot-4-6`), com a
geometria efetiva e a vazão real da rota — em queda livre, a vazão na saída, não
a da bomba. Os limites dependem do `n` de cada fluido e vêm do perfil calculado
(`maxLaminarRe`, `minTurbulentRe`); não usar 400/6000 do Petroguia nem 2000/3000
das imagens. Identificar limites como pertencentes à correlação, não universais. Fricção e classificação
devem usar o mesmo `correlationId/version` e critérios de fronteira; não manter
números independentes no componente visual.

Trecho estático conhecido tem Q=0 e Re=0 por convenção de repouso, sem avaliar
expressão singular. Volume vazio, geometria/reologia sem domínio ou vazão não
resolvida → `null`, sem desenhar fluido fictício. Tooltip: fluido, caminho,
MD/TVD, Q, diâmetros, n/k, Re e classificação. Usar autoscale incluindo as linhas
de referência; exportação preserva unidades e o instante escolhido.

## 6. G4 — pressão, densidade e vazões no tempo

Referência: quarto anexo, pressão, densidade, vazão bombeada e retorno calculado.

| Eixo | Séries |
|---|---|
| X: tempo (min) | Tempo global com eventos/pausas |
| Y pressão (psi) | Pressão de bombeio calculada e pressão medida compatível |
| Y densidade (ppg) | Densidade do fluido na entrada; medida quando disponível |
| Y vazão (bpm) | Vazão de bombeio programada, retorno calculado; bombeio e retorno medidos quando disponíveis |

Densidade é a do fluido efetivamente bombeado, inclusive lama, lavador e
deslocamento; não chamar todas as fases de “densidade da pasta”. Em pausa sem
entrada, a densidade de entrada calculada é `null`; o fluido que permanece no
poço continua no perfil G5. Densidade medida parada é apresentada como medição
no sensor, não como entrada de massa. Separar programa planejado de qualquer
vazão calculada indisponível após interrupção do modelo.

## 7. G5 — densidade, ECD e janela por profundidade

Referência: quinto anexo, `Density`, `Pore Den`, `ECD`, `Frac Den` em um snapshot.
X em ppg; Y em MD, crescente para baixo. Exibir quatro séries identificadas:

- Densidade local do fluido no anular, `rho(z,t)`.
- Gradiente equivalente de poro, `P_poro(z)/(K·TVD(z))`.
- ECD no anular, `P_anular(z,t)/(K·TVD(z))`.
- Gradiente equivalente de fratura, `P_fratura(z)/(K·TVD(z))`.

Se a janela já foi informada em ppg equivalentes, usar diretamente esses valores,
sem integrá-los novamente. Densidade local não é a média integrada de pressão
representada por ECD. Densidade conhecida em trecho isolado pode aparecer mesmo
quando sua pressão/ECD é desconhecida. Janela só onde há formação exposta;
atrás de revestimento anterior usar lacunas, não janela extrapolada. TVD=0 torna
densidades equivalentes calculadas por divisão indisponíveis.

Colorir excedências sem remover resultados, preservando os valores reais.
Tooltip informa fluido, MD/TVD, pressão, densidade, ECD e margens. Cabeçalho inclui
tempo, estágio e volume selecionado; usuário pode alternar volume sem mudar o
instante. Perfis medidos exigem dados em profundidade no instante compatível;
não desenhar perfil completo a partir de um sensor isolado.

## 8. Importação de medições

**[PROPOSTO]** CSV como formato inicial de medições; JSON versionado para cenário
completo. Não exigir Excel nem integração de telemetria para esta entrega.
Fluxo: selecionar arquivo → mapear colunas e unidades → prévia/validação →
alinhar tempo → incorporar dataset ao cenário. Cancelar/falhar mantém os dados
anteriores. Permitir vários datasets nomeados e remover um sem mudar o programa.

Aceitar separador vírgula/ponto e vírgula/tabulação, cabeçalho, aspas e decimal
configurável; não interpretar vírgula decimal como separador de coluna. Detectar
como sugestão e mostrar prévia antes de incorporar. Datas ambíguas exigem formato
explícito. Dados de texto são texto, nunca HTML ou fórmulas executáveis.

| Campo normalizado | Regra |
|---|---|
| `timeMin` | Obrigatório por linha: tempo relativo em s/min/h ou timestamp com fuso explicitamente informado |
| `pumpRateBpm`, `returnRateBpm` | Opcionais; converter bpm, L/min ou m³/min |
| `pumpPressurePsi` | Opcional; converter psi, bar ou MPa e informar referência manométrica; absoluta exige pressão atmosférica declarada para conversão |
| `inletDensityPpg` | Opcional; converter ppg, kg/m³ ou g/cm³ |
| `totalPumpedBbl`, `cementPumpedBbl` | Opcionais, acumulados com origem/reset declarados; converter bbl, L ou m³ |
| Referências adicionais | ECD em ppg ou pressão em profundidade exigem ID do ponto, MD/unidade e datum; perfis exigem tempo + MD por amostra |

Mínimo útil: tempo e um canal. Canal ausente não invalida os demais. Guardar
campos normalizados e metadados de mapeamento, unidades originais, nome do arquivo,
importação, origem da operação e ponto dos sensores. Preservar número de linha,
valor original inválido e motivo para diagnóstico; não converter vazio em zero.

Valores não finitos, unidades incompatíveis e linhas sem tempo são erros; oferecer
correção do mapeamento ou descarte explícito das linhas listadas. Não imputar nem
ordenar silenciosamente timestamps. Para amostras fora de ordem, oferecer ordenação
estável na prévia. Duplicatas de tempo podem representar degrau; preservar ordem
e descontinuidades. Vazões negativas ou resets de acumulados exigem tratamento
de convenção/evento explícito, sem aplicar módulo ou limitar a zero.

Limites iniciais **propostos**, configuráveis e validados no front/integração:
10 MiB por cenário serializado e 100.000 amostras medidas no total. Verificar também
limite efetivo do gateway/backend antes de liberar P10; LONGTEXT não garante limite
HTTP. Excedência orienta recortar arquivo antes de incorporar, sem truncar dados
silenciosamente. Redução de pontos é apenas visual, preservando picos/eventos;
exportação e cálculos de comparação usam dados completos aceitos.

### 8.1 Alinhamento temporal e por volume

```text
t_cenario = (timestamp_amostra - timestamp_origem) / 60 s + offsetMin
// ou t_cenario = tempo_relativo_convertido_min + offsetMin
```

Usuário escolhe origem e offset, opcionalmente alinhando um evento conhecido a
um evento do programa. Mostrar transformação e guardar no dataset. Não alinhar
curvas automaticamente para minimizar erro. Conversão para tempo comum não
altera amostras nem programa; estágio vem dos intervalos do programa, não da
ordem das linhas. Medições antes/depois do programa permanecem identificadas.

Para comparação em X volume, preferir o acumulado medido do mesmo tipo. Sem ele,
permitir associar o ponto medido ao volume **calculado no tempo alinhado**, com
essa origem explícita no eixo/tooltip. Não apresentar esse X como volume medido.
Integração de vazão medida, quando selecionada, usa trapézios em trechos válidos,
exige origem de volume declarada e não atravessa lacunas. Volume de pasta derivado
exige também classificação real dos fluidos/intervalos; não usar automaticamente
o programa como se identificasse o fluido medido.

### 8.2 Comparação e lacunas

Comparar canais de mesma grandeza/ponto/unidade. Exibir calculado e medido com
legenda, origem, timestamp e valor, permitindo ambos ou cada um separadamente.
Não calibrar propriedades, alterar bomba nem inferir perdas a partir da diferença.
`retorno_medido != retorno_calculado` é discrepância, não diagnóstico de perda.

Para valores residuais, amostrar o calculado no tempo medido somente dentro do
domínio válido, respeitando eventos. Não extrapolar nem interpolar através de
parada, troca de dispositivo ou `outside-model`. Lacunas explícitas permanecem;
para intervalo longo sem amostras, usar limite de interpolação informado no
dataset (sugestão inicial: três vezes a mediana dos intervalos positivos).
Guardar o limite escolhido. Diferença `medido - calculado` é opcional no detalhe;
não produzir percentual quando referência é zero, nem índice de qualidade sem
definição aprovada. Dados sem sobreposição temporal são exibidos com aviso.

### 8.3 Contrato e persistência

```ts
interface PrimaryMeasuredDataset {
  id: string; schemaVersion: number; name: string; importedAt: string;
  sourceFileName: string;
  mapping: Record<string, { column: string; originalUnit: string }>;
  alignment: { originTimestamp?: string; timezone?: string; offsetMin: number };
  maxInterpolationGapMin: number;
  channels: { id: string; quantity: string; unit: string;
    location: string; referenceMD?: number; datum?: string }[];
  samples: { sourceRow: number; timeMin: number; md?: number;
    values: Record<string, number | null> }[];
  importDiagnostics: { sourceRow: number; field: string; rawValue: string;
    reason: string; resolution: string }[];
}
```

`timeMin` das amostras é relativo à origem antes do offset, aplicado só na
apresentação/comparação. Nunca aplicar offset duas vezes ao recarregar. Unidades
de `channels` são canônicas; `mapping` preserva unidades originais. Consolidar
discriminantes e proveniência dos volumes em P1, evitando strings ambíguas no
motor. Persistir dataset e alinhamento no cenário pela API, conforme §9 da SPEC
principal; não apenas caminho local para o CSV. Reabrir em outro computador
recupera os dados normalizados. Exportar JSON inclui esse mesmo conteúdo.

## 9. Aceitação dos gráficos e medições

| Caso | Resultado esperado |
|---|---|
| 10 bbl de espaçador + 20 de pasta + 30 de deslocamento | Total 60 bbl; pasta 20 bbl; patamar de pasta durante deslocamento |
| Pausa com mesmo volume e ECD diferente | Preservar ambos os instantes em G2 e permitir seleção sem eliminar X repetido |
| Referência MD em poço desviado | Perfil desenhado por MD; ECD usa TVD correspondente, sem trocar as grandezas |
| Mudança de estágio | Perfil acompanha porta/caminho ativo; referências isoladas não herdam pressão fictícia |
| Perfil de Reynolds | Mesmos valores/limites do motor; em repouso Re=0; sem fluido/reologia resolvida é lacuna |
| Densidade 16 ppg local sobre coluna de outro fluido | G5 mantém rho local distinto da densidade equivalente integrada |
| CSV em segundos/bar e retorno em L/min | Conversões conferidas independentemente; valores originais rastreáveis |
| Offset +5 min em amostra t=2 min | Ponto aparece em t=7 min antes/depois de salvar, sem aplicação duplicada |
| Medição sem volume acumulado | X por volume calculado explicitamente identificado ou série indisponível |
| Arquivo parcial/duplicatas/lacunas | Prévia lista problemas; nenhum zero ou preenchimento silencioso |
| Falta de medição | Curvas calculadas utilizáveis; sem falsa medição por cópia |
| Exportar/reabrir cenário | Mesmos dados, unidades, alinhamento, referências e seleção de volume |
| Print/exportação e tela estreita | Todos os eixos/legendas legíveis; distinção medido/calculado preservada |

Os gráficos complementam a matriz física da SPEC principal; aparência parecida
com as imagens não valida as equações ou o transporte.
