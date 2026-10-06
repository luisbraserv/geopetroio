# Contrato REST — Consulta de Séries de Monitoramento

> Contrato de integração entre aplicações · 2026-08-26
>
> Define como o Geopetro-Backend consulta séries temporais no serviço de Telemetria.

## Partes

| Papel | Aplicação | Estado |
|---|---|---|
| **Cliente** | Geopetro-Backend (`com.geopetro.monitoramento`) | **[FATO]** Implementado |
| **Servidor** | Geopetro-Telemetria | ✅ **Implementado em 2026-08-27** |
| Consumidor final | Geopetro-Front | **[FATO]** Implementado |

**[FATO]** Este contrato foi derivado do `MonitoramentoClient` já existente — o serviço novo foi
escrito para encaixar no cliente, sem alterar o Geopetro-Backend.

⚠️ **Correção de 2026-08-27:** a versão anterior deste documento afirmava que `dataHora` era uma
string local no formato `yyyy-MM-dd'T'HH:mm:ss.SSS`. **Estava errado.** A leitura do código-fonte do
cliente mostrou que `MonitoramentoPontoDTO.dataHora` é um **`java.time.Instant`**, e que o cliente
envia `inicio.toString()` — ou seja, **o contrato REST é UTC ponta a ponta**. Só o payload MQTT usa
hora local sem offset.

---

## 1. Cadeia de chamada

```
Front                    Geopetro-Backend                    Telemetria :8081
  │                            │                                 │
  │ GET /api/monitoramento/    │                                 │
  │     unidades/minhas        │                                 │
  ├───────────────────────────►│ (consulta o escopo no MySQL)  │
  │◄───────────────────────────┤                                 │
  │                            │                                 │
  │ GET /api/monitoramento/    │                                 │
  │     unidades/{id}/series   │                                 │
  ├───────────────────────────►│                                 │
  │                            │ 1. valida acesso no Core       │
  │                            │ 2. traduz id no nome da unidade│
  │                            │ 3. GET /api/monitoramentos/    │
  │                            ├────────────────────────────────►│
  │                            │◄────────────────────────────────┤
  │◄───────────────────────────┤                                 │
```

**[FATO]** O frontend **nunca** chama a telemetria diretamente. Comentário no código:
*"O front não fala direto com o telemetria; sempre passa pelo backend para respeitar o vínculo do
usuário às unidades"*. A autorização é responsabilidade do Geopetro-Backend, que consulta o acesso
atual no Braserv-Core.

---

## 2. Endpoint do serviço de Telemetria

```
GET /api/monitoramentos/unidades/{idUnidade}/series
```

### Parâmetros

| Parâmetro | Local | Tipo | Obrigatório |
|---|---|---|---|
| `idUnidade` | path | string | Sim — é o `Unidade.nome` no Braserv-Core (ex.: `SPT-144`) |
| `dispositivoId` | query | string | Sim — id do card, `<TIPO>_<NN>`. O conjunto é **por unidade** ([`mqtt-telemetria.md §4`](../mqtt/mqtt-telemetria.md#4-o-conjunto-de-dispositivos-é-por-unidade)) |
| `serie` | query | string | **Não** — ver abaixo |
| `inicio` | query | ISO-8601 | Sim |
| `fim` | query | ISO-8601 | Sim |

### O filtro `serie` — **[FATO 2026-09-08]**

Um card `CONTADOR_STROKE` grava **três** séries sob o mesmo `dispositivoId`, distinguidas pela tag
`serie` ([RN-098](../../negocio/regras/business-rules.md#rn-098--as-três-séries-do-contador-de-stroke-se-distinguem-por-serie)).
Sem o filtro, uma consulta a esse card devolveria as três **misturadas na mesma linha do tempo** — um
gráfico que parece válido e não é. Era a pendência aberta por
[`mqtt-telemetria.md §4`](../mqtt/mqtt-telemetria.md#as-três-séries-do-contador-de-stroke).

⚠️ **Omitir o parâmetro significa "a série única", não "todas as séries".** É assim que a escrita
marca as leituras de um card de uma grandeza só (tag `serie = "unica"`). A consequência deliberada é
que um card de stroke consultado sem `serie` devolve **vazio**, em vez das três sobrepostas:

| Alternativa | Por que não |
|---|---|
| Ausência = sem filtro (as três juntas) | Devolve uma curva com três grandezas de unidades diferentes somadas na mesma escala. **Vazio se vê; isso não** |
| Tornar `serie` obrigatório | Quebraria todo chamador de card comum, para resolver um caso que só existe no stroke |

### Resposta `200`

```json
{
  "idUnidade": "SPT-144",
  "dispositivoId": "CONTADOR_STROKE_01",
  "serie": "vazao",
  "pontos": [
    { "dataHora": "2026-08-26T17:32:05.120Z", "valor": 1.52 }
  ]
}
```

**[FATO]** `serie` volta no eco da resposta, e é `null` para card de uma grandeza só. Sem ele, o
cliente não distinguiria duas respostas do mesmo `dispositivoId`.

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

**Consequência [FATO]:** o Geopetro-Backend **degrada graciosamente**. Uma indisponibilidade da
telemetria vira `502` na API pública, não `500`.

---

## 4. Endpoints expostos pelo Geopetro-Backend

**[FATO 2026-09-17]** Já implementados. O acesso é por **combinação** — `ADMIN`, ou
`MONITORAMENTO` somada ao tipo de conta (`CLIENTE` ou `INTERNO`); ver
[RN-099](../../negocio/regras/business-rules.md#rn-099--acesso-por-combinação-tipo-de-conta--permissão-de-módulo). O
`CLIENTE` tem escopo restrito às unidades ativas concedidas no Core; a conta interna acessa a
frota inteira.

⚠️ `/api/monitoramento/unidades/{id}/configuracao` e `/api/monitoramento/unidades/{id}/alarmes[...]` exigem
`MONITORAMENTO_REAL`, **não** `MONITORAMENTO`: limite de alarme e histórico seguem o tempo real
(RN-069).

### `GET /api/monitoramento/unidades/minhas`

Lista as unidades ativas às quais o usuário autenticado tem acesso.

```json
[ { "id": 3, "nome": "SPT-144", "apelido": "Sonda 144", "tipo": "SONDA" } ]
```

**[FATO]** `UnidadeMonitoramentoService` cruza o catálogo do Core com o acesso atual: contas internas
com `MONITORAMENTO` recebem a frota ativa; `CLIENTE` recebe somente as unidades ativas presentes em
`unidadeIds`. Um cliente sem concessão recebe uma lista vazia.

### `GET /api/monitoramento/unidades/{id}/series`

Mesmos parâmetros de query do §2. Valida o acesso antes de repassar.

| Status | Condição |
|---|---|
| `200` | Série retornada |
| `403` | Usuário sem acesso àquela unidade |
| `502` | Serviço de telemetria indisponível |

**[FATO]** As mensagens exatas já são tratadas pelo frontend: *"Você não tem permissão para acessar
esta unidade"* e *"Serviço de telemetria indisponível no momento"*.

---

## 5. Uso pelo frontend

**[FATO]** `MonitoramentoSondaPageComponent`:
- Períodos: 15m · 1h · 6h · personalizado (`datetime-local`)
- Séries em paralelo via `forkJoin` — uma requisição por grandeza
- Renderização em **SVG desenhado à mão**, com toggle Original/Suavizada (média móvel de 8 pontos, calculada no client)

**[FATO 2026-09-08]** A lista de variáveis **deixou de ser fixa**: vem de `GET /api/monitoramento/unidades/{id}/cards`
e é traduzida em grandezas por `services/grandezas-de-card.ts`, que é o único ponto do front que sabe
que um card de stroke rende três séries. Unidade sem cards não oferece variável nenhuma, e a tela diz
por quê ([RN-088](../../negocio/regras/business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada)).

**[FATO 2026-10-06]** Todas as rotas públicas usam o `id` numérico. O backend busca a unidade no
catálogo do Core e traduz o id em `Unidade.nome` somente na chamada interna à Telemetria, onde o nome
continua sendo a chave de correlação histórica (RN-018).

**[PENDENTE]** O contrato exige **1 requisição por grandeza** — e o número agora **varia por unidade**:
uma unidade com duas bombas passa de 5 para 10 séries, e cada uma é uma cascata front → backend →
telemetria. A pressão por um endpoint que aceite vários `dispositivoId` numa resposta **aumentou** com
cards configuráveis; continua sendo mudança pequena agora e cara depois de o cliente estar em produção.

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

---

## 7. Verificação de existência de série

> **[DECIDIDO 2026-09-05]** · **[FATO 2026-09-06] Implementado** no working tree, dos dois lados.

**Por que passou a ser necessário:** a exclusão de cadastros passa a ser **bloqueada quando houver
vínculo** ([RN-063](../../negocio/regras/business-rules.md#rn-063--exclusão-bloqueada-por-vínculo-em-todos-os-cadastros)),
e o **histórico de telemetria conta como vínculo**
([RN-072](../../negocio/regras/business-rules.md#rn-072--histórico-de-telemetria-conta-como-vínculo)).

O Geopetro-Backend não tem como saber disso sozinho: o vínculo que ele enxerga é relacional, e a série vive
no InfluxDB, em outro serviço. Precisa **perguntar**.

### Endpoint

**[FATO 2026-09-06]** Implementado exatamente como proposto:

```
GET /api/monitoramentos/unidades/{idUnidade}/existe
```

```json
{
  "idUnidade": "SPT-144",
  "possuiSerie": true,
  "primeiroPonto": "2026-03-01T00:00:00Z",
  "ultimoPonto": "2026-09-05T12:00:00Z"
}
```

**Por que devolver as datas junto:** a mensagem de recusa fica útil — *"não é possível excluir: há
telemetria de 01/03/2026 a 05/09/2026"* — em vez de um "existe vínculo" que não diz o quê.

**Custo no InfluxDB:** consulta de primeiro e último ponto da sonda, não varredura de série.

**[FATO 2026-09-06]** `InfluxTelemetriaRepository.consultarIntervalo` roda duas consultas Flux com
`first()` e `last()` sobre `range(start: 0)`, filtrando `_field == "valor"` para não contar o field
`nome` como ponto separado. Ambas são empurradas para o mecanismo de armazenamento.

⚠️ **As datas saem em UTC**, como todo o resto deste contrato. O consumidor formata para exibição —
e o faz **também em UTC**, para a mensagem de recusa não mudar conforme o fuso do servidor.

### Comportamento na indisponibilidade

⚠️ **[DECIDIDO 2026-09-05]** Se o serviço de Telemetria estiver fora, a exclusão é **recusada**.

Isto **inverte** a degradação graciosa do §3, deliberadamente: em consulta de série, falhar devolvendo
vazio custa uma tela sem gráfico; em exclusão, assumir "não tem histórico" porque ninguém respondeu
apaga um cadastro que não podia ser apagado. Só um dos dois erros tem volta.

**[FATO 2026-09-06]** `MonitoramentoClient.consultarExistencia` devolve `Optional.empty()` quando não
consegue perguntar, e `TelemetriaVinculoAdapter` traduz isso em **impedimento**, com a mensagem
*"não foi possível confirmar o histórico de telemetria (serviço indisponível); tente novamente"*.

⚠️ **O `Optional.empty()` significa coisas opostas nos dois métodos do mesmo cliente** — em
`consultarSerie` é "sem dados", aqui é "não perguntei". Está documentado no javadoc de ambos, porque
confundi-los apagaria cadastro com histórico.
