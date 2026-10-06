# Specs — Braserv-Core

Especificações exclusivas do Braserv-Core. As decisões transversais ficam no SDD:

- [Arquitetura, decisões e plano de entrega](../../../specs/SDD/software/backend/braserv-core.md)
- [Contrato com as outras aplicações](../../../specs/SDD/software/apis/braserv-core.md)

## Estado das fases

| Fase | Estado |
|---|---|
| 1 · Projeto, módulos renomeados para Unidade, Flyway próprio, tokens RS256 e JWKS | **Concluída em 2026-10-06** |
| 2 · Status da unidade, exclusão com consulta ao backend, permissão `UNIDADE`, clientes de serviço, rotas internas | **Concluída em 2026-10-06** |
| 3 · Geopetro-Backend lendo o core: tokens pela chave pública, acesso e catálogo de unidades, endpoint de vínculos, `unidade_id`, `/api/monitoramento/**` | **Concluída em 2026-10-06** |
| 4 a 7 | Pendentes. Ver o plano na spec de arquitetura |

## Fase 1 — o que foi conferido

- 134 testes passando, incluindo as migrations contra MySQL real.
- Core sobe contra base vazia; o Flyway cria as nove tabelas e o Hibernate valida o mapeamento.
- Login de ponta a ponta: token RS256 com `iss=braserv-core`, `tipo=usuario` e `kid` igual ao do JWKS; o token abre `/api/usuarios` e `/api/unidades`.
- Desativar o usuário corta o mesmo token em até 10 s (RN-062).
- `/api/unidades-sondas` não existe mais (`404`).

## Fase 2 — o que foi conferido

- 166 testes passando.
- Base da fase 1 (versão 1) migrada para a versão 3 pelo Flyway ao subir, sem intervenção.
- O cliente `geopetro-backend` nasce de `CORE_SEGREDO_INICIAL_BACKEND` e troca o segredo por um token de serviço de 15 min com `acesso:ler` e `unidades:ler`. Segredo errado ou cliente desativado: `401`.
- `INTERNO` sem `UNIDADE` consulta unidades (`200`) e não cria (`403`); `INTERNO` + `UNIDADE` cria, inativa e reativa.
- Unidade inativa sai de `?status=ATIVA` e aparece em `?status=INATIVA` e no catálogo interno.
- Com o Geopetro-Backend fora do ar, `DELETE /api/unidades/{id}` responde `409` com "não foi possível confirmar com o Geopetro-Backend que ela nunca foi usada. Use inativar.", e a unidade continua no banco.
- Token de pessoa em `/internal/**` e token de serviço em `/api/**`: `401`.
- Logado sem permissão recebe `403`, não `401` ([DT-017](../../../specs/SDD/software/technical-debt.md#dt-017--logado-sem-permissão-recebe-401-em-vez-de-403)).

## Fase 3 — o que foi conferido

No Geopetro-Backend:

- Saíram os módulos `empresa`, `regional`, `setor`, `usuario` e `unidade-sonda`, o login, a recuperação de senha e o SMTP. O módulo `core` virou `comum` (D-2).
- 191 testes passando, com o core simulado: tokens do core (inclusive rotação de chave), cache de acesso de 10 s com tolerância de 5 min, catálogo de 60 s, cliente HTTP do core, escopo por perfil e o endpoint de vínculos.
- A migration nova renomeia `unidade_sonda_id` para `unidade_id` nas quatro tabelas, preserva os dados e remove as quatro FKs.
- De ponta a ponta, core e backend rodando juntos contra MySQL, com a Telemetria parada:
  - o backend aceita o token emitido pelo core; o cliente vê só a unidade concedida e recebe `403` na outra;
  - a unidade inativada no core some da lista do backend depois do cache de 60 s;
  - `DELETE` de unidade no core chega ao backend, que responde `503` porque a Telemetria não respondeu, e o core recusa com `409`;
  - o cliente desativado no core perde o acesso no backend em até 10 s;
  - logado sem permissão recebe `403` ([DT-017](../../../specs/SDD/software/technical-debt.md#dt-017--logado-sem-permissão-recebe-401-em-vez-de-403), corrigido também no backend).

**Ainda não funciona de ponta a ponta** até as fases 4 e 5: o Desktop e o Front chamam as rotas e tópicos antigos (`/api/sondas`, `unidades-sondas`) e fazem login no backend, que não tem mais login.

