# Specs — Braserv-Core

Especificações exclusivas do Braserv-Core. As decisões transversais ficam no SDD:

- [Arquitetura, decisões e plano de entrega](../../specs/SDD/software/backend/braserv-core.md)
- [Contrato com as outras aplicações](../../specs/SDD/software/apis/braserv-core.md)

## Estado das fases

| Fase | Estado |
|---|---|
| 1 · Projeto, módulos renomeados para Unidade, Flyway próprio, tokens RS256 e JWKS | **Concluída em 2026-10-06** |
| 2 · Status da unidade, exclusão com consulta ao backend, permissão `UNIDADE`, clientes de serviço, rotas internas | Pendente |
| 3 a 7 | Pendentes. Ver o plano na spec de arquitetura |

## Fase 1 — o que foi conferido

- 134 testes passando, incluindo as migrations contra MySQL real.
- Core sobe contra base vazia; o Flyway cria as nove tabelas e o Hibernate valida o mapeamento.
- Login de ponta a ponta: token RS256 com `iss=braserv-core`, `tipo=usuario` e `kid` igual ao do JWKS; o token abre `/api/usuarios` e `/api/unidades`.
- Desativar o usuário corta o mesmo token em até 10 s (RN-062).
- `/api/unidades-sondas` não existe mais (`404`).
