# Contratos de limites do servidor e cards da unidade

> **[FATO 2026-09-30]** O documento de limites do servidor é lido e gravado
> por REST. O Backend o avalia no tempo real. O Desktop usa limites locais
> independentes; o antigo canal STOMP de limites foi removido.

## 1. Transporte e acesso

| Operação | Destino | Comportamento |
|---|---|---|
| HTTP GET | `/api/sondas/{id}/configuracao` | Lê o snapshot vigente |
| HTTP PUT | `/api/sondas/{id}/configuracao` | Substitui a lista inteira, exigindo a revisão lida |

**[FATO]** A API exige conta ativa e acesso à unidade. Quem vê a sonda pode
ler e alterar seus limites, inclusive `CLIENTE` nas unidades concedidas
([RN-069](../business-rules.md#rn-069--quem-vê-a-sonda-vê-e-ajusta-o-alarme-dela)).
O canal WebSocket de **cards** é separado e continua descrito no §5.

## 2. Snapshot, schema 1

```json
{
  "schemaVersion": 1,
  "unidadeSondaId": 7,
  "revisao": 1,
  "limites": [
    {
      "dispositivoId": "PRESSAO_01",
      "serie": null,
      "minimoAtencao": null,
      "maximoAtencao": 100,
      "minimoCritico": null,
      "maximoCritico": 120,
      "segundosParaAbrir": 3,
      "segundosParaFechar": 5,
      "ativo": true
    }
  ],
  "atualizadoPor": "ana",
  "atualizadoEm": "2026-09-07T12:00:00Z"
}
```

**[FATO]** Os números ilustram o formato; não são limites recomendados nem padrões do sistema. O PUT recebe `revisao` e `limites`. Autoria e instante UTC vêm do servidor. A lista substitui integralmente a anterior; `[]` remove todos os limites configurados.

**[FATO]** Sem configuração: revisão `0`, lista vazia, autoria/instante nulos, sem criar registro. A primeira gravação retorna revisão `1`; cada alteração incrementa a revisão. Revisão desatualizada retorna HTTP `409`. A revisão controla concorrência e ordenação, sem histórico de versões. A autoria corresponde à última substituição do documento inteiro.

**[FATO]** Persistência: um documento por unidade em `configuracao_sonda`, lock otimista JPA e FK para `unidades_sondas`. Migration `V2026.09.07.2__configuracao_sonda.sql`. A configuração vinculada impede exclusão da unidade conforme a guarda de cadastro; não há exclusão em cascata.

### A grandeza que o limite vigia — **[FATO 2026-09-09]**

**[FATO]** O par `dispositivoId` + `serie` identifica a grandeza. `serie` é `null` para card de uma
grandeza só e obrigatória num card `CONTADOR_STROKE`, que publica três séries — `stroke`, `vazao` e
`volumeAcumulado` — sob o mesmo `dispositivoId` ([RN-098](../business-rules.md#rn-098--as-três-séries-do-contador-de-stroke-se-distinguem-por-serie)).

⚠️ **Sem `serie` o limite seria ambíguo.** "Acima de 8" é alarme plausível para vazão e não quer
dizer nada para volume acumulado, que só cresce: dispararia uma vez e nunca mais fecharia. É o mesmo
motivo que obrigou o filtro `serie` na consulta ao histórico
([rest-monitoramento §2](rest-monitoramento.md#o-filtro-serie--fato-2026-09-08)).

**[FATO]** A unidade de engenharia de cada limiar **não está aqui** — vem do tipo do card, e o
documento de cards é que o declara. A tabela fixa que este contrato trazia (`VAZAO_01` em bbl/min,
`PESO_COLUNA_01` em lbf, `TORQUE_01/02` em lbf.ft, `PRESSAO_01` em psi) descrevia as cinco grandezas
que toda sonda tinha, e deixou de existir com os cards por unidade.

**[FATO 2026-09-09]** Validação: cada limite deve referir uma grandeza que **a unidade declara** no
documento de cards, sem repetição de `dispositivoId` + `serie`. Não há mais teto de cinco — ele era a
contagem daquelas cinco grandezas fixas, e o número de limites é naturalmente limitado pelo que a
unidade declara. Valores finitos ou nulos; limite ativo exige ao menos um limiar. Mínimo crítico ≤
mínimo de atenção, máximo de atenção ≤ máximo crítico; todo mínimo informado deve ser menor que todo
máximo informado. Tempos: inteiros não negativos em segundos (Java `int`), sem limite operacional
adicional inventado. Falhas retornam HTTP `400`.

⚠️ **Limite de card desativado é aceito e preservado** — ele hiberna junto com o card
([RN-091](../business-rules.md#rn-091--card-se-desativa-nunca-se-exclui)). Recusá-lo obrigaria a
apagar o limite para salvar qualquer outro, e quem reativasse o card no dia seguinte encontraria a
grandeza sem vigilância nenhuma.

⚠️ **Unidade sem documento de cards não aceita limite algum**, com o motivo na resposta. É a resposta
certa: não há grandeza para vigiar ([RN-088](../business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada)).
A lista vazia continua sendo aceita, e é como se apagam os limites.

**[FATO]** O Desktop não recebe este documento. O sininho da estação valida e
grava seus próprios limites locais, sem depender da configuração do servidor
([configuração da estação §3](../features/configuracao-da-estacao.md#3-alarme-próprio-da-estação)).

## 3. Sincronização do Desktop

**[FATO 2026-09-30]** Não há sincronização deste documento com o Desktop.
A estação sincroniza somente o documento de **cards** (§5), necessário à
leitura do CLP. Esta seção conserva o título para não quebrar referências
anteriores.

## 4. Limites e evidências

**[FATO]** O Backend avalia os limites persistidos a cada ciclo de tempo
real; a alteração feita por REST vale na próxima avaliação. O documento
continua vinculado à unidade e sujeito a revisão otimista. A ausência de
limite significa que aquela grandeza não alarma no servidor.

**[PENDENTE]** Atualização automática das instalações do Desktop. Ela
distribui código novo à frota, não este documento.

---

## 5. Documento de cards

> **[FATO]** O documento de cards é independente dos limites e continua
> sincronizado com o Desktop pelo canal STOMP `/cards`.
> Spec completa em
> [`../features/cards-configuraveis.md`](../features/cards-configuraveis.md).

**[DECIDIDO 2026-09-07]** Os cards **não entram neste documento**. Vão para um **documento próprio**,
com seu endpoint e sua revisão.

| Documento | Recurso | Quem grava | Onde |
|---|---|---|---|
| Limites de alarme | `/api/sondas/{id}/configuracao` — este contrato | Quem enxerga a sonda, inclusive `CLIENTE` ([RN-069](../business-rules.md#rn-069--quem-vê-a-sonda-vê-e-ajusta-o-alarme-dela)) | Web |
| **Cards** | `/api/sondas/{id}/cards` | `ADMIN` ou `SUPORTE` ([RN-086](../business-rules.md#rn-086--configurar-exige-admin-ou-suporte-autenticado-no-backend)) | **Só no Desktop** |

**Por que separados.** Num documento só, o cliente que ajusta um limite devolveria o documento
inteiro — cards inclusive. O servidor teria de comparar campo a campo para descobrir se ele mexeu no
que não podia, e a regra de autorização ficaria escondida numa comparação. Separados, **não há como
errar**. Encerra [OQ-044](../open-questions.md#oq-044--um-documento-de-configuração-duas-autoridades)
e está em [RN-089](../business-rules.md#rn-089--cards-e-limites-são-documentos-separados).

### Transporte

| Operação | Destino | Quem |
|---|---|---|
| HTTP GET | `/api/sondas/{id}/cards` | Quem enxerga a sonda, mais `ADMIN` e `SUPORTE` |
| HTTP PUT | `/api/sondas/{id}/cards` | **Somente** `ADMIN` ou `SUPORTE` |
| STOMP SUBSCRIBE | `/topic/config/unidades-sondas/{id}/cards` | Mesma regra da leitura |
| STOMP SUBSCRIBE | `/app/config/unidades-sondas/{id}/cards` | Snapshot direto ao solicitante |

**[FATO]** `ConfiguracaoCardsOutbound` guarda o tópico de cards e confere
conta ativa, permissão e acesso à unidade a cada entrega. A antiga guarda
`ConfiguracaoSondaOutbound` saiu junto com o canal STOMP de limites.

⚠️ **`SUPORTE` entra em `/api/sondas/*/cards` e em nada mais sob `/api/sondas`.** Dar-lhe a rota
inteira seria monitoramento, não configuração.

### Forma do documento de cards

```json
{
  "schemaVersion": 1,
  "unidadeSondaId": 7,
  "revisao": 4,
  "conexao": { "ip": "10.0.0.5", "rack": 0, "slot": 1, "dbNumero": 1, "intervaloLeituraMs": 1000 },
  "cards": [
    {
      "dispositivoId": "TEMPERATURA_01",
      "nome": "Temperatura do tanque de lama",
      "tipo": "TEMPERATURA",
      "byteInicial": 12,
      "ativo": true,
      "visivel": true,
      "ordem": 3,
      "parametros": { "minimoEscala": -50, "maximoEscala": 200, "unidade": "°C" }
    }
  ],
  "atualizadoPor": "ana",
  "atualizadoEm": "2026-09-07T12:00:00Z"
}
```

**[DECIDIDO]** O `dispositivoId` é **gerado pelo servidor** e imutável —
[RN-081](../business-rules.md#rn-081--o-id-do-card-é-gerado-o-nome-é-rótulo). O cliente envia o card
sem id ao criar; renomear nunca o altera.

**[DECIDIDO]** O tamanho da leitura **vem do tipo**, não do payload: analógico é Word (2 bytes),
`CONTADOR_STROKE` é DWord (4 bytes).

**[DECIDIDO 2026-09-07]** Não há remoção de card: `ativo: false` para de publicar e some da tela, mas
o card permanece no documento — [RN-091](../business-rules.md#rn-091--card-se-desativa-nunca-se-exclui).
O limite de alarme correspondente **hiberna junto**, sem ser apagado.

**[DECIDIDO 2026-09-07]** Dois cards **podem** apontar para o mesmo `byteInicial` — a validação não
recusa ([RN-094](../business-rules.md#rn-094--dois-cards-podem-ler-o-mesmo-endereço)).

### O que isto muda neste contrato

✅ **[FATO 2026-09-09] Entregue.** O teto de cinco dispositivos e a tabela fixa de ids saíram dos dois
projetos. Um limite só existe para uma grandeza que a unidade declara no documento de cards, um card
desativado mantém o limite hibernando, e a chave passou a incluir `serie` — ver
[§2](#a-grandeza-que-o-limite-vigia--fato-2026-09-09).

`VAZAO_01`, `PESO_COLUNA_01`, `TORQUE_01/02` e `PRESSAO_01` eram o vocabulário do **sistema**; agora
o vocabulário é de **cada unidade**. Um card `CONTADOR_STROKE` produz **três** séries — stroke, vazão
e volume acumulado ([RN-090](../business-rules.md#rn-090--um-contador-de-stroke-produz-três-séries)),
e cada uma admite o seu próprio limite.

⚠️ **`SEND` recusado continua valendo, e ganha peso:** a configuração de cards decide o que a borda lê,
e gravação segue só por HTTP, pelo `WebSocketInboundGuard`.

**[FATO]** O Desktop mantém o documento de cards em cache persistente; sem
configuração não lê grandezas do CLP
([RN-088](../business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada)).
