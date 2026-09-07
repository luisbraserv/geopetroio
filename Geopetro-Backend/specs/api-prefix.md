# Prefixo da API — RN-079

**[DECIDIDO 2026-09-05]** Login e usuários passam para `/api`, conforme
[`RN-079`](../../specs/business-rules.md#rn-079--a-api-padroniza-o-prefixo-api).

## Contrato da migração

- `POST /api/auth/login` é público. Corpo e resposta permanecem iguais.
- `PATCH /api/usuarios/me` e `PATCH /api/usuarios/me/senha` exigem autenticação
  e usam a identidade do token, para todos os perfis.
- As demais operações de `/api/usuarios/**` exigem ADMIN. A exceção de
  autoatendimento vale apenas para os dois PATCH acima, sem liberar `/me/ativar`
  ou `/me/desativar` pela regra genérica de username.
- `/auth` e `/usuarios` deixam de mapear controllers. Não há alias nem redirecionamento
  de credenciais. Frontend, proxy local, Nginx, Postman e os dois logins do
  Geopetro-Desktop acompanham a mudança. `apiUrl`/URL do backend continuam sendo a
  raiz do servidor, sem acrescentar `/api` à configuração do ambiente.
- WebSocket, probes e documentação OpenAPI mantêm suas rotas próprias.
- Não há alteração de schema ou migration nesta entrega.

## Verificação e distribuição

**[FATO 2026-09-06]** Antes de mover qualquer rota, nove testes HTTP passaram
contra os controllers e filtros reais nas URLs anteriores. Cobrem login público,
negação anônima, administração de usuários, autoatendimento por perfil, restrições
de regionais/cadastros, bearer token com conta desativada, preflight CORS e falha
de inicialização sem segredo JWT. Serviços de negócio são mocks; não há banco.

A distribuição deve coordenar backend, frontend e Geopetro-Desktop. Binários antigos
do Desktop usam `/auth/login` e precisam ser atualizados para voltar a autenticar.
O auto-update ainda não existe. Esta entrega altera o código local, sem deploy
ou instalação nas sondas.

## Resultado da entrega

**[FATO 2026-09-06 — implementado e validado no working tree]**

- Controllers, regras de segurança, serviços Angular, Nginx, proxy de desenvolvimento,
  coleção Postman e os dois consumidores de login no Desktop usam o prefixo novo.
- O teste das URLs retiradas identificou que o tratamento genérico de exceções
  convertia ausência de rota em 500. `ApiExceptionHandler` agora responde 404 para
  `NoHandlerFoundException` e `NoResourceFoundException`. Requisições anônimas a
  rotas protegidas continuam recebendo 401 antes do controller.
- No Nginx, `/auth` e `/usuarios` retornam 404, inclusive sem barra final, evitando
  que uma URL antiga da API receba o HTML da SPA.
- `IdentidadeHttpSecurityTest`: 11 testes aprovados depois da migração, incluindo
  as URLs retiradas e a proteção de ações administrativas sob o username `me`.
- Backend: **121 testes aprovados** (26 em `usuario`, 95 em `app`) com
  `mvnw.cmd -pl app -am test -Dtest=*,!MigracaoFlywayTest -Dsurefire.failIfNoSpecifiedTests=false`.
  O teste de migrations MySQL foi excluído desta execução: não há mudança de schema.
- Frontend: **305 testes aprovados em 33 arquivos**, incluindo seis testes novos
  do contrato HTTP. Build de produção aprovado, com os avisos de tamanho existentes.
- Desktop: compilação aprovada e **dois testes HTTP aprovados** contra servidor
  local isolado, verificando login do catálogo, envio de bearer token e login do
  tempo real. Não iniciam worker STOMP nem acessam CLP.
- `nginx -t` aprovado em container temporário `nginx:alpine`, sem rede externa
  durante a validação e com a configuração montada somente para leitura.
