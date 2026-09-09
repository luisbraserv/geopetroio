# Contrato de configuração remota da sonda

> **[FATO 2026-09-07]** Etapa 1 de [alarmes](../features/alarmes.md), implementada no Geopetro-Backend e no Geopetro-Desktop. Motor, interfaces de limites/histórico e distribuição automática do Desktop continuam pendentes.

## 1. Transporte e acesso

| Operação | Destino | Comportamento |
|---|---|---|
| HTTP GET | `/api/sondas/{id}/configuracao` | Lê o snapshot vigente |
| HTTP PUT | `/api/sondas/{id}/configuracao` | Substitui a lista inteira, exigindo a revisão lida |
| STOMP SUBSCRIBE | `/topic/config/unidades-sondas/{id}` | Recebe alterações após commit |
| STOMP SUBSCRIBE | `/app/config/unidades-sondas/{id}` | Recebe um snapshot diretamente na assinatura solicitante |

**[FATO]** Reutiliza `/ws`, JWT no `CONNECT` e autorização por unidade. `SEND` para configuração é recusado; gravação ocorre somente por HTTP. Os perfis de monitoramento (`SONDA`, `CIMENTACAO`, `GERENCIA`, `DIRETORIA`, `ADMIN` e `CLIENTE`) usam as concessões existentes. Conta inativa ou sem acesso não lê nem grava. Cada entrega também verifica conta e concessão atuais, inclusive nas sessões previamente assinantes.

**[FATO]** `WebSocketInboundGuard` envia `ERROR` para recusas de autenticação, assinatura ou destino de envio, encerrando a sessão. A resposta explícita é necessária porque a fila de ordenação captura exceções antes do tratador de protocolo.

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

⚠️ **A borda não confere o vocabulário, e isso é deliberado.** Os dois documentos chegam ao Desktop
por canais independentes, com revisões próprias, e o de limites pode chegar **antes** do de cards —
um id desconhecido ali significa "card que ainda não chegou", não "documento corrompido". Enquanto a
lista fixa vivia também no Desktop, um limite de `TEMPERATURA_01` fazia a estação **descartar o
snapshot inteiro** e seguir em silêncio com o anterior. O Desktop continua conferindo a **forma**:
números finitos, ordenação dos limiares, tempos não negativos e ausência de grandeza repetida.

## 3. Sincronização do Desktop

**[FATO]** `CanalConfiguracaoLifecycle` inicia o worker no `ApplicationReadyEvent` e ao salvar configurações locais. Não depende de amostra nem de conexão com o CLP. Requer URL, usuário, senha e unidade do backend configurados no Desktop.

1. Autenticar e aguardar `CONNECTED`.
2. Assinar o tópico de alterações da unidade.
3. Pedir snapshot no destino `/app/config/...`; aguardar até 10 segundos por configuração válida.
4. Aplicar somente revisão maior que a atual, da mesma unidade e geração de conexão. Resposta inicial atrasada não substitui atualização mais recente.
5. Repetir o pedido a cada 60 segundos e ao reconectar. Reutilizar o identificador de snapshot com `UNSUBSCRIBE`/`SUBSCRIBE`.

**[FATO]** O servidor preserva a ordem de recebimento por sessão para registrar o tópico antes de consultar o snapshot. `@SubscribeMapping` responde diretamente ao solicitante. Referências: [ordenação STOMP no Spring](https://docs.spring.io/spring-framework/reference/web/websocket/stomp/ordered-messages.html) e [SubscribeMapping](https://docs.spring.io/spring-framework/reference/web/websocket/stomp/handle-annotations.html).

**[FATO]** Cache imutável em memória, isolado por servidor, usuário, unidade e geração de conexão. Sobrevive à desconexão durante o processo; trocar servidor, usuário ou unidade limpa o cache. O parser aceita fragmentação, múltiplos frames e heartbeats; rejeita schema desconhecido, payload inválido, unidade divergente e buffers acima de 65536 caracteres. Payload inválido mantém o último snapshot válido.

## 4. Limites e evidências

**[FATO]** Falha de publicação após commit não desfaz a gravação; consulta periódica e reconexão recuperam o snapshot. Broker em memória: sem entrega imediata entre réplicas, outbox durável ou confirmação de aplicação por dispositivo.

✅ **[FATO 2026-09-07]** Cache persistente entregue — `ConfiguracaoRemotaStore`, gravação atômica em
`config/configuracao-remota.json`, chaveada por servidor/usuário/unidade. Ver
[RN-088](../business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada).

**[PENDENTE]** Avaliação de leituras, alertas e atualização automática da frota. O canal transporta dados tipados; não executa comandos, instala pacotes nem altera parâmetros do CLP.

**[FATO]** Testes: `ConfiguracaoSondaServiceTest` (persistência, autoria, revisão, rollback, falha do broker e validação); `ConfiguracaoSondaWebSocketTest` (TCP/WebSocket real, snapshot, atualização, consulta periódica, reconexão, revogação e isolamento); `ConfiguracaoSondaAccessTest` e `IdentidadeHttpSecurityTest` (acesso); `MigracaoFlywayTest` (MySQL descartável, atualização, unicidade e FK); `ConfiguracaoRemotaTest` (cache, parser e evento de configuração sem CLP).

---

## 5. Documento de cards

> **[FATO 2026-09-07] Implementado no backend.** UI e consumo na borda seguem pendentes.
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

⚠️ **A guarda de saída é uma segunda classe, não a mesma.** `ConfiguracaoSondaOutbound` casa
`/config/unidades-sondas/{id}` **terminando no id** — o tópico de cards tem sufixo e passaria sem
verificação nenhuma. `ConfiguracaoCardsOutbound` guarda o tópico novo, com a regra de acesso de
cards, e confere **a cada entrega**: uma sessão que já assinava continua sendo verificada depois de
a conta ser desativada.

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

✅ **O cache em memória deixou de bastar, e o de disco já existe** — entregue em 2026-09-07, antes de
qualquer card depender dele. [RN-088](../business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada).
