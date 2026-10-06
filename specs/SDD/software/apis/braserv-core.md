# Contrato — Braserv-Core

> Contrato de integração entre aplicações · 2026-10-06 · **Estado: implementado**
>
> Define o que o Braserv-Core oferece às outras aplicações e o que ele consome do backend.
> Arquitetura, decisões e plano: [backend/braserv-core.md](../backend/braserv-core.md).

## Partes

| Papel | Aplicação | Usa |
|---|---|---|
| **Servidor** | Braserv-Core | — |
| Cliente | Geopetro-Front | Rotas públicas (seção 1) |
| Cliente | Geopetro-Desktop | `POST /api/auth/login` |
| Cliente | Geopetro-Backend | JWKS (seção 2), token de serviço (seção 3) e rotas internas (seção 4) |
| Servidor, para o core | Geopetro-Backend | Vínculos de uma unidade (seção 5) |
| Cliente futuro | Qualquer sistema novo da Braserv | JWKS, token de serviço e rotas internas |

## 1. Rotas públicas

Publicadas pelo proxy. A referência executável de cada payload é o OpenAPI do Core
(`/v3/api-docs`).

| Rota | Quem acessa | Observação |
|---|---|---|
| `POST /api/auth/login` | público | Token RS256 com claim `tipo: usuario` (seção 2) |
| `POST /api/auth/recuperacao-senha`, `POST /api/auth/recuperacao-senha/confirmar` | público | — |
| `/api/usuarios/**` | `ADMIN`; `PATCH /me` e `/me/senha` para qualquer autenticado | Usa `unidadeIds`; inclui a role `UNIDADE` |
| `/api/empresas/**` | `ADMIN` | — |
| `GET /api/regionais/**` | `INTERNO`, `ADMIN` | — |
| `POST/PUT/DELETE /api/regionais/**` | `ADMIN` | — |
| `/api/setores/**` | `INTERNO`, `ADMIN` | — |
| `/api/unidades/**` | ver 1.1 | Cadastro de unidades |
| `/api/configuracoes/email/**` | `ADMIN`, `SUPORTE` | — |
| `/api/servicos-clientes/**` | `ADMIN` | Credenciais de integração (1.2) |

### 1.1 Unidade

| Rota | Quem acessa ([RN-118](../../negocio/regras/business-rules.md#rn-118--gestão-de-unidades-exige-interno--unidade-ou-admin)) | Comportamento |
|---|---|---|
| `GET /api/unidades`, `/paginado`, `/{id}` | `INTERNO`, `ADMIN` | Resposta ganha `status`: `ATIVA` ou `INATIVA`. Filtro opcional `?status=` |
| `POST /api/unidades` | `ADMIN`, `INTERNO`+`UNIDADE` | Nasce `ATIVA` |
| `PUT /api/unidades/{id}` | `ADMIN`, `INTERNO`+`UNIDADE` | — |
| `PATCH /api/unidades/{id}/inativar` | `ADMIN`, `INTERNO`+`UNIDADE` | `204`. Idempotente |
| `PATCH /api/unidades/{id}/ativar` | `ADMIN`, `INTERNO`+`UNIDADE` | `204`. Idempotente |
| `DELETE /api/unidades/{id}` | `ADMIN`, `INTERNO`+`UNIDADE` | `204` se nunca foi usada; `409` com todos os impedimentos; `409` se o backend não responder em 5 s ([RN-116](../../negocio/regras/business-rules.md#rn-116--unidade-é-inativada-e-só-é-excluída-se-nunca-foi-usada)) |

Conceder uma unidade `INATIVA` a um cliente (`unidadeIds` no cadastro de usuário) responde `400`.

Exemplo de recusa:

```json
{
  "status": 409,
  "mensagem": "A unidade SPT-144 não pode ser excluída: 1 concessão a cliente, limites de alarme configurados, telemetria gravada desde 12/09/2026. Use inativar."
}
```

### 1.2 Clientes de serviço

| Rota | Comportamento |
|---|---|
| `GET /api/servicos-clientes` | Lista `id`, `nome`, `escopos`, `ativo`, `ultimoUsoEm`. Nunca devolve segredo |
| `POST /api/servicos-clientes` | Corpo: `id`, `nome`, `escopos`. Resposta `201` com o **segredo gerado, exibido só desta vez** |
| `POST /api/servicos-clientes/{id}/segredo` | Gera segredo novo e invalida o anterior. Resposta com o segredo, exibido só desta vez |
| `PATCH /api/servicos-clientes/{id}/desativar`, `/ativar` | `204`. Desativado não obtém token novo |

## 2. Chave pública (JWKS)

`GET /.well-known/jwks.json` · interna · sem autenticação

```json
{
  "keys": [
    { "kty": "RSA", "kid": "2026-10", "use": "sig", "alg": "RS256", "n": "…", "e": "AQAB" }
  ]
}
```

O consumidor valida todo token assim:

| Item | Regra |
|---|---|
| Assinatura | RS256 com a chave do `kid` do cabeçalho |
| `iss` | igual a `braserv-core` |
| `exp` | no futuro |
| `tipo` | `usuario` em rota pública, `servico` em rota interna. Qualquer outra combinação: `401` |

Busque o JWKS de novo ao receber um `kid` desconhecido, no máximo uma vez a cada 30 s. Durante uma
rotação há duas chaves publicadas.

**Token de pessoa** (`tipo: usuario`): `sub` = username, `roles` = roles no momento do login,
validade 1 hora.

**Token de serviço** (`tipo: servico`): `sub` = id do cliente de serviço, `escopos` = lista de
escopos, validade 15 min.

## 3. Token de serviço

`POST /internal/v1/auth/token`

```json
{ "clienteId": "geopetro-backend", "segredo": "…" }
```

```json
{ "token": "eyJ…", "expiraEm": "2026-10-06T15:45:00Z", "escopos": ["acesso:ler", "unidades:ler"] }
```

| Situação | Resposta |
|---|---|
| Credencial válida e cliente ativo | `200` |
| Credencial inválida ou cliente desativado | `401`, sem dizer qual dos dois |

Peça um token novo quando faltar menos de 1 min para `expiraEm`. Não peça a cada chamada.

## 4. Rotas internas do core

Prefixo `/internal/v1`. **Não publicadas pelo proxy.** Exigem token de serviço com o escopo indicado.

### 4.1 Acesso atual de um usuário

`GET /internal/v1/usuarios/{username}/acesso` · escopo `acesso:ler`

```json
{
  "username": "joao.cliente",
  "tipo": "CLIENTE",
  "ativo": true,
  "roles": ["CLIENTE", "MONITORAMENTO", "MONITORAMENTO_REAL"],
  "unidadeIds": [3, 7]
}
```

| Campo | Regra |
|---|---|
| `tipo` | `CLIENTE` ou `INTERNO` |
| `ativo` | `false` corta o acesso em todos os consumidores (RN-062, RN-107) |
| `roles` | Roles **atuais**, que podem diferir das do token emitido antes de uma alteração |
| `unidadeIds` | Concessões do cliente (RN-048), inclusive de unidades inativas. Sempre `[]` para `INTERNO`; o escopo de frota inteira é decidido pelo consumidor (RN-047) |

`404` quando o usuário não existe; o consumidor trata como conta inativa.

**No consumidor:** cache de até 10 s. Sem resposta do core, use o último valor por até 5 min e
registre no log; depois disso, negue.

### 4.2 Catálogo de unidades

`GET /internal/v1/unidades` · escopo `unidades:ler`

```json
[
  { "id": 3, "nome": "SPT-144", "apelido": "Sonda 144", "tipo": "SONDA", "status": "ATIVA", "setorId": 2 }
]
```

Todas as unidades, ativas e inativas, sem paginação. `nome` é a chave de integração com MQTT e
InfluxDB (RN-018). **No consumidor:** cache de até 60 s para leitura.

`GET /internal/v1/unidades/{id}` · escopo `unidades:ler` · um item no mesmo formato, ou `404`.
**Use sem cache antes de gravar qualquer dado que referencie a unidade.**

## 5. Rota interna do backend chamada pelo core

`GET /internal/v1/unidades/{id}/vinculos` · servida pelo **Geopetro-Backend** · exige token de
serviço com `sub` = `braserv-core` e escopo `unidades:vinculos`

```json
{
  "emUso": true,
  "vinculos": ["limites de alarme configurados", "telemetria gravada desde 12/09/2026"]
}
```

| Situação | Resposta |
|---|---|
| Conferiu todas as fontes | `200`, com `emUso: false` e `vinculos: []` quando não há uso |
| A Telemetria não respondeu | `503`. O backend não responde `emUso: false` sem ter conferido a telemetria |

O core trata `503`, erro de rede ou demora acima de 5 s como **em uso** e recusa a exclusão.

## 6. Erros

Mesmo formato de erro compartilhado com o Backend (`ApiErrorResponse`).

| Código | Quando |
|---|---|
| `400` | Corpo inválido; concessão de unidade inativa |
| `401` | Token ausente, inválido, vencido ou de `tipo` errado para a rota |
| `403` | Token válido sem a role ou o escopo exigido |
| `404` | Recurso não existe |
| `409` | Exclusão recusada por vínculo |
| `503` | Core sem acesso ao banco; backend sem resposta da Telemetria |

## 7. Versionamento

Rotas internas são versionadas no caminho (`/internal/v1`). Acrescentar campo na resposta não muda a
versão; remover ou mudar o significado de um campo exige `/internal/v2`, com as duas versões no ar
até todos os consumidores migrarem.
