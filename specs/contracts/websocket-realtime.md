# Contrato WebSocket — Tempo Real

> Contrato de integração entre aplicações · **[DECIDIDO 2026-08-27]** · Implementado

## A divisão que organiza tudo

**[DECIDIDO 2026-08-27]** A telemetria da sonda segue por **dois caminhos independentes**, com
responsabilidades que não se sobrepõem:

```
                        ┌── MQTT ──► Broker ──► Backend-Telemetria ──► InfluxDB
CLP ──► Desktop-Sonda ──┤                              HISTÓRICO
                        └── WebSocket ──► Backend-Sonda :8080 ──► Angular
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
| **Produtor** | `Desktop-Sonda-Geopetro-IO` | envia para `/app/realtime/estado` |
| **Retransmissor** | `Backend-Sonda-Geopetro-IO` | publica em `/topic/realtime/unidades-sondas/{id}` |
| **Consumidor** | `Front-Sonda-Geopetro-IO` | assina o tópico da unidade escolhida |

**[FATO]** O Backend-Sonda **não persiste as amostras de estado atual** e **não consome MQTT**. Desde 2026-09-07, a mesma conexão também transporta [configurações persistidas por unidade](configuracao-sonda.md), em destinos próprios.

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

```json
{
  "unidadeSondaId": 7,
  "timestamp": "2026-08-27T16:32:05.120Z",
  "pesoColuna": 12450.75,
  "torqueTubos": 3200.0,
  "torqueFlutuante": 2980.5,
  "pressaoBomba": 1450.25,
  "vazao": 0.523,
  "strokeAtual": 184
}
```

**[FATO]** `unidadeSondaId` e `timestamp` são **obrigatórios**. Se o timestamp vier ausente, o
backend carimba o instante de recepção — mas isso é rede de segurança, não o caminho esperado.

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

## 7. Configuração do Desktop-Sonda

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
| [`mqtt-telemetria.md`](mqtt-telemetria.md) | Ingestão do histórico: Desktop → Broker → Backend-Telemetria |
| [`rest-monitoramento.md`](rest-monitoramento.md) | Consulta do histórico: Backend-Sonda → Backend-Telemetria |
| **Este** | Estado atual: Desktop → Backend-Sonda → Angular |
| [`configuracao-sonda.md`](configuracao-sonda.md) | Configuração persistida: Backend-Sonda → Desktop, na mesma conexão STOMP |

**[FATO]** Os três são independentes. A tela de Monitoramento usa o histórico; a de Tempo Real usa
este canal. Nenhuma depende da outra.
