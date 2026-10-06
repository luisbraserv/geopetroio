# Specs — Braserv-Horus-Desktop (Cimentação)

> Módulo de Cimentação Desktop do GeopetroIO · JavaFX 21 · Gradle 9.3 · Windows
>
> Specs de **sistema** em [`../../specs/`](../../specs/). Aqui ficam as specs de **feature**.

## Identidade do produto

**[FATO]** "Horus" é **codinome interno** de desenvolvimento — nome do repositório local, da pasta e
do pacote Java (`com.example.braservhorusdesktop`). O produto se apresenta ao usuário como
**"GeoPetro IO - Cimentação"**:

| Evidência | Local |
|---|---|
| Título da janela `"GeoPetro IO - Cimentação"` | `JavaFxApp.java:24` |
| Cabeçalho do PDF `"Geopetro IO - Braserv"` | `PdfService.java:157` |
| Instalador `--name "GeopetroIO - Cimentação"` | `scripts/package-windows.ps1:9` |
| Dados em `%LOCALAPPDATA%\GeopetroIO\` | `ConfiguracaoService.java:42` |
| Remote `geopetro-io-cimentacao-desktop` | `git remote -v` |

## Isolamento técnico — confirmado

**[FATO]** Verificado nos dois sentidos por varredura textual exaustiva:

- Zero ocorrências de `"sonda"` em todo o código-fonte do Horus.
- Zero ocorrências de `"horus"` em **todos** os repositórios irmãos (incluindo `target/` e `dist/`).

**[FATO]** Sem dependência HTTP/REST no `build.gradle`. A única comunicação de rede é S7 com o CLP
local na porta 102.

**Conclusão:** é módulo do produto GeopetroIO por **marca e convenção de instalação**, mas
**tecnicamente autônomo** — sem acoplamento algum em código, configuração ou runtime com o sistema
Sonda.

**[DECIDIDO 2026-08-26]** Permanece separado do Geopetro-Desktop. A duplicação de capacidades
([DT-010](../../specs/SDD/software/technical-debt.md#dt-010--duplicação-entre-os-dois-desktops)) é aceita
conscientemente — mas correções de fórmula precisam ser aplicadas **nos dois repositórios**.

## Organização

```
specs/
├── aquisicao-clp/      ← conexão S7, leitura DB1, conversão de pressão
├── monitoramento/      ← dashboard da bomba em tempo real
├── carta-operacao/     ← geração de PDF com 4 gráficos
└── configuracao/       ← calibração da bomba e do sensor
```

## Mapeamento físico do CLP

**[FATO]** CLP Siemens LOGO!, `ConnectTo(ip, rack=0, slot=0)` — note `slot=0`, diferente do
Geopetro-Desktop (`slot=1`).

| Endereço | Tipo | Grandeza | Ciclo |
|---|---|---|---|
| `DBD0` | DWord | Stroke cumulativo | 1s |
| `DBW4` (B002) | Word 4-20mA | Pressão | **250ms** |

**[FATO]** Ciclos distintos: pressão a cada 250ms; stroke, vazão e persistência a cada 1s.

## Persistência

**[FATO]** JSONL incremental — uma linha JSON por leitura:

```
%LOCALAPPDATA%\GeopetroIO\data\registros_operacao.jsonl
```

Com migração automática do formato legado (`registros_operacao.json`, array único).

⚠️ **[FATO]** `H2DatabaseService` existe no código com URL `jdbc:h2:./data/operacao` e a dependência
H2 está no `build.gradle` — mas a classe **nunca é instanciada**. Código morto.

## Dívida técnica específica

| Item | Severidade | Referência |
|---|---|---|
| ⚠️ **Credencial MySQL em texto plano no histórico do Git** | **Alta** | [SEC-006](../../specs/SDD/software/seguranca/security-findings.md#sec-006--credencial-mysql-no-histórico-do-git) |
| ⚠️ Comentários dizem "10 segundos", constante é 60000ms (**60s**) | Alta | [DT-009](../../specs/SDD/software/technical-debt.md#dt-009--documentação-divergente-do-código) |
| `H2DatabaseService` nunca instanciada | Baixa | [DT-015](../../specs/SDD/software/technical-debt.md#dt-015--código-morto-inventário) |
| `VazaoCalculatorService` — só `reset()` é chamado | Baixa | idem |
| `S7AreaHelper` nunca referenciado | Baixa | idem |
| Tela "Carregar CSV" inalcançável e sem parser | Baixa | idem |
| `slf4j-simple` declarado, logging via `System.out` | Baixa | idem |
| 3 classes duplicando a mesma estrutura de dados | Baixa | — |
| Namespaces JavaFX inconsistentes nos FXML (21, 21.0.1, 25) | Baixa | [DT-016](../../specs/SDD/software/technical-debt.md#dt-016--inconsistências-de-organização-de-projeto) |
| 3,3 MB de telemetria real versionados no Git | Média | idem |
| `JAVA_HOME` de fallback fixo no `build.gradle` | Baixa | idem |

### ⚠️ Ação prioritária

**[FATO]** `src/main/resources/application.properties`, versionado **desde o commit inicial**, contém
uma senha MySQL em texto plano (usuário `root`, banco `braservone`). O arquivo é **inerte em runtime**
— o projeto não usa Spring Boot nem MySQL.

**A credencial está no histórico do Git e deve ser tratada como comprometida.**
Rotacionar é a ação primeira e independente de qualquer alteração de código.

## Duplicação de estrutura de dados

**[FATO]** Três classes com exatamente os mesmos 6 campos (`timestamp`, `pressao`, `strokeAtual`,
`strokeCumulativo`, `vazaoAtual`, `volumeBombeado`):

- `model/RegistroOperacao`
- `dto/OperacaoSnapshot`
- `JsonRegistroService.RegistroJson`

`RegistroOperacaoService.salvar` apenas copia campo a campo, sem lógica adicional. Não há ORM que
justifique a separação.


## Design system compartilhado (2026-08-28)

**[FATO]** As quatro telas (`carta.operacao`, `configuracao`, `gerar.pdf`, `carregar.csv`) passaram a
usar `geopetro-design-system.css` — o mesmo arquivo do Geopetro-Desktop, com um bloco adicional para as
telas de bombeio (`card-grandeza`, `botao-icone`, `titulo-tela`, `rotulo-campo`, `progress-bar`).

**[DECIDIDO]** As classes do Horus foram acrescentadas ao arquivo comum em vez de um CSS próprio:
duas cópias divergiriam na primeira alteração, e a razão de existir um design system é justamente
não ter dois azuis institucionais ligeiramente diferentes.

- Estilos inline saíram das telas: `carta.operacao` e `configuracao` ficaram sem nenhum `style=`
- Ícone do app trocado para a marca GeoPetro (`icons/logo.png`), o mesmo do Geopetro-Desktop

⚠️ **[FATO]** `app.ico` precisa ser **regenerado** por `scripts/create-windows-icon.ps1` ao trocar o
logo — o jpackage exige ICO real, com as 6 resoluções (256→16). **Nunca renomeie um PNG para `.ico`:**
o `logo.ico` do Geopetro-Desktop foi exatamente isso até 2026-08-31 (assinatura `89504e47`), e copiá-lo
produzia um instalador com ícone quebrado. Hoje os dois são ICO legítimos (`00000100`) — confira a
assinatura antes de confiar na extensão.

⚠️ **[FATO]** `.label` do design system pinta `#051833` (text-primary). Em fundo escuro o texto some — use
`texto-inverso`. Foi o que aconteceu no cabeçalho do Geopetro-Desktop; o Horus não tem fundo escuro
hoje, mas a armadilha vale para telas futuras.

## Unidade de pressão (2026-08-28)

**[FATO]** `UnidadePressao` (PSI, KGF_CM2) governa apenas a **apresentação**. O CLP entrega PSI, o
JSONL grava PSI, o histórico inteiro é PSI.

| Onde | Comportamento |
|---|---|
| Card da carta de operação | Unidade da configuração; título acompanha |
| Gráficos do PDF | Unidade escolhida na tela de geração |
| Rodapé de estatísticas | Mesma unidade dos gráficos |
| Arquivo de registros | **Sempre PSI** |

**[DECIDIDO]** A tela de PDF começa na unidade configurada mas permite trocar por relatório — gerar
uma cópia em kgf/cm² para um cliente não deveria exigir mudar a configuração da estação.

**[FATO]** `atualizarConfiguracao` ganhou sobrecarga com a unidade; as antigas **preservam** a
escolha atual. Sem isso, qualquer gravação por uma sobrecarga antiga devolveria a exibição para PSI
silenciosamente.

Testes: `UnidadePressaoTest` (7 casos, incluindo reversibilidade e o fator 14,223343307).

## Geração de PDF em segundo plano (2026-08-28)

**[FATO]** `PdfService.gerarPdfComGraficos` aceita `ProgressoListener` e reporta 8 etapas;
`GerarPdfController` roda em `Task` e move a `ProgressBar`.

⚠️ **[FATO] Dois defeitos corrigidos aqui:**

1. A geração rodava **na thread de UI**. A janela congelava durante os quatro gráficos e a gravação,
   sem nenhum sinal — o clique parecia não ter surtido efeito.
2. `gerarPdfComGraficos` **capturava toda exceção sem relançar**. A tela dizia "PDF gerado com
   sucesso" mesmo sem arquivo escrito. Idem para falha ao inserir um gráfico: o relatório saía
   incompleto e era dado como bom. Agora ambas viram `PdfGeracaoException`, e o sucesso só é
   anunciado depois de o arquivo existir.

Testes: `PdfServiceTest` (5 casos — progresso monotônico até 100%, gravação, ambas as unidades,
falha propagada, ouvinte opcional).

## Design system (revisão 2026-08-31)

**[FATO]** `specs/SDD/software/frontend/index.html` é a **fonte normativa**. O `geopetro-design-system.css` (Geopetro-Desktop
e Horus, arquivo idêntico nos dois) transcreve aqueles tokens para JavaFX CSS — rem convertido para
px na base 16, já que JavaFX não tem custom properties nem unidades relativas.

### Tokens

| Papel | Valor |
|---|---|
| Marca (primário) | `#051833` navy-900 · hover `#0b2b52` |
| Azul de interação | `#154a7a` blue-600 — foco, borda de campo, seleção |
| **Acento** | `#d4852f` orange-600 — destaque e seleção, **não** é cor de ação |
| Superfícies | canvas `#f7f9fc` · subtle `#edf1f8` · soft `#eaf1f8` · raised `#ffffff` |
| Bordas | default `#d6deeb` · strong `#b7c3d5` (campos) |
| Texto | primary `#051833` · secondary `#5a667a` · tertiary `#757b86` |
| Semântico | ok `#2e8b3a` · atenção `#e5bd02` · erro `#d92d20` / `#b42318` |
| Raio | sm 3 · md 5 · lg 7 · xl 9 (px) |
| Tipografia | Coco Gothic → Century Gothic → Trebuchet MS · mono: Cascadia Code |

⚠️ **[DECIDIDO] O botão primário é azul-marinho, não vermelho.** A versão anterior usava `#c50d15`
em toda ação comum — Conectar, Salvar, Gerar PDF. Vermelho passou a ser exclusivo de **ação
destrutiva** (`.botao-perigo`) e de **estado de erro**. Usá-lo como cor de ação gasta o único sinal
que faz o operador parar antes de clicar, e numa tela de sonda isso importa.

Consequências aplicadas:

- `Conectar` é `.botao-primario`; `Desconectar` é `.botao-perigo` — antes os dois eram vermelhos e
  só o texto distinguia um do outro
- Aba ativa passou de preenchimento vermelho para **sublinhado laranja**: a cor de "você está aqui"
  não pode ser a mesma de "algo está errado"
- Faixa divisória do cabeçalho e do splash: vermelho → laranja de acento
- Círculos de status usam `#d92d20`/`#2e8b3a` do sistema

### Classes disponíveis

`.botao-primario` `.botao-secundario` `.botao-perigo` `.botao-fantasma` `.botao-icone` ·
`.card`/`.cartao` `.cartao-titulo` `.cartao-nota` `.cartao-muted` · `.rotulo` `.rotulo-campo`
`.ajuda` `.eyebrow` `.heading` `.muted` `.mono` `.texto-inverso` ·
`.estado-ok` `.estado-atencao` `.estado-erro` · `.card-grandeza*` `.valor-bruto` `.tool-bar`
`.titulo-tela` `.area-rolagem`

⚠️ **[FATO]** `.label` pinta `#051833`. Em fundo escuro o texto some — use `.texto-inverso`.
O atributo `textFill="WHITE"` do FXML **não resolve**: em JavaFX o stylesheet vence valores vindos
do FXML.

**[FATO]** O hover dos botões vem do CSS, não de `setOnMouseEntered`. A versão anterior reescrevia
o style inline a cada entrada e saída do mouse, o que obrigava a repetir a paleta em três lugares —
foi assim que as cores antigas sobreviveram ao redesenho anterior.
## Pontos em aberto

| # | Questão | Referência |
|---|---|---|
| 1 | A credencial do banco `braservone` ainda é válida? A que sistema pertence? | [OQ-020](../../specs/SDD/negocio/requisitos/open-questions.md#oq-020--a-credencial-do-banco-braservone-ainda-é-válida) |
| 2 | Origem de `data/sonda-geopetro.lock` e `sonda_geopetro.mv.db` — não gerados por nenhum código deste repo | — |
| 3 | "Carregar CSV" é funcionalidade planejada ou abandonada? | — |
| 4 | Remover a dependência H2 ou reativar persistência relacional? | — |
