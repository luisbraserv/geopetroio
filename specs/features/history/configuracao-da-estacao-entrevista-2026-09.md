# Histórico — configuração da estação

Decisões e diagnósticos datados. A [SPEC vigente](../configuracao-da-estacao.md) prevalece.

# Configuração da Estação — engrenagem, autoridade e alarme local

> **[DECIDIDO 2026-09-09]** · Spec-first · **Passo 1 entregue** (§11); os demais ainda não existem
> em código
>
> Feature de nível de sistema: atravessa Geopetro-Desktop, Geopetro-Backend e Geopetro-Front. Por
> isso mora aqui, e não dentro de um repositório —
> [convenção](../../README.md#convenção-de-marcação).
>
> Continua [`cards-configuraveis.md`](../cards-configuraveis.md) e corrige um desenho de
> [`alarmes.md`](../alarmes.md). **Reverte três decisões registradas**, todas marcadas como tal:
> §3, §5 e §7.
>
> Decisões vêm da **entrevista de 2026-09-09**, em quatro rodadas (§8) — a terceira foi a revisão da
> própria spec contra o código.

## 1. O que muda, em cinco frases

1. **O alarme da estação passa a ser da estação.** Hoje ele só apita com o limite que veio do
   servidor. Passa a ter configuração própria, local, editável por quem está na unidade — §3.
2. **A conexão do CLP inteira — IP incluído — vai para a engrenagem**, e é por ela que o PLC conecta.
   O endereço de cada grandeza fica no card, onde é propriedade dela — §4.
3. **A engrenagem passa a exigir `ADMIN` ou `SUPORTE`.** Ela deixou de ajustar só *esta estação* — §5.
4. **Telemetria vira liga/desliga**, para não gastar recurso onde o contrato não pede — §6.
5. **A tela de Prontidão da Frota é removida** — §7.

## 2. O estado de hoje

**[FATO 2026-09-09]** Verificado no código, para que a spec não descreva algo imaginado.

| Onde | O que configura | Portão |
|---|---|---|
| Engrenagem (`settings.fxml`) | IP do PLC ⚠️, Unidade/Sonda desta estação, broker MQTT (url/usuário/senha), URL do Backend, calibração de peso e torque, "Cards visíveis no monitoramento" ⚠️ | **Nenhum** |
| Cards (`cards-config.fxml`) | Por card: nome, tipo, byte inicial, ativo, visível, parâmetros. Mais o painel de conexão do CLP — IP, rack, slot, DB, intervalo | `ADMIN`/`SUPORTE` via `SessaoConfiguracao` |

### ⚠️ Dois campos da engrenagem não fazem nada

**[FATO 2026-09-09]** Descobertos ao detalhar §4. Não são duplicação inofensiva — são telas que
afirmam controlar algo que não controlam.

**O `plcIp` da engrenagem está morto.** `PlcConnectionService` conecta por
`documento.conexao().ip()`, o IP do **documento de cards**. O campo da engrenagem é lido de
`app-settings.json`, exibido, salvo de volta — e **nunca usado para conectar**. Quem troca o IP ali,
salva, e vê a estação continuar falando com o CLP antigo não tem como descobrir por quê.

**"Cards visíveis no monitoramento" também.** São os seis checkboxes das grandezas fixas de antes dos
cards configuráveis — `chkPesoColuna`, `chkChHidTubos`, `chkChFlutuante`, `chkBombaLama`, `chkEscp`,
`chkVazao`. `CardVisibilityConfig` é lido e escrito **somente** pela própria tela de configurações;
nada no caminho de leitura ou de publicação o consulta.

⚠️ **E o rótulo dele mente:** *"Cards desmarcados ficam ocultos e não salvam dados"*. Nenhuma das
duas coisas acontece — o dashboard vem do documento de cards, e a gravação também.

**[FATO]** O alarme local existe e funciona: `AlarmesLocais` avalia a cada ciclo,
`AvaliadorLocalDeAlarme` é a regra (função pura, dois níveis, tempo mínimo nas duas direções) e
`SinalSonoro` toca o beep do sistema no agravamento
([RN-104](../../business-rules.md#rn-104--a-estação-sinaliza-o-alarme-o-servidor-o-registra)).

⚠️ **[FATO] Mas os limites só chegam do servidor.** `AlarmesLocais.avaliar` recebe um
`ConfiguracaoSondaRemota` — o documento de limites que veio pelo canal de configuração e ficou em
cache. **Uma unidade que nunca recebeu esse documento não alarma nada**, por mais que esteja lendo o
CLP normalmente.

## 3. O alarme da estação passa a ser da estação

> ⚠️ **Isto reverte o desenho registrado em [`alarmes.md §3`](../alarmes.md).** Lá, o alarme da borda
> foi desenhado como *consumidor* dos limites do servidor: o Desktop recebia o documento e avaliava
> localmente. A entrevista de 2026-09-09 classificou esse desenho como **errado**. O que **não** muda
> é [RN-104](../../business-rules.md#rn-104--a-estação-sinaliza-o-alarme-o-servidor-o-registra): a
> estação continua sinalizando e não registrando.

**[DECIDIDO 2026-09-09]** *"O Geopetro-Desktop lê os valores. Então ele deveria ler e ter uma
configuração própria nele dos alarmes para poder tocar o alarme. Não faz sentido ir pro back e depois
retornar para o Geopetro-Desktop a mesma informação. O cliente no front pode colocar um alarme para
ele, mas o operador no equipamento que tá rodando o Geopetro-Desktop tem que ter a própria
configuração."*

### O que estava errado

O valor **nasce na estação**. Ela lê o CLP, converte e sabe o número antes de qualquer outro. Mandar
esse número ao servidor, deixar o servidor decidir que ele está fora da faixa, e trazer a decisão de
volta para tocar um beep na mesma máquina é uma volta inteira pela rede para responder uma pergunta
que já estava respondida ali.

⚠️ **E a volta é justamente o que falta quando o alarme importa.** O operador ao lado do equipamento é
a única pessoa que pode agir sobre uma pressão subindo; a sonda sem internet é o cenário em que ele é
a única pessoa que pode agir **e** o único caminho disponível. Fazer o beep depender de um documento
remoto é fazê-lo depender do que falhou.

### Dois alarmes, duas perguntas

**[DECIDIDO 2026-09-09]** São **configurações independentes**, e a divergência entre elas é
comportamento correto, não bug.

| | Alarme da estação | Alarme do servidor |
|---|---|---|
| Quem configura | Quem está na unidade, **sem login** | Quem enxerga a sonda, inclusive `CLIENTE` ([RN-069](../../business-rules.md#rn-069--quem-vê-a-sonda-vê-e-ajusta-o-alarme-dela)) |
| Onde | Sininho no card, no Desktop | Tela de Limites, no Front |
| Onde mora | `config/alarmes-locais.json`, nesta estação | Documento de limites, no Backend |
| O que faz | Destaque no card + beep | Episódio no log, destaque no tempo real, histórico |
| Sem rede | **Funciona** | Não avalia — o tempo real não chega |
| Responde | "eu, aqui, preciso olhar isto agora?" | "o que aconteceu nesta sonda?" |

⚠️ **Nenhum dos dois vê o outro, e é essa a intenção.** O operador aperta o limite dele para uma
manobra específica sem alterar o que a supervisão vigia; a supervisão aperta o dela sem fazer a
estação apitar a cada ciclo. Um único conjunto compartilhado obrigaria a escolher quem vence — e
qualquer resposta tira de alguém o controle do próprio alarme.

⚠️ **Custo aceito:** a estação pode estar apitando por um limite que a supervisão não conhece, e a
supervisão pode ter um episódio aberto que a estação não sinaliza. Quem olhar os dois lados vai
encontrar diferença, e **ela não é defeito**.

### 3.1 O sininho no card

**[DECIDIDO 2026-09-09]** Cada card ganha um **sininho**. Ele abre o ajuste do alarme daquela
grandeza, e o estado dele diz, sem clicar, se aquela grandeza é vigiada nesta estação.

| Estado do sininho | Significa |
|---|---|
| Apagado | Sem faixa configurada nesta estação |
| Aceso | Vigiando, dentro da faixa |
| Aceso + destaque | **Disparado agora** |
| Riscado | Faixa configurada e **desligada** — ela continua guardada |

**[DECIDIDO 2026-09-09] Sem faixa, o alarme nasce desligado.** A caixa "Alarme ligado" fica
**indisponível** enquanto mínimo e máximo estiverem vazios, e passa a valer sozinha assim que um dos
dois for digitado — quem acabou de informar um limiar quer o alarme ligado, e pedir um segundo clique
para confirmar o óbvio é o caminho para alguém sair achando que configurou.

⚠️ **"Ligado e sem faixa" deixou de ser possível**, em vez de ser corrigido em silêncio na gravação.
Era o engano mais fácil de cometer — marcar o sininho e sair sem digitar número — e o resultado era um
sino que prometia vigilância inexistente. A gravação ainda força `ativo=false` sem limiar, como
segunda linha: a invariante é de [RN-108](../../business-rules.md#rn-108--o-alarme-da-estação-é-configurado-na-estação),
não da tela.

**[DECIDIDO 2026-09-09] Sem login.** É o único ajuste do Desktop que qualquer pessoa faz. A razão é a
mesma que sustenta o alarme local existir: quem está no equipamento precisa poder dizer "me avise se
passar disto" no momento em que precisa, e um portão de rede ali anula a feature no cenário que a
motiva.

⚠️ **Isto contrasta de propósito com §5**, onde a engrenagem inteira passa a exigir login. A linha que
separa os dois: **o sininho não altera o que a unidade lê nem o que ela publica** — ele só decide
quando esta máquina apita. Errar nele não produz dado errado no histórico de cinco anos; errar na
engrenagem, sim.

⚠️ **Sem autoria, por construção.** A estação não tem identidade de quem opera, então mudar, desligar
ou afrouxar um alarme local **não deixa rastro** — um turno pode desativar o alarme de pressão e o
seguinte não tem como saber que ele existia. **[DECIDIDO 2026-09-09]** Aceito sem mitigação: *"essa
configuração é um alarme, só vai apitar, não é nada crítico"*. O que é crítico — o que a unidade lê e
publica — está atrás do portão de §5.

### ⚠️ O sininho precisa alcançar o card invisível

**[FATO 2026-09-09]** O dashboard da estação monta os indicadores a partir de
`LeituraDeCards.ativos(...)` e **nada filtra por `visivel`** — o campo decide apenas se a grandeza
entra na publicação de tempo real ([RN-037](../../business-rules.md#rn-037)).
Card ativo e invisível **aparece na tela da estação**.

**Isto é load-bearing e não estava escrito em lugar nenhum.** É o que faz o alarme da estação cobrir
justamente as grandezas que o servidor **estruturalmente não enxerga**: o tempo real só carrega card
visível, então limite sobre card invisível nunca dispara no servidor
([OQ-050](../../open-questions.md#oq-050--limite-sobre-card-invisível-nunca-dispara)). Hoje quem cobre
esse buraco é o alarme local.

⚠️ **Com §3.3 removendo os limites remotos da estação, o sininho passa a ser a *única* cobertura que
sobra para card invisível.** Se alguém "otimizar" o dashboard para esconder card invisível — o que
parece inofensivo e coerente com o nome do campo —, aquelas grandezas ficam **sem alarme nenhum, em
lugar nenhum**, e nada no sistema acusa. Vira [RN-111](#9-regras-de-negócio) por isso.

### 3.2 O que se configura

**[DECIDIDO 2026-09-09]** Faixa e liga/desliga, por grandeza:

```
AlarmeLocal
  dispositivoId      (a grandeza vigiada)
  serie              (null, ou uma das três do contador — RN-098)
  minimo             (opcional)
  maximo             (opcional)
  ativo              (liga/desliga sem perder a faixa)
```

**[DECIDIDO 2026-09-09] O tempo mínimo não aparece na tela.** Dois campos, mínimo e máximo, mais o
liga/desliga — e nada além disso.

O motor é reaproveitado inteiro: `AvaliadorLocalDeAlarme` já trabalha com dois níveis e tempo mínimo
nas duas direções. A tela preenche **só o par crítico**, e os tempos usam o mesmo padrão do servidor
(**3 s para abrir, 5 s para fechar**). A UI fica do tamanho que o operador precisa sem amputar o
motor, e um segundo nível no futuro não custa reescrita.

⚠️ **O tempo mínimo continua existindo, invisível — e é ele que impede o alarme de se destruir.** Sem
ele, um valor tremendo na fronteira produz um bipe por segundo; o desfecho conhecido é o operador
desligar o som da estação, e o próximo alarme de verdade não avisa ninguém
([RN-071](../../business-rules.md#rn-071--o-alarme-tem-dois-níveis-atenção-e-crítico)).

### Onde a configuração mora

**[DECIDIDO 2026-09-09]** Arquivo próprio da estação, `config/alarmes-locais.json`, **por
`dispositivoId`** — exatamente o padrão que a calibração já adota
([`cards-configuraveis.md §10b`](../cards-configuraveis.md)).

**Por que por `dispositivoId` e não por posição:** o documento de cards é reescrito a cada publicação
e a ordem da tela muda. Uma configuração de alarme presa à posição migraria de grandeza sozinha, e o
resultado seria o mais caro desta base — **um número plausível e errado**, com o alarme vigiando a
grandeza errada em silêncio.

**[DECIDIDO 2026-09-09]** Card desativado **hiberna o alarme local junto**, como o limite remoto já
hiberna ([RN-091](../../business-rules.md#rn-091--card-se-desativa-nunca-se-exclui)). Reativar o card
traz a faixa de volta como estava.

### 3.3 O Desktop para de receber o documento de limites

**[DECIDIDO 2026-09-09]** Com o alarme local independente, o documento de limites do servidor não tem
mais uso na estação. O Desktop **deixa de assiná-lo**.

| Sai | Fica |
|---|---|
| Assinatura de `/topic/config/unidades-sondas/{id}` (limites) | Assinatura de `/topic/config/unidades-sondas/{id}/cards` |
| `ConfiguracaoRemotaStore` e `ConfiguracaoRemotaState` — cache de limites | `CardsStore` e `CardsState` — cache de cards |
| `ConfiguracaoSondaRemota` como entrada de `AlarmesLocais` | O motor, com a configuração local no lugar |

⚠️ **O que se perde:** o operador não tem como saber o que a supervisão vigia, e a divergência entre
os dois alarmes fica invisível dos dois lados. Aceito — os dois alarmes respondem perguntas
diferentes, e nenhum depende de conhecer o outro para funcionar.

✅ **[FATO 2026-09-09] O tópico de limites ficou sem assinante — conferido, não suposto.** O Front lê
e grava limites por **REST** (`GET`/`PUT /api/sondas/{id}/configuracao`) e não assina nada em STOMP;
o Desktop era o único consumidor.

✅ **[FATO 2026-09-30] A remoção do lado do Backend foi feita.** Saíram o
`@SubscribeMapping("/config/unidades-sondas/{id}")` de `ConfiguracaoSondaController` e a guarda de
saída `ConfiguracaoSondaOutbound`, que existia só para guardar aquele tópico. O documento continua
vivo e continua sendo lido e gravado por REST — `MotorDeAlarmes` o lê a cada ciclo de tempo real, e é
ele quem alarma no servidor (RN-102).

O tópico de cards (`/config/unidades-sondas/{id}/cards`) **não** foi tocado: tem sufixo próprio e
segue guardado por `ConfiguracaoCardsOutbound`.

### ⚠️ A espera da conexão mudou de documento

**[FATO 2026-09-09]** Encontrado ao implementar, e teria quebrado o canal em silêncio.

`StompRealtimeClient.conectar()` bloqueava até receber o snapshot **de limites** — era ele que
completava `snapshotRecebido`. Removida a assinatura, a espera nunca terminaria e a conexão morreria
no timeout, **a cada tentativa**.

A espera passou para o snapshot de **cards**, que é o documento de que o Desktop de fato depende: sem
ele a unidade não sabe o que ler (RN-088).

⚠️ **O comentário que justificava a escolha antiga estava errado.** Ele dizia que bloquear nos cards
*"faria uma unidade nunca configurada travar a conexão até o timeout"*. Não faz: `ConfiguracaoCardsService.ler`
responde `revisão 0` com lista vazia para unidade sem documento — o snapshot **chega**, só vem vazio.
Conferido no código do Backend antes de mover a espera, e agora fixado por teste.

## 4. A conexão do CLP vai para a engrenagem

**[DECIDIDO 2026-09-09]** A conexão do CLP **inteira** — IP, rack, slot, DB e intervalo — passa a ser
configurada na engrenagem, e **é por ela que o PLC conecta**.

| | Hoje | Passa a ser |
|---|---|---|
| IP | Em **dois lugares**: engrenagem (morto) e tela de Cards (o que vale) | **Engrenagem**, um só |
| Rack, slot, DB, intervalo | Tela de Cards | **Engrenagem** |
| Byte inicial de cada grandeza | Tela de Cards, no card | **Continua no card** |

**A linha que separa:** a **conexão** descreve *com qual CLP se fala e como*. O **endereço** descreve
*onde aquela grandeza mora dentro dele* — é propriedade da grandeza, muda quando o card muda, e
tirá-lo do card obrigaria a manter duas listas em sincronia.

### O IP tinha duas fontes, e a errada era a visível

⚠️ **[FATO 2026-09-09]** Hoje o IP existe em dois lugares, e **o que a tela de Configurações mostra
não é o que conecta**: `PlcConnectionService` usa `documento.conexao().ip()`, do documento de cards,
enquanto `AppSettings.plcIp` é lido, exibido, salvo — e ignorado.

**A correção não é escolher um dos dois, é apagar o morto.** `plcIp` sai de `AppSettings` e de
`app-settings.json`; o campo da engrenagem passa a editar o `conexao.ip` do documento, que é o que
sempre valeu. Fonte única, e o que a tela promete passa a acontecer.

⚠️ **Migração:** estações em campo têm um `plcIp` gravado que pode divergir do documento. Ele **não**
deve ser promovido a fonte na virada — o CLP conecta hoje pelo documento, e adotar o valor da
engrenagem apontaria a estação para outro endereço no primeiro boot depois da atualização. O valor
antigo fica no arquivo, sem uso, como a calibração faz na sua própria migração.

### Onde os campos passam a morar

**[DECIDIDO 2026-09-09]** A conexão continua **no documento da unidade** — muda a tela que a edita,
não o lugar onde ela é guardada.

**Por que não trazê-la para `app-settings.json`:** rack, slot, DB e intervalo descrevem o **modelo**
de CLP, e é isso que a cópia entre unidades repete ao configurar uma sonda igual
([`cards-configuraveis.md §10`](../cards-configuraveis.md)). Torná-los locais tiraria esse ganho e
obrigaria a redigitá-los unidade a unidade.

⚠️ **Consequência:** a engrenagem passa a editar um documento remoto, com revisão e `409` como
qualquer outro editor — é o que torna §5 necessário.

⚠️ **[FATO] O IP continua fora da cópia entre unidades.** Rack, slot, DB e intervalo são copiados; o
IP não, porque descreve **qual** CLP e não o modelo dele. Copiá-lo apontaria a estação B para o CLP da
A, *"a conexão teria sucesso, os endereços existiriam, e a B publicaria a leitura da A sob o próprio
nome. **Nada acusaria**"*. Reunir os campos numa tela só **não pode** apagar essa distinção.

### ⚠️ Dois editores, um documento

**[DECIDIDO 2026-09-09]** A engrenagem e a tela de Cards passam a editar o **mesmo documento**, e o
`PUT` carrega o documento **inteiro** — `conexao` e `cards` juntos.

**A revisão não cobre o caso perigoso.** Ela recusa duas gravações concorrentes, mas não impede a
engrenagem de enviar um array `cards` que ela **leu dez minutos atrás**: se alguém criou um card nesse
intervalo pela outra tela, salvar o IP na engrenagem o apaga, com revisão válida e `200` de resposta.

**Regra obrigatória:** a engrenagem **relê o documento imediatamente antes de gravar** e devolve
`cards` byte a byte como veio, alterando só `conexao`. A tela de Cards faz o simétrico com `conexao`.

⚠️ **Nada disso é visível em teste feliz.** O sintoma é um card que some sem ninguém ter apagado, e a
causa está na outra tela — separadas por minutos e por pessoas diferentes.

### O painel de conexão sai da tela de Cards

**[DECIDIDO 2026-09-09]** A tela de Cards deixa de ter o painel de conexão do CLP. Ela passa a tratar
só de **cards**: nome, tipo, byte inicial, ativo, visível e parâmetros.

⚠️ **Isto ajusta [`cards-configuraveis.md §13.6`](../cards-configuraveis.md)**, que descrevia a tela com
"painel de conexão do CLP e rodapé fixo".

### "Cards visíveis no monitoramento" sai da engrenagem

**[DECIDIDO 2026-09-09]** *"É de uma configuração antiga, os cards já estão sendo desabilitados nos
cards, então não faz sentido ter."*

**[FATO 2026-09-09]** São seis checkboxes das grandezas fixas de antes dos cards configuráveis —
Peso da Coluna, T. Ch. Hid. Tubos, T. Ch. Flutuante, P. Bomba de Lama, ESCP e Vazão. Com o
vocabulário fixo eles faziam sentido; com cards por unidade, a lista nem descreve mais o que a
unidade tem.

⚠️ **E já não fazem nada.** `CardVisibilityConfig` é lido e escrito **somente** pela própria tela de
configurações. Nada no caminho de leitura, de publicação ou de desenho o consulta — quem decide o que
aparece é `ativo`/`visivel` no documento de cards.

⚠️ **O rótulo mente.** Ele diz *"Cards desmarcados ficam ocultos e não salvam dados"*, e nenhuma das
duas coisas acontece. Uma tela que promete controle que não exerce é pior que a ausência dela: quem
desmarcar vai procurar o efeito, não achar, e desconfiar do resto da configuração.

**O que sai:** o cartão `cartaoCards` de `settings.fxml`, os seis `CheckBox` e seus campos no
`SettingsController`, `CardVisibilityConfig`, e a leitura/escrita correspondente em
`SettingsService`. O bloco antigo permanece em `app-settings.json` sem uso, como os demais resíduos
de migração — não se apaga arquivo de configuração de campo por conveniência de código.

**[FATO 2026-09-10] Feito.** Saíram também dois `import` órfãos de `CardVisibilityConfig` em
`MonitoringController` e `TelemetriaMqttService` — os únicos vestígios fora da tela, e **nenhum dos
dois usava a classe**. Eles confirmam o diagnóstico em vez de contradizê-lo: o import ficou de
alguma refatoração antiga e dava a impressão de que a configuração alcançava o monitoramento e a
publicação. Não alcançava.

A engrenagem passou de quatro cartões para três, e `aplicarLayout` acompanhou. `SettingsViewTest`
guarda a remoção pelo avesso — `oCartaoDeCardsVisiveisSumiu()` falha se o cartão ou qualquer um dos
seis checkboxes voltar.

### Como ficou — implementado em 2026-09-10

**Onde a regra da releitura mora:** em `ConfiguracaoCardsClient`, não nas telas
([RN-112](../../business-rules.md#rn-112--cada-tela-grava-só-a-sua-metade-do-documento-da-unidade)).
`salvarConexao` e `salvarCards` releem, comparam e mesclam; as telas só dizem qual metade estão
editando. Numa tela, a regra sobreviveria até a próxima pessoa que copiasse o método de gravar.

⚠️ **A releitura não descarta o `409`, e essa parte não estava escrita acima.** A redação original —
*"devolve `cards` byte a byte como veio"* — resolvida ao pé da letra adotaria a revisão relida e
mandaria em frente, o que **destruiria** a proteção da revisão sobre o campo que se está editando:
quem tivesse mudado a conexão nesse intervalo seria sobrescrito em silêncio. O que foi implementado
compara as duas metades e só recusa quando a **própria** mudou.

#### ⚠️ A cópia entre unidades colidia com "o painel sai da tela de Cards"

Duas afirmações desta seção não fechavam juntas: o painel de conexão **sai** da tela de Cards, e a
cópia entre unidades **replica** rack, slot, DB e intervalo. Se a tela não edita mais a conexão, a
gravação normal a descartaria — e a cópia perderia justamente o que a torna útil.

**[DECIDIDO 2026-09-10]** As duas ficam de pé, por caminhos separados:

| Caminho | Grava | Conferência |
|---|---|---|
| Salvar normal na tela de Cards | só `cards` | recusa se os **cards** mudaram |
| Salvar depois de uma cópia | `cards` **e** `conexao` | recusa se **qualquer** metade mudou |
| Salvar na engrenagem | só `conexao` | recusa se a **conexão** mudou |

⚠️ **E o que a cópia trouxe passou a ser dito.** Sem o painel, rack/slot/DB copiados seriam gravados
sem ninguém os ver — alterar o que não se mostrou é pior que não copiar. A linha de status agora
nomeia os quatro valores e lembra que o IP não vem junto.

## 5. A engrenagem passa a exigir ADMIN ou SUPORTE

> ⚠️ **Isto reverte [`cards-configuraveis.md §13.6`](../cards-configuraveis.md)**, que registrava:
> *"Botão Cards na barra do Desktop, ao lado da engrenagem e não dentro dela: são autoridades
> diferentes. **Configurações ajusta esta estação e não pede login**; Cards altera o que a unidade lê,
> só por ADMIN ou SUPORTE, com login."*

**[DECIDIDO 2026-09-09]** A engrenagem inteira passa a exigir `ADMIN` ou `SUPORTE`, **sem exceção**.

**O que mudou desde aquela decisão:** ela valia enquanto a engrenagem ajustava só *esta estação*. Com
§4, ela passa a editar a conexão do CLP — que é da unidade — e com §6 passa a decidir se a unidade
publica. O argumento que a mantinha aberta deixou de valer.

**Reaproveita o que existe:** `SessaoConfiguracao` já implementa o portão (`CONFIGURADORES = ADMIN,
SUPORTE`), já recusa perfil sem permissão com mensagem própria, e já vive só em memória
([RN-086](../../business-rules.md#rn-086--configurar-exige-admin-ou-suporte-autenticado-no-backend),
[RN-087](../../business-rules.md#rn-087--a-sessão-de-configuração-do-desktop-morre-com-o-app)). O que
falta é `SettingsController` passar por ele.

### A configuração inicial exige internet

**[DECIDIDO 2026-09-09]** *"A configuração inicial sempre é feita com internet. Isso é regra. Isso
evita que terceiros sem conhecimento ou que tentem roubar o software para uso pessoal acessem sem
permissão."*

Uma cópia do aplicativo sem credencial válida não configura nada, logo não lê CLP nenhum
([RN-088](../../business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada)). **O portão é a
proteção** — não há mecanismo além dele, e não é preciso haver.

### Os campos de endereço entraram no portão também

**[DECIDIDO 2026-09-09]** *"A URL do MQTT deve ficar como tá na engrenagem, sem alterar. A gente que
vai colocar. Se tem acesso só por email/senha, não tem por que se preocupar com isso."*

**[DECIDIDO 2026-09-10 — reverte o parágrafo acima]** *"URL do Backend + credenciais e endereço e
credenciais do broker MQTT também exige autenticação."*

**Os quatro cartões da engrenagem ficam trancados sem sessão, sem exceção** — endereços e credenciais
inclusive. A decisão de 09 deixava os campos de endereço livres; a de 10 fecha tudo.

⚠️ **O que impede a porta de fechar sobre si mesma.** A decisão de 09 apoiava-se numa observação
correta: sem a URL do Backend não há login, e se a URL só existisse atrás do login, uma estação nova
não teria por onde começar. Trancar tudo reabriria essa trava — por isso a trava foi resolvida em
outro lugar, e não abrindo exceção no cadeado.

**O campo Servidor mudou de tela.** Ele agora fica na *janela de login*, não na engrenagem. Quem
instala digita o endereço ali, no mesmo formulário em que digita usuário e senha. O endereço só é
gravado **depois** que o servidor aceita a credencial — endereço errado ou servidor fora do ar não
deixam lixo na configuração.

```
Estação nova  ->  janela de login: servidor + usuário + senha  ->  configura o resto
```

**A linha do cadeado, então:** não há linha. Tudo que a engrenagem alcança exige `ADMIN`/`SUPORTE`; o
único campo fora do cadeado é o Servidor na janela de login, que existe justamente para poder logar.

| Campo | Portão |
|---|---|
| URL do Backend, endereço e credenciais do broker MQTT | `ADMIN`/`SUPORTE` |
| Conexão do CLP — IP, rack, slot, DB, intervalo (§4) | `ADMIN`/`SUPORTE` |
| Unidade/Sonda desta estação | `ADMIN`/`SUPORTE` |
| Liga/desliga da telemetria | `ADMIN`/`SUPORTE` |
| Calibração de peso e torque | `ADMIN`/`SUPORTE` |
| **Servidor, na janela de login** | **Livre — é o que destranca o resto** |

⚠️ **A calibração de peso e torque entra no portão.** Ela é **medida em campo**, com a unidade parada,
e passa a exigir rede e perfil de configuração. Consequência aceita explicitamente na entrevista; fica
registrada porque é a que mais provavelmente vai doer na operação.

## 6. Telemetria vira liga/desliga

**[DECIDIDO 2026-09-09]** *"É uma configuração pra gente não gastar recurso computacional à toa."*

Dois checkboxes independentes na engrenagem:

| Checkbox | Desliga | Continua funcionando |
|---|---|---|
| **Telemetria MQTT** | Publicação ao broker → sem histórico no InfluxDB | Leitura do CLP, tela, histórico local, **alarme local** |
| **Tempo real (WebSocket)** | Publicação ao Backend → sem tela remota, sem alarme do servidor | Idem |

**[FATO]** Hoje não há liga/desliga. `TelemetriaMqttService` sobe se houver credenciais e
`TelemetriaRealtimeService` se houver URL e unidade — então "desligar" é **deixar um campo em
branco**. Funciona por acidente, é indescobrível, e não distingue *desligado de propósito* de *mal
configurado*. Os dois checkboxes tornam a decisão explícita.

**[DECIDIDO 2026-09-09] O interruptor é local**, em `app-settings.json`. Não viaja ao servidor.

⚠️ **Consequência:** de fora, uma unidade deliberadamente calada é indistinguível de uma quebrada. É o
mesmo limite que o sistema já aceita para o CLP desligado — nenhuma tela remota promete responder
"está chegando dado?", e esta decisão não muda isso.

### Como ficou — implementado em 2026-09-10

**[DECIDIDO 2026-09-10] Chave ausente vale LIGADO.** Toda estação em campo tem um
`app-settings.json` gravado antes de §6 existir. Se a ausência valesse "desligado", a frota inteira
emudeceria na primeira atualização — sem histórico, sem tela remota e sem alarme de servidor, por uma
escolha que ninguém fez. Só um `false` explícito desliga
([RN-114](../../business-rules.md#rn-114--os-interruptores-de-telemetria-nascem-ligados)).

#### ⚠️ O lugar óbvio de dobrar o interruptor apagava os cards

O caminho natural seria somar `tempoRealAtivo` a `AppSettings.temConfiguracaoTempoReal()` — um
`&&` e pronto. **Não pode.** Aquele predicado alimenta `alvo()`, e `alvo()` nulo faz
`atualizarConfiguracao` chamar `cards.conectar(null, null)`; `EstadoDeDocumento.conectar` **zera o
snapshot em memória** quando o backend ou a unidade mudam.

O resultado seria o dashboard vazio e o alarme local mudo junto com a telemetria — exatamente o que a
tabela acima promete manter de pé, e o alarme da estação só alcança grandeza de card invisível
porque ela aparece no dashboard ([RN-111](../../business-rules.md#rn-111--o-dashboard-da-estação-mostra-todo-card-ativo-visível-ou-não)).

**Onde ficou, então:** o interruptor viaja no snapshot do worker e é conferido **depois** do
`cards.conectar`, no laço de `TelemetriaRealtimeService`. O canal de cards continua apontado para a
unidade certa; o que para é a publicação. `conectar()` tem a segunda tranca, para quem o chame por
outro caminho.

⚠️ **`CardsOfflineTest.desligarTempoRealNaoApagaOsCards` existe por causa disso** — verificado: com o
`&&` no predicado, ele falha.

**O MQTT fecha a conexão ao desligar**, não só para de publicar: o cliente sobe com
`setAutomaticReconnect(true)`, e uma conexão viva reconectando sozinha seria o gasto que o
interruptor existe para evitar, com a tela dizendo "desligado". A fila pendente é descartada junto —
o que estava nela foi lido antes do desligamento.

## 7. A tela de Prontidão da Frota sai

> ⚠️ **Isto reverte a entrega de [OQ-049](../../open-questions.md#oq-049--como-saber-quais-unidades-da-frota-já-foram-configuradas)**,
> de 2026-09-09 — a tela tem um dia de vida.

**[DECIDIDO 2026-09-09]** *"A frota não tá configurada, eu vou configurar tudo de uma vez, não faz
sentido ter ela."*

**Por que ela existia:** a frota nasce vazia (RN-088) e cada unidade é configurada individualmente. A
tela respondia *"quais já foram e quais ficaram para trás?"* durante o mutirão de migração.

**Por que sai:** a migração vai ser feita **de uma vez**, e não unidade a unidade ao longo de semanas.
Sem mutirão espalhado no tempo, não há pergunta para a tela responder — ela custa manutenção sem
resolver problema.

**O que sai junto:**

| Camada | O que remover |
|---|---|
| Front | Tela `prontidao-frota-page`, `prontidao.service.ts`, rota e item de menu |
| Backend | `GET /api/sondas/prontidao`, `ProntidaoController`, `ProntidaoService`, `ProntidaoDaUnidade` |
| Backend | Os campos que só ela usa em `CardsDeclarados.Resumo` e `LimitesDeclarados.Resumo` |

⚠️ **A correção do achado A05 sai com ela.** A auditoria de 2026-09-09 encontrou que a prontidão
contava flags sem cruzá-las com as grandezas efetivamente publicadas, e a correção entrou no mesmo
dia. Removida a tela, **o achado deixa de existir por ausência de código, não por conserto** — e o
registro da auditoria precisa dizer isso, ou vai parecer que foi resolvido de outra forma.

⚠️ **[PENDENTE] OQ-049 volta a ficar sem resposta.** Se um dia entrar unidade nova na frota, ou uma
for reconfigurada, não haverá como saber de fora que ela ficou muda. Aceito porque a migração é um
evento único e acompanhado; registrar aqui para que a decisão não se perca se o cenário mudar.

### Como ficou — implementado em 2026-09-10

**Saiu mais do que a tabela previa.** Ela dizia "os campos que só ela usa em `CardsDeclarados.Resumo`
e `LimitesDeclarados.Resumo`". Na verificação, **os dois `Resumo` inteiros e os dois `resumos()`**
não tinham outro chamador — `CardsDeclarados` e `LimitesDeclarados` continuam de pé pelos métodos
`de(unidadeSondaId)`, usados por `ConfiguracaoSondaService` e pelo `MotorDeAlarmes`. Removidos
inteiros, e com eles os imports de `Instant`, `Set`, `LinkedHashSet` e `Predicate`.

**Registros atualizados:** [OQ-049](../../open-questions.md#oq-049--como-saber-quais-unidades-da-frota-já-foram-configuradas)
foi reaberta, e o achado A05 da auditoria diz agora, com todas as letras, que deixou de existir **por
ausência de código, não por conserto**.

**Verificação:** Backend em **280 testes** verdes (254 no `app`, 26 no `usuario`); Front em
**412 testes, 45 arquivos**, todos verdes por `ng test`; `tsc --noEmit` limpo.

⚠️ **A contagem do Front caiu de 421/46 para 412/45**, e é a remoção aparecendo: os nove testes de
`prontidao-frota-page.component.spec.ts` saíram com a tela.

> ⚠️ **Armadilha registrada porque custou uma conclusão errada.** `npx vitest run` neste projeto
> "falha" em 38 testes de 28 arquivos, com `JIT compilation failed for injectable [class
> PlatformLocation]`, `describe is not defined`, `localStorage is not defined` e
> `Need to call TestBed.initTestEnvironment() first`. **Não há defeito nenhum ali.** O alvo de teste
> é `@angular/build:unit-test` (`angular.json`), e é o builder que fornece o ambiente jsdom, os
> globais, o `zone.js`, o `@angular/compiler` e o `initTestEnvironment` — não existe `vitest.config`
> nem arquivo de setup no repositório, porque quem os monta é ele. Chamar o `vitest` cru pula tudo
> isso.
>
> **O comando é `ng test` (ou `npm test`).** Um resultado de `npx vitest` não é evidência sobre este
> repositório.

## 8. As quatro rodadas da entrevista de 2026-09-09

| # | Tema | Antes | Depois |
|---|---|---|---|
| 1 | Alarme da borda | Consumia os limites do servidor | **Configuração própria da estação** — o desenho anterior foi classificado como errado |
| 1 | Um conjunto ou dois | Proposto um só, com precedência a definir | **Dois independentes** |
| 1 | Quem ajusta o sininho | Proposto login | **Sem login** |
| 1 | Conexão do CLP | Dividida entre engrenagem e Cards | **Conexão na engrenagem, endereço no card** |
| 1 | Portão da engrenagem | Aberta, de propósito | **ADMIN/SUPORTE, sem exceção** |
| 1 | Tempo mínimo | Em aberto | **Padrão fixo, invisível** (3 s / 5 s) |
| 1 | Documento de limites no Desktop | Em aberto | **Para de receber** |
| 1 | Impasse de instalação | Bloqueava §5 | ~~URL vem no instalador~~ — **revertido na rodada 3**. Ficou de pé só a regra de que a 1ª configuração exige internet |
| 2 | Interruptor de telemetria | Proposto no documento da unidade | **Local**, em `app-settings.json` |
| 2 | Prontidão da Frota | Entregue no dia anterior | **Removida** |
| 3 | Endereços de servidor e broker | Propostos no instalador, como barreira anti-cópia | **Ficam na engrenagem como estão** — *"a gente que vai colocar; se tem acesso só por email/senha, não tem por que se preocupar"*. A RN-111 daquela proposta **deixa de existir** |
| 3 | Impasse de primeira instalação | Bloqueava o passo do portão | **Resolvido de graça** pela decisão acima: os campos de endereço ficam fora do cadeado (§5) |
| 3 | Rastro do ajuste do sininho | Proposto log local | **Sem rastro** — *"é um alarme, só vai apitar, não é nada crítico"* |
| 3 | Alcance do sininho | Suposição não escrita | **RN-111** — o dashboard mostra card ativo invisível, e é isso que sustenta a cobertura |
| 3 | Dois editores do documento de cards | Não previsto | **Regra de releitura antes de gravar** (§4) |
| 4 | IP do CLP | A spec o mantinha local, separado do resto da conexão | **Vai para a engrenagem junto com rack, slot, DB e intervalo** — *"o PLC deve se conectar através dessas configurações"* |
| 4 | `plcIp` de `app-settings.json` | Tido como a fonte do IP | **[FATO] Está morto** — quem conecta é o `conexao.ip` do documento. O campo sai (§4) |
| 4 | "Cards visíveis no monitoramento" | Não examinado | **Removido** — seis checkboxes das grandezas fixas antigas, que não fazem nada e cujo rótulo mente (§4) |

### Correção registrada

⚠️ Na rodada 2, a spec argumentou que o interruptor local faria a unidade aparecer como *"Nunca
configurada"* para sempre na prontidão. **Estava errado**: a tela classifica pelos documentos no
servidor, então uma unidade configurada com telemetria desligada apareceria como **"Pronta"** — e a
própria tela já declarava não falar de publicação. O argumento caiu; a decisão pelo interruptor local
não tinha o custo que se atribuiu a ela.

## 9. Regras de negócio

**[PROPOSTA]** A registrar em [`business-rules.md`](../../business-rules.md) **no mesmo commit do
código**, conforme a [regra de evolução](../../README.md#como-manter-uma-spec-curta).

| # | Regra | Efeito |
|---|---|---|
| **RN-108** | O alarme da estação é configurado na estação | Nova. O beep local não depende de documento remoto |
| **RN-109** | O sininho é o único ajuste do Desktop sem login, e sem autoria | Nova. Delimita a exceção a RN-086 e diz por quê |
| **RN-110** | A estação decide se publica, por caminho | Nova. E de fora, calada por decisão é igual a quebrada |
| **RN-111** | O dashboard da estação mostra todo card **ativo**, visível ou não | Nova. É o que dá ao sininho alcance sobre card invisível — a única cobertura que sobra para OQ-050 |
| RN-086 | Configurar exige ADMIN ou SUPORTE | **Amplia** para a engrenagem inteira (§5) |
| RN-104 | A estação sinaliza; o servidor registra | **Mantém**, e passa a valer sobre limites locais (§3) |

## 10. Pontos em aberto

| # | Questão | Onde |
|---|---|---|
| 1 | OQ-049 volta a ficar sem resposta se a frota crescer | §7 |

✅ **Nada bloqueia a implementação.** O tópico de limites já foi removido do
Backend (§3.3). OQ-049 permanece como risco para o crescimento da frota.

**[FATO 2026-09-09]** Conferido na revisão, para o passo 8 não descobrir isso no meio: `resumos()` de
`CardsDeclarados` e `LimitesDeclarados` é chamado **apenas** por `ProntidaoService` e pelos testes
dele — a remoção da prontidão leva junto os campos que a correção do A05 acrescentou, sem alcançar
nenhum outro consumidor.

## 11. Ordem de implementação sugerida

Nenhum passo começa antes de a spec ser aceita — a base é spec-first
([README §Como evoluir uma spec](../../README.md#como-manter-uma-spec-curta)).

1. ✅ **Alarme local com configuração própria** (§3) — **entregue em 2026-09-09**.
   `AlarmesDaEstacao` guarda a faixa em `config/alarmes-locais.json` por `dispositivoId` mais
   `serie`, com escrita atômica e o mesmo desenho de `CalibracaoDeCards`; `AlarmesLocais` passou a
   ler dela e **não recebe mais o documento do servidor**. Registrado em
   [RN-108](../../business-rules.md#rn-108--o-alarme-da-estação-é-configurado-na-estação).

   ⚠️ **Junto veio o desacoplamento da regra.** `AvaliadorLocalDeAlarme` recebia o `Limite` do
   documento remoto — o que amarrava o beep desta máquina a um documento de outra. Passou a ter tipo
   próprio (`Faixa`), com os seis campos que a regra usa e nada mais: sem `dispositivoId` e sem
   `ativo`, que são de quem guarda a configuração, não de quem aplica a regra.

   ⚠️ **E a hibernação precisou de regra nova.** Antes, card desativado sumia do documento de
   limites e o destaque apagava sozinho. Agora a configuração é local e não sabe de card, então o
   motor apaga o estado de toda grandeza **ausente do ciclo** — card desativado sai por completo,
   enquanto grandeza sem valor continua presente e conserva o destaque (RN-099).

2. ✅ **Sininho no card** (§3.1) — **entregue em 2026-09-09**. Um botão por card, à esquerda e oposto
   à engrenagem, abrindo `AlarmeLocalDialog` com mínimo, máximo e liga/desliga. Sem login
   ([RN-109](../../business-rules.md#rn-109--o-sininho-é-o-único-ajuste-do-desktop-sem-login)). Os
   quatro estados de §3.1 saem no símbolo **e** na cor, e a dica explica cada um.

   ⚠️ **Junto veio a correção de um defeito que a tela tinha.** `atualizarCard` pedia a severidade
   só quando a grandeza tinha valor — então uma leitura ausente **apagava o destaque na tela**,
   desfazendo exatamente o que o motor preserva por RN-099. O motor guardava o alarme aceso e a tela
   o jogava fora. Agora a severidade sai do motor, e não do ciclo.

   ⚠️ **Sem faixa, o alarme nasce desligado** — a caixa fica indisponível até haver um limiar, e a
   gravação força o mesmo. "Ligado e sem faixa" deixou de ser um estado alcançável.

   Com este passo o conjunto **passa a ser entregável**: o passo 1 sozinho deixaria a estação sem
   como configurar faixa nenhuma.
3. ✅ **Desktop para de assinar o documento de limites** (§3.3) — **entregue em 2026-09-09**. Saíram a
   assinatura de `/topic/config/unidades-sondas/{id}`, o snapshot correspondente,
   `ConfiguracaoRemotaState`, `ConfiguracaoRemotaStore`, `ConfiguracaoSondaRemota` e
   `getConfiguracaoSonda()`. O canal passou a trazer **um** documento.

   ⚠️ **A espera da conexão teve de mudar de documento** — ver §3.3. Era o snapshot de limites que a
   destravava; sem ele o canal morreria no timeout a cada tentativa.

   ⚠️ **Cobertura viva quase foi junto.** `ConfiguracaoRemotaTest` cobria os dois documentos: apagá-lo
   inteiro levaria o teste do parser fragmentado, o do frame gigante, o de documento de outra
   unidade, o da assinatura efetiva e o da unidade sem cards. Foram portados para
   `CanalDeCardsTest`; só o que era específico de limites morreu com a feature.
4. ✅ **Portão na engrenagem** (§5) — **entregue em 2026-09-10**. A tela abre livre; os cartões de
   Equipamento e de Cards nascem **desabilitados**, com uma faixa explicando por quê e um botão
   *Entrar para configurar* que reaproveita `ConfiguracaoLoginController.exigirSessao`.

   ⚠️ **O portão é conferido no `saveSettings` também**, e não só nos campos desabilitados. Campo
   desabilitado é aparência: um FXML editado ou um caminho que chame o método sem passar pela tela
   gravariam do mesmo jeito. Regra de autorização que vive só na UI some na primeira refatoração.

   ⚠️ **Um detalhe do salvamento sem sessão.** `updateTempoReal` grava unidade, URL e credenciais de
   uma vez, e só a unidade é trancada. Sem sessão, ela é regravada com o valor que já estava — passar
   `null` desconectaria a estação só por alguém ter aberto a tela e clicado em Salvar.

   ⚠️ **A calibração entrou no portão junto**, pela engrenagem de cada card no monitoramento. Ela
   decide como o valor bruto do CLP vira a leitura gravada por cinco anos; errar ali produz um número
   plausível e errado. Contrasta de propósito com o sininho ao lado, que não pede login (RN-109).
5. **Conexão do CLP na engrenagem** (§4) — move o painel inteiro, IP incluído, com a releitura antes
   de gravar. Junto sai o `plcIp` morto de `AppSettings`, para o IP ter fonte única
6. **Remoção de "Cards visíveis no monitoramento"** (§4) — código morto com rótulo que mente.
   Independente dos demais, e o mais barato da lista
7. **Liga/desliga da telemetria** (§6) — dois checkboxes, `app-settings.json`
8. **Remoção da Prontidão da Frota** (§7) — independente dos demais; pode ir a qualquer momento

⚠️ **O passo 4 é o de maior risco**: erra no sentido de **trancar a operação para fora**, e o sintoma
aparece na instalação de uma unidade nova — longe de quem fez a mudança. O teste que importa é subir
uma estação **sem `app-settings.json` nenhum** e chegar até o login.

⚠️ **O passo 3 tem uma janela perigosa.** Entre remover o consumo do documento remoto e o passo 1
estar completo, a estação fica sem alarme nenhum. A ordem acima evita isso; inverter os dois, não.
