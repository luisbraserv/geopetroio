# Cimentação primária — survey, caliper LAS e relatório A4

## Escopo

Esta entrega vale somente para a cimentação primária. Squeeze e tampão não passam a consumir survey ou caliper nesta versão.

## Survey direcional

- O survey é opcional e pertence às fases do poço.
- Cada estação manual contém somente MD, inclinação e azimute.
- Cada fase aceita no máximo 50 estações manuais.
- A TVD, o deslocamento Norte e o deslocamento Leste são calculados por mínima curvatura.
- As listas das fases formam uma trajetória cumulativa e contínua. Ao mudar um limite de fase, a estação é reatribuída pela sua MD.
- Quando não existe estação exatamente no topo ou na base, o sistema cria limites calculados. O topo herda a orientação anterior e a base mantém a última orientação conhecida. Antes da primeira medição, a inclinação é zero.
- Uma fase sem survey usa suas TVDs manuais. Uma fase posterior com survey continua da posição acumulada da fase anterior.
- MDs repetidos, dados incompletos, inclinação fora de 0°–180°, azimute fora de 0°–360°, estações fora do poço ou mais de 50 estações na mesma fase bloqueiam o salvamento e o cálculo.

## Caliper LAS

- O caliper é opcional e possui um único arquivo ativo por poço.
- Um botão no cadastro do poço importa `.las`; um novo arquivo válido substitui integralmente o anterior. Também existe a ação **Remover caliper**.
- Falha de leitura não altera o caliper atual. A mensagem deve informar que nada foi importado e que o último arquivo continua em uso.
- O arquivo original não é armazenado. São persistidos nome, data de importação, unidade normalizada, intervalo e amostras processadas.
- A associação às fases é dinâmica pelos intervalos de MD. Alterar fases recalcula associação, volumes e cenários.
- O importador converte unidades de profundidade para metros e de diâmetro para polegadas. Unidade desconhecida invalida a importação.
- A leitura exige profundidade e as curvas `EHD1` e `EHD2`. As amostras importadas são somente para consulta e não têm o limite de 50 pontos.
- A seção do poço é elíptica: `A = π × EHD1 × EHD2 / 4`. O volume é integrado por trapézios ao longo do MD, e o deslocamento externo do revestimento é descontado.
- Quando existir `IHV`, a diferença para a integração calculada é exibida. Diferenças superiores a 5% geram aviso e não bloqueiam a importação.
- Prioridade do diâmetro: LAS onde houver cobertura; diâmetro medido manual no restante; diâmetro nominal com arrombamento quando os dois anteriores não existirem.

## Recalculo e cenário

- O cenário mantém o identificador da fase selecionada.
- Mudanças na fase, survey ou caliper do poço provocam novo cálculo na cimentação primária.
- O volume continua integrado pelo comprimento MD. O survey altera TVD, trajetória e pressões; o caliper altera a área e o volume.
- Sem survey, usa-se TVD manual. Sem caliper, usa-se diâmetro medido manual ou nominal com arrombamento.

## Representação 2D

- O esquemático apresenta um perfil (deslocamento horizontal × TVD) e uma planta (Norte × Leste).
- O diâmetro nominal aparece tracejado; `EHD1/EHD2` formam o contorno medido e destacam ovalização/arrombamento.
- A escala radial pode ser ampliada para leitura, sempre com legenda dos valores reais.
- O revestimento permanece centralizado visualmente. O cimento ocupa o anular entre o tubo e o furo e respeita TOC, fundo, estágios e tipos de pasta.
- Sem survey, o perfil é vertical e a planta fica centrada. Sem caliper, a largura usa a geometria de fallback.

## Relatório

- Conteúdo textual, sequência operacional, fases, receitas, aditivos, volumes e tabelas são obrigatórios.
- Antes de emitir, o usuário escolhe quais desenhos e gráficos entram no relatório. Todos iniciam marcados, e a seleção não é persistida no cenário.
- O papel é A4. Conteúdo geral usa retrato; desenhos e gráficos largos podem usar A4 paisagem.

## Gráficos hidráulicos e sequência visual

- O gráfico **Pressão hidrostática e ECD** usa volume total injetado em bbl no eixo horizontal, pressão hidrostática anular em psi no eixo esquerdo e ECD em ppg no eixo direito.
- O **Envelope de pressão** usa TVD no eixo vertical e gradiente equivalente em ppg no eixo horizontal. A ordem das séries é: gradiente de poro pontilhado, pressão hidrostática máxima, ECD máximo e gradiente de fratura pontilhado.
- O envelope permite selecionar uma fase ou todas. O filtro usa os limites MD da fase e mantém TVD como profundidade apresentada.
- O gráfico **Volume injetado x tempo** apresenta o acumulado total e o acumulado de cada fluido da sequência operacional.
- A entrada de fluidos informa densidade em ppg e volume utilizado em bbl. O volume editável atualiza o passo correspondente; o deslocamento converte o volume para a fração da capacidade geométrica. O volume da lama inicial é calculado pela capacidade do circuito.
- O esquemático reproduz os snapshots do transporte e informa passo ativo, tempo, volume e vazão. Durante bombeio, o fluxo é animado para baixo no interior do tubo e para cima no anular.
- Os três gráficos possuem ampliação, exportação em PNG e versões vetoriais selecionáveis no relatório A4.

## Validação funcional

- Criar um poço de teste com fases `0–329,946 m`, `329,946–430,0728 m` (17,5 pol) e `430,0728–824 m`.
- Usar até 50 estações representativas do PDF de survey, preservando início, fim e mudanças relevantes.
- Importar o LAS fornecido como caliper do mesmo poço de teste.
- Criar um cenário de cimentação primária na fase de 17,5 pol, com receita de teste Classe G, 15,8 ppg e aditivos de exemplo.
- Identificar claramente dados ajustados como dados de teste, sem apresentá-los como dados operacionais reais.
