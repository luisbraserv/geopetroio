# Geometria de Poço e Trajetória — Simulador

> Spec de feature · **[DECIDIDO 2026-09-05]** · Trabalho **em curso, não commitado**
>
> Specs de sistema em [`../../../specs/`](../../../specs/) · contexto de produto em
> [`product-context.md`](../../../specs/product-context.md)

## 1. Estado

**[FATO 2026-09-05]** Existe no *working tree*, sem commit:

| Arquivo | Papel |
|---|---|
| `models/well-geometry.model.ts` | Modelo da estrutura física do poço |
| `models/well-geometry.form.ts` | Formulário reativo da estrutura |
| `services/well-geometry.service.ts` | Fonte única de fase, diâmetro, MD↔TVD e capacidade |
| `components/well/well-schematic.component.ts` | Desenho do poço |
| `components/well/well-structure-form.component.ts` | Edição das fases |
| `components/charts/pressure-depth-config.ts` | Configuração do gráfico pressão × profundidade |

**[FATO]** O desenho arquitetural está declarado no próprio modelo e é bom: *"a operação (tampão/
squeeze) NÃO define a geometria. Ela é posicionada dentro dela por um `OperationInterval`"*. Toda
pergunta sobre fase, diâmetro ou conversão passa pelo `WellGeometryService`, e nenhum service de
cálculo reimplementa isso.

`LegacySectionFields` já prevê a migração dos cenários de seção única.

## 2. A decisão que o modelo atual não comporta

**[DECIDIDO 2026-09-05]** A trajetória direcional é necessária, e as **estações são digitadas** pelo
engenheiro (MD, inclinação, azimute). Importação de arquivo do cliente fica fora de escopo.

**[FATO]** O modelo em curso não suporta isso. `WellPhase` guarda quatro números por fase —
`topMD`, `bottomMD`, `topTVD`, `bottomTVD` — e `WellGeometryService.mdToTvd` interpola **linearmente
dentro da fase**:

```ts
const ratio = (phase.bottomTVD - phase.topTVD) / mdLength;
return phase.topTVD + (md - phase.topMD) * ratio;
```

Isso equivale a tratar cada fase como um trecho de inclinação constante. Num poço com *build-up* ou
*drop-off* dentro da fase, o TVD calculado no meio do trecho **erra** — e o erro entra silenciosamente
em tudo que depende de TVD: pressão hidrostática, ECD, gradientes de fratura e poro, e o eixo do
gráfico pressão × profundidade.

⚠️ **O TVD por fase é hoje um dado de entrada digitado.** Com survey, ele passa a ser **derivado**.
Manter os dois é convidar a divergência entre o que o engenheiro digitou e o que a trajetória calcula.

## 3. Modelo alvo

**[PENDENTE — proposta]**

```ts
interface SurveyStation {
  md: number;
  inclinationDeg: number;   // 0 = vertical
  azimuthDeg: number;
}

interface WellTrajectory {
  stations: SurveyStation[];   // ordenadas por MD, começando em 0
}
```

- `WellGeometry` ganha `trajectory?: WellTrajectory`.
- `WellPhase.topTVD` / `bottomTVD` **deixam de ser entrada** e passam a ser derivados — mantidos no
  tipo apenas enquanto durar a compatibilidade.
- `mdToTvd` / `tvdToMd` passam a consultar a trajetória. **A assinatura pública não muda** — é o ganho
  concreto de a conversão já estar centralizada no service.

**Método de cálculo [DECIDIDO 2026-09-05]: mínima curvatura.** Padrão da indústria e o que se espera
declarado num relatório entregue ao cliente — provavelmente impresso no próprio relatório.

**Unidade de profundidade [DECIDIDO 2026-09-05]:** a tela oferece **metros e pés**; o armazenamento é
**sempre em metros**, com conversão apenas na exibição. É a mesma decisão que o Horus tomou para
PSI/kgf-cm² — se a unidade escolhida chegasse ao arquivo, o mesmo campo significaria coisas diferentes
conforme a configuração vigente no dia. Ver [RN-066](../../../specs/business-rules.md#rn-066--mínima-curvatura-e-profundidade-gravada-em-metros).

**Sem trajetória, o comportamento atual continua valendo** — poço vertical ou aproximação por fase.
Isso preserva os cenários existentes e permite entregar a estrutura antes do survey.

## 4. Poço vira entidade

**[DECIDIDO 2026-09-05]** O mesmo poço volta em vários cenários (squeeze, tampão, revisões), e
redigitar a geometria a cada vez produz divergência entre cenários que descrevem a mesma realidade
física. `Poço` passa a ser **entidade do sistema**
([product-context §7](../../../specs/product-context.md#7-poço-passa-a-existir-no-modelo)).

**Consequência para esta feature:** geometria e trajetória **deixam de viver dentro do `formValue`
opaco do cenário** e passam a pertencer ao poço, referenciado pelo cenário.

⚠️ **[FATO]** Hoje o backend do simulador é **agnóstico de domínio** — persiste `formValue` como
`LONGTEXT` e nada mais ([domain-map §4](../../../specs/domain-map.md#4-domínio-de-cimentação)). Tirar
a geometria de dentro do blob é a primeira vez que o backend do simulador passa a conhecer o domínio.
É mudança de arquitetura, não acréscimo de campo.

✅ **[DECIDIDO 2026-09-05] O cenário referencia o poço por id.** Corrigir a geometria corrige **todos**
os cenários daquele poço de uma vez.

**Consequência aceita:** editar a geometria **muda relatórios antigos**, inclusive já entregues. É
coerente com a decisão de não congelar relatório
([product-context §6](../../../specs/product-context.md#6-simulador--o-relatório-é-entregável-ao-cliente)):
o sistema mostra a realidade como se sabe hoje, não como se sabia no dia da entrega. Ver
[RN-067](../../../specs/business-rules.md#rn-067--o-cenário-referencia-o-poço).

## 5. Validação — elevada a crítica

**[DECIDIDO 2026-09-05]** O relatório do simulador é **entregue ao cliente**. Isso muda a severidade de
[OQ-009](../../../specs/open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador)
e de [DT-014](../../../specs/technical-debt.md#dt-014--simulador-sem-validação-de-entrada).

**[FATO]** `WellGeometryIssue` (`level: 'error' | 'warning'`, com `code` e `phaseId`) já existe no
modelo novo — a estrutura para reportar problema de geometria está pronta. Ela cobre **coerência**
(sobreposição de fases, sapata fora do trecho, revestimento maior que o poço).

⚠️ **Coerência não é plausibilidade.** Uma geometria internamente consistente pode ter um poço de 200"
de diâmetro ou um gradiente de fratura impossível. As faixas plausíveis por campo continuam sem
definição, e são conhecimento de engenharia que só a equipe técnica tem.

## 6. Pontos em aberto

✅ **Resolvidos em 2026-09-05:** método de cálculo (**mínima curvatura**), vínculo cenário↔poço
(**referencia por id**), unidade de profundidade (**metros e pés na tela, metros no armazenamento**) e
migração do legado (**cenários antigos abrem como estão**, sem conversão forçada — `LegacySectionFields`
permanece).

| # | Questão que continua aberta |
|---|---|
| 1 | Faixas plausíveis por campo — [OQ-009](../../../specs/open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador) |
| 2 | O TVD digitado dos cenários legados: permanece como aproximação para sempre, ou em algum momento vira estação de survey? |
| 3 | O relatório deve declarar o método de cálculo e a unidade usada? Provável que sim, já que sai da empresa |

## 7. Ordem sugerida

1. Fechar a estrutura de fases (o que está em curso) e **commitar** — o risco de OneDrive sobre
   trabalho não versionado é real ([DT-004](../../../specs/technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git))
2. Trajetória como estrutura opcional, com `mdToTvd` passando a consultá-la
3. Entidade Poço no backend, com a geometria migrando para fora do `formValue`
4. Validação de plausibilidade, quando as faixas forem definidas

## 8. Primeira entrega — coerência da geometria e bloqueio do cálculo

**[DECIDIDO 2026-09-05]** Aplicar as regras de coerência já autorizadas em
[`faixas-validacao.md`](faixas-validacao.md), preservando o caminho dos cenários legados.

**[INFERÊNCIA] Critérios técnicos derivados dessas regras:**

- Campos geométricos obrigatórios vazios, negativos ou não finitos devem produzir erro;
  vazio não significa profundidade zero. Zero explícito é válido na superfície.
- Revestimento parcialmente preenchido deve produzir erro, sem transformar a fase em poço aberto.
- MD e TVD devem ser contínuos entre fases; a variação de TVD não pode superar a de MD.
  O fundo declarado deve concordar com a última fase quando ela alcançar o MD final.
- Capacidade em um MD exato usa a fase mais rasa na fronteira, inclusive na sapata,
  e continua definida no fundo do poço; não consulta um ponto artificialmente mais profundo.
- Erro de estrutura, intervalo ou canhoneado interrompe a simulação e invalida os resultados
  anteriores e relatórios. Corrigir a entrada permite recalcular.
- Os cenários legados válidos continuam abrindo, inclusive revestimentos sem sapata explícita.

Esta entrega não define faixas de plausibilidade nem introduz survey ou a entidade Poço.

### Estado da implementação — 2026-09-05

**[FATO]** Critérios acima implementados no mapper, no serviço de geometria e nas páginas
de tampão e squeeze. Erros aparecem também no topo das páginas; resultados anteriores
são limpos e relatórios revalidam o formulário antes de abrir. A geração com captura
assíncrona de gráficos é cancelada se o formulário mudar durante a captura.

**Validação executada:**

- `npm.cmd test -- --watch=false --include="src/app/features/simulador/**/*.spec.ts"`:
  152 testes aprovados e 5 falhas, em 14 arquivos. Os testes de geometria, mapper,
  integração das páginas e cálculo do tampão passaram.
- As 5 falhas ficam em arquivos não alterados nesta entrega: 4 em
  `cement-slurry-recipe.service.spec.ts` (rendimento, conversão de volume, rendimento
  ausente e escala do sal) e 1 em `squeeze-schematics.component.spec.ts` (base do cimento:
  esperado 1430 m, obtido 1500 m). A suíte completa ainda não está aprovada.
- `npm.cmd run build`: aprovado, com avisos de orçamento do bundle inicial
  (506,96 kB / 500 kB) e dos estilos de tampão e squeeze (13,61 e 14,06 kB / 8 kB).

**Pendência identificada nesta entrega:** integrar os cálculos de squeeze que ainda
consomem uma capacidade única aos trechos de geometria. Avanço registrado na seção 9.

## 9. Segunda entrega — volumes e topos do squeeze por fase

**[FATO 2026-09-05]** Implementado:

- `SqueezeCalculoService` recebe contexto opcional de poço e intervalo. Com contexto,
  volumes são somados por trecho e os quatro topos do cimento são calculados a partir
  da base da operação, atravessando mudanças de fase e sapatas. Sem contexto, permanece
  o caminho de seção única.
- Volume manual segue o mesmo cálculo por trechos. Espaçador da frente, distribuição
  do cimento entre coluna e anular e redistribuição do deslocamento após retirada
  também consomem a geometria cadastrada. As capacidades escalares retornadas são
  referências na base, não capacidades equivalentes para todo o poço.
- O cálculo estático de pressão consulta o TVD de cada fase nos topos dos fluidos
  e no canhoneado mais profundo.
- A página passa o contexto tanto à simulação quanto à receita manual. Esquemáticos
  usam os topos e volumes calculados. Relatórios de retirada e circulação reversa
  usam o topo sem coluna da geometria selecionada, ancorado na base da operação.
- Corrigida a expectativa antiga do teste do esquemático: referência de pressão no
  canhoneado não define a base física do cimento.

**Validação:** suíte do simulador com 166 testes aprovados e 4 falhas em 15 arquivos.
As 4 falhas continuam em `cement-slurry-recipe.service.spec.ts`, sem alteração nesta
entrega. Cobertura nova inclui soma de volumes, quatro estados do cimento, volume
manual, espaçador atravessando a sapata, conservação de volume, TVD por fase,
esquemáticos e integração da página com relatórios. Build de produção aprovado,
com os mesmos avisos de tamanho registrados na seção 8.

**Pendência identificada nesta entrega (tratada na seção 10):** o motor temporal `SqueezeHydraulicSimulationService` e suas
varreduras de conformidade ainda usam capacidade anular única e conversão de seção.
BHP/ECD, fricção e deslocamento dos fluidos durante o bombeio ainda precisam consumir
os trechos; esta entrega não conclui a hidráulica multifásica. A regra existente de
altura dos espaçadores pela razão de densidades também foi preservada.
Survey, unidades de exibição e entidade Poço seguem nas etapas posteriores.

## 10. Terceira entrega — hidráulica por trechos

**[FATO 2026-09-05]** O motor temporal recebe contexto opcional de poço e intervalo.
Squeeze, tampão e suas varreduras de sensibilidade passam esse contexto. Chamadas sem
contexto mantêm o caminho de seção única.

- Distribuição dos fluidos conserva volume em MD, com capacidades por trecho.
  A coluna é preenchida de cima para baixo, o anular de baixo para cima; o retorno
  só recebe o fluido bombeado depois que ele percorre a coluna até a base da operação.
  A referência de BHP pode ficar acima dessa extremidade.
- TVD vem exclusivamente do serviço de geometria. Hidrostática usa a variação de
  TVD de cada camada; atrito usa seu comprimento em MD, diâmetro e propriedades do
  fluido presente. Trechos horizontais têm volume e atrito, sem ganho hidrostático.
- Pressão de bombeio e estimativa de queda livre consideram o caminho completo de
  coluna e retorno. BHP/ECD usam as integrações até a referência escolhida.
- O envelope anular amostra MD e inclui interfaces de fluidos e geometria. A fricção
  é acumulada por trecho, substituindo a antiga repartição proporcional ao TVD.
- A injeção fecha o retorno mesmo quando a pressão informada é zero. O passo que
  cruza o início de uma pausa contabiliza apenas sua fração bombeada, preservando
  o volume programado.
- A coluna deve ter ID/OD positivos, ID menor que OD e folga em todos os trechos.
  A hidráulica exige cobertura contínua da superfície até a extremidade; erros
  aparecem na validação das páginas e bloqueiam os resultados.

**Limites preservados do modelo:** mantidas as correlações de reologia/atrito e a
expressão de BHP existente. Queda livre permanece uma estimativa operacional: seu
volume adicional não realimenta o transporte. Na injeção, o volume injetado é
debitado da contabilidade, mas as interfaces do trem de circulação permanecem no
estado anterior; não foi introduzido um modelo de transporte na formação ou de
compressibilidade. A altura dos espaçadores pela razão de densidades continua como
aproximação existente. Estas extensões físicas exigem uma etapa própria.

**Verificação:** testes novos cobrem conservação e ordem dos fluidos, transição de
diâmetro, MD diferente de TVD, trecho horizontal, referência acima da extremidade,
soma do atrito, invariância ao subdividir fases, pausas, injeção e integração das
duas páginas com suas varreduras. Build de produção aprovado com os mesmos avisos
de tamanho das entregas anteriores. As quatro falhas conhecidas em receitas de
pasta continuam fora desta alteração. Execução final da suíte do simulador:
183 testes aprovados e 4 falhas, em 17 arquivos.

**Próximas etapas do plano:** trajetória opcional por mínima curvatura, unidades
de exibição e entidade Poço, conforme seções 3–7.

## 11. Quarta entrega — survey opcional por mínima curvatura

**[FATO 2026-09-05]** Implementada a trajetória opcional descrita nas seções 2–3;
o diagnóstico de ausência do modelo nessas seções corresponde ao estado anterior.

- Editor nas páginas de tampão e squeeze, em **Estrutura do Poço → Trajetória do
  poço**. O engenheiro ativa o survey e digita MD, inclinação a partir da vertical
  e azimute. Não há importação de arquivo.
- `WellGeometry.trajectory` guarda as estações. Com survey ativo, os TVDs de fases,
  sapatas e fundo são derivados no modelo efetivo. O formulário preserva os TVDs
  manuais, que voltam a ser usados ao desativar o survey.
- `MinimumCurvature` integra a tangente no arco circular entre estações, inclusive
  para MDs intermediários. Calcula TVD e deslocamentos locais norte/leste, com
  tratamento numérico do dogleg próximo de zero. Referência técnica:
  [Energistics RESQML 2.0.1, Minimum-Curvature Splines](https://docs.energistics.opengroup.org/RESQML/RESQML_TOPICS/RESQML-000-168-0-C-sv2010.html).
- A conversão pública continua no `WellGeometryService`. Hidráulica, TVDs de
  sapatas e perfil estático do tampão usam a trajetória. Este último amostra MD e
  integra diferenças de TVD, preservando trechos horizontais e ascendentes.
- Validação exige ao menos duas estações, primeira em MD zero, MDs crescentes,
  números finitos, inclinação entre 0 e 180° e azimute entre 0 e 360°. A última
  estação deve cobrir o fundo. Tangentes opostas são rejeitadas porque não
  determinam um arco único. Não há extrapolação além das estações ou do fundo.
- **[INFERÊNCIA — contrato técnico]** TVD→MD retorna o menor MD em patamares
  horizontais de trajetórias não decrescentes. Em trajetórias com retorno
  ascendente, essa inversão é rejeitada; o cálculo direto por MD continua
  disponível, sem escolher silenciosamente uma das possíveis profundidades.
- O cenário persiste `trajectory: { enabled, stations }` no `formValue` existente.
  Cenários sem esse campo abrem com survey desativado e estações vazias, sem
  herdar a trajetória que estava na tela. Metros continuam sendo a unidade de
  entrada e armazenamento nesta entrega; norte/leste são deslocamentos locais,
  não coordenadas georreferenciadas.

**Verificação:** 207 testes aprovados e 4 falhas conhecidas em receitas de pasta,
em 19 arquivos. Cobertura inclui arco circular analítico, trechos retos,
dogleg pequeno, azimute cruzando o norte, inversão, entradas inválidas, cache após
edição, bloqueio/recuperação nas páginas, edição real dos controles e
salvamento/restauração com compatibilidade do legado. Build aprovado com os
avisos de tamanho já registrados.

**Pendente ao encerrar esta etapa:** seleção de metros/pés na exibição (entregue na seção 12) e entidade Poço no backend.
O desenho atual representa a estrutura e os fluidos; não foi introduzida uma
visualização espacial 3D da trajetória. A declaração do método no relatório
permanece a questão de produto registrada na seção 6.

## 12. Metros e pés na apresentação

**[DECIDIDO 2026-09-05]** Profundidades podem ser digitadas e exibidas em m ou ft;
o armazenamento permanece em metros, conforme a entrevista de produto.

**[FATO 2026-09-05 — implementação no working tree]**

- Squeeze e tampão têm seletor de profundidade no cabeçalho, iniciado em metros.
  A preferência pertence à página: trocar a unidade não altera o formulário,
  não marca o cenário como editado e não dispara simulação.
- `models/depth-unit.ts` centraliza o fator exato `1 ft = 0,3048 m` e a formatação.
  `components/well/depth-input.directive.ts` converte a edição para metros antes
  de atualizar o controle e converte de volta ao apresentar um valor carregado.
  Alternar a unidade não arredonda os dados armazenados; campo vazio continua
  vazio, distinto de zero.
- A conversão cobre MD/TVD do fundo, fases e sapatas, MD do survey, intervalo da
  operação, canhoneados, alturas de espaçadores e comprimento do tubo na sequência
  operacional. TVDs derivados do survey também seguem a seleção. Inclinação,
  azimute, diâmetros, pressão, volume, densidade e temperatura mantêm suas unidades.
- Resultados, esquemas e o eixo de profundidade dos gráficos acompanham a seleção.
  Capacidades lineares são apresentadas em bbl/m ou bbl/ft, com conversão inversa
  à das alturas. As coordenadas físicas dos esquemas e os dados hidráulicos
  permanecem em metros; o gráfico recebe uma cópia dos pontos convertidos.
- Cenários novos e antigos usam o contrato existente em metros. Carregar um
  cenário enquanto a tela está em pés não reinterpreta os valores gravados.
- Relatórios exportados permanecem em metros, incluindo suas imagens: os
  componentes dedicados ao relatório mantêm a unidade padrão. Mensagens de
  validação da geometria também conservam a unidade explícita em metros.

**Verificação:** suíte do simulador com 216 testes aprovados e as quatro falhas
de receita de pasta já registradas, em 21 arquivos. Após acrescentar a cobertura
do formulário de fases/sapatas e de valores vazios vindos do legado, os 14 testes
dos quatro arquivos de componentes de poço passaram (total acumulado: 217
aprovados e quatro falhas conhecidas). A cobertura desta etapa inclui troca sem
emissão ou perda de precisão, edição em pés, survey, TVD derivado, restauração de
cenários, capacidades, eixos e posições físicas preservadas nos esquemas.
Build de produção aprovado; permanecem os avisos de tamanho de bundle e CSS.

**Pendente ao encerrar esta etapa:** entidade Poço no backend e referência do cenário ao poço (entregues na seção 13).

## 13. Cadastro de poços e cenários vinculados

**[FATO 2026-09-06 — implementação no working tree]** O cadastro está disponível
em **Estrutura do Poço → Cadastro de poços**, nas páginas de squeeze e tampão.
É possível cadastrar a geometria da tela como um novo poço, carregar um existente,
alterar nome/geometria e excluir um poço sem cenários. A coluna de trabalho,
intervalo operacional, fluidos e receitas continuam pertencendo ao cenário.

- `models/poco.model.ts` define o contrato em metros e separa a referência do
  conteúdo do cenário. `PocoApiService` acessa `/api/simulador/pocos`.
- O banco mantém nome, versão, autoria e geometria tipada em JSON no poço.
  `wellFinalMD`, `wellFinalTVD`, `fases` e `trajectory` saem do `formValue` de
  cenários vinculados. Campos derivados legados ainda presentes no formulário
  são recalculados a partir da geometria carregada e não são sua fonte.
- Salvar um cenário vinculado exige que as alterações da geometria já tenham
  sido salvas no poço. O cadastro informa o efeito sobre todos os cenários e
  relatórios. Salvar um cenário não altera implicitamente a geometria compartilhada.
- Carregar cenário faz um GET individual atualizado e aplica a geometria atual
  do poço, preservando os parâmetros da operação. Se a nova geometria tornar a
  operação inválida, a validação existente impede cálculo e relatório.
- Atualizações usam versão: edição ou vínculo desatualizado retorna 409.
  Recarregar busca o estado atual; não há atualização automática de abas abertas.
- Cenários legados continuam sem vínculo e com sua geometria original. Carregá-los
  limpa o vínculo que estava na tela. A opção **Usar sem vínculo** mantém os dados
  atuais na tela para salvá-los como cenário independente.
- Respostas atrasadas do cadastro preservam edições feitas durante o envio.
  Fechar o modal cancela o carregamento pendente de um cenário.

**Verificação:** nove testes novos no backend (validação, persistência real em H2,
restrição por FK, atualização compartilhada, versões e autorização HTTP), com
70 testes aprovados na suíte completa. O teste de inicialização foi depois
isolado em H2 e aprovado novamente, com interrupção em caso de erro de DDL.
Frontend: suíte com 228 aprovações e as quatro falhas conhecidas de receitas de
pasta; após acrescentar o cancelamento de carregamento, os dois testes do modal
passaram (229 aprovações acumuladas, 12 testes novos nesta etapa).
Build de produção aprovado, mantendo os avisos anteriores de bundle e CSS.

**Banco:** contrato, migration e detalhe do banco local em
[`Backend-Sonda/specs/simulador-pocos.md`](../../../Geopetro-Backend/specs/simulador-pocos.md).
Não foi realizado deploy em produção. Permanecem pendentes as faixas de
plausibilidade que dependem de confirmação técnica e a declaração do método no relatório.

## 14. Visualização do poço em 3D

**[DECIDIDO 2026-09-06]** Nova aba horizontal **Visualização do poço**, logo após
**Esquemático**, no squeeze e no tampão. O desenho de estrutura do poço é movido
para essa aba e acompanha a nova visualização 3D interativa.

- Survey usa o cálculo existente de mínima curvatura, com coordenadas locais
  norte/leste/TVD em metros. Sem survey, a representação é vertical em MD e
  identificada como esquemática; TVDs manuais não fornecem azimute.
- Rotação, zoom, enquadramento, vistas frontal e superior. Fases, sapatas e
  intervalos de fluidos/operação acompanham a geometria e o estado selecionado.
- Eixos espaciais têm a mesma escala. Diâmetros são ampliados apenas no desenho,
  com aviso e ajuste visual, para continuarem legíveis em poços profundos.
- m/ft altera rótulos, mantendo coordenadas e cálculos em metros. Geometria
  inválida não produz uma trajetória fictícia; falta de WebGL mantém o desenho 2D.
- Renderizador carregado sob demanda na nova aba, com liberação de recursos ao
  sair dela. A exportação dos relatórios existentes permanece com os esquemas atuais.

**[FATO 2026-09-06 — implementado no working tree]**
`WellSpatialPath` consulta `MinimumCurvature` e preserva os limites de fases,
sapatas e fundo. `Well3dComponent` desenha tubos ao longo dessa trajetória usando
[TubeGeometry](https://threejs.org/docs/pages/TubeGeometry.html), com câmera
controlada por [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html).
Não há suavização adicional que altere a trajetória calculada. O seletor de MD
consulta coordenadas locais ao longo do poço; estados de fluido da página
atualizam os dois desenhos. Renderização ocorre apenas quando a cena ou câmera muda.

**Verificação:** 36 testes aprovados nos três arquivos selecionados (trajetória
espacial, esquemático existente e integração das páginas). Quatro testes novos
cobrem direção norte/leste, pontos intermediários do arco, representação sem
survey, limites/sapata e rejeição de geometria inválida.
Conferência em Edge com WebGL nas duas operações, survey de teste e caso sem
survey, rotação, zoom, troca m/ft sem alterar formulário, saída/retorno à aba e
viewport de 390 px; nenhuma exceção JavaScript. Build de produção aprovado.
O 3D ficou em chunk carregado sob demanda (~587 kB brutos); os avisos de tamanho
do bundle inicial (~514 kB) e dos estilos das páginas permanecem.

## 15. Correção das receitas de pasta

**[FATO 2026-09-06]** Encerradas as quatro falhas conhecidas de receitas citadas
nas verificações anteriores. A receita preserva a composição recebida do cálculo
da pasta, soma os volumes para obter o rendimento e escala todos os componentes
pelo volume solicitado. Conversões de galões/bbl/ft³ usam fatores sem arredondamento
intermediário; bases inválidas deixam de gerar uma receita padrão.

Contrato, limites desta entrega e testes em [`receitas-pasta.md`](receitas-pasta.md).
Suíte completa do frontend: **280 testes aprovados em 31 arquivos**. Build aprovado
com os mesmos avisos de tamanho. As faixas de plausibilidade e a declaração do
método de trajetória no relatório continuam pendentes.

## 16. Avisos de consistência entre campos

**[FATO 2026-09-06]** Squeeze e tampão exibem avisos para gradientes de fratura/poro,
ordem das leituras Fann e densidade da pasta em relação ao deslocamento. Squeeze
também verifica se a referência hidráulica MD pertence a algum canhoneado.
Os avisos não bloqueiam cálculo nem abertura do relatório, não alteram o formulário
e são recalculados ao carregar um cenário. As regras geométricas impossíveis
continuam bloqueantes.

Contrato e cobertura em [`faixas-validacao.md`](faixas-validacao.md#entrega-de-relações-entre-campos--2026-09-06).
Suíte completa: **299 testes aprovados em 32 arquivos**. Build aprovado com os
avisos de tamanho existentes. As faixas quantitativas seguem aguardando a equipe.
