# Identidade e cadastro — rodada 2 da entrevista

**[DECIDIDO 2026-09-05]** RN-061 a RN-065, mais RN-072. Bloco independente da frota e do
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

### RN-063 · Exclusão bloqueada por vínculo, em todos os cadastros

A regra que só a Regional aplicava passa a valer para **Setor, Unidade/Sonda e Empresa**. Antes, os
três quebravam em violação de FK e devolviam `500` genérico.

`VinculoCadastroPort` + `GuardaDeExclusao` **substituem** o antigo `RegionalConsultaPort`. Duas
mudanças sobre o mecanismo anterior:

1. **Vale para os quatro cadastros**, com uma porta declarando por qual responde.
2. **A porta devolve a descrição do que impede**, não um booleano. Quem conhece o vínculo sabe
   descrevê-lo; o serviço só junta as descrições.

A recusa saiu de *"existem setores ou unidades/sondas vinculados"* para *"Nao e possivel excluir a
regional: 2 setores vinculados e 1 unidade/sonda vinculada."* — `409`, com a mensagem chegando ao
toast do front pelo `parseApiError` que já existia.

**A guarda consulta todas as fontes antes de recusar**, em vez de parar na primeira: recusar três
vezes seguidas, cada uma revelando um impedimento novo, é pior que recusar uma vez dizendo os três.

Fontes registradas hoje — acrescentar uma não exige tocar em configuração, só um `@Component`:

| Cadastro | O que impede | Onde |
|---|---|---|
| Regional | setores · unidades/sondas | `setor` · `unidade-sonda` |
| Setor | unidades/sondas | `unidade-sonda` |
| Unidade/Sonda | clientes com acesso concedido · **histórico de telemetria** | `usuario` · `app` |
| Empresa | usuários vinculados | `usuario` |

**Sem exclusão lógica.** Nada de `ativo=false` como substituto de apagar.

### RN-072 · Histórico de telemetria conta como vínculo

Uma Unidade/Sonda com série gravada não pode ser excluída — e o Geopetro-Backend não sabia disso
sozinho, porque o vínculo que ele enxerga é relacional e a série vive no InfluxDB, em outro serviço.

**Endpoint novo no Geopetro-Telemetria:** `GET /api/monitoramentos/sondas/{id}/existe`, devolvendo
`possuiSerie` mais o primeiro e o último ponto. As datas vão junto para a recusa dizer *"telemetria de
01/03/2026 a 05/09/2026"* em vez de um "existe vínculo" que não diz o quê. No InfluxDB é consulta de
extremos (`first()`/`last()`), não varredura.

⚠️ **Indisponibilidade bloqueia a exclusão.** Isto inverte de propósito a degradação graciosa que vale
para a consulta de série: lá, falhar devolvendo vazio custa uma tela sem gráfico; aqui, assumir "não
tem histórico" porque ninguém respondeu apaga um cadastro que não podia ser apagado. Só um dos dois
erros tem volta.

⚠️ **`Optional.empty()` significa coisas opostas nos dois métodos do mesmo cliente** — em
`consultarSerie` é "sem dados", em `consultarExistencia` é "não consegui perguntar". Está no javadoc
de ambos, porque confundi-los apaga cadastro com histórico.

**Datas formatadas em UTC**, não no fuso da máquina: o contrato de telemetria é UTC ponta a ponta, e
um ponto gravado à meia-noite UTC apareceria como o dia anterior em qualquer fuso negativo — a recusa
passaria a depender de onde a aplicação roda.

**O adaptador consulta pelo nome da sonda**, que é a chave de integração com a telemetria
([RN-018](../../specs/business-rules.md#rn-018--nome-da-unidadesonda-é-chave-de-integração)), e usa o
repositório em vez do `UnidadeSondaService` — o serviço depende da guarda, a guarda depende do
adaptador, e injetar o serviço fecharia um ciclo que o Spring recusa a subir.

### RN-064 · O usuário não tem mais vínculo organizacional

Saíram do sistema a regional principal, a lista N:N de regionais e a lista N:N de setores do usuário
interno — domínio, entidade, request, command, response, formulário e tabelas.

- `UsuarioInterno` fica apenas com **matrícula**. `RegionalRef` e `SetorRef` deixaram de existir.
- `regionalId`/`regionalNome` saíram do `AutenticacaoResponse` e do `AuthState` do front, onde já
  eram guardados **sem nenhum consumidor**.
- **Código morto arrastado junto:** com a remoção, `RegionalBuscaPort` e `SetorConsultaPort` ficaram
  sem nenhum chamador. As duas portas e seus adaptadores (`RegionalBuscaAdapter`,
  `SetorConsultaAdapter`) foram removidos. Não confundir com `RegionalConsultaPort`, que era outra
  interface e sustentava a guarda de exclusão da Regional — essa foi **substituída** por
  `VinculoCadastroPort` em RN-063, acima.
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

**[FATO 2026-09-06]** As duas mudanças viraram migrations do **Flyway**, que roda no startup do
backend. Não há mais script para executar à mão — a fila manual de
[DT-002](../../specs/technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema)
deixou de existir.

| Versão | O que faz |
|---|---|
| `V2026.09.06.1__unidade_sonda_tipo.sql` | Adiciona `tipo` nula → backfill `SONDA` → torna NOT NULL |
| `V2026.09.06.2__usuario_sem_vinculo_organizacional.sql` | `DROP` das duas tabelas N:N e da coluna `regional_id` |

⚠️ **A `.1` classifica todas as linhas existentes como `SONDA`.** É o padrão coerente com a frota
atual, mas a classificação precisa ser conferida registro a registro na tela depois do deploy — o
campo é editável para isso.

⚠️ **A `.2` descarta dados sem volta**, e não há backup do MySQL
([decisão de 2026-09-05](../../specs/product-context.md#11-fechamentos-das-rodadas-3-a-6)). O cabeçalho
do script traz os `SELECT` de exportação, caso haja intenção de consultar os vínculos depois. A FK de
`regional_id` é descoberta em tempo de execução: bases criadas em momentos diferentes receberam nomes
gerados diferentes do Hibernate.

**[FATO 2026-09-06]** Nenhuma foi aplicada em produção. Diferente do caso de
[poços](simulador-pocos.md#banco), o MySQL local **não** recebeu a estrutura por efeito colateral —
`dev` passou a usar `ddl-auto=validate` junto com esta entrega.

## Verificação

**[FATO 2026-09-06]** `mvnw.cmd -pl app -am test`: **110 testes aprovados**, sendo 26 no módulo
`usuario` e 84 no `app`. Eram 70 no total antes desta entrega.

No Geopetro-Telemetria, `mvnw.cmd test`: **27 aprovados**, contra 24 antes.

⚠️ **Uma correção de infraestrutura foi necessária para chegar até aqui.** A suíte do
Geopetro-Telemetria estava com **10 dos 24 testes quebrados** por incompatibilidade entre o Byte Buddy
que o Spring Boot 3.4.5 traz e o Java 25 instalado — falha pré-existente, verificada na árvore sem
estas alterações. Registrada em
[DT-016](../../specs/technical-debt.md#dt-016--inconsistências-de-organização-de-projeto).

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
- `GuardaDeExclusaoTest` — 7 casos: sem fontes, fonte sem vínculo, recusa `409` dizendo o que impede,
  reunião de vários impedimentos numa recusa só, porta que não vaza para outro cadastro, três
  impedimentos legíveis como frase, lista nula.
- `TelemetriaVinculoAdapterTest` — 7 casos, com destaque para **telemetria indisponível impedindo a
  exclusão**; também a consulta pelo nome, o cadastro inexistente que não chega a perguntar, e as
  datas em UTC.
- `ConsultaExistenciaServiceTest` (Telemetria) — 3 casos: sonda com série, sem série e com ponto único.

Front: `npm run build` aprovado, com os avisos de tamanho de bundle já registrados. Suíte com
**261 aprovações e as 4 falhas conhecidas** de `cement-slurry-recipe.service.spec.ts`, em 31
arquivos — as mesmas de antes desta entrega, em arquivo não tocado por ela.

## O que esta entrega não faz

| Fora de escopo | Onde está |
|---|---|
| Recuperação de senha por autoatendimento (traz SMTP de volta) | [OQ-021](../../specs/open-questions.md#oq-021--recuperação-de-senha-é-planejada) |
| Padronizar `/auth` e `/usuarios` em `/api` | ✅ Entregue posteriormente: [api-prefix.md](api-prefix.md) |
| Revogação de token individual | RN-062 registra que continua não existindo |
| Autenticação entre o Geopetro-Backend e a Telemetria | Firewall é a única proteção — [product-context §10](../../specs/product-context.md#10-identidade-acesso-e-cadastro) |
