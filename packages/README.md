# packages

Bibliotecas compartilhadas entre as aplicações de `apps/`. Ainda vazio.

Uma biblioteca entra aqui quando **duas ou mais aplicações** precisam do mesmo código e copiar deixou de compensar. Até lá, cada aplicação mantém a própria cópia. Exemplo: as exceções e o `PaginaResponse` existem no `comum` do Braserv-Core e no `core` do Geopetro-Backend (decisão D-2 em [braserv-core.md](../specs/SDD/software/backend/braserv-core.md)).

Cada aplicação é construída pelo Docker a partir da própria pasta. Antes de criar o primeiro pacote, defina como ele chega ao build de quem o usa: repositório Maven, ou contexto de build na raiz do monorepo.
