# Histórico — R2 da cimentação primária

Entrevista, propostas e entregas datadas. A [SPEC vigente](../cimentacao-primaria-padrao-squeeze.md) prevalece.

# Cimentação primária — padrão do squeeze, cenários e relatório

> Revisão R2 · 2026-09-19 · **Código implementado; revisão visual e aceites manuais pendentes.**
> Evidências: [Validação R2](../r2-validacao.md).
>
> Referências: [motor e regras da primária](../cimentacao-primaria.md),
> [primeiro redesenho da tela](../cimentacao-primaria-tela.md) e código do squeeze.

## 1. Pedido e precedência

**[DECIDIDO 2026-09-19]** A cimentação primária deve seguir o padrão visual e de uso do squeeze, com painel lateral retrátil e dividido em partes, cenários organizados por pastas, dados completos do relatório, sequência operacional, dados da operação, pasta e aditivos. **A receita precisa aparecer no relatório**, além de estar disponível na tela.

**[DECIDIDO]** Toda informação e toda etapa operacional devem corresponder à cimentação primária. A referência é o desenho e a organização do squeeze; a geometria, os estágios, os fluidos e os cálculos continuam sendo os da primária.

**[DECIDIDO 2026-09-19 — complemento]** Em todos os simuladores, primeiro cadastrar as fases, depois **selecionar a fase da operação**; o cálculo usa essa fase como alvo. A regra comum, sua persistência e a aplicação em squeeze/tampão/primária estão em [Fase de trabalho](../fase-operacao.md). Integra esta revisão e autoriza as adaptações correspondentes nos três simuladores.

**[PROPOSTO]** Esta R2 substitui, nos pontos abaixo, o alvo anterior de `cimentacao-primaria-tela.md`:

| Decisão anterior | Alvo desta revisão |
|---|---|
| Persistência e conteúdo do relatório não mudam | Completar pastas, metadados persistidos, sequência operacional e receitas no documento |
| Modal próprio sem gerenciamento de pastas | Mesma experiência de pastas e cenários do squeeze, preservando o codec da primária |
| Lista plana de dez ou mais acordeões | Grupos principais e subseções recolhíveis, conforme §3 |
| Dados do relatório limitados a cliente e nome | Identificação completa, conforme §4 |
| Relatório de P11 mantido como está | Documento com apresentação do squeeze e conteúdo próprio da primária, conforme §8 |

**[PROPOSTO]** Os detalhes de campos, organização, contratos internos e entregas abaixo são a proposta de implementação. Os registros T1–T7 e P1–P12 permanecem como histórico do que foi entregue; não comprovam a conclusão desta revisão. O motor físico e a decisão anterior de reconstruir gráficos separadamente continuam vigentes.

## 2. Diagnóstico do código atual

### Decisões da entrevista — 2026-09-19

**[DECIDIDO]** Entrevista encerrada. Respostas do usuário: **1A, 2A, 3A, 4A, 5B, 6A, 7A, 8A, 9B, 10B e 11 — conferência manual posterior pelo próprio usuário com dados reais**. Prevalecem sobre propostas anteriores em conflito.

| Pergunta | Decisão |
|---|---|
| 1 — Limites da fase | Intervalo-alvo de squeeze/tampão inteiramente dentro da fase selecionada; bloquear intervalos fora dela |
| 2 — Geometria do alvo da primária | Diâmetros e sapata do revestimento/liner derivados do cadastro da fase, onde devem ser corrigidos |
| 3 — Troca de fase | Preservar dados preenchidos e apontar incompatibilidades, sem reajuste automático da operação |
| 4 — Parâmetros da pasta | Calculados pela composição ou informados manualmente, como no squeeze, identificando a origem de cada valor |
| 5 — Receitas no relatório | Receitas individuais por pasta/estágio, **sem consolidação geral de materiais no relatório** |
| 6 — Sequência operacional | Bombeio gerado pelo programa; textos/observações editáveis; volumes e vazões acompanham o cálculo |
| 7 — Documento com pendências | Permitir prévia como rascunho e **bloquear emissão final** quando faltar composição ou houver erro de cálculo, mostrando as pendências |
| 8 — Aceite numérico | Comparar com **caso real já conferido pela equipe**, incluindo volumes, sacos, água, aditivos e pressões |
| 9 — Excluir pasta de cenários | Excluir a pasta e seus cenários após confirmação explícita |
| 10 — Limites excedidos | Bloquear o relatório final quando o resultado indicar pressão, vazão ou potência acima do limite informado |
| 11 — Responsável e momento do aceite | O próprio usuário fará a verificação manual posteriormente, com dados reais |

**[DECIDIDO — 11]** A conferência com dados reais ocorrerá depois da implementação, pelo usuário. Não exigir envio prévio de caso/planilha para iniciar o desenvolvimento. Testes automatizados e revisão funcional não substituem esse aceite numérico manual.

**[PENDENTE — aceite posterior]** Registrar o caso e o resultado da conferência quando o usuário os fornecer. Nenhuma tolerância numérica foi acordada; não inventar uma nem declarar validação operacional concluída. A entrevista funcional está encerrada e a implementação pode seguir a autorização já dada.

**[FATO — inspeção em 2026-09-19]** As diferenças abaixo são verificáveis no código; não houve validação visual em navegador nesta revisão documental.

| Área | Evidência e diferença encontrada |
|---|---|
| Layout da primária | [Template](../../../src/app/features/simulador/pages/simulador-primaria/simulador-primaria.component.html): já existem abas, dock e painel que recolhe; falta a hierarquia de grupos do squeeze e não há seção de sequência operacional |
| Referência visual | [Template do squeeze](../../../src/app/features/simulador/pages/simulador-squeeze/simulador-squeeze.component.html): Dados do Relatório, Sequência Operacional, Dados da Operação com subseções, Pasta e Aditivos |
| Cenários | [Modal da primária](../../../src/app/features/simulador/components/state-modal/primary-scenario-modal.component.ts): lista plana e botões de salvar/importar/exportar; [modal do squeeze](../../../src/app/features/simulador/components/state-modal/simulador-state-modal.component.ts): coluna de pastas, Sem pasta, contagens e CRUD |
| Salvamento | [Página da primária](../../../src/app/features/simulador/pages/simulador-primaria/simulador-primaria.component.ts), `salvarCenario` e `abrirSalvo`: a página não envia `pastaId`/`dadosRelatorio` nem restaura estes metadados; o [store](../../../src/app/features/simulador/services/primary-scenario-store.service.ts) já admite ambos no salvamento |
| Receitas | [Resolver](../../../src/app/features/simulador/services/primary-recipes.ts): já calcula receitas por colocação, sacos, água, linhas de produtos e totais; a tela já edita composição e aditivos |
| Relatório | [Gerador da primária](../../../src/app/features/simulador/services/primary-report.ts), `fluidsSection`: informa composição cadastrada/ausente e origem das propriedades, mas não publica a receita detalhada com quantidades por produto |
| Sequência de referência | [Gerador do squeeze](../../../src/app/features/simulador/components/relatorio/relatorio-builder.service.ts), `buildOperationalSequencePages`: contém injetividade, retirada de coluna, reversa e squeeze, além de valores padrão; esse texto não pode ser usado como sequência da primária |
| Filtro por pasta | [Serviço do backend](../../../../Geopetro-Backend/simulador/src/main/java/com/geopetro/simulador/application/service/CenarioSimuladorService.java), `listar`: quando recebe `pastaId`, consulta por pasta sem combinar o filtro de operação; criar/atualizar também não confere compatibilidade entre operação do cenário e da pasta |

## 3. Layout e painel lateral

**[PROPOSTO — atende ao padrão visual solicitado]** Usar o squeeze como referência para cabeçalho, abas, densidade dos campos, botões, tabelas, cards, ícones, modais e dock. Consumir os tokens Braserv e controles Taiga existentes. Copiar nomes de classes sem reproduzir dimensões e comportamento não atende ao requisito.

```text
Cabeçalho: Cimentação Primária · unidade de profundidade · situação do resultado
Abas horizontais de resultados
┌────────────────────────────┬─────────────────────────────────────┐
│ Painel de entradas         │ Conteúdo da aba ativa                │
│ 1. Dados do relatório      │ Volumes, programa, receita,          │
│ 2. Sequência operacional   │ transporte, hidráulica,               │
│ 3. Dados da operação       │ esquemático ou medições              │
│    subseções retráteis     │                                     │
│ 4. Fluidos e bombeio       │                                     │
│ 5. Pasta                   │                                     │
│ 6. Aditivos                │                                     │
│ 7. Medições e apresentação │                                     │
└────────────────────────────┴─────────────────────────────────────┘
Dock: [Ocultar/Exibir painel] [Cenários + situação] [Relatório]
```

### 3.1 Grupos do painel

**[PROPOSTO]** Ordem e conteúdo obrigatórios para a implementação desta revisão:

| Grupo principal | Conteúdo / subseções |
|---|---|
| **1. Dados do relatório** | Identificação, autoria, revisão, cliente e apresentação do documento |
| **2. Sequência operacional** | Preparação, testes informados, etapas por estágio, encerramento e observações; prévia gerada a partir do programa |
| **3. Dados da operação** | **3.1 Poço, fases, trajetória e seleção da fase da operação**; **3.2 Revestimento-alvo / liner da fase selecionada**; **3.3 Anular e retorno**; **3.4 Estágios, dispositivos e intervalos**; **3.5 Janela e equipamento** |
| **4. Fluidos e bombeio** | Fluido inicial, lavador, espaçador, deslocamento, propriedades e origens; programa por estágio com pastas referenciadas pelo cadastro do grupo 5 |
| **5. Pasta** | Seleção e cadastro das pastas de cimento, composição, propriedades e associação aos intervalos |
| **6. Aditivos** | Aditivos da pasta selecionada, catálogo e edição; seção própria, visível no primeiro nível |
| **7. Medições e apresentação** | Importação e alinhamento de medições; unidades, referências de ECD e opções existentes de apresentação |

**[PROPOSTO]** Cada grupo abre e fecha independentemente. Dados da operação é um grupo recolhível com subseções também recolhíveis, como no squeeze. Fechar o grupo preserva valores e estado das subseções. Ao iniciar uma sessão, abrir Dados da operação/Poço; manter os demais grupos fechados. Erros devem indicar grupo e campo, com ação para abrir a seção correspondente.

**[PROPOSTO]** O painel inteiro recolhe pelo dock, liberando a largura do conteúdo. O botão permanece acessível e alterna seu rótulo; usar `aria-expanded` e `aria-controls`. Reabrir restaura grupos e edição, sem recalcular nem apagar dados. O painel referido aqui é o de entradas do simulador, não o menu global da aplicação.

**[PROPOSTO]** A fase selecionada também aparece no resumo/cabeçalho com o painel recolhido. O cadastro das fases vem antes do seletor; sem seleção válida, permitir rascunho e edição, mantendo o cálculo pendente. Geometria, volumes, receita dimensionada e relatório usam o mesmo contexto da fase, preservando os trechos anteriores necessários ao circuito, conforme [regra comum](../fase-operacao.md).

**[PROPOSTO]** Manter as seis abas atuais: Volumes e programa, Receita da pasta, Transporte, Hidráulica, Esquemático e Dados medidos. Em Volumes e programa, acrescentar a prévia da sequência operacional do relatório. Entradas ficam no painel ou em seus modais; controles de reprodução e visualização 3D permanecem junto ao resultado.

**[PROPOSTO]** Em desktop, adotar a largura de referência de 320 px do painel do squeeze. Em tela estreita, evitar esmagar as tabelas: painel recolhível/empilhado, dock acessível e rolagem horizontal restrita às tabelas. Validar a 1440, 1024, 768 e 390 px e com zoom de 200%; o dock não pode cobrir a última linha nem as ações dos modais.

## 4. Dados do relatório

**[PROPOSTO]** A edição no painel e a prévia do relatório usam o mesmo estado. Se houver edição na prévia/modal, ela altera esse estado; não criar uma segunda ficha independente.

| Campos | Comportamento |
|---|---|
| Cliente, logo do cliente | Nome, seleção, prévia e remoção do logo, como no squeeze |
| Preparado para, preparado por, revisado por | Identificação do destinatário, autor e revisor |
| Título/documento, data, versão/revisão, Job # | Título inicial “Programa de Cimentação Primária”; revisão documental distinta da versão do formato do cenário |
| Origem/operador, campo, sonda, país | Identificação operacional |
| Poço | Derivado do poço vinculado; quando não houver vínculo, permitir identificação textual explícita, sem cadastrar ou vincular poço automaticamente |
| Objetivo e zona/intervalo a isolar | Texto complementar; profundidades técnicas vêm dos intervalos e do revestimento-alvo |
| Observações e seções complementares | Texto/imagens opcionais no padrão do relatório existente, identificados como informação do usuário |

**[PROPOSTO]** Nome do cenário identifica o salvamento e aparece na ficha do documento; não substitui o título do relatório. Campos não informados aparecem como “Não informado”, nunca com valores operacionais herdados de exemplo. Trocar de cenário também troca ou limpa todos os seus metadados e imagens.

## 5. Sequência operacional específica da primária

**[PROPOSTO]** Há duas informações relacionadas:

- **Programa de bombeio:** passos estruturados que alimentam a simulação, com estágio, fluido, volume, vazão, duração, pausa e evento de dispositivo.
- **Sequência operacional do relatório:** apresentação desses passos, acrescida dos itens documentais de preparação e encerramento informados pelo usuário.

**[DECIDIDO 2026-09-19 — 6A]** As etapas de bombeio da sequência são geradas pelo programa, com textos e observações editáveis; volumes e vazões acompanham o cálculo. Os números devem vir do mesmo programa e da mesma receita exibidos na tela, sem cópias editáveis independentes no relatório.

**[PROPOSTO]** Alterar o programa atualiza a prévia e o documento; comentários manuais ficam associados a IDs estáveis de estágio/passo, preservados quando a ordem muda.

**[PROPOSTO — estrutura de software, não procedimento de campo validado]** A sequência permite organizar os seguintes blocos conforme a configuração da operação:

| Bloco | Dados e fonte |
|---|---|
| Preparação | Identificação do revestimento/liner e estágio; conferências, reunião e observações informadas |
| Circulação/condicionamento e testes | Itens habilitados pelo usuário; pressão, duração e referência do teste explicitamente informadas, sem valores padrão do squeeze |
| Preparação das pastas | Uma receita para cada pasta utilizada, incluindo materiais e volume a preparar |
| Bombeio por estágio | Cada passo do programa na ordem configurada: lavador/espaçador, pasta(s), deslocamento, pausas e eventos aplicáveis |
| Plugues e dispositivos | Identificação, configuração e eventos disponíveis no modelo; pressão/duração informada para documentação não vira resultado físico calculado |
| Encerramento | Retornos/volumes calculados identificados como previstos, observações e verificações informadas |
| Informações de laboratório e espera | Tempo de bombeabilidade e condição de ensaio por pasta; resistência compressiva e tempo/critério informado, com origem identificada |

**[PROPOSTO]** Suportar uma ou várias pastas e um ou vários estágios, inclusive liner. Lead e tail são nomes de uso possíveis, não uma limitação a duas receitas. O texto deve refletir os fluidos e dispositivos efetivamente configurados.

**[PROPOSTO]** Etapas documentais podem ser habilitadas, ordenadas e comentadas. Linhas derivadas do bombeio são alteradas no programa; removê-las ou reordená-las somente no relatório criaria divergência. Ao excluir um passo com comentários, avisar sobre a remoção desses comentários. Referências quebradas após importação/revisão do programa devem ser apontadas antes da emissão.

**[PROPOSTO]** A sequência da primária não deve receber automaticamente teste de injetividade, hesitação de squeeze, volume injetado na formação, retirada de tubing do tampão ou circulação reversa do procedimento legado. Tampouco usar “pressão de operação + 1000 psi” como pressão de teste automática. Valores ausentes permanecem ausentes. Duração de tarefas documentais não deve alterar o relógio da simulação sem um passo correspondente no programa.

## 6. Pasta, aditivos e receita

### 6.1 Cadastro de pasta

**[DECIDIDO 2026-09-19]** Pasta e Aditivos fazem parte do escopo obrigatório, e a receita deve permitir gerar o relatório completo.

**[PROPOSTO]** O grupo **Pasta** terá seletor com nome legível da pasta ativa, criação/edição e vínculo aos intervalos/estágios. O grupo **Aditivos** mostra o mesmo nome e permite trocar a seleção compartilhada. O relatório considera todas as pastas usadas, independentemente da pasta ativa no momento da emissão.

**[PROPOSTO]** Campos: nome, densidade alvo, classe de cimento pelo catálogo existente, água doce/água do mar, sílica, NaCl, temperaturas de superfície/BHCT/BHST quando disponíveis, propriedades reológicas e sua origem. Usar unidades e bases de concentração do squeeze: por exemplo, sílica em % BWOC e NaCl sobre água. Rendimento, FAC e FAM calculados ficam identificados com unidade e origem.

**[DECIDIDO 2026-09-19 — 4A]** Permitir parâmetros calculados pela composição ou informados manualmente, como no squeeze, identificando a origem de cada valor.

**[PROPOSTO]** Oferecer seleção Calculado/Manual por pasta, incluindo rendimento, FAC e FAM conforme o fluxo existente do squeeze. Guardar modo e valores manuais na receita da pasta, preservar ao trocar de modo e aplicar a mesma fonte efetiva à tela e ao relatório. O codec e a migração v2 devem abranger esses dados; não guardar as substituições somente no componente ou no texto do relatório. A composição continua necessária para detalhar os materiais; informar parâmetros manualmente não dispensa ingredientes/dosagens necessários à receita.

**[PROPOSTO]** Densidade/reologia medida ou informada deve continuar identificada e preservada. Quando diferente da estimativa da receita, apresentar a diferença e qual valor alimenta o motor; não sobrescrever silenciosamente a propriedade efetiva. A edição de receitas mantém as regras atuais de `primary-recipes.ts` e dos serviços compartilhados de pasta.

### 6.2 Aditivos por pasta

**[PROPOSTO]** Reusar `ADITIVOS_CATALOGO` e `AditivoModalComponent`: adicionar do catálogo ou manualmente, editar, remover, importar/exportar conforme o fluxo disponível. Cada aditivo pertence à receita da pasta selecionada.

**[PROPOSTO]** Preservar nome, identificador/código quando existente, categoria/tipo, concentração, unidade de dosagem, base/local de mistura e situação ativo/inativo. As concentrações e propriedades editadas devem sobreviver ao fechamento do modal, troca de pasta, salvamento e importação. Produto manual sem código deve ser identificado como manual, sem inventar código comercial.

**[PROPOSTO]** Alterar um aditivo da pasta A não altera a pasta B. Sílica e sal podem ser acessados em Pasta e Aditivos como no squeeze, mas com o mesmo campo de estado, sem contar duas vezes na receita. Pasta usada por intervalo ou passo não pode ser excluída deixando referência inválida; indicar onde está em uso.

### 6.3 Receita na tela e no relatório

**[DECIDIDO 2026-09-19 — 5B]** O relatório apresenta somente receitas individuais por pasta/estágio, sem consolidação geral de materiais. Esta decisão substitui a proposta anterior de totais da operação no documento.

**[PROPOSTO]** A aba Receita da pasta deve mostrar, e o relatório deve reproduzir para cada receita individual, os seguintes blocos:

| Bloco | Conteúdo obrigatório |
|---|---|
| Identificação | Nome da pasta, estágio(s), colocação/intervalo, classe do cimento e densidade com origem |
| Receita base | Base de cálculo explícita do serviço existente, referência ao saco de 94 lb quando aplicável, rendimento, FAC/FAM e unidades |
| Volume de aplicação | Volume dimensionado, reserva extra programada, volume programado para bombeio, reserva de mistura e volume total preparado, apresentados separadamente |
| Cimento e água | Sacos calculados, sacos inteiros para suprimento separados do valor calculado, massa de cimento e água de mistura |
| Composição detalhada | **Produto · código/identificação · concentração · unidade/base da dosagem · quantidade para o volume preparado · unidade da quantidade**; incluir cimento, águas, sílica, sal e cada aditivo aplicável |
| Aplicação individual | Quantidades da receita por pasta/estágio e colocação; não incluir quadro geral consolidado da operação no relatório |
| Origem e pendências | Composição e propriedades informadas/estimadas/medidas, observações e motivo de indisponibilidade |

**[PROPOSTO]** Reutilizar a receita resolvida para alimentar tabela, sequência operacional e documento. Não implementar uma segunda fórmula no gerador HTML. Resolver identidade/código do produto a partir da composição e do catálogo; caso seja necessário ampliar o resultado com identificação, manter o cálculo numérico existente.

**[PROPOSTO]** O volume de cimento simulado continua derivado de geometria, TOC e intervalos. A receita escala para o **volume preparado**. Reserva de mistura aumenta materiais preparados e não é acrescentada ao volume bombeado. Arredondamento para suprimento não altera o volume físico. Totais não somam produtos distintos nem unidades incompatíveis; pastas repetidas em estágios distintos mantêm o detalhamento por colocação.

**[DECIDIDO 2026-09-19 — 7A/10B]** Receita inexistente/inválida, erro de cálculo ou pressão/vazão/potência acima de um limite informado permite prévia como rascunho e bloqueia a emissão final, com as pendências listadas. O cálculo pode continuar para demonstrar o problema; isso não libera o documento final.

**[PROPOSTO]** Manter salvamento do cenário como rascunho disponível. Exibir motivo da receita indisponível sem transformar zeros internos do resolver em quantidades válidas; somente densidade e reologia não constituem receita completa. A prévia traz identificação visível de RASCUNHO; as ações de emitir/baixar/imprimir a versão final ficam bloqueadas até resolver as pendências. A possibilidade técnica de imprimir a prévia pelo navegador não remove sua identificação de rascunho.

## 7. Cenários organizados por pastas

**[DECIDIDO 2026-09-19]** O modal de cenários da primária deve seguir o padrão de organização por pastas do squeeze. “Pasta de cenários” é o agrupamento de arquivos; “Pasta de cimento” é a composição da operação. Usar os termos completos quando houver ambiguidade.

**[PROPOSTO]** O modal terá coluna de pastas à esquerda e lista de cenários à direita, com Sem pasta, nomes, contagens, seleção ativa, carregamento, lista vazia e erros. Criar e renomear pastas no próprio modal. Não exigir acesso ao squeeze para organizar cenários da primária. Pastas são do mesmo nível, conforme a estrutura atual; não criar subpastas nesta revisão.

| Ação | Comportamento proposto |
|---|---|
| Salvar novo | Nome obrigatório; usar a pasta de destino selecionada ou Sem pasta, enviando `pastaId` explicitamente |
| Abrir | Recuperar cenário, pasta, identificação, sequência, todas as pastas de cimento/aditivos, medições e apresentação; recalcular resultados |
| Salvar alterações | Atualizar o ID aberto; preservar sua pasta até que o usuário escolha mudar o destino |
| Salvar como novo | Criar outro ID com nome e destino escolhidos, sem sobrescrever o cenário de origem |
| Renomear/mover cenário | Atualizar nome/destino preservando todo o conteúdo, inclusive `dadosRelatorio` e vínculo do poço |
| Excluir cenário | Confirmação no padrão existente; atualizar lista/contagem após sucesso da API |
| Excluir pasta | **[DECIDIDO — 9B]** Excluir a pasta e seus cenários após confirmação explícita, informando nome e quantidade de cenários afetados; cancelar não modifica os dados |
| Exportar/importar | Manter arquivo portátil com operação e versão; incluir dados do relatório e sequência junto de receitas/aditivos |

**[PROPOSTO]** Distinguir pasta em navegação e pasta do cenário aberto: apenas clicar em outra pasta não move o cenário nem altera seu próximo salvamento. Abrir/substituir cenário com edições pendentes oferece salvar, descartar ou cancelar; falha ao salvar impede a substituição. Importação continua com resumo antes de adotar e cria rascunho sem vínculo automático com IDs do arquivo.

**[PROPOSTO]** Toda operação de pasta/cenário usa `operacao: 'primaria'`. Conferir operação ao abrir por ID e ao importar. A consulta por pasta deve combinar operação e pasta, e a API deve recusar associação entre operações diferentes. O problema identificado em §2 precisa ser corrigido e testado no backend; filtrar apenas os cartões no frontend não basta.

**[PROPOSTO]** Só marcar salvo após confirmação da API para a revisão enviada. Se houver edição durante a requisição, a revisão mais recente permanece não salva. Falha de rede mantém o trabalho e permite exportar. A resposta de uma listagem antiga não pode substituir a pasta atualmente selecionada.

## 8. Relatório da primária

**[PROPOSTO]** O botão Relatório do dock abre a prévia/configuração com o padrão visual do squeeze e ações de visualizar, imprimir e baixar no formato `.doc` já disponível. A opção de download pertence ao fluxo do relatório; o usuário não precisa abrir Cenários para encontrá-la. Não apresentar o HTML `.doc` existente como arquivo `.docx` nativo.

**[PROPOSTO]** Reusar capa, ficha, hierarquia tipográfica, cabeçalhos, tabelas e paginação do squeeze, compondo um documento próprio da primária. A ordem será:

1. **Capa** — Cimentação Primária, cliente, poço, data e revisão.
2. **Ficha do documento e sumário** — autoria, destinatário, identificação do cenário e seções efetivamente presentes.
3. **Dados do poço e da operação** — fase selecionada e seus limites MD/TVD, geometria, trajetória, revestimento/liner, anular, dispositivos, estágios, intervalos, limites e propriedades.
4. **Volumes e programa de bombeio** — fluidos, passos, vazões, durações, deslocamento e reservas por estágio.
5. **Pastas, aditivos e receitas** — todos os blocos de §6.3, receitas individuais por pasta/estágio e colocação, sem consolidação geral de materiais.
6. **Sequência operacional** — lista numerada de §5, na ordem do programa e com receitas/tabelas referenciadas pelo nome da pasta.
7. **Resultados da simulação** — TOC ideal/real, retornos, balanço, transporte, hidráulica e limites, mantendo as informações técnicas já existentes.
8. **Esquemáticos, medições e anexos disponíveis** — snapshots e comparação com origem e unidades; itens indisponíveis com motivo.
9. **Observações, diagnósticos e conclusão** — informações adicionais do usuário e situação completa/parcial/incompleta.

**[PROPOSTO]** A situação do documento considera separadamente resultado físico parcial e receita/dados documentais pendentes. Um cálculo concluído não permite ocultar uma receita ausente. Texto de sequência é planejamento, e não atestado de execução. Entradas, receitas e resultados devem pertencer à mesma revisão.

**[PROPOSTO]** Selecionar lead na tela não pode excluir tail do relatório. Alterar uma concentração atualiza materiais e sequência antes da emissão. Receitas e tabelas precisam ser legíveis em A4, repetir cabeçalhos em quebras e manter produto, quantidade e unidade juntos; nomes longos devem quebrar linha. Metadados e textos livres devem ser escapados no HTML.

**[PROPOSTO]** Esta revisão não depende de reconstruir gráficos. Manter os motivos de indisponibilidade já previstos e preservar as seções técnicas existentes. O conteúdo de receitas e sequência é obrigatório mesmo sem gráficos.

## 9. Estado, persistência e compatibilidade

**[PROPOSTO]** Reusar a API existente do simulador e a separação de responsabilidades abaixo; não criar tabela específica para esta revisão.

| Local | Conteúdo |
|---|---|
| Cenário na API | `nome`, `operacao`, `pastaId`, vínculo/versionamento do poço |
| `formValue` / `PrimaryScenario` | `selectedPhaseId`, entradas físicas, `primary.fluids[].recipe` com aditivos, intervalos/programa, medições e apresentação |
| `dadosRelatorio` | JSON tipado próprio da primária: `reportSchemaVersion: 1`, `operation: 'primaria'`, identificação, logo, observações/seções complementares e configuração da sequência operacional |
| Resultado em memória | Receitas dimensionadas, materiais, volumes, transporte, hidráulica e documento derivado; recalculados ao carregar |
| Estado de interface | Painel/grupos abertos e pasta selecionada no modal; não são entradas físicas |

**[PROPOSTO]** `dadosRelatorio` referencia pastas, estágios e passos por IDs estáveis e não duplica suas quantidades. Adotar tipo próprio, por exemplo `PrimaryReportData`, em vez de forçar campos de injetividade/squeeze de `RelatorioSequenciaOperacionalData`. O identificador da pasta de cenários continua no envelope da API.

**[PROPOSTO]** No arquivo portátil, evoluir `exportVersion` de 1 para **2**, acrescentando `dadosRelatorio` como objeto tipado e identificação da pasta original apenas como procedência. Evoluir também o `schemaVersion` físico de 1 para **2** para incluir `selectedPhaseId`, conforme [Fase de trabalho](../fase-operacao.md). Declarar migração de arquivo/cenário v1: preservar cenário/receitas, iniciar metadados ausentes vazios e fase como `null`, exigindo seleção antes do recálculo. Arquivo futuro, operação incompatível ou estrutura inválida não substitui a tela aberta.

**[PROPOSTO]** Cenários atuais do banco com `dadosRelatorio: null` continuam abrindo; informar que a identificação/receita documental pode precisar de complemento. Se existir JSON de relatório anterior reconhecível, migrar campos compatíveis explicitamente. Conteúdo não reconhecido exige diagnóstico e preservação do original antes de qualquer sobrescrita; não descartar silenciosamente.

**[PROPOSTO]** Abrir no banco deve restaurar também `poco`/versão e `pastaId`, não apenas o formulário. Importação portátil mantém geometria como snapshot e não assume vínculo com poço ou pasta de outra instalação. Exportar/importar preserva as configurações do relatório, receitas completas, aditivos e medições.

**[PROPOSTO]** Alterações físicas continuam pausando reprodução e invalidando resultados. Edição de metadados/comentários marca cenário não salvo e atualiza documento, sem executar novamente o motor físico. Recolher painéis não altera a situação de salvamento. Mudanças persistidas de apresentação atualizam o documento conforme necessário.

## 10. Implementação orientada por entregas

**[PROPOSTO]** Aproveitar os serviços físicos existentes. Compartilhar estrutura visual e componentes de apresentação com o squeeze onde viável; manter adaptadores tipados da primária para abrir/salvar/importar. Um modal visual compartilhado não deve remover a validação do cenário da primária.

| Ordem | Entrega | Arquivos/pontos principais | Pronto quando |
|---|---|---|---|
| [x] R2.0 | Fase de trabalho comum | [Entregas F1–F6](../fase-operacao.md); modelos, geometria e três simuladores | Cadastro seguido de seleção explícita; fase persistida e contexto usado pelos cálculos/documentos |
| [x] R2.1 | Estado do relatório e compatibilidade | Modelos da primária, codec, arquivo portátil, store e página | Metadados/receitas sobrevivem ao salvamento, abertura e importação v1/v2 |
| [x] R2.2 | Layout e grupos retráteis | `simulador-primaria.component.{html,css,ts}`; referência do squeeze | Sete grupos, subseções de operação, Pasta/Aditivos separados e painel inteiro retrátil |
| [ ] R2.3 | Cenários por pasta | Modais de cenários, state API/store e serviços/repositórios do backend | CRUD, destinos e filtros corretos, Sem pasta e integração HTTP verificados |
| [x] R2.4 | Pasta, aditivos e receita completa | Formulários de pasta/aditivos, `primary-recipes.ts` e resultado de receita | Várias pastas independentes, fontes calculada/manual persistidas e receitas individuais consistentes |
| [x] R2.5 | Sequência operacional | Modelo de dados do relatório, editor e função de composição | Prévia derivada do programa, comentários persistidos e conteúdo exclusivo da primária |
| [ ] R2.6 | Documento implementado; revisão visual pendente | `primary-report.ts`, `primary-report-html.ts`, apresentação compartilhada do relatório | Capa/ficha, receitas, sequência e seções técnicas legíveis na prévia, impressão e `.doc` |
| [ ] R2.7 | Regressão e revisão visual | Testes relevantes e roteiro abaixo | Aceites conferidos; registrar evidência e pendências reais |

**[PROPOSTO]** Refatorações compartilhadas exigem conferir squeeze e tampão. Atualizar as specs do backend/contratos de sistema quando a correção dos filtros alterar comportamento documentado. Não marcar entrega concluída somente por existir teste de DOM.

## 11. Critérios de aceitação

**[PROPOSTO]** Cenário de referência: poço válido com duas pastas de cimento de nomes distintos, aditivos diferentes, dois estágios, reserva de mistura, identificação do relatório e observações de sequência. Manter também caso simples com uma pasta e um estágio.

**[DECIDIDO 2026-09-19 — 8A]** O aceite numérico exige comparação com um caso real já conferido pela equipe, abrangendo volumes, sacos, água, aditivos e pressões. Casos sintéticos e testes automatizados continuam como regressão, mas não substituem essa conferência.

**[DECIDIDO 2026-09-19 — 11]** O usuário fará essa conferência manualmente, depois da implementação, com dados reais. A entrega de software pode ser testada antes; o aceite numérico permanece separado e pendente até sua manifestação. Registrar referência, diferenças e tolerâncias se fornecidas durante a conferência, sem exigir esses dados como condição para iniciar a implementação.

| ID | Verificação | Resultado esperado |
|---|---|---|
| AC01 | Comparar squeeze e primária lado a lado | Mesma linguagem visual, hierarquia, dimensões dos controles e ações; texto e dados da primária |
| AC02 | Recolher grupo, subseção e painel inteiro; reabrir | Largura liberada, estado preservado, dock acessível; teclado e foco funcionam |
| AC03 | Editar todos os dados do relatório, salvar e reabrir em nova sessão | Identificação, logo, revisão, observações e sequência recuperados |
| AC04 | Criar duas pastas de cenários e salvar um cenário em cada | Lista e contagens corretas; Sem pasta mostra apenas cenários sem pasta |
| AC05 | Abrir da pasta A, navegar na B e salvar; depois mover explicitamente | Navegação não move o cenário; mudança explícita altera destino sem perder conteúdo |
| AC06 | Salvar como novo, renomear e excluir | Novo ID quando solicitado; conteúdo preservado ao renomear; alcance da exclusão informado |
| AC07 | Consultar/associar pasta de outra operação pela API | Nenhum cenário incompatível listado/associado; squeeze não é convertido em primária |
| AC08 | Editar aditivo da pasta A e trocar para B | B permanece intacta; A mantém composição e dosagem após reabrir cenário |
| AC09 | Alterar concentração ou reserva de mistura | Receita e relatório atualizam; reserva não entra como bombeio; quantidades respeitam o resolver |
| AC10 | Emitir relatório com duas pastas e estágios distintos | Receitas individuais completas com água, sacos, produtos, concentrações, unidades e quantidades; sem consolidação geral de materiais |
| AC11 | Reordenar/repetir passo de bombeio | Prévia e documento acompanham a ordem e os valores, sem duplicar receita de suprimento inadvertidamente |
| AC12 | Gerar sequência convencional e de liner | Textos/dispositivos coerentes com a configuração; sem conteúdo automático de squeeze/injetividade |
| AC13 | Exportar v2/importar e abrir arquivo legado v1 | V2 preserva relatório/receitas/medições; v1 migra com metadados vazios, sem perder o cenário |
| AC14 | Falhar salvamento, editar durante requisição, importar inválido ou cancelar abertura | Trabalho preservado e estado de salvamento correto; cenário atual não substituído indevidamente |
| AC15 | Tentar emitir documento sem composição, com erro de cálculo ou pressão/vazão/potência acima do limite informado | Prévia identificada como rascunho, motivo explícito e emissão final bloqueada; sem receita fictícia ou zero disfarçado |
| AC16 | Conferir desktop, tela estreita, zoom, A4 e `.doc` | Sem sobreposição/corte de campos; receitas e sequência legíveis; rótulos e unidades preservados |
| AC17 | Abrir e calcular squeeze/tampão após mudanças compartilhadas | Seleção de fase aplicada conforme a regra comum; sem alterações involuntárias além desse escopo |
| AC18 | Cadastrar fases, selecionar uma e trocar para outra | Cálculo, receita dimensionada, cenário e relatório vinculados à seleção; revalidação sem perder composição/aditivos, conforme F-AC01–F-AC14 |
| AC19 | Alternar Calculado/Manual, salvar e reabrir cada pasta | Modo, valores e origens preservados; receita e relatório usam a mesma fonte efetiva |
| AC20 | Verificação manual posterior do usuário com dados reais | Usuário confere volumes, sacos, água, aditivos e pressões; registrar sua conclusão e eventuais diferenças. Pendente até a conferência, sem tolerância presumida |
| AC21 | Confirmar/cancelar exclusão de pasta com cenários | Confirmação informa nome e quantidade; confirmar remove o conjunto após sucesso da API, cancelar preserva tudo |

**[PROPOSTO]** Na implementação, executar os testes Angular pelo comando do projeto (`npm.cmd test -- --watch=false`), o build e os testes do backend afetado. Verificar a integração HTTP real de pastas/cenários; testes com mocks não encerram AC04–AC07. Registrar revisão visual e do documento separadamente da suíte automatizada.

**[IMPLEMENTADO 2026-09-19]** Código e regressão automatizada implementados conforme a entrevista. R2.3 tem controllers/persistência verificados em H2 e aguarda fluxo autenticado na aplicação; R2.7 aguarda revisão visual e aceite numérico. [Evidências, limites da verificação e roteiro](../r2-validacao.md). As marcações de implementação não significam aceite visual ou numérico.
