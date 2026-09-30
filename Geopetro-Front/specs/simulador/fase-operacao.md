# Fase de trabalho — regra comum aos simuladores

> SPEC de feature · 2026-09-19 · **Implementada; aceites manuais pendentes.**
> Evidências: [Validação R2](r2-validacao.md).
>
> Complementa [Geometria de poço](geometria-poco.md) e integra a revisão
> [Cimentação primária no padrão do squeeze](cimentacao-primaria-padrao-squeeze.md).

## 1. Decisão do usuário e alcance

**[DECIDIDO 2026-09-19]** Em **todo simulador**, o usuário primeiro cadastra as fases do poço, depois seleciona a fase em que a operação vai trabalhar. O simulador calcula em função dessa fase selecionada.

**[DECIDIDO]** A regra se aplica aos três simuladores atuais: **squeeze, tampão balanceado e cimentação primária**. Também deve orientar novos simuladores que utilizem a estrutura do poço. A seleção é da fase cadastrada, não do tipo de operação nem da etapa de bombeio.

**[DECIDIDO 2026-09-19 — entrevista, 1A/2A/3A]** O usuário confirmou:

| Pergunta | Decisão |
|---|---|
| 1 — Intervalo de squeeze/tampão | Deve ficar inteiramente dentro da fase selecionada; bloquear intervalos fora dela |
| 2 — Revestimento/liner da primária | Diâmetros e sapata vêm do cadastro da fase; alterações são feitas nesse cadastro, sem substituições independentes no cenário |
| 3 — Troca de fase | Preservar os dados da operação e apontar incompatibilidades para correção; não reajustar os dados preenchidos automaticamente |

**[PROPOSTO]** Os detalhes abaixo definem o contrato de implementação dessa decisão. As fórmulas físicas existentes continuam vigentes; muda a seleção explícita do contexto geométrico enviado a cada cálculo.

## 2. Base existente e lacuna

**[FATO]** [WellPhase](../../src/app/features/simulador/models/well-geometry.model.ts) já possui `id`, nome, tipo, limites MD/TVD, diâmetro do furo, revestimento e sapata. [WellStructureFormComponent](../../src/app/features/simulador/components/well/well-structure-form.component.ts) permite cadastrar as fases, e [PocoGeometry](../../src/app/features/simulador/models/poco.model.ts) mantém a estrutura completa do poço.

**[FATO]** As páginas de [squeeze](../../src/app/features/simulador/pages/simulador-squeeze/simulador-squeeze.component.ts), [tampão](../../src/app/features/simulador/pages/simulador-tampao/simulador-tampao.component.ts) e [primária](../../src/app/features/simulador/pages/simulador-primaria/simulador-primaria.component.ts) não oferecem o contrato comum de uma fase de trabalho explicitamente selecionada e persistida. Na primária, o [adaptador da operação](../../src/app/features/simulador/models/primary-operation.form.ts) monta o alvo a partir de campos próprios e identifica fase por profundidade, inclusive com fallback para a última fase.

## 3. Fluxo obrigatório na interface

**[PROPOSTO — atende à decisão do usuário]** O fluxo será:

1. **Cadastrar/abrir o poço e suas fases**, mantendo a geometria completa disponível para edição.
2. **Selecionar a fase de trabalho** em um seletor comum dentro de Dados da operação, logo após o cadastro das fases.
3. **Configurar a operação nessa fase**, vendo dimensões e limites derivados dela.
4. **Calcular, conferir, salvar e gerar relatório** com a fase explicitamente identificada.

**[PROPOSTO]** Nome do campo: **Fase da operação**. Opções: nome, tipo, intervalo MD e identificação do revestimento quando houver, com as unidades escolhidas. Armazenar o ID estável da fase; nome e posição na lista não são chave. Mostrar a fase selecionada também no cabeçalho/resumo, inclusive com o painel recolhido.

**[PROPOSTO]** Novo cenário começa com “Selecione a fase da operação”, mesmo quando existir uma única fase. Exemplos podem preencher o cadastro e os dados, mas o usuário confirma a fase antes do cálculo. Não selecionar implicitamente a última fase, a mais profunda ou a primeira compatível.

**[PROPOSTO]** Sem fase válida, manter cadastro/edição e salvamento como rascunho disponíveis, com pendência clara. Não executar o cálculo nem apresentar resultado anterior como atual. A prévia do relatório pode mostrar entradas e pendências, sem números calculados válidos enquanto faltar a seleção.

**[PROPOSTO]** O seletor é único por cenário. Todos os cálculos, receitas dimensionadas, gráficos, esquemáticos e relatórios desse cenário usam a mesma seleção. A fase não é configuração global do poço: dois cenários do mesmo poço podem operar em fases diferentes.

## 4. Contexto geométrico do cálculo

**[PROPOSTO]** A seleção define **onde a operação ocorre** e **qual revestimento/trecho é o alvo**. O cadastro completo continua disponível. O contexto efetivo de cálculo deve conter a fase escolhida e os trechos/conexões anteriores necessários para representar o percurso da superfície até a operação e o retorno.

**[PROPOSTO]** Não substituir toda a geometria por uma linha isolada: isso apagaria o percurso superior, a trajetória e as capacidades necessárias. Também não usar fases posteriores para definir o diâmetro, revestimento mais interno ou fundo de uma operação em fase anterior. O serviço de geometria deve fornecer uma visão coerente do poço na fase escolhida, sem modificar o cadastro original.

| Aspecto | Regra proposta |
|---|---|
| Fase escolhida | Determina limites e dados geométricos de referência do alvo |
| Fases anteriores conectadas | Participam quando necessárias ao trajeto hidráulico, volumes de deslocamento, retorno e TVD |
| Fases posteriores | Permanecem cadastradas, mas não alteram o circuito da fase anterior selecionada; revestimentos posteriores não passam a ocupar esse circuito |
| Trajetória | Continua consultada pela geometria compartilhada para MD/TVD; selecionar fase não torna o poço vertical |
| Desenho | Destacar a fase ativa; distinguir estrutura completa e contexto usado pelo cálculo, sem representar fase posterior como trecho bombeado |
| Diâmetros e profundidades | Derivados da fase/geometria; edição estrutural ocorre no cadastro da fase, evitando cópias independentes no simulador |

**[PROPOSTO]** Centralizar a resolução em serviço/adaptador compartilhado, por exemplo `resolveOperationContext(geometry, selectedPhaseId, operation)`. O resultado deve identificar a fase, geometria efetiva e diagnósticos. `WellGeometryService` continua como fonte de fase, diâmetro, capacidade e MD/TVD. Cada motor recebe seu adaptador de operação; não duplicar a seleção em três componentes.

### 4.1 Aplicação por simulador

**[DECIDIDO 2026-09-19 — 1A]** No squeeze e no tampão, o intervalo-alvo da operação deve ficar inteiramente dentro dos limites da fase selecionada. Intervalo fora desses limites bloqueia o cálculo até correção. A restrição é sobre o intervalo-alvo, preservando o percurso superior conectado necessário ao bombeio e deslocamento.

**[DECIDIDO 2026-09-19 — 2A]** Na primária, ID/OD e sapata do revestimento/liner são derivados do cadastro da fase selecionada. Corrigir esses dados no cadastro; não oferecer valores diferentes para a mesma geometria no cenário. Campos específicos da operação, como colar, dispositivos, TOC e programa, permanecem no cenário.

| Simulador | Interpretação proposta da fase selecionada |
|---|---|
| Squeeze | Fase que contém o intervalo-alvo/canhoneados da operação. Validar o intervalo-alvo dentro da fase e obter capacidades/revestimento dela; percurso da coluna, posicionamento de fluidos e deslocamento podem envolver trechos superiores conectados |
| Tampão balanceado | Fase que contém o intervalo-alvo do tampão. Validar topo/base pretendidos dentro da fase e usar a geometria correspondente; preservar os trechos superiores necessários a deslocamento, coluna e circulação |
| Cimentação primária | Fase cujo revestimento/liner será cimentado. Derivar alvo, dimensões e sapata dos dados cadastrados; completar no contexto da operação colar, dispositivos, coluna de assentamento, TOC, intervalos e programa |

**[PROPOSTO]** Na primária, o revestimento da fase selecionada é o **alvo**, não deve ser tratado como revestimento anterior que forma a parede externa do próprio anular. Resolver furo da fase e revestimentos anteriores conforme as regras da primária. Se faltar informação do revestimento/liner da fase, solicitar complemento em Dados da operação/cadastro antes do cálculo; não usar dimensões da fase seguinte.

**[PROPOSTO]** O cimento da primária pode subir acima do topo do trecho perfurado da fase para os trechos anulares conectados previstos no programa. Não limitar o TOC artificialmente ao topo da linha da fase. Essa extensão não muda a fase-alvo. Liner e múltiplos estágios continuam pertencendo ao alvo selecionado.

**[PROPOSTO]** Fase do poço, estágio de cimentação e passo do programa são entidades diferentes. Selecionar a fase não escolhe automaticamente um estágio nem apaga os demais. Uma operação em outro alvo/fase usa outro cenário ou uma troca explícita da seleção, com revalidação.

## 5. Troca de fase e alteração do cadastro

**[DECIDIDO 2026-09-19 — 3A]** Trocar de fase preserva os dados preenchidos da operação e aponta incompatibilidades para correção pelo usuário.

**[PROPOSTO]** A troca pausa a reprodução, invalida resultados e documento calculado, atualiza somente as leituras derivadas do cadastro da nova fase e marca o cenário como alterado. Preservar intervalos informados, cliente, receitas, aditivos e demais parâmetros. Revalidar intervalos, canhoneados, TOC, dispositivos, referências e programa; apresentar os campos incompatíveis sem deslocá-los, truncá-los ou substituí-los silenciosamente.

**[PROPOSTO]** Renomear/reordenar fases mantém a seleção pelo ID. Alterar dimensões da fase escolhida ou de trecho anterior utilizado invalida os resultados. Excluir a fase selecionada torna a referência inválida e exige nova escolha; informar qual referência deixou de existir, sem escolher outra fase automaticamente.

**[PROPOSTO]** Trocar de poço exige nova seleção no poço de destino. Ao abrir cenário vinculado, resolver o ID contra a geometria atual e respeitar a versão/conflito já existente do poço. Fase removida ou incompatível permite abrir rascunho com pendência, mas impede usar resultados como atuais.

## 6. Persistência, relatório e migração

**[PROPOSTO]** Persistir `selectedPhaseId: string | null` no estado de operação de cada cenário (`formValue`), fora da geometria do poço e fora de `dadosRelatorio`. `scenarioPayload` deve preservá-lo ao remover a cópia geométrica de um cenário vinculado. Nenhuma seleção pertence ao cadastro global do poço.

**[PROPOSTO]** No contrato `PrimaryScenario`, a inclusão exige evolução de `schemaVersion` **1 → 2**, com migração explícita. Essa evolução se soma ao `exportVersion: 2` previsto na R2 do relatório. Migração física v1 → v2 preserva geometria, fluidos, receitas, aditivos, estágios, medições e apresentação e inicializa `selectedPhaseId: null`. A escolha do usuário é exigida antes de recalcular.

**[PROPOSTO]** Cenários antigos de squeeze/tampão também abrem sem fase selecionada, preservando seus dados; a ausência do campo é tratada como `null`. A UI pode mostrar sugestão baseada no intervalo existente, mas só confirma com ação do usuário. Não inferir uma fase e salvar a migração no banco ao abrir.

**[PROPOSTO]** Arquivos portáteis carregam o ID da fase junto da geometria snapshot, preservando a relação ao importar. Remapeamento de IDs, caso necessário, deve atualizar a referência de forma consistente. A importação não vincula automaticamente ao poço de origem. No banco, confirmar o round-trip de `selectedPhaseId` com e sem poço vinculado.

**[PROPOSTO]** Relatórios dos três simuladores incluem nome/tipo da fase, limites MD/TVD e identificação do revestimento/liner utilizado. Esse bloco é derivado do contexto do cálculo e não editável como texto técnico independente. Identificação do poço permanece separada da identificação da fase.

## 7. Entregas e aceitação

**[PROPOSTO]** Esta mudança autoriza evolução funcional dos três simuladores. Substitui, para esse escopo, a restrição anterior de manter squeeze/tampão intocados. Preservar seus cálculos para o mesmo contexto geométrico; qualquer diferença decorrente do novo contexto deve estar explicada e testada.

| Entrega | Critério de pronto |
|---|---|
| [x] F1 — Modelo e migração | Campo de seleção, codec da primária v2 e abertura dos cenários legados sem perda de dados |
| [x] F2 — Contexto compartilhado | Fase/estrutura efetiva resolvidas por ID, sem influência de fases posteriores e com percurso anterior preservado |
| [x] F3 — Interface nos três simuladores | Cadastro → seleção → configuração/cálculo; fase visível mesmo com painel recolhido |
| [x] F4 — Adaptadores de cálculo | Squeeze/tampão usam seus intervalos na fase; primária deriva o revestimento-alvo e anular correto |
| [x] F5 — Cenários e relatório | Seleção recuperada do banco/arquivo e identificada em todos os documentos |
| [ ] F6 — Validação integrada | Casos abaixo verificados e revisão visual registrada |

**[PROPOSTO]** Critérios de aceitação:

| ID | Caso | Resultado esperado |
|---|---|---|
| F-AC01 | Cadastrar três fases em qualquer simulador sem selecionar uma | Cadastro disponível; cálculo aguarda seleção explícita |
| F-AC02 | Selecionar a fase intermediária, tendo produção cadastrada depois | Alvo/contexto são da intermediária; produção não fornece diâmetro, revestimento ou fundo ao cálculo |
| F-AC03 | Alterar somente uma fase posterior válida | Resultado do contexto anterior permanece numericamente igual |
| F-AC04 | Alterar trecho superior que integra o circuito | Recalcular as grandezas afetadas, mantendo fase-alvo e sua identificação |
| F-AC05 | Renomear/reordenar a fase selecionada | Seleção preservada por ID e nome atualizado na tela/relatório |
| F-AC06 | Excluir a fase selecionada ou abrir vínculo cuja fase foi removida | Pendência explícita; sem fallback para outra fase nem resultado antigo vigente |
| F-AC07 | Trocar de fase com intervalo/programa incompatível | Reprodução parada e resultado invalidado; dados incompatíveis indicados para correção, sem ajuste silencioso |
| F-AC08 | Primária em revestimento ou liner, com TOC em trecho conectado superior | Alvo correto, anular exterior correto, estágios preservados e TOC não truncado ao topo da fase |
| F-AC09 | Salvar, reabrir e exportar/importar em cada simulador | Mesma fase selecionada, receitas/aditivos e demais entradas recuperados |
| F-AC10 | Abrir cenário legado | Dados preservados e fase pendente até escolha explícita; nenhuma gravação automática |
| F-AC11 | Gerar relatório com painel recolhido e unidade em pés | Fase identificada, unidades coerentes e mesma referência usada no cálculo |
| F-AC12 | Dois cenários do mesmo poço, cada um numa fase | Troca de cenário restaura sua seleção sem alterar o cadastro do poço nem o outro cenário |
| F-AC13 | Informar intervalo-alvo de squeeze/tampão atravessando o limite da fase selecionada | Cálculo bloqueado com indicação dos limites; não selecionar outra fase nem recortar o intervalo automaticamente |
| F-AC14 | Corrigir ID/OD ou sapata do revestimento da primária | Edição realizada no cadastro da fase; valores derivados atualizados na operação, sem cópia independente no cenário |

**[IMPLEMENTADO 2026-09-19]** Seleção e contexto conectados aos três simuladores, cenários e relatórios principais/auxiliares. Regressão automatizada executada; revisão visual, fluxo autenticado e aceite numérico permanecem pendentes. [Registro de validação R2](r2-validacao.md).
