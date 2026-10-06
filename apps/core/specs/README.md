# Specs — Braserv-Core

Especificações exclusivas do Braserv-Core. As decisões transversais ficam no SDD:

- [Arquitetura, decisões e plano de entrega](../../../specs/SDD/software/backend/braserv-core.md)
- [Contrato com as outras aplicações](../../../specs/SDD/software/apis/braserv-core.md)

## Estado das fases

| Fase | Estado |
|---|---|
| 1 · Projeto, módulos renomeados para Unidade, Flyway próprio, tokens RS256 e JWKS | **Concluída em 2026-10-06** |
| 2 · Status da unidade, exclusão com consulta ao backend, permissão `UNIDADE`, clientes de serviço, rotas internas | **Concluída em 2026-10-06** |
| 3 a 7 | Pendentes. Ver o plano na spec de arquitetura |

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
