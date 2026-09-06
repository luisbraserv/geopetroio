# Poços e cenários do simulador

**[DECIDIDO 2026-09-05]** RN-059, RN-066 e RN-067: poço é dono da geometria e
do survey; cenários referenciam seu id. Sem vínculo, cenários legados continuam
abrindo sem migração forçada. Os mesmos perfis do simulador acessam o cadastro.

## Contrato desta entrega

**[FATO 2026-09-06 — implementado e validado no working tree]**

- CRUD em `/api/simulador/pocos`, compartilhado entre squeeze e tampão. Nome,
  geometria tipada em metros, versão e autoria da última alteração. Sem relação
  com telemetria ou posse por usuário.
- A geometria contém `wellFinalMD`, `wellFinalTVD`, `fases` e `trajectory`, no
  formato dos controles existentes. Persistência JSON validada em coluna própria
  do poço; sem duplicação desses campos no `formValue` dos cenários vinculados.
  Os TVDs manuais ficam disponíveis para desativar o survey; quando ativo, a
  trajetória determina os TVDs usados na validação e no cálculo.
- Cenário recebe `pocoId` opcional e `pocoVersion` para salvar um vínculo.
  Resposta inclui `poco`, com a geometria atual. GET individual é usado ao
  carregar para evitar reutilizar a geometria obtida na listagem.
- Atualizar poço requer a versão lida. Versão divergente retorna 409. A interface
  exige salvar alterações geométricas no poço antes de salvar o cenário
  vinculado; operações e receitas continuam específicas de cada cenário.
- Excluir poço com cenários retorna 409, sem cascata. Chave estrangeira e bloqueio
  transacional protegem a disputa entre exclusão e criação de vínculo.
- Salvar/corrigir um poço é uma ação explícita, com aviso do efeito sobre todos
  os cenários. Geometria inválida não é gravada. Carregar uma geometria que tornou
  a operação incompatível aciona a validação já existente no simulador.
- Não há atualização em tempo real de abas já abertas. Reabrir/recarregar o poço
  ou cenário busca o estado atual; versão impede salvar vínculo desatualizado.

## Banco

**[FATO 2026-09-06]** Virou a migration `V2026.09.05__simulador_pocos.sql` do Flyway, que roda no
startup do backend — não há mais script para aplicar à mão. Não extrai nem inventa poços a partir dos
nomes livres dos cenários antigos.

**[FATO 2026-09-06]** Na primeira execução da suíte completa, o teste preexistente
`BackendSondaGeopetroIoApplicationTests` iniciou o perfil dev com `ddl-auto=update`. O Hibernate criou
`simulador_pocos`, adicionou `poco_id` e a FK `fk_cenario_poco` no **MySQL local**, sem ninguém rodar
migration nenhuma.

**Isso deixou de ser um problema a administrar.** A migration é idempotente — guardas com
`information_schema` — e o Flyway a aplica normalmente numa base que já tenha a estrutura.
`MigracaoFlywayTest` cobre exatamente esse caso. E a causa raiz foi removida: `dev` passou de
`update` para `validate`, então o Hibernate não cria mais nada em silêncio.

Não foi executado deploy em produção.

O teste de inicialização agora fixa URL e driver H2 em memória, credenciais de
teste, dialeto H2 e `create-drop`, com falha imediata em erros de DDL. Também
verifica a URL da conexão. Sua execução isolada passou sem erro de schema.
O baseline recebe um complemento manual identificado; a parte histórica continua
sendo o schema anteriormente gerado pelo Hibernate.

## Verificação

**[FATO 2026-09-06]** `mvnw.cmd -pl app -am test`: 70 testes aprovados, sendo
nove novos em `PocoGeometryTest`, `PocoPersistenceTest` e `PocoSecurityTest`.
O teste de inicialização isolado em H2 foi aprovado após o ajuste descrito acima.

- Validação de fases, diâmetros, sapatas, campos ausentes e survey; conversão de
  persistência preserva valores tipados e TVDs manuais para uso sem survey.
- Dois cenários de operações distintas passam a ler a geometria corrigida do
  mesmo poço. O legado conserva seu conteúdo sem vínculo.
- Versão desatualizada bloqueia alteração e criação do vínculo. Exclusão vinculada
  é bloqueada no serviço e pela FK, sem cascata.
- HTTP exige autenticação e os perfis CIMENTACAO, GERENCIA, DIRETORIA ou ADMIN,
  seguindo o `SecurityConfig` existente. JSON inválido retorna 400; conflito, 409.

Os limites de 1000 fases e 10000 estações limitam o tamanho do cadastro aceito;
não representam faixas de plausibilidade de engenharia.
