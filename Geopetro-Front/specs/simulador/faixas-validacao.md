# Faixas de Validação do Simulador — a preencher

> **[PENDENTE 2026-09-05]** · Resolve [OQ-009](../../../specs/SDD/negocio/requisitos/open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador)
>
> **[DECIDIDO 2026-09-05]** As faixas serão **fornecidas pela equipe técnica**. Esta tabela existe para
> ser preenchida — sem os números, as faixas quantitativas não podem ser escritas.
> As relações entre campos já implementadas estão registradas ao final deste documento.

## Por que isto é crítico

**[DECIDIDO 2026-09-05]** O relatório do simulador é **entregue ao cliente**
([product-context §6](../../../specs/SDD/negocio/requisitos/product-context.md#6-simulador--o-relatório-é-entregável-ao-cliente)).

**[FATO]** Hoje existem ~40 campos numéricos de engenharia **sem nenhum `Validators`** — o único uso na
feature inteira é no `FormArray` de aditivos ([RN-041](../../../specs/SDD/negocio/regras/business-rules.md#rn-041--aditivos-são-o-único-campo-validado-do-simulador)).
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

## Entrega de relações entre campos — 2026-09-06

**[FATO — diagnóstico]** As regras 1 a 4 já estão cobertas pelo serviço de geometria
e pelo bloqueio de cálculo/relatório nas duas páginas. O diagnóstico inicial de
ausência de validação acima corresponde ao levantamento anterior a essas entregas.

**[INFERÊNCIA — aplicação do contrato acima]** Esta etapa cobre as regras 5 a 8
como avisos, sem bloquear cálculo ou exportação e sem alterar os valores digitados:

- Fratura menor ou igual ao poro gera aviso nas duas operações.
- Leituras Fann devem ser não crescentes conforme a rotação diminui. A tela atual
  oferece θ300, θ200, θ100, θ60, θ30, θ20, θ10, θ6 e θ3; θ600 é verificado quando
  fornecido ao validador, sem introduzir um campo que o motor não consome.
- Compara-se a densidade efetivamente calculada da pasta com a densidade de
  deslocamento usada na operação; igualdade também gera aviso.
- No squeeze, verifica-se a referência MD efetivamente usada na hidráulica.
  Com vários canhoneados, o ponto deve pertencer a pelo menos um deles, incluindo
  seus extremos. Um ponto em um espaço entre canhoneados gera aviso.
- Campos ausentes, vazios ou não finitos não participam dessas comparações.
  A obrigatoriedade e as faixas individuais continuam uma etapa separada.
- Avisos são atualizados ao simular/carregar cenário e removidos ao corrigir os
  dados ou invalidar a geometria. São apresentados em um bloco de atenção nas
  duas páginas; esta entrega não acrescenta seção de avisos ao relatório exportado.

**[FATO 2026-09-06 — implementado no working tree]** O validador puro
`services/engineering-validation.ts` aplica as quatro relações. As páginas usam
o resultado atual de densidade da pasta e, no squeeze, a referência da simulação
hidráulica. O bloco de atenção aparece acima das abas e mantém os dados digitados.

**Verificação:** 19 casos novos (14 do validador e cinco de integração nas páginas),
incluindo igualdade, rotações intermediárias, campos vazios/não finitos, limites e
espaços entre canhoneados, abertura do relatório, recuperação ao carregar cenário e
remoção de avisos antigos após erro geométrico. A suíte completa do frontend passou:
**299 testes em 32 arquivos**. Build de produção aprovado, mantendo os avisos de
tamanho do bundle inicial e dos estilos das duas páginas.
