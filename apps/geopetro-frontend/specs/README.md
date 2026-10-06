# Specs — Geopetro-Front

O Front é a aplicação web do GeopetroIO. Contratos entre aplicações e regras transversais ficam nas [specs do sistema](../../../specs/); aqui ficam as decisões específicas da interface e do simulador.

## Onde encontrar cada requisito

| Assunto | Documento |
|---|---|
| Poço, fases, survey e geometria | [Geometria de poço](simulador/geometria-poco.md) · [Fase de trabalho](simulador/fase-operacao.md) |
| Cimentação primária, motor e critérios numéricos | [SPEC principal](simulador/cimentacao-primaria.md) |
| Tela, cenários, pastas e relatório da primária | [Tela](simulador/cimentacao-primaria-tela.md) · [Padrão R2](simulador/cimentacao-primaria-padrao-squeeze.md) |
| Gráficos e medições da primária | [Gráficos e dados medidos](simulador/cimentacao-primaria-graficos.md) |
| Squeeze e tampão | [Gráficos e motor comuns](simulador/squeeze-tampao-graficos-motor.md) · [Janela operacional](simulador/janela-operacional.md) |
| Receitas e validação | [Receitas de pasta](simulador/receitas-pasta.md) · [Faixas de validação](simulador/faixas-validacao.md) |
| Evidências de R2 | [Validação R2](simulador/r2-validacao.md) |

O [histórico de implementação](simulador/history/) conserva sequências de entrega, revisões e resultados datados. A regra vigente fica nos documentos da tabela. As rotas e permissões implementadas são verificadas em `src/app/app.routes.ts` e nos guards; não devem ser copiadas para este índice.

## Convenções de interface

- A página da primária usa entradas na sidebar, resultados no conteúdo e Cenários/Relatório no dock. As cinco abas e os gráficos atuais estão na [SPEC da tela](simulador/cimentacao-primaria-tela.md).
- Squeeze, tampão e primária compartilham o componente de gráficos de operação. Cada operação conserva suas regras de cálculo, geometria e relatório.
- Cenários são vinculados ao poço e à fase escolhida. O cálculo usa a fase selecionada, conforme [fase de trabalho](simulador/fase-operacao.md).
- O relatório do simulador é entregável ao cliente; limites excedidos, origem dos dados, unidades e resultados parciais precisam ficar explícitos.

## Verificação do Front

Os testes Angular devem rodar pelo builder configurado no projeto:

```text
npm test
npx ng test --watch=false
npm run build
```

O comando direto `npx vitest run` não prepara o ambiente Angular deste repositório e não serve como verificação da suíte.