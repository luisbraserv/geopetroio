# Faixas de Validação do Simulador — a preencher

> **[PENDENTE 2026-09-05]** · Resolve [OQ-009](../../../specs/open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador)
>
> **[DECIDIDO 2026-09-05]** As faixas serão **fornecidas pela equipe técnica**. Esta tabela existe para
> ser preenchida — sem os números, a validação não pode ser escrita.

## Por que isto é crítico

**[DECIDIDO 2026-09-05]** O relatório do simulador é **entregue ao cliente**
([product-context §6](../../../specs/product-context.md#6-simulador--o-relatório-é-entregável-ao-cliente)).

**[FATO]** Hoje existem ~40 campos numéricos de engenharia **sem nenhum `Validators`** — o único uso na
feature inteira é no `FormArray` de aditivos ([RN-041](../../../specs/business-rules.md#rn-041--aditivos-são-o-único-campo-validado-do-simulador)).
Um valor fisicamente impossível produz um relatório de aparência impecável, sem um único aviso, e esse
relatório sai da empresa.

## Como preencher

Para cada campo, um **mínimo** e um **máximo plausíveis** — não os limites do tipo numérico, e sim a
faixa que um poço real pode ter. Onde a resposta for "qualquer valor positivo", escreva isso.

Três níveis de severidade são possíveis por campo:

| Nível | Comportamento |
|---|---|
| **Impossível** | Bloqueia o cálculo. Ex.: diâmetro negativo, ID maior que OD |
| **Implausível** | Deixa calcular, mas avisa. Ex.: poço de 12.000 m — existe, mas quase certamente é erro de digitação |
| **Livre** | Sem faixa declarada |

---

## Geometria do poço

| Campo | Unidade | Mín | Máx | Observação |
|---|---|---|---|---|
| `sectionStartMD` / `sectionEndMD` | m | | | |
| `sectionStartTVD` / `sectionEndTVD` | m | | | TVD ≤ MD sempre |
| `wellFinalMD` / `wellFinalTVD` | m | | | |
| `caliper` | pol | | | Diâmetro do poço aberto |
| `casingOD` / `casingID` | pol | | | ID < OD |
| `tubingOD` / `tubingID` | pol | | | ID < OD; OD < casing ID |
| `topoCanhoneadoMD` / `baseCanhoneadoMD` | m | | | Base > topo |
| `topoCanhoneadoTVD` / `baseCanhoneadoTVD` | m | | | |
| `profundidadeReferenciaSqueezeMD` / `TVD` | m | | | |
| `standoffPct` | % | | | Provavelmente 0–100 |

## Densidades de fluido

| Campo | Unidade | Mín | Máx | Observação |
|---|---|---|---|---|
| `mudWeightFront` / `mudWeightBack` | ppg | | | |
| `completionWeight` | ppg | | | |
| `displacementWeight` | ppg | | | |
| `densidadeFluidoCompletacaoPpg` | ppg | | | |
| `densidadeFluidoDeslocamentoPpg` | ppg | | | |
| `densidadeAguaFrentePpg` / `densidadeAguaAtrasPpg` | ppg | | | |
| `densidadePastaPpg` | ppg | | | Pasta de cimento |
| `density` | ppg | | | |

## Gradientes e temperatura

| Campo | Unidade | Mín | Máx | Observação |
|---|---|---|---|---|
| `fracGrad` / `gradienteFraturaPpg` | ppg | | | Fratura > poro, sempre |
| `poreGrad` / `gradientePoroPpg` | ppg | | | |
| `geoGradient` | °F/100ft ou °C/100m | | | **Declarar a unidade** |
| `surfaceTemp` | °F ou °C | | | **Declarar a unidade** |

## Pressões

| Campo | Unidade | Mín | Máx | Observação |
|---|---|---|---|---|
| `surfacePressure` / `pressaoSuperficiePsi` | psi | | | |
| `squeezeTestPressure` | psi | | | |
| `pressaoOperacao` | psi | | | |
| `maxSurfacePressure` | psi | | | Limite do equipamento |

## Volumes

| Campo | Unidade | Mín | Máx | Observação |
|---|---|---|---|---|
| `volumePastaBbl` | bbl | | | |
| `volumeAguaFrenteBbl` / `volumeAguaAtrasBbl` | bbl | | | |
| `volumeDeslocamentoBbl` | bbl | | | |
| `volMaxInjetadoBbl` | bbl | | | |
| `backSpacerHeight` | m | | | |
| `expectedLoss` | bbl ou % | | | **Declarar a unidade** |

## Vazões e tempos

| Campo | Unidade | Mín | Máx | Observação |
|---|---|---|---|---|
| `pumpRate` / `vazaoBpm` | bpm | | | |
| `vazaoAguaFrenteBpm` / `vazaoPastaBpm` | bpm | | | |
| `vazaoAguaAtrasBpm` / `vazaoDeslocamentoBpm` | bpm | | | |
| `tempoPressurizacaoMin` | min | | | |
| `tempoPausaMin` | min | | | |

## Reologia e equipamento

| Campo | Unidade | Mín | Máx | Observação |
|---|---|---|---|---|
| θ600, θ300, θ200, θ100, θ6, θ3 | leitura Fann | | | Decrescentes entre si |
| `viscosidadeAguaCp` | cP | | | |
| `freeFallMaxFactor` | — | | | Fator adimensional |
| `motorHP` | HP | | | |
| `pumpEff` | % ou fração | | | **Declarar qual** |

---

## Regras entre campos

Estas não são faixas — são relações que o sistema pode verificar sozinho, e que valem independentemente
dos números que vierem:

| # | Regra | Nível |
|---|---|---|
| 1 | `casingID` < `casingOD`, `tubingID` < `tubingOD` | Impossível |
| 2 | `tubingOD` < `casingID` | Impossível |
| 3 | TVD ≤ MD, em qualquer profundidade | Impossível |
| 4 | Base do canhoneado > topo do canhoneado | Impossível |
| 5 | Gradiente de fratura > gradiente de poro | Implausível |
| 6 | θ600 ≥ θ300 ≥ θ200 ≥ θ100 ≥ θ6 ≥ θ3 | Implausível |
| 7 | Densidade da pasta > densidade do fluido de deslocamento | Implausível |
| 8 | Profundidade de referência do squeeze dentro do intervalo canhoneado | Implausível |

**[DECIDIDO 2026-09-05]** As regras 1 a 4 podem ser implementadas **antes** de as faixas chegarem — o
modelo já sabe verificá-las, e `WellGeometryIssue` (com `level: 'error' | 'warning'`) já existe para
reportá-las. Ver [geometria-poco.md §5](geometria-poco.md#5-validação--elevada-a-crítica).
