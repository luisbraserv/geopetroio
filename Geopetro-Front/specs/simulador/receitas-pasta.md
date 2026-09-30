# Receitas de pasta — composição e escala

## Contrato desta entrega

**[FATO 2026-09-06 — diagnóstico]** `SlurryCalculoService` calcula a composição
com `calcSlurryEngine` e entrega um `SlurryDesign` com as massas de água, sal,
sílica e aditivos. O serviço de receita chamava o motor novamente, alterando a
composição recebida e podendo modificar os aditivos do próprio design.

**[INFERÊNCIA — contrato técnico adotado]** A receita deve representar a composição
recebida. O dimensionamento pela densidade continua no serviço de cálculo da pasta;
a montagem da receita soma e escala os componentes, sem resolver outra mistura.

- Base de cimento: saco de 94 lb, com o volume absoluto da classe informado no design.
- Água doce, água do mar, NaCl, sílica e aditivos mantêm suas massas calculadas.
- Densidade de conferência = soma das massas / soma dos volumes absolutos.
- Rendimento = volume absoluto total convertido de galões US para ft³.
- A ausência do rendimento armazenado não impede recalculá-lo pela composição.
- Volume absoluto de cimento inválido ou componente negativo/não finito invalida
  a base. Não se substitui uma base inválida por uma receita padrão.
- Escala = volume solicitado em ft³ / rendimento. Todas as linhas da receita
  automática recebem o mesmo fator. Zero volume gera quantidades zero.
- Volume solicitado negativo/não finito e rendimento sobrescrito inválido são
  recusados. Uma receita recusada não oferece quantidades de uma base de um saco.
- Conversões da receita e do motor usam 231 in³/gal US, 1728 in³/ft³ e 42 gal/bbl,
  sem arredondamento intermediário.

Esta entrega não define faixas operacionais de plausibilidade, nem muda o modelo
de dosagem do motor. FAC/FAM manuais continuam com o comportamento existente;
a coerência de dosagens dependentes da água após alteração manual do FAC exige
uma revisão própria.

## Verificação

**[FATO 2026-09-06 — implementado e validado no working tree]**

- Reproduzidas as quatro falhas antigas antes da alteração. As expectativas de
  conversão passaram a usar as relações entre in³, galões e ft³ acima, substituindo
  constantes arredondadas. Os testes de composição e sal mantêm sua finalidade.
- O serviço de receita deixou de chamar `calcSlurryEngine`: soma os componentes
  recebidos, calcula o rendimento e escala as linhas sem modificar o design.
- 15 casos novos cobrem conservação de massa/volume, componentes dependentes da
  água sem mutação, integração com um design calculado pelo motor (água doce/mar,
  sílica, NaCl e aditivo BWOW), entradas inválidas, volume zero e conversão manual.
- Volume zero também deixou de produzir `NaN` nas linhas de água da receita manual.
- `npm.cmd test -- --watch=false`: **280 testes aprovados em 31 arquivos**, sem falhas.
- `npm.cmd run build`: aprovado. Permanecem os avisos anteriores de tamanho do
  bundle inicial (513,74 kB para orçamento de 500 kB) e dos estilos de squeeze/tampão.

As menções às quatro falhas nas entregas anteriores registram o estado daquela
verificação; esta entrega encerra essa pendência.
