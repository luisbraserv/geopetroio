# Auditoria de setembro: cards no monitoramento do Desktop

Data: 2026-09-09. Escopo: specs de setembro aplicáveis aos cards, ao cache,
à leitura e à apresentação do monitoramento no Geopetro-Desktop. Não é uma
certificação de todas as funcionalidades de todos os projetos.

## Problema reproduzido e causas

A consulta autenticada com a configuração já existente nesta estação retornou
HTTP 200 e documento de revisão 3, com dois cards ativos: `PRESSAO_01` e
`CONTADOR_STROKE_01`. Portanto, o painel deve ter quatro indicadores: pressão,
stroke, vazão e volume acumulado. A ausência de cadastro não era a causa.

1. `MonitoringController` montava os nós exclusivamente de
   `SondaService.grandezas()`, preenchida apenas após leitura bem-sucedida do CLP.
   Sem primeira leitura, nenhum card cadastrado aparecia.
2. O controller era singleton. Cada abertura do FXML substituía `cardsPane`, mas
   mantinha o mapa de nós anteriores. Com as mesmas chaves, a sincronização
   retornava sem preencher o novo painel. Cada abertura também iniciava outro
   `Timeline`, sem encerrá-lo ao sair da página.
3. A sincronização considerava apenas ids/séries. Renomear um card ou mudar sua
   escala não reconstruía rótulos e visuais.
4. `CardsState.conectar`, que restaura o cache em disco, só era chamado após
   autenticação bem-sucedida no backend. O cache persistente existia, mas não
   atendia o reinício offline prometido pela RN-088.
5. As leituras não identificavam a revisão/unidade de seu documento, e a
   desconexão não as limpava. Valores antigos podiam sobreviver à configuração.

## Ajustes

| Regra/spec | Comportamento corrigido ou verificado |
|---|---|
| RN-080/081: configuração e identidade | `CardsDoMonitoramento` deriva os indicadores dos cards ativos, em `ordem`; valores apenas preenchem essa estrutura. Nomes e parâmetros acompanham o documento |
| RN-088/092: cache e unidade vazia | Cache carregado antes do login de rede; mensagem explica documento indisponível, unidade não selecionada, cadastro vazio ou todos os cards desativados |
| RN-090: três séries do contador | Um card de stroke gera stroke, vazão e volume acumulado, mesmo antes da primeira leitura |
| RN-091: desativar | Card desativado sai imediatamente da tela, sem depender de outro ciclo do CLP |
| RN-037: visibilidade | Card ativo invisível continua no Desktop; a filtragem de publicação permanece em `LeituraDeCards.paraPublicar` |
| RN-099: ausência não é zero | Sem leitura, mostra `--` no valor e no bruto, com “CLP desconectado” ou “Aguardando a primeira leitura”. Não publica placeholders |
| Monitoramento e navegação | Controller por instância do FXML; atualização periódica para ao remover a página da cena |
| Valores e configuração | Snapshot de leitura vinculado ao documento; leitura de outra unidade/revisão é descartada da apresentação. Desconexão/reconexão limpa o snapshot |
| Alarmes locais | Valor indisponível não recebe destaque de alarme antigo. Algoritmo existente de avaliação não foi alterado |

## Validação

- `mvn -Dfx.disponivel=true test`: **215 testes, zero falhas, erros ou pulados**.
- Teste JavaFX com FXML e Spring reais: quatro indicadores sem CLP, saída e
  retorno ao monitoramento, interrupção do timer, alteração de nome,
  desativação e mensagem de unidade vazia.
- Testes de serviço: três séries do contador; ativo invisível; ordenação;
  primeira leitura; descarte de valor após desconexão e troca de documento;
  cache disponível antes de autenticar e isolado por unidade.
- API real: login da estação e leitura dos cards retornaram HTTP 200.
- Logs de teste em `apps/geopetro-desktop/target/audit-monitoring-tests.log` e
  `apps/geopetro-desktop/target/audit-monitoring-regression.log`.
- Aplicação real reaberta e conferida visualmente: os quatro indicadores da
  revisão 3 aparecem com o CLP desconectado; o canal com o backend conectou.
  Os títulos das três séries do contador foram ajustados para caber por inteiro.
  Captura direta da janela: `apps/geopetro-desktop/target/monitoring-cards-fixed.png`.
- Após os ajustes finais, os sete testes de regressão passaram, e o teste JavaFX
  foi repetido para conferir o layout. Instância corrigida deixada aberta.

O CLP físico não foi conectado nesta auditoria. O teste de indicadores sem
leitura não comprova calibração, endereçamento do equipamento ou exatidão de
medições de campo. O cadastro e as credenciais da estação foram preservados.
