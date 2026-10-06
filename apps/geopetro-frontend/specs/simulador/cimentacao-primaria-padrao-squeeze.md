# Cimentação primária — cenários, receitas e relatório (R2)

**[FATO 2026-09-19]** O código da R2 foi entregue; revisão visual, integração HTTP autenticada e aceite numérico com dados reais continuam pendentes. [Validação R2](r2-validacao.md) registra a evidência. A [versão de entrevista](history/cimentacao-primaria-r2-2026-09.md) preserva propostas e sequência de implementação, inclusive descrições de seis abas e painel de 320 px já substituídas.

Esta SPEC complementa o [motor da primária](cimentacao-primaria.md), a [tela atual](cimentacao-primaria-tela.md) e a [regra comum de fase](fase-operacao.md). Em conflito sobre layout, prevalece a tela atual; sobre física, a SPEC do motor.

## 1. Objetivo

A primária usa o padrão visual do squeeze com conteúdo próprio: grupos retráteis, cenários por pastas, receitas completas por pasta/estágio, sequência operacional derivada do programa e relatório entregável ao cliente. O cálculo usa a fase cadastrada e selecionada da operação.

## 2. Estado

O fluxo e os testes automatizados da R2 estão registrados em [r2-validacao.md](r2-validacao.md). Marcação de implementação não equivale a aceite visual ou numérico. Um cenário pode ser salvo como rascunho; emissão final depende da composição, do cálculo e dos limites da operação.

## 3. Layout e painel

Entradas ficam na sidebar; resultados, tabelas, desenhos e gráficos ficam nas **cinco abas** da [tela atual](cimentacao-primaria-tela.md#1-estrutura-da-página). O painel inteiro e seus grupos/subseções recolhem sem perder valores. A referência atual de largura é **500 px**; abaixo de **980 px** ele passa para cima do conteúdo. O dock mantém Cenários e Relatório acessíveis.

Os grupos cobrem identificação, poço e fases, revestimento, anular, fluidos, pasta, aditivos, estágios, programa, janela/equipamento e importação. Sem fase válida, o rascunho continua editável, mas cálculo e emissão ficam pendentes.

## 4. Dados do relatório

Cliente e logo; destinatário, autor e revisor; título, data, revisão e Job #; operador, campo, sonda e país; poço vinculado; objetivo/intervalo; observações e seções complementares pertencem ao mesmo estado do cenário. Nome do cenário identifica o salvamento e não substitui o título do documento. Campo ausente aparece como “Não informado”; trocar cenário limpa os dados que não lhe pertencem.

## 5. Sequência operacional

O **programa de bombeio** é a fonte estruturada de estágio, fluido, volume, vazão, pausa e evento. A sequência do relatório apresenta esses passos com textos e observações editáveis, mais preparação e encerramento informados pelo usuário. Alterar o programa atualiza prévia e documento; comentários seguem IDs estáveis quando a ordem muda.

A sequência da primária não herda automaticamente teste de injetividade, hesitação de squeeze, volume injetado na formação ou retirada de tubing do tampão. Informação documental sem passo de bombeio não altera o relógio da simulação. Planejamento não é atestado de execução.

## 6. Pasta, aditivos e receita

Cada pasta de cimento mantém composição e aditivos próprios. Pasta e Aditivos compartilham a seleção da pasta ativa, mas o relatório inclui **todas** as pastas usadas. Parâmetros como rendimento, FAC e FAM podem ser calculados ou informados manualmente; origem e modo sobrevivem a salvamento e importação. Valor medido diferente da estimativa não é substituído em silêncio.

A receita por pasta/estágio mostra base por saco de 94 lb quando aplicável, densidade, rendimento, FAC/FAM, volume dimensionado, reserva programada, volume preparado, sacos, água e cada produto com código, concentração, base de dosagem, quantidade e unidade. **Não há consolidação geral de materiais no relatório.** Reserva de mistura aumenta suprimento preparado, não o volume bombeado. Arredondar sacos para suprimento não altera o volume físico.

Receita ausente/inválida, cálculo incompleto ou pressão/vazão/potência acima do limite informado permitem prévia marcada **RASCUNHO**, com motivos, e bloqueiam imprimir/baixar a emissão final.

## 7. Cenários por pastas

“Pasta de cenários” agrupa arquivos; “pasta de cimento” compõe a operação. O modal oferece Sem pasta, criar/renomear/excluir pasta, listar, abrir, salvar, salvar como novo, mover, excluir, exportar e importar. Navegar em outra pasta não move o cenário aberto. Excluir pasta com cenários exige confirmação com nome e quantidade; cancelar preserva tudo.

Toda consulta e associação usa `operacao: 'primaria'`; a API recusa pasta/cenário de outra operação. “Salvo” aparece só após resposta da API para a revisão enviada. Falha de rede ou importação inválida preserva o trabalho aberto.

## 8. Relatório

O relatório combina identificação, poço e fase, geometria, volumes e programa, receitas individuais, sequência, resultados hidráulicos, limites, desenhos, gráficos, medições e diagnósticos. Dados e receitas vêm da mesma revisão. A apresentação atual segue a [SPEC da tela](cimentacao-primaria-tela.md#4-gráficos-e-relatório): capítulos na mesma folha quando cabem, figuras inteiras em A4 e seleção individual.

O download `.doc` existente é HTML compatível com Word; não deve ser apresentado como `.docx` nativo. Texto livre é escapado no HTML.

## 9. Persistência e compatibilidade

O cenário mantém `operacao`, `pastaId`, vínculo/versão do poço, fase selecionada, entradas físicas, receitas/aditivos, medições e dados do relatório. Resultados derivados são recalculados ao abrir. Arquivo portátil v2 preserva esses dados; v1 abre com metadados ausentes vazios e exige seleção de fase antes de recalcular. Operação incompatível ou estrutura inválida não substitui o cenário aberto.

## 10. Entregas

O [registro histórico](history/cimentacao-primaria-r2-2026-09.md#10-implementação-orientada-por-entregas) conserva R2.0–R2.7. O [roteiro de validação](r2-validacao.md) separa verificação automatizada, visual, HTTP e numérica.

## 11. Critérios de aceitação

AC01–AC21 continuam como verificações funcionais. O aceite numérico exige comparação posterior pelo usuário com caso real para volumes, sacos, água, aditivos e pressões; testes sintéticos não o substituem.

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

A integração HTTP real de pastas/cenários, a revisão visual e o aceite numérico devem ser registrados separadamente dos testes com mocks. O histórico contém as decisões e alternativas da entrevista.
