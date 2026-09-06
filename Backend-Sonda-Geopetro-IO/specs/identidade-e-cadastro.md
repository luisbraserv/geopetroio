# Identidade e cadastro — rodada 2 da entrevista

**[DECIDIDO 2026-09-05]** RN-061, RN-062, RN-064 e RN-065. Bloco independente da frota e do
auto-update: entrega sozinho, sem tocar na borda.

## Contrato desta entrega

**[FATO 2026-09-06 — implementado e validado no working tree]**

### RN-061 · Política de senha unificada

`PoliticaSenha` no domínio de `usuario`: **8 a 20 caracteres**, com minúscula, maiúscula, dígito e
caractere especial. Aplicada nos **três** caminhos que definem senha — criar cliente, criar interno
e `PATCH /usuarios/me/senha`, que antes só conferia se os dois campos batiam.

- **Incide sobre a definição, nunca sobre a verificação.** Senhas já gravadas que não atendem à
  regra continuam autenticando; forçar adequação exigiria troca compulsória, que não foi decidida.
- Espaço em branco **não** conta como caractere especial: é invisível na conferência e sobrevive mal
  a copiar e colar.
- Todas as exigências não cumpridas vão numa **mensagem só** — apontar uma por vez faz o usuário
  descobrir a regra por tentativa e erro.
- Fora de escopo, conforme a regra: expiração periódica, histórico de senhas e bloqueio por
  tentativas.

### RN-062 · Desativar corta o acesso na hora

`ContaAtivaVerificador` consulta o status a cada requisição autenticada, e o
`JwtAuthenticationFilter` só popula o contexto de segurança se a conta estiver ativa.

- A consulta é uma **projeção de um campo** (`findStatusByUsername`), não o carregamento do usuário
  inteiro com roles, endereço e coleções.
- Cache curto em memória, `security.cache-status-segundos` (default **10**). **O cache define a
  janela do corte:** um usuário desativado passa por até esse tempo, contra a hora inteira de antes.
  É o único botão que troca corte rápido por menos consultas.
- Conta **inexistente** é barrada: username válido no token e ausente no banco significa usuário
  removido, e negar é a leitura segura.
- **O login também passou a checar o status.** Sem isso o corte no filtro seria contornado por um
  novo login — `AutenticacaoUseCase` não verificava o status em nenhum momento. A mensagem
  distingue conta desativada de senha errada porque o sistema não tem autocadastro: as contas são
  nomeadas e criadas por `ADMIN`.
- **Continua valendo:** não há revogação de token individual. Token vazado de usuário *ativo* segue
  válido até expirar. Fecha a parte decidida de [SEC-008](../../specs/security-findings.md#sec-008--token-não-revogável-e-desacoplado-do-estado-do-usuário).

### RN-064 · O usuário não tem mais vínculo organizacional

Saíram do sistema a regional principal, a lista N:N de regionais e a lista N:N de setores do usuário
interno — domínio, entidade, request, command, response, formulário e tabelas.

- `UsuarioInterno` fica apenas com **matrícula**. `RegionalRef` e `SetorRef` deixaram de existir.
- `regionalId`/`regionalNome` saíram do `AutenticacaoResponse` e do `AuthState` do front, onde já
  eram guardados **sem nenhum consumidor**.
- **Código morto arrastado junto:** com a remoção, `RegionalBuscaPort` e `SetorConsultaPort` ficaram
  sem nenhum chamador. As duas portas e seus adaptadores (`RegionalBuscaAdapter`,
  `SetorConsultaAdapter`) foram removidos. `RegionalConsultaPort` — outra interface, que sustenta a
  guarda de exclusão da Regional — **permanece**, implementada por `setor` e `unidade-sonda`.
- **Elimina um modo de falha:** hoje, excluir uma Regional com usuários vinculados e sem setores
  passava pela validação e quebrava em violação de FK com `500` genérico.
- **O que decide visibilidade continua inalterado:** a role (RN-047) e, para o cliente, a concessão
  explícita de unidades em `usuario_cliente_unidades` (RN-048).

### RN-065 · Unidade/Sonda tem tipo

Enum fechado `TipoUnidadeSonda`: `SONDA` · `UNIDADE_BOMBEIO` · `SLICKLINE_WIRELINE` · `CIMENTACAO` ·
`UCAQ`. Campo obrigatório na entidade, no request, na resposta e na tela de cadastro.

- **Classificação apenas** (RN-074). A telemetria segue exclusiva de sonda de perfuração, com as
  mesmas cinco grandezas. Uma unidade de outro tipo existe no cadastro **sem monitoramento**.
- O tipo é **editável**: uma classificação errada no backfill da migration precisa ter conserto.
- ❌ **Sem perfil de limites de alarme por tipo** — a proposta de RN-065/RN-071 foi recusada em
  RN-078. O tipo não carrega comportamento nenhum por ora.

## Banco

Duas migrations manuais em `db/migrations/`, ambas **obrigatórias antes do próximo deploy** —
produção roda `ddl-auto=validate` e a aplicação não sobe sem elas:

| Ordem | Script | O que faz |
|---|---|---|
| 1 | `2026-09-06-unidade-sonda-tipo.sql` | Adiciona `tipo` nula → backfill `SONDA` → torna NOT NULL |
| 2 | `2026-09-06-usuario-sem-vinculo-organizacional.sql` | `DROP` das duas tabelas N:N e da coluna `regional_id` de `usuarios` |

⚠️ **O script 1 classifica todas as linhas existentes como `SONDA`.** É o padrão coerente com a
frota atual, mas a classificação precisa ser conferida registro a registro na tela depois do deploy.

⚠️ **O script 2 descarta dados sem volta**, e não há backup do MySQL
([decisão de 2026-09-05](../../specs/product-context.md#11-fechamentos-das-rodadas-3-a-6)). O
cabeçalho do script traz os `SELECT` de exportação, caso haja intenção de consultar os vínculos
depois.

O baseline `deploy/vm1-transacional/mysql-init/01-schema.sql` foi atualizado nas duas frentes.

**[FATO 2026-09-06]** Nenhuma das duas migrations foi executada em produção. Diferente do caso de
[poços](simulador-pocos.md#banco), o teste de inicialização já roda em H2 `create-drop` isolado, então
o MySQL local **não** recebeu a estrutura por efeito colateral da suíte.

## Verificação

**[FATO 2026-09-06]** `mvnw.cmd -pl app -am test`: **96 testes aprovados**, sendo 26 no módulo
`usuario` e 70 no `app`. Eram 70 no total antes desta entrega.

Testes novos:

- `PoliticaSenhaTest` — 14 casos: as quatro classes, os dois extremos de tamanho, acentuação,
  nulo/vazio, espaço não valendo como especial, e a mensagem única reunindo as pendências.
- `ContaAtivaVerificadorTest` — 7 casos: ativo, inativo, inexistente, username vazio sem tocar o
  banco, o cache evitando uma consulta por requisição, a desativação aparecendo na chamada seguinte
  com cache desligado, e contas diferentes não compartilhando entrada.
- `JwtAuthenticationFilterTest` — 4 casos: token válido de conta ativa autentica; token válido de
  conta desativada **não** autentica e a cadeia segue (quem responde 401/403 é a camada de
  autorização); sem cabeçalho e com token inválido o estado da conta nem é consultado.
- `UnidadeSondaServiceTest` — 2 casos novos: gravar tipo diferente de `SONDA` e corrigir o tipo de
  uma unidade existente.
- `UsuarioTest` — os três casos de regional/setor deram lugar a um de matrícula inválida.

Front: `npm run build` aprovado, com os avisos de tamanho de bundle já registrados. Suíte com
**261 aprovações e as 4 falhas conhecidas** de `cement-slurry-recipe.service.spec.ts`, em 31
arquivos — as mesmas de antes desta entrega, em arquivo não tocado por ela.

## O que esta entrega não faz

| Fora de escopo | Onde está |
|---|---|
| Recuperação de senha por autoatendimento (traz SMTP de volta) | [OQ-021](../../specs/open-questions.md#oq-021--recuperação-de-senha-é-planejada) |
| Exclusão bloqueada por vínculo em Setor, Unidade/Sonda e Empresa | [RN-063](../../specs/business-rules.md#rn-063--exclusão-bloqueada-por-vínculo-em-todos-os-cadastros) |
| Padronizar `/auth` e `/usuarios` em `/api` | [RN-079](../../specs/business-rules.md#rn-079--a-api-padroniza-o-prefixo-api) |
| Revogação de token individual | RN-062 registra que continua não existindo |
