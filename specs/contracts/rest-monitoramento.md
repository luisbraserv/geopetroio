# Contrato REST — Consulta de Séries de Monitoramento

> Contrato de integração entre aplicações · 2026-08-26
>
> Define como o Backend-Sonda consulta séries temporais no serviço de Telemetria.

## Partes

| Papel | Aplicação | Estado |
|---|---|---|
| **Cliente** | Backend-Sonda-Geopetro-IO (`com.geopetro.monitoramento`) | **[FATO]** Implementado |
| **Servidor** | Backend-Telemetria-Sonda-Geopetro-io | ✅ **Implementado em 2026-08-27** |
| Consumidor final | Front-Sonda-Geopetro-IO | **[FATO]** Implementado |

**[FATO]** Este contrato foi derivado do `MonitoramentoClient` já existente — o serviço novo foi
escrito para encaixar no cliente, sem alterar o Backend-Sonda.

⚠️ **Correção de 2026-08-27:** a versão anterior deste documento afirmava que `dataHora` era uma
string local no formato `yyyy-MM-dd'T'HH:mm:ss.SSS`. **Estava errado.** A leitura do código-fonte do
cliente mostrou que `MonitoramentoPontoDTO.dataHora` é um **`java.time.Instant`**, e que o cliente
envia `inicio.toString()` — ou seja, **o contrato REST é UTC ponta a ponta**. Só o payload MQTT usa
hora local sem offset.

---

## 1. Cadeia de chamada

```
Front                    Backend-Sonda                    Telemetria :8081
  │                            │                                 │
  │ GET /api/sondas/minhas     │                                 │
  ├───────────────────────────►│ (consulta o escopo no MySQL)  │
  │◄───────────────────────────┤                                 │
  │                            │                                 │
  │ GET /api/sondas/{id}/      │                                 │
  │     monitoramentos/series  │                                 │
  ├───────────────────────────►│                                 │
  │                            │ 1. valida acesso do usuário     │
  │                            │    à sonda (role/concessão)    │
  │                            │ 2. GET /api/monitoramentos/     │
  │                            ├────────────────────────────────►│
  │                            │◄────────────────────────────────┤
  │◄───────────────────────────┤                                 │
```

**[FATO]** O frontend **nunca** chama a telemetria diretamente. Comentário no código:
*"O front não fala direto com o telemetria; sempre passa pelo backend para respeitar o vínculo do
usuário às sondas"*. A autorização é responsabilidade do Backend-Sonda.

---

## 2. Endpoint a implementar no serviço de Telemetria

```
GET /api/monitoramentos/sondas/{idSondaUnidade}/series
```

### Parâmetros

| Parâmetro | Local | Tipo | Obrigatório |
|---|---|---|---|
| `idSondaUnidade` | path | string | Sim — é o `UnidadeSonda.nome` (ex.: `SPT-144`) |
| `dispositivoId` | query | string | Sim — vocabulário em [`mqtt-telemetria.md §4`](mqtt-telemetria.md#4-vocabulário-de-dispositivos) |
| `inicio` | query | ISO-8601 | Sim |
| `fim` | query | ISO-8601 | Sim |

### Resposta `200`

```json
{
  "idSondaUnidade": "SPT-144",
  "dispositivoId": "PESO_COLUNA_01",
  "pontos": [
    { "dataHora": "2026-08-26T17:32:05.120Z", "valor": 12450.75 }
  ]
}
```

**[FATO]** Estrutura definida por `MonitoramentoSerieDTO` no cliente existente. Os nomes de campo
**devem** ser exatamente estes.

**[FATO]** `dataHora` é um `Instant` — ISO-8601 **em UTC**, com `Z`. O servidor configura
`spring.jackson.serialization.write-dates-as-timestamps=false` para emitir texto em vez de epoch
numérico; o cliente aceita ambos, mas o texto é legível em log e no Swagger.

`inicio` e `fim` seguem a mesma convenção — o cliente envia `Instant.toString()`.

---

## 3. Comportamento do cliente (já implementado)

**[FATO]**

| Aspecto | Valor |
|---|---|
| Tecnologia | Spring `WebClient` reativo (Netty) |
| Base URL | `monitoramento.base-url` — default `http://localhost:8081` |
| Timeout | `monitoramento.timeout-ms` — default **5000ms** |
| Tratamento de erro | Qualquer falha HTTP ou indisponibilidade → `Optional.empty()`, log de erro, **sem propagar exceção** |

**Consequência [FATO]:** o Backend-Sonda **degrada graciosamente**. Uma indisponibilidade da
telemetria vira `502` na API pública, não `500`.

---

## 4. Endpoints expostos pelo Backend-Sonda

**[FATO]** Já implementados. Roles: `ADMIN`, `SONDA`, `CIMENTACAO`, `GERENCIA`, `DIRETORIA` e
`CLIENTE`. O perfil `CLIENTE` tem escopo restrito às Unidades/Sondas concedidas no cadastro; os
demais perfis listados acessam a frota inteira.

### `GET /api/sondas/minhas`

Lista as sondas às quais o usuário autenticado tem acesso.

```json
[ { "idSondaUnidade": "SPT-144", "nome": "SPT-144", "apelido": "Sonda 144" } ]
```

**[FATO]** `SondaMonitoramentoService` aplica uma regra por capacidade: perfis operacionais
autorizados recebem todas as unidades; `CLIENTE` recebe somente a coleção N:N
`usuario_cliente_unidades`. Um cliente sem concessão recebe uma lista vazia.

### `GET /api/sondas/{idSondaUnidade}/monitoramentos/series`

Mesmos parâmetros de query do §2. Valida o acesso antes de repassar.

| Status | Condição |
|---|---|
| `200` | Série retornada |
| `403` | Usuário sem acesso àquela sonda |
| `502` | Serviço de telemetria indisponível |

**[FATO]** As mensagens exatas já são tratadas pelo frontend: *"Você não tem permissão para acessar
esta sonda"* e *"Serviço de telemetria indisponível no momento"*.

---

## 5. Uso pelo frontend

**[FATO]** `MonitoramentoSondaPageComponent`:
- Períodos: 15m · 1h · 6h · personalizado (`datetime-local`)
- Até **5 séries em paralelo** via `forkJoin` — uma requisição por dispositivo
- Renderização em **SVG desenhado à mão**, com toggle Original/Suavizada (média móvel de 8 pontos, calculada no client)

**[PENDENTE]** O contrato atual exige **1 requisição por dispositivo**. Para 5 dispositivos são 5
chamadas em cascata (front → backend → telemetria = 10 saltos). Vale avaliar um endpoint que aceite
múltiplos `dispositivoId` e retorne várias séries numa resposta — mudança pequena agora, cara depois
que o cliente estiver em produção.

---

## 6. Pontos em aberto

| Item | Observação |
|---|---|
| ~~Paginação / limite de pontos~~ | ✅ **Resolvido 2026-08-27.** Teto configurável (`telemetria.max-pontos-por-serie`, default 2000) |
| ~~Downsampling~~ | ✅ **Resolvido 2026-08-27.** Acima do teto, agrega por janela via `aggregateWindow` com `mean`. Transparente ao cliente — a resposta mantém a mesma forma |
| ~~Fuso horário~~ | ✅ **Resolvido.** UTC ponta a ponta neste contrato — ver correção no topo |
| Retenção | **[PENDENTE]** Por quanto tempo o histórico fica disponível? Afeta política de retenção do InfluxDB |
| Autenticação entre serviços | **[PENDENTE]** Hoje o `WebClient` chama sem credencial. Se telemetria e backend não estiverem na mesma rede fechada, é preciso definir autenticação serviço-a-serviço |
| Múltiplos dispositivos por chamada | **[PENDENTE]** A tela faz 5 requisições em paralelo. Um endpoint que aceite vários `dispositivoId` reduziria isso a uma — mudança pequena agora, cara depois que o cliente estiver em produção |

### Sobre o downsampling

**[FATO]** A agregação é decidida no servidor, não pedida pelo cliente: se o intervalo, à taxa de 1
leitura/s, produzir mais pontos que o teto, o serviço agrega por janela do tamanho necessário.

Isso mantém o contrato inalterado — o cliente continua recebendo `{dataHora, valor}` — e evita que
uma consulta de 6h derrube a resposta. Usa `mean` em vez de `min`/`max` porque a tela já suaviza para
exibição, e a média preserva a forma da curva.
