# Contrato WebSocket — Tempo Real

> Contrato de integração entre aplicações · **[DECIDIDO 2026-08-27]** · Implementado

## A divisão que organiza tudo

**[DECIDIDO 2026-08-27]** A telemetria da sonda segue por **dois caminhos independentes**, com
responsabilidades que não se sobrepõem:

```
                        ┌── MQTT ──► Broker ──► Geopetro-Telemetria ──► InfluxDB
CLP ──► Geopetro-Desktop ──┤                              HISTÓRICO
                        └── WebSocket ──► Geopetro-Backend :8080 ──► Angular
                                                TEMPO REAL
```

| | MQTT | WebSocket |
|---|---|---|
| **Responsabilidade** | Histórico / persistência | Estado atual |
| **Estrutura no produtor** | `BlockingQueue` (3600) | `AtomicReference` |
| **Perda aceitável?** | Não — cada leitura importa | **Sim, por desenho** |
| **Ao reconectar** | Envia o acumulado | Envia **só o mais recente** |
| **Persistido?** | Sim, InfluxDB | **Não** |

**[FATO]** Os dois são independentes: falha em um não bloqueia o outro nem interrompe a leitura do
CLP. Cada um tem seu worker; a thread de leitura apenas entrega e segue.

---

## 1. Partes

| Papel | Aplicação | Destino |
|---|---|---|
| **Produtor** | `Geopetro-Desktop` | envia para `/app/realtime/estado` |
| **Retransmissor** | `Geopetro-Backend` | publica em `/topic/realtime/unidades-sondas/{id}` |
| **Consumidor** | `Geopetro-Front` | assina o tópico da unidade escolhida |

**[FATO]** O Geopetro-Backend **não persiste as amostras de estado atual** e **não consome MQTT**. Desde 2026-09-07, a mesma conexão também transporta [configurações persistidas por unidade](configuracao-sonda.md), em destinos próprios.

---

## 2. Endpoint e destinos

| Item | Valor |
|---|---|
| Handshake | `ws://{host}/ws` (`wss://` em produção) |
| Protocolo | STOMP 1.2 sobre WebSocket nativo |
| Publicação (Desktop) | `/app/realtime/estado` |
| Assinatura (Angular) | `/topic/realtime/unidades-sondas/{unidadeSondaId}` |
| Broker | Simples, em memória |

### Por que `unidadeSondaId` numérico e não o nome

**[FATO]** O histórico usa `UnidadeSonda.nome` como chave de correlação no InfluxDB
([RN-018](../business-rules.md#rn-018--nome-da-unidadesonda-é-chave-de-integração)) — e por isso
renomear uma unidade quebra o histórico.

O tempo real usa o **id numérico**, que é imune a renomeações. Não corrige RN-018 para o histórico,
mas evita reproduzir a mesma fragilidade num canal novo.

---

## 3. Payload

**[DECIDIDO 2026-09-08]** Reescrito para cards por unidade, **no mesmo formato do MQTT**.

```json
{
  "unidadeSondaId": 144,
  "timestamp": "2026-09-08T16:32:05.120Z",
  "leituras": [
    { "dispositivoId": "PESO_01", "tipo": "PESO", "unidade": "lbf",
      "enderecoDb": "DBW4", "valor": 184300.5, "valorBruto": 412 },
    { "dispositivoId": "CONTADOR_STROKE_01", "serie": "vazao",
      "tipo": "CONTADOR_STROKE", "unidade": "bbl/min",
      "enderecoDb": "DBD0", "valor": 1.52, "valorBruto": 148320 }
  ],
  "alarmes": [
    { "unidadeSondaId": 144, "dispositivoId": "PESO_01", "serie": null,
      "episodioId": "6f1c…", "severidadeAtual": "CRITICO",
      "desde": "2026-09-08T16:30:10.400Z", "valorExtremo": 190100.0,
      "limiteViolado": "MAX" }
  ]
}
```

**[FATO]** `unidadeSondaId` e `timestamp` são **obrigatórios**. Se o timestamp vier ausente, o
backend carimba o instante de recepção — mas isso é rede de segurança, não o caminho esperado.

### `alarmes` é a única coisa que o servidor acrescenta — **[DECIDIDO 2026-09-09]**

**[FATO]** O Desktop **não envia** este campo, e o valor que um produtor mandasse é ignorado: quem
decide o que alarma é quem tem os limites. O backend avalia o ciclo recebido
([RN-102](../business-rules.md#rn-102--o-servidor-avalia-o-alarme-pelo-canal-de-tempo-real)) e
retransmite a mensagem com os episódios abertos **depois** dela. Lista vazia é o normal.

⚠️ **Por que junto, e não num tópico próprio.** O destaque descreve **estes** números. Em canais
separados os dois chegariam em ordens diferentes, e a tela mostraria um valor com o destaque do ciclo
anterior — um alarme aceso sobre um número que já voltou à faixa, ou o contrário. O preço é a consulta
de limites entrar no caminho do ciclo; é uma busca por chave primária.

⚠️ **Falha do motor não apaga a tela.** Retransmitir é o que faz a tela existir; avaliar produz
histórico. Uma exceção na avaliação vira log, e a mensagem segue com a **última projeção conhecida**
em vez de nenhuma: o alarme que já estava aceso continua aceso, que é mais próximo da verdade do que
apagá-lo por causa de uma falha de escrita.

**[FATO]** Antes da primeira mensagem — e enquanto a sonda **não publica** — quem responde é
`GET /api/sondas/{id}/alarmes`, com a mesma autorização dos limites
([RN-069](../business-rules.md#rn-069--quem-vê-a-sonda-vê-e-ajusta-o-alarme-dela)). Sem essa rota, um
episódio aberto de uma sonda que caiu ficaria invisível justamente quando ninguém está olhando o CLP.

### Mesma forma que o MQTT, de propósito

As regras de cada leitura são as de
[`mqtt-telemetria.md §3`](mqtt-telemetria.md#campos-de-cada-leitura) — **não são repetidas aqui**,
para não haver duas versões da mesma definição divergindo. O que muda entre os dois canais é o
destino e a garantia, não o conteúdo:

| | MQTT (histórico) | WebSocket (tempo real) |
|---|---|---|
| Garantia | QoS 1, cada leitura importa | Sobrescreve: estados intermediários são descartados de propósito |
| Consumidor | Geopetro-Telemetria → InfluxDB | Angular, direto na tela |
| Envelope | `idSondaUnidade` (nome) | `unidadeSondaId` (id numérico) — ver [§2](#por-que-unidadesondaid-numérico-e-não-o-nome) |

### Os campos fixos saíram — isto quebrava o Angular

**[DECIDIDO 2026-09-08]** `pesoColuna`, `torqueTubos`, `torqueFlutuante`, `pressaoBomba`, `vazao` e
`strokeAtual` **deixam de existir**.

✅ **[FATO 2026-09-08] O consumidor Angular foi atualizado** — passo 8 de
[cards-configuraveis](../features/cards-configuraveis.md#13-ordem-de-implementação-sugerida).
`EstadoRealtime` passou a carregar `leituras[]`, e a tela monta cards e gráficos a partir do documento
de cards da unidade. Duas decisões de leitura que valem registrar:

| Situação | O que a tela faz |
|---|---|
| Grandeza ausente num ciclo (RN-099) | Vira **lacuna** na série, não ponto omitido — comprimir a falta deslocaria o resto da curva como se o tempo não tivesse passado |
| Leitura que chega **sem card** no documento lido | Aparece com o `dispositivoId` no lugar do rótulo. Acontece quando o Desktop publica de um cache mais novo ou mais velho que o servidor; **esconder leitura real seria pior que exibi-la sem nome** |
| Mensagem **sem** `leituras` (produtor antigo) | Recusada, com aviso na tela. Aceitá-la produziria uma tela sem card nenhum e sem explicar por quê |

**Por que não manter os dois formatos por um tempo:** o payload carregaria os campos fixos e a lista
ao mesmo tempo, e se divergissem não haveria como dizer qual vale. Pior: com uma unidade que tem dois
cards de torque e um de temperatura, os campos fixos já não conseguiriam representá-la — seriam uma
verdade parcial se passando por completa.

⚠️ **Consequência de deploy:** Desktop, Backend e Front mudam **juntos**. Ver
[`mqtt-telemetria.md §10`](mqtt-telemetria.md#10-o-que-a-virada-quebra).

---

## 4. Autenticação e autorização

**[FATO]** Reutiliza integralmente o JWT existente — nenhum mecanismo novo foi criado.

| Momento | Verificação |
|---|---|
| **CONNECT** | JWT no header `Authorization`, validado pelo mesmo `TokenPort` do login REST |
| **SUBSCRIBE** | O usuário tem acesso àquela Unidade/Sonda? ([RN-047](../business-rules.md#rn-047--escopo-de-sondas-por-perfil)) |
| **SEND** | Destino permitido + acesso à unidade, verificado no controller |

### Por que verificar no SUBSCRIBE, não só no CONNECT

⚠️ **[FATO]** O destino carrega o id da unidade. Um usuário autenticado poderia **trocar o id à mão**
e tentar assinar a sonda de outro cliente. A autorização precisa acontecer onde o alvo é conhecido.

Coberto por 9 testes em `WebSocketAuthInterceptorTest`, incluindo o caso central: um `CLIENTE`
autenticado tentando assinar uma unidade que não é dele.

**[FATO]** Destino fora do padrão é **recusado por padrão** — para que um tópico novo não nasça sem
controle de acesso por esquecimento.

### O Desktop também é um usuário

**[FATO]** O Desktop autentica em `/api/auth/login` com credenciais de um usuário de serviço e usa o JWT
no CONNECT. Sujeito às mesmas regras: só publica na unidade a que tem acesso.

**Por quê:** um token estático separado criaria um segundo mecanismo de autenticação para manter, com
suas próprias regras de rotação e revogação.

---

## 5. Concorrência no produtor

**[FATO]** Java 21 Virtual Threads, uma por responsabilidade:

```
VT "plc-reader"   → lê o CLP a cada 1s
VT "mqtt-worker"  → consome a BlockingQueue e publica
VT "realtime-ws"  → lê o AtomicReference e envia
JavaFX Thread     → apenas interface
```

**[FATO]** Nenhuma thread é criada por leitura. As Virtual Threads ficam bloqueadas em espera a
maior parte do tempo — exatamente o caso de uso para o qual foram feitas.

### O contraste que define o desenho

| | MQTT | Tempo real |
|---|---|---|
| Estrutura | `BlockingQueue(3600)` | `AtomicReference` |
| Fila cheia / canal lento | Descarta o **mais antigo** | Descarta o **intermediário** |
| Motivo | Histórico: cada leitura importa | Estado: só o "agora" importa |

**[FATO]** Se o canal de tempo real ficar lento e voltar, envia o **estado mais recente** — não uma
fila de estados antigos. Isso é propriedade do `AtomicReference`, não lógica adicional.

**[FATO]** A fila MQTT cobre ~1 hora de broker fora antes de descartar. Mesmo descartando, o H2 local
do Desktop mantém o registro completo.

---

## 6. Reconexão

**[FATO]** Ambos os canais reconectam sozinhos, com backoff exponencial de 2s até 30s.

No frontend, o estado da conexão é visível: `Offline` · `Conectando` · `Online` · `Reconectando`.

⚠️ **[FATO] Indicador de defasagem.** Estar "Online" não garante dado fresco: se a sonda parar de
publicar, a conexão permanece aberta e os cards congelariam sem aviso. A tela alerta após **5
segundos** sem leitura nova.

---

## 7. Configuração do Geopetro-Desktop

**[FATO]** Campos novos na tela de Configurações:

| Campo | Obrigatório | Observação |
|---|---|---|
| `unidadeSondaId` | **Sim** | Id numérico no cadastro. Cada instalação pertence a **uma** Unidade/Sonda |
| `backendUrl` | Sim | Ex.: `http://10.0.0.10:8080` |
| `backendUsuario` / `backendSenha` | Sim | Usuário de serviço desta sonda |

**[FATO]** Sem essa configuração, o Desktop **segue operando normalmente** — lê o CLP, grava local e
publica no MQTT. O tempo real é um canal adicional, não um requisito de funcionamento.

---

## 8. Limitações conhecidas

| # | Limitação | Impacto |
|---|---|---|
| 1 | **Broker STOMP em memória** | Não propaga entre instâncias. Com mais de uma réplica do backend, um assinante na instância A não recebe o que o Desktop publicou na B. Resolver com RabbitMQ/ActiveMQ como broker externo, ou afinidade de sessão |
| 2 | **Sem histórico de telemetria no canal** | Estado atual chega na próxima amostra. Configurações têm snapshot inicial persistido |
| 3 | **Um Desktop por unidade** | Duas instalações com o mesmo `unidadeSondaId` sobrescrevem o estado uma da outra |
| 4 | **`ws://` sem TLS** | Aceitável em rede privada; use `wss://` se atravessar internet |

---

## 9. Relação com os outros contratos

| Contrato | Responsabilidade |
|---|---|
| [`mqtt-telemetria.md`](mqtt-telemetria.md) | Ingestão do histórico: Desktop → Broker → Geopetro-Telemetria |
| [`rest-monitoramento.md`](rest-monitoramento.md) | Consulta do histórico: Geopetro-Backend → Geopetro-Telemetria |
| **Este** | Estado atual: Desktop → Geopetro-Backend → Angular |
| [`configuracao-sonda.md`](configuracao-sonda.md) | Configuração persistida: Geopetro-Backend → Desktop, na mesma conexão STOMP |

**[FATO]** Os três são independentes. A tela de Monitoramento usa o histórico; a de Tempo Real usa
este canal. Nenhuma depende da outra.
