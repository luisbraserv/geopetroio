# R2 — implementação e verificação

Registro de 2026-09-19. Requisitos e decisões da entrevista permanecem em
[Padrão do squeeze](cimentacao-primaria-padrao-squeeze.md) e
[Fase da operação](fase-operacao.md).

## Implementado

- Seleção explícita da fase em squeeze, tampão e primária. O contexto inclui os
  trechos anteriores e exclui os posteriores. Seleção ausente, removida,
  duplicada ou incompatível invalida o cálculo; a troca preserva os campos da
  operação para correção. Na primária, ID/OD e sapata vêm do cadastro da fase.
- Painel da primária retrátil, sete grupos principais e subseções de operação;
  Pasta e Aditivos têm seleção de pasta de cimento independente da fase.
- Intervalos por pasta, estágios, dispositivos e passos de bombeio editáveis.
  Receita calculada ou manual com rendimento, FAC/FAM e origem; aditivos ativos
  e inativos persistidos, sem incluir os inativos no dimensionamento.
- Receita em destaque na aba da primária, seguindo o squeeze: composição base
  por saco de 94 lb, cimento, águas e aditivos, código, concentração e quantidade
  em kg/L; receita por volume preparado por pasta/estágio. Atalhos em Pasta e
  Aditivos para ver a receita e abrir o editor compartilhado. Criar uma pasta
  seleciona essa pasta para edição. Nome, dosagem, unidade e ativação dos
  aditivos também podem ser editados no painel.
- Cenários por pasta, Sem pasta, destino explícito, salvar como novo, renomear,
  mover e excluir. Navegar entre pastas não altera o destino de salvamento.
  A exclusão de pasta informa nome e quantidade antes da confirmação.
- Identificação, logo, observações, seções extras e notas da sequência no
  `dadosRelatorio`. Sequência derivada do programa e receitas individuais por
  colocação/pasta/estágio no relatório, sem total geral de materiais no documento.
  A tabela da receita no relatório mostra a quantidade base calculada por saco
  ao lado da quantidade preparada. O uso de parâmetros manuais fica identificado.
- Capa baseada no padrão visual do squeeze, ficha, sumário e seções técnicas.
  Profundidades convertidas para a unidade selecionada. Prévia disponível como
  rascunho; emissão final bloqueada por receita inválida, cálculo incompleto ou
  limites excedidos, inclusive nas chamadas diretas de impressão/download.
- Cenário físico v2 e arquivo portátil v2. Migração explícita de v1 com seleção
  nula e preservação dos dados; importação sem assumir os vínculos de banco da
  instalação de origem. Estruturas incompatíveis não substituem a tela.
- Estado de gravação isolado por página; edições durante o salvamento continuam
  não salvas. Mudanças durante abertura impedem que a resposta atrasada substitua
  o trabalho atual. A troca de cenário oferece salvar, descartar ou cancelar.
- Backend filtra por operação **e** pasta e recusa associação ou conversão entre
  operações. Não houve alteração de tabelas nem necessidade de migration nesta R2.

## Verificação automatizada

- Frontend: **726 testes aprovados em 68 arquivos**, pelo comando Angular `npm.cmd test -- --watch=false`.
  Testes de regressão dos três simuladores e casos R2 em `primary-r2.spec.ts`.
- Após a apresentação da receita com aditivos: **100 testes aprovados em sete
  arquivos**, selecionando `primary-r2.spec.ts`, os testes da página primária,
  `primary-recipes.spec.ts` e `primary-report.spec.ts` pelo Angular. Os quatro
  novos testes exercitam edição pelo painel, quantidades base e por volume,
  documento, aditivos inativos, pastas independentes, fonte manual e bloqueio
  sem fase. O servidor local entrega as tabelas novas e os atalhos de edição.
- Build: `npm.cmd run build`. Permanecem avisos de orçamento do pacote inicial
  (aproximadamente 525,6 kB / 500 kB) e dos CSS existentes de squeeze/tampão.
- Backend: 12 testes aprovados em `PastaCenarioPersistenceTest`,
  `PocoPersistenceTest`, `PocoGeometryTest` e `PocoSecurityTest`.
  Os novos testes exercitam controllers, serviços e persistência reais com H2
  isolado: filtros, movimento/renomeação sem perda de conteúdo, contagens,
  exclusão em cascata e recusa de operações incompatíveis. O transporte HTTP
  desses testes usa MockMvc; não é uma sessão autenticada da aplicação implantada.

O Maven 3.9.14 instalado no cache local foi chamado diretamente, com Java 21,
`-o -pl app -am`, seleção das quatro classes e
`-Dsurefire.failIfNoSpecifiedTests=false`. O wrapper Windows não iniciou no
ambiente restrito. Nenhum teste desta revisão usou o banco operacional.

## Pendências de aceite

### Correção da apresentação inicial do menu (2026-09-19)

Após o relato de que o menu ainda não correspondia ao squeeze, os sete grupos
passaram a iniciar recolhidos, com cabeçalhos explícitos e o mesmo padrão de
tipografia, ícones e destaque do grupo Dados da Operação do squeeze. Poço e fases
e Revestimento ou liner também iniciam recolhidos. O cabeçalho ganhou o botão
**Painel de dados**, além do controle existente no menu flutuante.

Os grupos principais têm controles próprios, independentes dos acordeões das
subseções, com `aria-expanded`, `aria-controls` e ocultação do conteúdo fechado.
Recolher preserva os formulários. **77 testes passaram em quatro arquivos** pelo
Angular, incluindo cliques nos sete grupos, seleção de fase pela subseção do
poço e preservação de um campo digitado ao ocultar/reabrir seções e painel.
O build de produção gerou os pacotes; além dos avisos já registrados, o CSS da
primária passou a 8,79 kB para um orçamento de aviso de 8 kB.

Uma leitura HTTP de `http://localhost:4200/main.js` e do módulo da rota
`/app/simulador/primaria` confirmou que o servidor entrega a correção, com os
sete cabeçalhos e o novo botão. Isso verifica o código servido; a conexão ao
Browser continuou sem nenhuma instância disponível e não houve login nem
conferência visual da tela nesta sessão.

### Aceites ainda pendentes

A captura enviada pelo usuário mostrou títulos brancos das subseções sobre
fundo claro. A correção seguinte definiu texto azul-escuro e ícones azuis nas
subseções, fundo branco e destaque da seção aberta. Rótulos e campos ganharam
fonte maior e mais espaçamento. A reserva inferior passou a abranger também o
painel, permitindo rolar seus últimos campos acima do menu flutuante. Build
concluído com exit 0; CSS da primária em 9,72 kB (aviso acima de 8 kB). O servidor
local entrega esses estilos. A revisão visual após essa correção permanece
pendente; não foram adicionados testes de DOM para aferir aparência.

1. **Revisão visual:** desktop, tela estreita, zoom, teclado, A4 e abertura do
   `.doc` em Word. O Browser da sessão retornou `No browser is available` e
   nenhuma instância disponível; os testes de DOM não substituem esta revisão.
2. **Fluxo na aplicação em execução:** cadastrar duas pastas, salvar, reabrir,
   mover e excluir usando uma sessão autenticada. Controllers e H2 foram
   verificados, mas o fluxo completo com frontend/backend em execução ainda não.
3. **Aceite numérico:** conforme resposta 11, o usuário fará a conferência
   posterior com dados reais. Nenhuma tolerância nem aprovação física foi presumida.

## Roteiro curto para a conferência

1. Em cada simulador, cadastrar fases e selecionar a intermediária. Conferir a
   fase no cabeçalho, o bloqueio sem seleção e a preservação dos campos na troca.
2. Na primária, criar Lead e Tail, adicionar produtos diferentes, dividir o
   intervalo e selecionar a pasta de cada trecho. Alternar Calculada/Manual e
   conferir origem, reservas, água, sacos e produtos na aba Receita.
3. Preencher identificação e sequência, salvar na pasta A, navegar na B e
   confirmar que o destino continua A. Alterar o destino explicitamente para
   mover; salvar como novo deve criar outro cenário.
4. Reabrir e exportar/importar. Conferir identificação, fase, composição,
   aditivos, notas e medições; a importação deve nascer como rascunho sem vínculo.
5. Abrir o relatório, conferir as duas receitas e a sequência. Remover a
   composição ou exceder um limite: a prévia deve indicar rascunho e os botões de
   emissão final devem ficar bloqueados.
