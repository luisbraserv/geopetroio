# Cards Configuráveis — Spec de Feature

> **[DECIDIDO 2026-09-07]** · Spec-first · **Nada disto existe em código hoje**
>
> Feature de nível de sistema: atravessa Geopetro-Desktop, Geopetro-Backend, Geopetro-Telemetria e
> Geopetro-Front. Por isso mora aqui, e não dentro de um repositório.
>
> **Prioridade declarada:** esta alteração vem **antes** dos itens pendentes de alarmes, borda e
> dívidas técnicas.
>
> Decisões de §3 em diante vêm da **entrevista de 2026-09-07** (§12).

## 1. O que muda, em uma frase

O Desktop deixa de ter cinco grandezas fixas no código e passa a ler **o que a unidade mandar ler**.

**[FATO]** Hoje o mapeamento é constante em `PlcConnectionService`: `DB1`, `DBD0` para o contador de
stroke e `DBW4/6/8/10` para quatro canais analógicos, com `rack=0` e `slot=1` fixos. Só o IP é
configurável. Cada card da tela corresponde a um desses endereços, escritos à mão.

**[DECIDIDO 2026-09-07]** Passa a ser configuração: o usuário adiciona cards, dá nome, escolhe o tipo
e declara onde ler. Cada unidade tem o seu conjunto.

Isto executa [OQ-043](../open-questions.md#oq-043--mapeamento-configurável-de-card-para-endereço-no-clp),
registrada em 2026-09-05 como melhoria futura, e resolve de uma vez as três perguntas que ela previa
resolver: rack/slot por sonda ([OQ-017](../open-questions.md#oq-017--rackslot-do-clp-valem-para-toda-a-frota)),
modelo de CLP variável ([OQ-018](../open-questions.md#oq-018--qual-é-o-modelo-real-de-clp)) e
instrumentação de equipamento que não é sonda ([OQ-041](../open-questions.md#oq-041--o-tipo-da-unidade-define-quais-variáveis-são-monitoradas)).

## 2. A inversão que isto provoca

**[DECIDIDO 2026-09-07]** O Desktop deixa de ser *o app da sonda* e passa a ser **o agente de borda de
qualquer unidade cadastrada** — sonda, unidade de bombeio, slickline/wireline, cimentação ou UCAQ.

⚠️ **Isto reverte [RN-074](../business-rules.md#rn-074--o-tipo-não-altera-o-que-é-monitorado-por-ora).**
Aquela regra dizia que o `tipo` da Unidade/Sonda era classificação apenas, e que a telemetria seguia
exclusiva de sonda de perfuração com as mesmas cinco grandezas — porque instrumentar outro
equipamento era um projeto próprio, com outro CLP e outras grandezas. Com o endereçamento
configurável, **deixa de ser projeto e vira cadastro**. Registrado em
[RN-080](../business-rules.md#rn-080--o-card-define-o-que-se-lê-do-clp).

**[DECIDIDO 2026-09-07]** O **Braserv-Horus continua separado**, sem convergência prevista. Uma
unidade de cimentação pode ter os dois instalados, medindo coisas diferentes. A duplicação segue
aceita de propósito ([DT-010](../technical-debt.md#dt-010--duplicação-entre-os-dois-desktops)), e o
desenho dos cards **não** deve prever absorver o Horus.

✅ **[FATO 2026-09-07]** O nome dos projetos já acompanhou a mudança: `Geopetro-Backend`,
`Geopetro-Front`, `Geopetro-Desktop` e `Geopetro-Telemetria` —
[`renomeacao-projetos.md`](../renomeacao-projetos.md).

## 3. Os seis tipos de card

**[DECIDIDO 2026-09-07]** Vocabulário fechado de tipos. O que é aberto é *quantos* cards de cada tipo
uma unidade tem, o nome deles e onde leem — não a existência de tipos novos, que continua exigindo
desenvolvimento.

| Tipo | Sinal | Regra de conversão | Estado |
|---|---|---|---|
| `PESO` | Analógico | [RN-031](../business-rules.md#rn-031--peso-da-coluna-pela-cadeia-do-sargento) — cadeia do sargento, 8 parâmetros | ✅ Existe |
| `TORQUE` | Analógico | [RN-032/033](../business-rules.md#telemetria--conversão-de-sinal) — chave hidráulica | ✅ Existe |
| `PRESSAO` | Analógico | [RN-030](../business-rules.md#rn-030--conversão-do-ax-do-logo--psi) — fração × range do transmissor | ✅ Existe |
| `TEMPERATURA` | Analógico | [RN-083](../business-rules.md#rn-083--temperatura-é-escala-linear-com-mínimo-e-máximo) — **a implementar** | 🆕 |
| `NIVEL_TANQUE` | Analógico | [RN-084](../business-rules.md#rn-084--o-sensor-de-nível-mede-distância-não-nível) — **a implementar** | 🆕 |
| `CONTADOR_STROKE` | Digital | [RN-090](../business-rules.md#rn-090--um-contador-de-stroke-produz-três-séries) — três séries | ✅ Existe, amplia |

**[FATO]** Todos os sensores analógicos são **4-20 mA**. O bloco *Analog Amplifier* do LOGO! entrega o
laço já reescalonado para `Ax` na faixa −50..750, e `ConversaoPressao.axComoSigned` já lê com sinal —
a base negativa faria `-50` virar `65486` se lido como Word sem sinal.

⚠️ **Conversão não é endereço.** Tornar o endereço configurável **não** torna a grandeza
configurável. Peso e torque têm fórmulas próprias com geometria e calibração; um card de peso carrega
os 8 parâmetros do sargento, um card de torque carrega a calibração da chave. O que o usuário escolhe
é *qual regra aplicar e onde ler*, não *como converter*.

### O contador de stroke produz três séries

**[DECIDIDO 2026-09-07]** Um card `CONTADOR_STROKE` publica **três** grandezas, não uma:

| Série | O que é | Como sai |
|---|---|---|
| Stroke atual | Contagem no ciclo | Delta entre leituras do contador cumulativo |
| Vazão | `bbl/min` | Delta × constante da bomba, no intervalo |
| Volume acumulado | `bbl` | Contagem cumulativa × constante da bomba |

**A vazão nunca foi lida do CLP** — sempre foi derivada. O que muda é que o volume acumulado passa a
ser publicado também: o contador já é cumulativo, e multiplicá-lo pela constante dá quanto aquela
bomba bombeou desde o início.

### Uma unidade pode ter várias bombas

**[DECIDIDO 2026-09-07]** Mais de um card `CONTADOR_STROKE` por unidade, cada um com sua constante e
suas três séries.

⚠️ **[FATO verificado 2026-09-07] Isto quebra uma premissa do código atual**, e mais fundo do que
parece:

| Classe | Estado que guarda | O que acontece com duas bombas |
|---|---|---|
| `StrokeCalculatorService` | `lastCumulativeStroke` e `firstReading` | Deltas trocados entre as bombas |
| `FlowRateCalculatorService` | `Queue<ReadingData> history` — **janela móvel de 60 s** | As leituras das duas bombas **se misturam na mesma fila** |

O segundo é o pior: não é só um valor anterior sobrescrito, é uma janela de um minuto somando strokes
de bombas diferentes. As duas vazões sairiam plausíveis e erradas. Com N cards, esse estado passa a
ser **por card**.

**[PENDENTE]** Vazão somada entre bombas. A entrevista respondeu que "vazão total" era o volume
acumulado *da bomba*, não a soma entre bombas — então a soma **não entra** por ora. Se entrar depois,
é derivada do conjunto de cards da unidade, sem quebrar nada do que existe.

## 4. Identidade do card — o que vai para o histórico

**[DECIDIDO 2026-09-07]** O card tem **duas identidades**, e confundi-las custa caro.

| | Quem define | Muda? | Vai para o InfluxDB? |
|---|---|---|---|
| `dispositivoId` | **Sistema**, no formato `<TIPO>_<NN>` por unidade | **Não** | Sim, como *tag* |
| `nome` | Usuário | Sim, livremente | Não — é rótulo de tela |

**Por que o id não é o nome.** O `dispositivoId` é **tag** no InfluxDB, e o esquema avisa que
cardinalidade alta em tag degrada o banco seriamente. Com nome livre por card, cada rebatismo criaria
uma tag nova, e a retenção é de **5 anos**. Pior: renomear cortaria a série em duas, sem aviso.

⚠️ **É exatamente a armadilha de [RN-018](../business-rules.md#rn-018--nome-da-unidadesonda-é-chave-de-integração)**,
onde o nome editável da Unidade/Sonda virou chave de integração com a telemetria. Aquele risco já está
registrado como o de maior custo da base; repeti-lo no nível do card multiplicaria por seis.

**Numeração:** `NN` é sequencial por tipo **dentro da unidade**, atribuído na criação e nunca
reaproveitado.

### Card se desativa, nunca se exclui

**[DECIDIDO 2026-09-07]** Não há exclusão de card. Desativar tira da tela e para de publicar; o card
continua existindo com sua identidade, e o **histórico permanece consultável**.

É a mesma postura de [RN-072](../business-rules.md#rn-072--histórico-de-telemetria-conta-como-vínculo),
onde histórico de telemetria passou a impedir a exclusão da unidade. Sem isso, uma série ficaria no
InfluxDB por cinco anos sem nada que explicasse o que ela é.

**[DECIDIDO 2026-09-07]** O **limite de alarme hiberna junto**: para de avaliar e volta como estava se
o card for reativado. Quem desativou por engano não perde a configuração de alarme junto.

## 5. O modelo de configuração

**[PENDENTE]** Proposta, não implementação.

### Conexão — uma por unidade

```
ConexaoClp
  ip
  rack               (hoje constante 0)
  slot               (hoje constante 1)
  dbNumero           (hoje constante 1)
  intervaloLeituraMs (hoje constante 1000)
```

**[DECIDIDO 2026-09-07]** Rack, slot e DB saem do código. É o que encerra OQ-017 e OQ-018: com o
modelo de CLP variando por unidade, o endereçamento deixa de ser premissa global.

### Card

```
CardTelemetria
  dispositivoId      (gerado — §4)
  nome               (rótulo editável)
  tipo               (PESO | TORQUE | PRESSAO | TEMPERATURA | NIVEL_TANQUE | CONTADOR_STROKE)
  byteInicial        (offset dentro do DB)
  ativo              (desativado para de publicar e some da tela — §4)
  visivel            (RN-037 — controla publicação, não gravação)
  ordem              (posição na tela)
  parametros         (específicos do tipo — abaixo)
```

**Tamanho da leitura vem do tipo**, não é escolhido: analógico é Word (2 bytes), `CONTADOR_STROKE` é
DWord (4 bytes). Deixar o tamanho livre permitiria ler dois bytes de um contador de quatro e obter um
número plausível e errado.

### Parâmetros por tipo

| Tipo | Parâmetros |
|---|---|
| `PRESSAO` | `rangeSensorBar` — já existe em `SensorPressaoConfig` |
| `TEMPERATURA` | `minimoEscala`, `maximoEscala`, `unidade` (`°C`/`°F`) |
| `NIVEL_TANQUE` | forma, dimensões, `distanciaMinima`, `distanciaMaxima` |
| `PESO` | os 8 de `PesoColunaConfig` |
| `TORQUE` | calibração da chave hidráulica |
| `CONTADOR_STROKE` | `constanteBomba` |

### Leitura em bloco, não card a card

**[DECIDIDO 2026-09-07]** Uma unidade tem **5 a 10 cards em geral, mas pode ter mais**.

⚠️ **[FATO verificado 2026-09-07]** Hoje são **cinco leituras `ReadArea` por ciclo** — quatro do
`readPressaoPsi`, uma por canal analógico, mais uma do contador de stroke. São dois pontos de chamada
no código, mas cinco idas ao CLP por segundo.

Com N cards configuráveis isso vira N idas por segundo, e N deixou de ser conhecido. O desenho seguro
é **ler a faixa do DB de uma vez e fatiar em memória** — o que também torna as leituras do mesmo ciclo
**coerentes entre si**: hoje, cinco chamadas sequenciais podem pegar o CLP em estados diferentes e
compor um ciclo que nunca existiu.

## 6. Temperatura

**[DECIDIDO 2026-09-07]** Mesma lógica da pressão: posiciona o `Ax` na faixa e converte pela escala
configurada. A diferença é que a escala tem **mínimo e máximo**, não só fundo.

```
fracao = (Ax − (−50)) / 800
valor  = minimoEscala + fracao × (maximoEscala − minimoEscala)
```

⚠️ **A pressão é o caso particular com mínimo zero.** `pressao = fracao × range` equivale a
`0 + fracao × (range − 0)`. **Não** unificar as duas agora: mexer na fórmula da pressão alteraria toda
leitura já gravada.

**Por que mínimo e máximo:** transmissores de temperatura raramente começam em zero — uma faixa
`−50..+200 °C` é comum. Assumir base zero produziria erro proporcional em toda a faixa.

**[DECIDIDO 2026-09-07]** Mede **fluido** (lama, pasta) **e equipamento** (motor, bomba, hidráulico).
O mesmo tipo de card serve aos dois — muda a escala configurada.

⚠️ **O que difere é o significado do alarme,** não a conversão: temperatura de fluido é variável de
processo, ligada a reologia e tempo de pega; temperatura de equipamento é saúde de máquina. Quem
configura o limite precisa saber qual dos dois está olhando — e o **nome do card** é o que carrega
essa informação.

**Na tela:** termômetro desenhado com a escala configurada, e o valor numérico ao lado.

## 7. Nível do tanque

**[DECIDIDO 2026-09-07]** O sensor fica **sempre no topo** do tanque.

⚠️ **Consequência que define o cálculo inteiro:** um sensor no topo não mede nível — mede a
**distância até a superfície do líquido**. O nível é o que sobra.

```
distancia = distanciaMinima + fracao × (distanciaMaxima − distanciaMinima)
altura    = alturaUtil − distancia
volume    = f(forma, dimensões, altura)
```

Ler o valor do transmissor como se fosse o nível daria um tanque que **enche quando esvazia**.

### O que é publicado: volume, em bbl

**[DECIDIDO 2026-09-07]** A série gravada e alarmada é o **volume em bbl**. O nível é passo
intermediário e detalhe do desenho.

**Por quê:** é o que interessa na operação. No tanque de lama, ganho ou perda de volume denuncia
influxo ou perda de circulação. No tanque de cimentação, o volume é o que se compara com o que o
simulador planejou — e o simulador trabalha em bbl.

⚠️ **Isto põe a geometria do tanque dentro do dado, não só do desenho.** Forma e dimensões erradas
produzem volume errado gravado por cinco anos, e o número continua plausível. É o parâmetro de
configuração de maior consequência desta feature.

### Formas e volume

| Forma | Dimensões | Volume até a altura `h` |
|---|---|---|
| Cilíndrico **vertical** | raio, altura | `π · r² · h` |
| Cilíndrico **horizontal** | raio, comprimento | `L · [ r² · acos((r−h)/r) − (r−h) · √(2rh − h²) ]` |
| Retangular / cubo | comprimento, largura, altura | `C · L · h` |

⚠️ **O cilindro horizontal não é proporcional.** O volume é um segmento circular: metade da altura é
metade do volume, mas um quarto da altura **não** é um quarto do volume. Tratá-lo como o vertical
erraria mais no começo e no fim do tanque — justamente onde a leitura importa.

**Na tela:** o tanque desenhado na forma configurada, com o líquido preenchendo de baixo para cima e o
**sensor representado no topo**. O desenho é a conferência visual mais barata de que a configuração
está certa: um tanque que esvazia enquanto a operação enche denuncia distância trocada por nível.

**[DECIDIDO 2026-09-07]** Serve a tanque de **lama** e de **cimentação/mistura**.

## 8. Como a configuração viaja

**[DECIDIDO 2026-09-07]** Pelo **canal que já existe** —
[`configuracao-sonda.md`](../contracts/configuracao-sonda.md), implementado em 2026-09-07 para os
limites de alarme.

```
Desktop (ADMIN/SUPORTE autenticado)
        │  HTTP PUT — documento de CARDS
        ▼
Geopetro-Backend  ── grava, incrementa revisão ──┐
        │                                        │
        │ STOMP /topic/config/unidades-sondas/{id}
        ▼                                        ▼
Desktop aplica                          Geopetro-Front lê e monta os cards
```

**O que já está pronto e é reaproveitado:** transporte STOMP com JWT no `CONNECT`, autorização por
unidade, snapshot pedido no `/app/config/...`, revisão como controle de concorrência com `409` em
divergência, worker de sincronização no Desktop com pedido a cada 60 s e no reconnect, cache imutável
em memória isolado por servidor/usuário/unidade, e parser tolerante a fragmentação.

### Dois documentos, não um

**[DECIDIDO 2026-09-07]** Cards e limites de alarme viajam em **documentos separados**, cada um com
sua revisão e seu endpoint.

| Documento | Quem grava | Onde | Regra |
|---|---|---|---|
| **Cards** | `ADMIN` ou `SUPORTE` | Só no Desktop | [RN-086](../business-rules.md#rn-086--configurar-exige-admin-ou-suporte-autenticado-no-backend) |
| **Limites** | Quem enxerga a sonda, inclusive `CLIENTE` | Web | [RN-069](../business-rules.md#rn-069--quem-vê-a-sonda-vê-e-ajusta-o-alarme-dela) |

**Por que separar.** Num documento só, o cliente que ajusta um limite de pressão devolve o documento
inteiro — cards inclusive. O servidor teria de comparar campo a campo para descobrir se ele mexeu no
que não devia, e a regra de autorização ficaria escondida numa comparação. Separados, **não há como
errar**: o cliente nem toca no documento de cards.

⚠️ **O teto de cinco dispositivos na lista de limites deixa de valer.** Aquele número era a contagem
das cinco grandezas fixas. Passa a ser derivado: um limite só existe para um `dispositivoId` que a
unidade declara.

### ⚠️ O cache persistente deixa de ser opcional

**[FATO]** O contrato registra como **[PENDENTE]** o *"cache persistente para reiniciar sem rede"*.
Hoje, um Desktop que reinicia sem rede perde os limites de alarme — degradação incômoda, não fatal:
ele continua lendo o CLP e publicando.

**[DECIDIDO 2026-09-07]** Com os cards vindos da configuração, **um Desktop que reinicia sem rede não
sabe o que ler, e não lê nada.** A telemetria da unidade para por inteiro.

O cache em disco passa de melhoria a **requisito de entrega desta feature**.

## 9. Quem configura

**[DECIDIDO 2026-09-07]** Apenas **`ADMIN`** ou **`SUPORTE`**, e **apenas pelo Geopetro-Desktop**.

**Por que só no Desktop:** acertar byte, rack e slot exige estar na unidade, com a documentação do CLP
à mão e vendo o valor reagir. O Front **lê** a configuração para montar as telas, mas não a edita.

⚠️ **`SUPORTE` não existe.** O enum tem sete valores — `CLIENTE`, `INTERNO`, `ADMIN`, `CIMENTACAO`,
`SONDA`, `GERENCIA`, `DIRETORIA` — e [DT-011](../technical-debt.md#dt-011--divergência-de-roles-backend--frontend)
registra que, depois da limpeza de agosto, **todas as sete têm efeito real**. Criar a oitava exige:

| Onde | O quê |
|---|---|
| `Role.java` | novo valor |
| `user.model.ts` | espelho no front, e a constante de roles que o menu e os guards usam |
| Migration | ⚠️ **A coluna tem tipo diferente em produção e em base nova**: `VARCHAR(255)` lá, `ENUM` aqui. A migration tem de funcionar nos dois — normalizar para `VARCHAR` primeiro é o caminho seguro, e ainda elimina a divergência. Ver [DT-002](../technical-debt.md#-divergência-confirmada-entre-produção-e-base-nova) |

### A sessão de configuração do Desktop

**[DECIDIDO 2026-09-07]** O Desktop pede login **quando se abre uma janela de configuração**, não ao
iniciar.

| Situação | O que acontece |
|---|---|
| Sem login | O app **funciona normalmente**: lê o CLP, publica, mostra os cards, gera a carta |
| Login com `ADMIN`/`SUPORTE` | Configuração liberada |
| Usuário sem o perfil | Recusado, com a mesma mensagem de credencial inválida |
| Sem rede | Recusado — não há validação local de credencial |
| Fechar e reabrir o app | **Perde a sessão.** Novo login |

**A sessão vive em memória e nunca é gravada em disco.** Persistir credencial na borda é o oposto do
que [SEC-011](../security-findings.md#sec-011--credencial-única-de-frota-nas-sondas) já registra como
risco aceito: existe **uma credencial de serviço para toda a frota**, e um segundo segredo gravado na
máquina da unidade ampliaria a superfície sem necessidade.

## 10. Riscos aceitos na entrevista

**[DECIDIDO 2026-09-07]** Três escolhas foram feitas contra a recomendação registrada. Ficam aqui com
o custo à vista, não para serem revistas agora, mas para que a revisão comece de onde parou.

### A frota nasce vazia

**[DECIDIDO 2026-09-07]** As unidades existentes **não** recebem automaticamente os cards
equivalentes ao mapeamento de hoje. Cada uma é configurada individualmente.

⚠️ **[RN-088](../business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada) diz que unidade sem
card não lê nada.** Somando com "configuração só no Desktop" e "mais de dez unidades na frota", a
telemetria de cada unidade fica parada entre o deploy e a visita de quem vai configurá-la.

✅ **Mitigação decidida:** ao configurar uma unidade vazia, é possível **copiar os cards de outra
unidade já configurada** e ajustar o que difere. Sondas iguais têm o mesmo mapeamento, então a maior
parte do trabalho repetido some.

### Sem conferência ao vivo ao configurar

**[DECIDIDO 2026-09-07]** A tela de configuração **não** lê o endereço em tempo real enquanto se
digita. Salva-se e confere-se no dashboard.

⚠️ **O CLP não recusa endereço errado** — devolve bytes, e a conversão devolve um número plausível. A
proteção que resta é o **valor bruto exibido no card**, que já existe hoje e revela canal mudo ou
escala inesperada. Ela passa a ser a única.

⚠️ Isto contraria o padrão que a tela de peso da coluna já adota, recalculando enquanto se digita
justamente porque *"esperar o Salvar para ver o efeito de cada parâmetro tornaria a calibração
lenta"*.

### Dois cards podem ler o mesmo endereço

**[DECIDIDO 2026-09-07]** Permitido. O caso real é a mesma leitura interpretada com escalas
diferentes.

⚠️ **Custo:** duas séries no histórico com o mesmo dado de origem, e nada indicando que são a mesma
coisa. Hoje isso já acontece na tela — `PRESSAO_01` alimenta Bomba de Lama e ESCP —, mas com **um**
dispositivo no contrato; agora seriam dois.

## 11. Pontos que continuam em aberto

| # | Questão | Referência |
|---|---|---|
| 1 | ⚠️ **A configuração `−50..750` é assumida igual em todo canal.** A escala em si foi confirmada em 2026-08-31 e o código reescrito; o que segue sem conferência de campo, com calibrador de laço, é se **cada amplificador** está assim. Com cards configuráveis isso deixa de valer para 4 canais e passa a valer para todos os que a frota declarar | [OQ-016](../open-questions.md#oq-016--a-escala-analógica-do-clp-foi-confirmada) |
| 2 | Validação do alcance do DB ao configurar | [OQ-048](../open-questions.md#oq-048--validação-de-endereço) |
| 3 | `CatalogoDispositivos` da Telemetria perde a fonte fixa | [mqtt-telemetria §4](../contracts/mqtt-telemetria.md#4-vocabulário-de-dispositivos) |
| 4 | Vazão somada entre bombas, se um dia entrar | §3 |

## 12. A entrevista de 2026-09-07

**[DECIDIDO 2026-09-07]** Quatro rodadas. O que mudou em relação à primeira versão desta spec:

| Tema | Antes | Depois da entrevista |
|---|---|---|
| Onde se configura | Suposto Desktop | **Confirmado: só Desktop.** Front só lê |
| Documento | Um, com cards e limites | **Dois**, com autoridades e revisões próprias |
| Tanque | Publicava nível ou volume, em aberto | **Volume, em bbl** |
| Contador de stroke | Uma série, com vazão derivada | **Três séries**, e **várias bombas por unidade** |
| Exclusão de card | Em aberto | **Não existe** — só desativação, com o limite hibernando junto |
| Frota atual | Proposto nascer configurada | **Nasce vazia**, com cópia entre unidades como mitigação |
| Conferência ao vivo | Proposta | **Recusada** |
| Mesmo endereço em dois cards | Proposto recusar | **Permitido** |
| Horus | Em aberto | **Continua separado** |

## 13. Ordem de implementação sugerida

1. **Modelo e contrato** — documento de cards separado do de limites, com `conexao` e `cards`
2. **Cache persistente no Desktop** (§8) — antes de qualquer card depender dele
3. **Leitura em bloco dirigida por configuração** — `PlcConnectionService` passa a ler a faixa do DB e
   fatiar, iterando cards em vez de constantes, com os tipos que já existem
4. **Estado de stroke e vazão por card** (§3) — pré-requisito de várias bombas
5. **Role `SUPORTE` + sessão de configuração no Desktop** (§9)
6. **UI de configuração de cards** no Desktop, com cópia entre unidades (§10)
7. **Temperatura e nível de tanque** — conversão, e os dois desenhos novos
8. **Front dinâmico** — monitoramento e tempo real montados a partir da configuração da unidade

⚠️ O passo 3 é o de maior risco: troca o caminho de leitura de toda a frota. Como a frota nasce vazia
(§10), o comportamento observável **vai** mudar no dia do deploy — a telemetria só volta unidade a
unidade, conforme cada uma for configurada.
