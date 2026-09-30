# Cimentação primária — tela

**[FATO 2026-09-25]** A página usa o desenho do squeeze, com entradas no painel lateral, resultados no conteúdo e ações de Cenários e Relatório no dock. Esta SPEC descreve a interface vigente. O [histórico do redesenho](history/cimentacao-primaria-tela-implementacao-2026-09.md) conserva T1–T7 e as revisões de 2026-09-25.

As regras de cálculo e os casos numéricos estão na [SPEC da primária](cimentacao-primaria.md). Pastas, sequência operacional e receitas do relatório seguem o [padrão R2](cimentacao-primaria-padrao-squeeze.md).

## 1. Estrutura da página

A sidebar retrátil contém os campos editáveis, agrupados em subseções. O conteúdo mostra resultados, tabelas, desenhos e gráficos. O dock mantém **Ocultar/Exibir painel**, **Cenários** e **Relatório** acessíveis, inclusive em tela estreita. O estado de salvamento acompanha Cenários.

As cinco abas, na ordem, são:

| Aba | Conteúdo |
|---|---|
| **Volumes e programa** | Dimensionamento, TOC, deslocamento, cronograma e sequência |
| **Receita da pasta** | Composição, rendimento, sacos, água e aditivos por pasta/estágio |
| **Simulador** | Pressões, ECD, gráficos e limites excedidos |
| **Esquemático** | Fases, 2D, reprodução, estado/ECD no instante e 3D sob demanda |
| **Dados medidos** | Importações, proveniência, alinhamento e comparação |

A aba Transporte foi retirada; seus cálculos continuam no motor. O envelope é um gráfico da aba Simulador, sem tabela ou aba própria. A reprodução fica no bloco Esquemático 2D, começa em **3×** e oferece **3×, 5×, 20× e 60×**.

## 2. Entradas e resultados

Os grupos da sidebar cobrem identificação do relatório; poço e fases; revestimento; anular; fluidos, pastas e aditivos; estágios; programa de bombeio; janela e equipamento; referências; e importação de medições. A edição de uma entrada invalida o resultado e pausa a reprodução. Mover o cursor não recalcula.

Cada resultado exibe unidade e origem. Valor indisponível mostra o motivo, nunca zero substituto. Diagnósticos exibem código e severidade; cálculo interrompido fica marcado como parcial.

O painel tem largura de **500 px**. Abaixo de **980 px** de viewport ele passa para cima do conteúdo; tabelas podem rolar sem cortar rótulos ou unidades.

## 3. Pasta e aditivos

A receita aceita aditivos do catálogo ou manuais, com concentração e unidade. O volume de cimento bombeado continua derivado de **TOC, geometria e intervalos**; aditivos alteram rendimento, número de sacos, água e quantidades da receita, sem criar um segundo volume editável que alimente a simulação. Receitas individuais por pasta e estágio aparecem no relatório conforme R2.

## 4. Gráficos e relatório

A aba Simulador usa o componente comum de gráficos da primária, squeeze e tampão: hidrostática/ECD, envelope e volume × tempo. O envelope mostra a hidrostática mínima por profundidade e a mínima do poço. Poro e fratura aparecem somente onde há formação exposta; ΔECD representa atrito, com pressão de retorno separada. Os anexos G1–G5 e dados medidos seguem [gráficos e medições](cimentacao-primaria-graficos.md).

O relatório usa capítulos numerados, sequência operacional legível e seleção de figuras. Capítulos seguem na mesma folha quando couberem; título não fica sozinho no rodapé. Desenhos e gráficos ficam inteiros, empilhados em retrato, sem subtítulo numerado por figura. O conteúdo técnico e as receitas seguem a SPEC principal e R2.

## 5. Cenários e aceite

Cenários podem ser listados, abertos, salvos, exportados e importados pelo dock. “Salvo” só aparece após resposta bem-sucedida da API; arquivo inválido não substitui o cenário aberto. Medições importadas não alteram o cálculo. Relatório parcial não apresenta conclusão definitiva.

Aceitar a tela exige conferir: sidebar e dock em larguras normal e estreita; cinco abas e gráficos; edição e invalidação; reprodução sincronizada com 2D/3D; aditivos sem alteração indevida do volume; persistência dos cenários; e relatório com as figuras selecionadas. A validação numérica permanece nos casos da [SPEC principal](cimentacao-primaria.md#11-casos-de-aceitação-e-verificação).