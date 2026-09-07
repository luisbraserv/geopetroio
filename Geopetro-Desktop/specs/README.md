# Specs — Geopetro-Desktop

> Agente de borda instalado na sonda · JavaFX 21 + Spring Boot 4.0.5 · Windows
>
> Specs de **sistema** em [`../../specs/`](../../specs/). Aqui ficam as specs de **feature**.

## Papel no sistema

**[FATO]** É o único ponto de captura de telemetria do GeopetroIO. Roda em um computador conectado à
rede do CLP da sonda e:

1. Lê o CLP Siemens via protocolo S7 a cada **1 segundo**
2. Converte sinais 4-20mA em grandezas de engenharia
3. Persiste em H2 local (fonte de verdade da sonda)
4. Publica via MQTT para o sistema central
5. Exibe dashboard em tempo real e gera Carta de Operação em PDF

**[FATO] Arquitetura invertida:** JavaFX é o dono do processo; Spring é usado apenas como container de
DI/JPA. `DesktopSondaGeopetroIoApplication.main()` **não** chama `SpringApplication.run` — delega para
`JavaFXConfiguration.main()`, que sobe o contexto Spring dentro do ciclo de vida do JavaFX.
`spring.main.web-application-type=none` — **não há servidor HTTP**.

## Organização

```
specs/
├── aquisicao-clp/      ← conexão S7, leitura DB1, conversão de sinal
├── telemetria-mqtt/    ← publicação
├── monitoramento/      ← dashboard em tempo real
├── graficos/           ← histórico consultável
├── carta-operacao/     ← geração de PDF
└── configuracao/       ← parâmetros de sensores e calibração
```

## Identidade visual (2026-08-27)

**[DECIDIDO]** O Desktop usa os mesmos tokens normativos do
[`../../specs/index.html`](../../specs/index.html). A tradução para JavaFX fica centralizada em
`views/geopetro-design-system.css`: azul-marinho na estrutura, vermelho em ações primárias,
canvas claro, superfícies brancas, bordas azuladas e a pilha tipográfica da marca.

FXML novo deve preferir `styleClass` e o stylesheet compartilhado. Estilo inline fica reservado a
valores realmente dinâmicos (por exemplo, estado online/offline ou cor de uma série de gráfico),
para evitar divergência entre telas.

## Mapeamento físico do CLP

> ⚠️ **[DECIDIDO 2026-09-07] Isto vai deixar de ser fixo.** A tabela abaixo passa a ser o **conjunto
> inicial** de cards da frota atual, não o mapeamento do sistema. Endereço, rack, slot, DB e intervalo
> entram na configuração da unidade — [`cards-configuraveis.md`](../../specs/features/cards-configuraveis.md)
> e [RN-080](../../specs/business-rules.md#rn-080--o-card-define-o-que-se-lê-do-clp).
>
> **O app também deixa de ser exclusivo de sonda**, e o projeto passa a se chamar `Geopetro-Desktop` —
> [`renomeacao-projetos.md`](../../specs/renomeacao-projetos.md).

**[FATO]** Data Block 1, conexão `ConnectTo(ip, rack=0, slot=1)` — rack/slot **fixos no código**.

| Código | Endereço | Tipo | Grandeza | Dispositivo MQTT |
|---|---|---|---|---|
| B001 | `DBD0` | DWord (contador cumulativo) | Vazão | `VAZAO_01` |
| B002 | `DBW4` | Word 4-20mA | Peso da Coluna | `PESO_COLUNA_01` |
| B003 | `DBW6` | Word 4-20mA | Torque Ch. Hid. Tubos | `TORQUE_01` |
| B004 | `DBW8` | Word 4-20mA | Torque Ch. Flutuante | `TORQUE_02` |
| B005 | `DBW10` | Word 4-20mA | Pressão Bomba **e** ESCP | `PRESSAO_01` |

✅ **[CORRIGIDO 2026-09-07 — este texto estava obsoleto.]** Ele citava um comentário
*"A escala 0..1000 é preservada até sua confirmação no PLC"* em `PlcConnectionService.java:181`.
**Esse comentário não existe mais**, e a escala 0–1000 saiu do código em 2026-08-31: o
*Measurement Range* real é **−50..750**, e a conversão foi reescrita conforme
[RN-030](../../specs/business-rules.md#rn-030--conversão-do-ax-do-logo--psi).

⚠️ **O que de fato continua aberto** é outra coisa: confirmar em campo, com calibrador de laço, que o
amplificador de **cada canal** está com essa mesma configuração. A conversão assume −50..750 para
todos. Ver [OQ-016](../../specs/open-questions.md#oq-016--a-escala-analógica-do-clp-foi-confirmada).

## Fórmulas de conversão

Documentadas como [RN-030 a RN-035](../../specs/business-rules.md#telemetria--conversão-de-sinal).
**São as regras de maior criticidade deste repositório** — erro aqui produz dado operacional errado
silenciosamente, em toda a frota.

⚠️ **[FATO]** A constante bar→psi está declarada **duas vezes** com precisões diferentes:
`PlcConnectionService.BAR_PARA_PSI = 14.5037738` e `HydraulicTorqueCalculator.BAR_TO_PSI = 14.5038`.

## Contrato de telemetria

Normativo em [`mqtt-telemetria.md`](../../specs/contracts/mqtt-telemetria.md).

⚠️ **[FATO]** O formato publicado hoje **diverge** do contrato-alvo. Campos `unidade`/`dispositivo`
devem passar a `idSondaUnidade`/`dispositivoId`, com os campos descritivos adicionais. Ver
[§9 do contrato](../../specs/contracts/mqtt-telemetria.md#9-migração-a-partir-do-formato-atual).

## Caminhos de arquivo

**[FATO]** Resolvidos por `AppPaths`:

| Contexto | Base |
|---|---|
| Desenvolvimento (`jpackage.app-version` ausente) | `user.dir` (pasta do projeto) |
| Instalado via jpackage | `%USERPROFILE%\.geopetro-io\` |

⚠️ **[FATO] Divergência conhecida:** `application.properties:9` fixa a URL do H2 **sempre** em
`${user.home}/.geopetro-io/data/sonda_geopetro`, independente do modo. Já
`JavaFXConfiguration.isDatabaseFileAvailable()` usa `AppPaths.dataDir()`, que em dev aponta para a
pasta do projeto. **Em desenvolvimento, a trava de instância única não olha o banco realmente em uso.**

## Dívida técnica específica

| Item | Referência |
|---|---|
| ⚠️ `SondaReadingSeeder` insere 1000 leituras sintéticas sem guarda de ambiente | [DT-013](../../specs/technical-debt.md#dt-013--seed-de-dados-sintéticos-sem-guarda) |
| ⚠️ Documentação HTML descreve HTTP + buffer que não existem mais | [DT-009](../../specs/technical-debt.md#dt-009--documentação-divergente-do-código) |
| ⚠️ Texto da UI sobre visibilidade de cards é impreciso | [RN-037](../../specs/business-rules.md#rn-037---visibilidade-de-card-controla-publicação-não-gravação) |
| Lógica de suavização duplicada **3 vezes** | [DT-010](../../specs/technical-debt.md#dt-010--duplicação-entre-os-dois-desktops) |
| Dependências web mortas (`webmvc`, `h2console`) com `web-application-type=none` | [DT-015](../../specs/technical-debt.md#dt-015--código-morto-inventário) |
| READMEs de pacote descrevem arquitetura inexistente | idem |
| Validação silenciosa em 3 dos 5 diálogos de configuração | — |

## Validação inconsistente entre diálogos

**[FATO]** Padrão a unificar:

| Diálogo | Feedback de erro |
|---|---|
| Chave Hidráulica | ✅ Label de validação visível |
| Gerar Carta de Operação | ✅ `Alert` |
| Peso da Coluna | ✅ `Alert` por campo (2026-08-31) |
| Bomba | ⚠️ Silencioso |
| Sensor genérico | ⚠️ Silencioso |

Nos dois silenciosos restantes, a janela simplesmente não fecha e o operador não recebe explicação.


## Leitura analógica e peso da coluna (2026-08-31)

### Conversão do Ax

**[FATO]** `ConversaoPressao` é o ponto único. O bloco *Analog Amplifier* do LOGO! entrega o laço
4–20 mA já reescalonado para **−50..750** (`Offset -250`); o aplicativo só posiciona na faixa e
converte para a unidade — ver [RN-030](../../specs/business-rules.md#rn-030--conversão-do-ax-do-logo--psi).

⚠️ Ax é lido com **sinal** (`axComoSigned`): a base da escala é negativa e, lido como Word unsigned,
`-50` viraria `65486`. Sem clamp — fora de faixa é sinalizado no log e pelo Ax cru no card.

### Peso da coluna

**[FATO]** O sensor está no **sargento**, não no gancho. A cadeia completa está em
[RN-031](../../specs/business-rules.md#rn-031--peso-da-coluna-pela-cadeia-do-sargento):

```
pressão → força → torque → tração da deadline → × nº de linhas → − Catarina
```

⚠️ **[DECIDIDO]** Substitui `peso = pressão × área`, que dava apenas a força hidráulica na célula.

| Arquivo | Papel |
|---|---|
| `models/PesoColunaConfig` | os 8 parâmetros de geometria |
| `models/PesoColunaCalculo` | resultado **com os intermediários** |
| `services/PesoColunaCalculator` | a cadeia + dedução do fator de calibração |

**[FATO]** A tela de configuração recalcula **enquanto se digita**, mostrando a cadeia inteira com a
leitura atual. Em campo o ajuste é feito comparando com carga conhecida; esperar o "Salvar" para ver
o efeito de cada parâmetro tornaria a calibração lenta.

⚠️ **[FATO] Compatibilidade da configuração salva:** o campo antigo `areaEfetivaPol2` continua sendo
lido como alternativa a `areaEfetivaSensorPol2`, para não perder uma área já medida em campo. Os
demais parâmetros vêm zerados numa configuração antiga, e o card indica "não configurado" até serem
preenchidos.
## Pontos em aberto

| # | Questão | Referência |
|---|---|---|
| 1 | Escala 0–1000 confirmada no CLP? | [OQ-016](../../specs/open-questions.md#oq-016--a-escala-analógica-do-clp-foi-confirmada) |
| 2 | ~~Rack/slot valem para toda a frota?~~ | ✅ Encerrada em 2026-09-07: **entram na configuração** |
| 3 | ~~Modelo real do CLP?~~ | ✅ Deixa de importar globalmente — endereçamento por unidade |
| 4 | Perda de telemetria em falha de MQTT é aceitável? | [OQ-019](../../specs/open-questions.md#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável) |

✅ **[FATO 2026-09-07] Resolvido antes de virar problema.** O cache de configuração era só em memória,
e com os cards vindo da configuração um Desktop que reiniciasse sem rede não saberia o que ler.
`ConfiguracaoRemotaStore` grava o último snapshot válido em `config/configuracao-remota.json`, com
gravação atômica e chave de servidor/usuário/unidade. Ver
[RN-088](../../specs/business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada).

---

## Canal de tempo real (2026-08-27)

**[FATO]** O Desktop passou a publicar em **dois canais independentes**.

### Concorrência — Java 21 Virtual Threads

```
VT "plc-reader"   → lê o CLP a cada 1s
VT "mqtt-worker"  → consome BlockingQueue → Broker
VT "realtime-ws"  → lê AtomicReference   → Geopetro-Backend
JavaFX Thread     → apenas interface
```

**[FATO]** Nenhuma thread é criada por leitura. As Virtual Threads ficam bloqueadas em espera a maior
parte do tempo — exatamente o caso para o qual foram feitas.

**[FATO]** A thread de leitura **apenas entrega e segue**. Antes, a publicação MQTT era síncrona
dentro do ciclo: rede lenta atrasava a leitura do CLP.

### A escolha oposta em cada canal

| | MQTT | Tempo real |
|---|---|---|
| Estrutura | `BlockingQueue(3600)` | `AtomicReference` |
| Canal lento | Acumula; descarta o **mais antigo** só se encher | Descarta o **intermediário** |
| Motivo | Histórico: cada leitura importa | Estado: só o "agora" importa |

**[FATO]** Ao reconectar, o tempo real envia o **estado mais recente**, não uma fila de estados
antigos. Isso é propriedade do `AtomicReference`, não lógica adicional.

**[FATO]** A fila MQTT cobre ~1 hora de broker fora. Mesmo descartando, o H2 local mantém o registro
completo.

### Configuração nova

| Campo | Obrigatório | Observação |
|---|---|---|
| `unidadeSondaId` + `sondaId` | **Sim** | Cada instalação pertence a **uma** Unidade/Sonda. Não são digitados: vêm juntos da escolha no seletor (ver "Um único campo de Unidade/Sonda") |
| `backendUrl` | Sim | Ex.: `http://10.0.0.10:8080` |
| `backendUsuario` / `backendSenha` | Sim | Usuário de serviço; autentica em `/api/auth/login` |

**[FATO]** Sem essa configuração, o Desktop **segue operando normalmente** — lê o CLP, grava local e
publica no MQTT. O tempo real é canal adicional, não requisito.

⚠️ **[FATO]** Duas instalações com o mesmo `unidadeSondaId` sobrescrevem o estado uma da outra. Não
há detecção disso hoje.

Contrato: [`websocket-realtime.md`](../../specs/contracts/websocket-realtime.md).

### Tela de Configurações (2026-08-27)

**[FATO]** Reescrita: `settings.fxml` + `settings.css` (primeiro CSS do projeto) + `SettingsController`.

- `BorderPane` com **cabeçalho e rodapé fixos** e só o miolo rolando. Antes os botões ficavam no fim
  de um `VBox` único: encolhendo a janela, **"Salvar" saía de vista** e era preciso rolar até o fim.
- Quatro cartões (Equipamento, Broker MQTT, Tempo real, Cards) numa grade de **2 colunas**.
- **Responsivo:** abaixo de 780px de largura a grade colapsa para 1 coluna. FXML não tem media
  query, então quem faz isso é o controller, observando `scene.widthProperty()`. A grade só é
  remontada quando o estado muda — reagir a cada pixel do arrasto reposicionaria os quatro cartões
  continuamente.

#### Um único campo de Unidade/Sonda

⚠️ **[DECIDIDO]** A tela tinha **dois** campos para a mesma sonda: `sondaId` (texto, ex. `UC-01`,
que endereça o tópico MQTT e a série no InfluxDB) e `unidadeSondaId` (numérico, que endereça o tópico
WebSocket e é FK do cadastro). Nada garantia que apontassem para a mesma unidade — preencher só um,
ou os dois com valores de sondas diferentes, **deixava um dos canais mudo sem erro visível**.

Agora há um `ComboBox` só, alimentado por `GET /api/sondas/minhas`, cujo DTO já devolve os dois
identificadores no mesmo registro. Uma escolha grava os dois, coerentes por construção.

- `UnidadeSondaCatalogoService` faz login e lista as unidades. **Só a tela usa esse serviço**; MQTT e
  WebSocket seguem lendo o que está salvo e funcionam com o backend fora do ar.
- A consulta roda fora da thread de UI (`Task`): os 10s de timeout congelariam a janela.
- Falha de rede **mantém a seleção anterior** e mostra o motivo — não apaga o que já funcionava.
- Abrir a tela offline mostra o valor salvo, sem ida ao backend.

**[FATO]** `jackson-databind` foi adicionado ao `pom.xml`. Não vinha por tabela porque o app roda com
`web-application-type=none`. Parsear o array com regex repetiria o defeito já corrigido no
`SettingsService`, cujo padrão parava no primeiro caractere escapado.

**Testes [FATO]** · `SettingsViewTest` carrega o FXML de verdade — um `fx:id` órfão ou um CSS
inexistente compila sem reclamar e só estoura quando o usuário clica em "Configurações". Cobre
também o colapso para uma coluna e a ausência dos dois campos antigos.

### Recebimento de configuração remota (2026-09-07)

**[FATO]** `CanalConfiguracaoLifecycle` inicia a sincronização no startup e ao salvar configurações locais, mesmo sem CLP conectado. `StompRealtimeClient` assina o tópico de configuração da unidade e solicita o snapshot no primeiro acesso, na reconexão e a cada 60 segundos.

**[FATO]** `ConfiguracaoRemotaState` mantém o último snapshot válido em memória, com revisão crescente e isolamento por servidor, usuário, unidade e geração de conexão. Trocar servidor, usuário ou unidade invalida o cache. Schema desconhecido e payload inválido são recusados. Cache em disco, avaliação local e auto-update da frota continuam pendentes.

Contrato e testes: [`configuracao-sonda.md`](../../specs/contracts/configuracao-sonda.md).
