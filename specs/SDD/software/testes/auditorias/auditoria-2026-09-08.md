# Auditoria da aplicação local — 2026-09-08

## Verificação de 2026-09-09, 15:20 — o que os oito commits de alarmes deixaram de pé

**Os três serviços sobem com o código atual e as três rotas novas estão registradas.**

| Verificação | Resultado |
|---|---|
| Backend `/actuator/health` | `200` · `UP`, com liveness e readiness |
| Telemetria `/actuator/health` | `200` · `UP`, com **InfluxDB acessível** e **MQTT conectado** |
| Front na 4200 | `200` |
| `deploy/dev/audit-endpoints.ps1` | **33 verificações, todas passaram** — inclui as três rotas novas. Resultado em `deploy/dev/audit-endpoints-result.txt` |
| Flyway | 11 migrations validadas; schema em `2026.09.09.1`, a do log de eventos |
| Rotas novas no OpenAPI | `/api/sondas/prontidao`, `/api/sondas/{id}/alarmes` e `/api/sondas/{id}/alarmes/historico` |

⚠️ **`401` no script não prova que a rota existe.** O matcher `/api/sondas/**` recusa antes de rotear,
então rota inexistente responde igual. A prova veio de `/v3/api-docs`, que é `permitAll` e lista o que
o Spring MVC mapeou de fato — as três aparecem lá.

### O que **não** foi verificado

- ⚠️ **Nenhum fluxo autenticado.** Login com credencial real segue sem validação, como nas auditorias
  anteriores. Ninguém abriu a tela de limites, o histórico ou a prontidão com um usuário de verdade;
  o que se provou é que as rotas existem e recusam anônimo.
- ⚠️ **Nenhum alarme real.** O motor não foi exercitado com telemetria chegando: `ciclosRecebidos: 0`
  no health da telemetria. Não houve episódio gravado, nem destaque na tela, nem beep na estação.
- ⚠️ **O Desktop não foi executado.** O alarme de borda e o aviso de card invisível foram compilados e
  testados, e **nenhum olho humano os viu na tela**.
- **Suítes automatizadas**, estas sim rodadas: 236 no backend, 413 no Front (46 arquivos) e 207 no
  Desktop (3 pulados, os de JavaFX). Sem falhas.

### Correções de percurso

O `spring-boot:run` precisa rodar **de dentro do módulo** (`-pl app`, sem `-am`) depois de um
`install` dos módulos — com `-am` o goal cai no agregador raiz e falha com "Unable to find a suitable
main class". O `start-dev.cmd` já fazia certo, e o comentário dele explica por quê.

A telemetria não sobe sem `INFLUX_TOKEN`, `INFLUX_URL`, `INFLUX_ORG`, `INFLUX_BUCKET` e
`MQTT_BROKER_URL`, que o `start-dev.cmd` injeta. ⚠️ **O token está versionado nesse arquivo** — é da
mesma família de [SEC-007](../../seguranca/security-findings.md#sec-007--senha-de-banco-em-texto-plano-versionada), e
continua aberto.


## Resultado da nova tentativa — 2026-09-09, 07:07

**Backend e telemetria atualizados e em execução; ambos com health HTTP 200 / UP.**
O frontend responde HTTP 200 na porta 4200. Todas as **27** verificações do script
`deploy/dev/audit-endpoints.ps1` passaram.

⚠️ **O arquivo `deploy/dev/audit-endpoints-result.txt` não guarda mais este resultado** — ele foi
sobrescrito pela execução das 15:20, com 33 verificações. É um arquivo só, sempre da última corrida.

- Backend: reactor completo compilado e empacotado; **203 testes**, nenhuma
  falha, erro ou teste pulado. Inclui migrations em MySQL de teste e segurança HTTP.
- Telemetria: compilada e empacotada; **28 testes**, nenhuma falha, erro ou teste
  pulado. MQTT conectado, InfluxDB acessível e consulta de séries HTTP 200.
- Login pelo frontend: credenciais inválidas retornam HTTP 401 com a mensagem
  correta. Não foi usada senha de um usuário real; isso não certifica login real.
- Readiness do backend: HTTP 200 / UP, incluindo verificação do banco.

### Recuperação dos arquivos e compilação

O fonte `ConsultaExistenciaService.java` ficou acessível fora do sandbox.
Os outros três arquivos bloqueados foram recuperados dos objetos Git locais,
com os hashes do índice conferidos. Tamanho e data dos arquivos bloqueados
coincidiam com o índice. Foram restaurados no projeto, preservando os originais
em `Geopetro-Backend/target/onedrive-placeholders/`.

Um `.class` gerado também estava bloqueado pelo OneDrive; por isso os builds
completos foram executados em `%TEMP%/geopetro-audit-retry-20260909/`, com cópia
dos fontes atuais e as três recuperações. Os logs `audit-build.log` e relatórios
Surefire ficam nessa cópia. O problema de sincronização de arquivos gerados não
foi considerado resolvido globalmente.

Os pacotes testados foram copiados para o projeto com SHA-256 conferido e estão
em execução a partir destes arquivos:

- `Geopetro-Backend/app/target/Geopetro-Backend-audited-20260909.jar`
- `Geopetro-Telemetria/target/Geopetro-Telemetria-audited-20260909.jar`

Logs atuais: `Geopetro-Backend/.logs/server-audited.out.log` e
`Geopetro-Telemetria/target/server-audited.out.log`. As limitações sobre pacote
antigo e health de telemetria registradas abaixo são históricas e foram superadas.

## Histórico: primeira atualização — 2026-09-09

Após autorização explícita do usuário, foi criado um novo backup completo em
`Geopetro-Backend/app/target/pre-migration-20260909-063047.sql`. O Flyway criou
o histórico, registrou o baseline `2026.09.04` e aplicou as oito migrações até
`2026.09.07.4`. Todos os registros indicam sucesso; o Hibernate validou o schema
e o backend iniciou na porta 8080.

O login foi exercitado diretamente e pelo frontend com credenciais inválidas:
ambos responderam HTTP 401 com a mensagem correta, sem o antigo 500 do proxy.
As 24 verificações de acesso anônimo às famílias protegidas (direto e via proxy)
responderam 401. Login com credenciais reais permanece sem validação.

O health agregado revelou SMTP local não configurado. O probe de e-mail passou
a ser opcional no perfil dev (`MAIL_HEALTH_ENABLED`, padrão false), e o readiness
foi configurado explicitamente para incluir o banco. As mesmas opções foram
aplicadas na inicialização do pacote disponível, pois recompilar o código atual
continua dependendo da disponibilidade dos arquivos do OneDrive.

A telemetria segue no pacote disponível de 27/08: a consulta de séries responde
200, mas o endpoint de health desse pacote não está implementado. Essa limitação
não foi ocultada nem considerada um teste aprovado.

## Retomada: inicialização local

- O pacote disponível do backend (07/09) foi iniciado com Flyway desabilitado
  e validação do schema: falhou porque falta a tabela `configuracao_cards`.
- O banco local não possui `flyway_schema_history`.
- Backup completo criado em
  `Geopetro-Backend/app/target/pre-start-backup-20260908.sql` (não versionar).
- A inicialização com as migrações oficiais foi rejeitada pela revisão automática
  de aprovação: `V2026.09.06.2` exclui vínculos antigos de usuários e exige
  autorização explícita. Nenhuma migração foi executada nesta retomada.
- Telemetria iniciada com o pacote disponível de 27/08: consulta de séries
  respondeu HTTP 200 e conectou ao MQTT/InfluxDB. Esse pacote antigo não oferece
  `/actuator/health`; não representa o código atual ainda bloqueado pelo OneDrive.
- Frontend iniciado em segundo plano na porta 4200.

## Diagnóstico confirmado

`POST http://localhost:4200/api/auth/login` com corpo vazio retornou HTTP 500,
`Content-Type: text/plain` e corpo vazio. As conexões diretas a `localhost:8080`
e `localhost:8081` foram recusadas. Isso explica a mensagem genérica mostrada
na tela: o proxy está acessível, mas o backend não está alcançável neste ambiente.
Não foi validado login com credenciais reais.

Os dois serviços Java não compilam porque o OneDrive retorna “A operação de
nuvem é inválida” ao ler fontes. Arquivos identificados:

- `Geopetro-Backend/unidade-sonda/src/main/java/com/geopetro/unidadesonda/adapter/out/persistence/UnidadeSondaVinculoAdapter.java`
- `Geopetro-Backend/unidade-sonda/src/main/java/com/geopetro/unidadesonda/adapter/out/persistence/UnidadeSondaSetorVinculoAdapter.java`
- `Geopetro-Telemetria/src/main/java/com/braservpetroleo/telemetria/geopetroio/application/service/ConsultaExistenciaService.java`
- `Geopetro-Telemetria/src/test/java/com/braservpetroleo/telemetria/geopetroio/application/service/ConsultaExistenciaServiceTest.java`

Foi solicitado manter esses arquivos localmente (`attrib +P -U`), mas a leitura
continuou falhando. Os conteúdos não foram substituídos nem recriados.

## Correções aplicadas

- Perfil de produção: associa explicitamente `CORS_ALLOWED_ORIGINS` e
  `CORS_ALLOWED_ORIGIN_PATTERNS` às propriedades usadas por `SecurityConfig`.
  Antes o perfil caía no padrão localhost apesar das variáveis do compose.
- Interceptor: restringe o token às chamadas da API protegida; login e recuperação
  de senha não recebem o token antigo e suas respostas 401 não expiram a sessão.
- Login: evita erro JavaScript ao receber resposta sem `roles`.
- Erros HTTP: distingue indisponibilidade/erro 5xx, credenciais inválidas e acesso
  proibido. Preserva mensagens específicas enviadas pela API.
- Inicialização: `curl --fail` impede anunciar saúde quando o endpoint retorna
  HTTP 4xx/5xx.
- Checagem reproduzível: `deploy/dev/audit-endpoints.ps1`, sem alteração de dados.

## Cobertura e evidências

| Área | Verificação | Resultado |
|---|---|---|
| Frontend | Suíte Angular/Vitest completa | 40 arquivos, 358 testes passaram |
| Frontend | Build de produção | Concluído; avisos de tamanho de bundle e CSS |
| Login | POST pelo proxy, sem credenciais reais | 500 vazio |
| Backend e telemetria | Health HTTP direto | Conexão recusada |
| Backend | Maven reactor completo | Bloqueado na leitura das fontes do OneDrive |
| Backend | Tentativa isolada do módulo app | Cache de módulos incompatível; não validado |
| Telemetria | Maven test | Bloqueado na leitura das fontes do OneDrive |
| Contratos web | Comparação dos serviços Angular com os controllers | Prefixos e rotas examinados correspondem |
| Desktop | Rotas de login, catálogo e cards examinadas | Usam os endpoints atuais `/api/...` |

Famílias examinadas: autenticação, recuperação de senha, usuários, empresas,
regionais, setores, unidades/sondas, monitoramento, cards, configuração de sondas,
SMTP e simulador (poços, pastas e cenários). A correspondência no código não prova
funcionamento com banco real, autorização por perfil nem CRUD em execução.

A auditoria não certifica todo o projeto: testes Java, fluxo autenticado,
integração MQTT/InfluxDB, WebSocket em execução e aplicações Desktop completas
ainda precisam de validação. Não houve deploy nem alteração de contas/senhas.

## Para desbloquear a validação final

1. Recuperar a disponibilidade local dos quatro arquivos pelo OneDrive.
2. Compilar e testar o reactor inteiro do backend e a telemetria, sem reutilizar
   módulos antigos como evidência de funcionamento do código atual.
3. Iniciar os serviços e confirmar HTTP 200 nos endpoints de saúde.
4. Executar `powershell -File deploy/dev/audit-endpoints.ps1`.
   Os endpoints protegidos devem responder 401 sem autenticação; isso verifica
   conectividade e fronteira de autenticação, não substitui testes por perfil.
5. Validar login real e leitura por perfil, além das operações de escrita em base
   de teste e das integrações de telemetria.
