# Specs — Geopetro-Front

> SPA web do GeopetroIO · Angular 21.2.7 · standalone + zoneless · Taiga UI 5.2 · NGXS 21
>
> Specs de **sistema** em [`../../specs/`](../../../../specs/). Aqui ficam as specs de **feature**.

**[REVISADA EM ENTREVISTA 2026-09-23 — S1 a S8 concluídas; revisão visual pendente]** Squeeze
e tampão perdem todos os gráficos atuais e ganham os três da primária (hidrostática/ECD,
envelope e volume × tempo), com o mesmo componente, e o perfil/planta da trajetória
**sem caliper**; cronograma e UCA viram tabelas. Para as curvas se comportarem igual, os
dois passam a usar o motor da primária: alvo "coluna de trabalho", drenagem até o
equilíbrio do tampão, retirada até a extremidade do relatório de retirada e, no squeeze,
compressão em blocos (hesitação) pelas técnicas Bradenhead, packer recuperável ou
retentor. Tampão sem excesso. Tampão primeiro, depois squeeze. Relação entre as três
operações conferida no R3 cap. 14, Petroguia F-18–F-20 e Halliburton cap. 7–8. Entregas
S1–S8 e casos T-01 a T-20 em
[Squeeze e tampão — gráficos e motor](../../simulador/squeeze-tampao-graficos-motor.md).
**S1 concluída:** gráficos e perfil/planta extraídos para um módulo comum, com a primária
idêntica (12 de 12 SVGs iguais no caso MINA-02). **S2 concluída:** alvo "coluna de
trabalho" no motor da primária; o tampão do Petroguia sem excesso termina com as
interfaces nas alturas de projeto. **S3 concluída:** retirada da coluna até a
extremidade do relatório de retirada, pela mesma função; topo do cimento igual ao do
dimensionamento. **S4 concluída (2026-09-24):** o tampão roda no motor da primária na
tela, com os três gráficos na base do tampão, perfil/planta sem caliper, cronograma e UCA
em tabela e relatório em SVG; o relatório de conformidade lê o motor novo (varredura de
48 simulações em ~1 s). **S5 concluída (2026-09-24):** compressão Bradenhead depois da
retirada, com retorno fechado, blocos de injeção e pressurização (hesitação), pressão
no canhoneado pelo percurso, limite de superfície do squeeze de baixa pressão e
revestimento exposto. **S6 concluída (2026-09-24):** packer com contrapressão no anular e
diferencial na ferramenta; retentor posicionado com o stinger desencaixado (escolha do
usuário, conforme R3 §14-9.6.2) e encaixado quando a pasta chega à ferramenta, com o
dimensionamento de §6.6. **S7 concluída (2026-09-24):** squeeze na tela nova nas três
técnicas, com blocos de compressão, seletor de referência, perfil/planta sem caliper,
tabelas e relatório em SVG; cenários antigos abrem como Bradenhead; a Bradenhead e o packer
equilibram a pasta inteira no posicionamento; componentes antigos apagados. **S8 concluída
(2026-09-24):** T-01 a T-20 conferidos, comparação com o motor antigo, queda livre como alerta
no relatório de conformidade e cenários de exemplo de tampão (id 6) e squeeze (id 7) com pasta
de 15,8 ppg no banco local; falta a revisão visual. 844 testes em 87 arquivos (em lotes);
build exit 0.

**[IMPLEMENTADO 2026-09-19; ACEITES MANUAIS PENDENTES]** Todos os simuladores devem seguir
**cadastrar fases → selecionar a fase da operação → calcular para a fase escolhida**.
Regra comum para squeeze, tampão e primária, incluindo cenário e relatório:
[Fase de trabalho](../../simulador/fase-operacao.md).

**[R2 IMPLEMENTADA — 2026-09-19; ACEITES MANUAIS PENDENTES]** A primária deve completar o
padrão do squeeze: painel retrátil com grupos/subseções, cenários organizados por
pastas, dados completos do relatório, sequência operacional própria, Pasta e
Aditivos separados e **receitas completas no relatório**, individuais por pasta/estágio,
sem consolidação geral. Entrevista: parâmetros calculados/manuais, sequência derivada
do programa e emissão final bloqueada por pendências ou limites excedidos. Entrevista
encerrada: exclusão de pasta com seus cenários mediante confirmação; o usuário fará
o aceite numérico manual posteriormente, com dados reais.
Requisitos, persistência, compatibilidade e aceites em
[Padrão do squeeze, cenários e relatório](../../simulador/cimentacao-primaria-padrao-squeeze.md).
Esta revisão substitui as limitações do primeiro redesenho nos pontos indicados.
Evidências e pendências: [Validação R2](../../simulador/r2-validacao.md).

**[REDESENHO DA TELA INICIADO 2026-09-18]** A pedido do usuário, a página da
primária passa a seguir o desenho do squeeze: menu horizontal, entradas numa
sidebar vertical, dados no conteúdo e cenários/relatório num menu flutuante. Todos
os gráficos saem e voltam um a um sob demanda, e a receita da pasta ganha aditivos.
Alvo e sequência T1–T7 em [redesenho da tela](../../simulador/cimentacao-primaria-tela.md).
O motor não muda.

**[PRIMEIRA VERSÃO IMPLEMENTADA 2026-09-18 — P1 a P12 concluídas; revisão visual pendente]**
[`simulador/cimentacao-primaria.md`](../../simulador/cimentacao-primaria.md) define a
cimentação por trás do revestimento: geometria externa, volumes, shoe track,
deslocamento e hidráulica, incluindo liner e múltiplos estágios. Entrevista
consolidada: volumes por TOC/intervalos, ordem livre, playback, banco e relatório
completo; sequência P1–P12. Inclui fórmulas, referências e casos de aceitação.
[`Gráficos e dados medidos`](../../simulador/cimentacao-primaria-graficos.md) detalha os
cinco anexos adicionais, eixos de volume total/pasta e comparação com medições
importadas.

Já implementados: contratos versionados, geometria convencional e de liner,
conectividade por estado de dispositivo, dimensionamento por intervalo com TOC
ideal, reservas e receitas, transporte de fluido com eventos exatos e colocação
real, hidráulica com atrito, ECD, janela, envelope e alertas de limite, e a
página `/app/simulador/primaria` com os oito gráficos, esquemático 2D, visão 3D
com corte, reprodução sincronizada e importação de medições em CSV para comparar
com o calculado, mais os cinco gráficos anexos G1 a G5 a persistência do cenário e o relatório completo.

As doze etapas estão implementadas e verificadas por teste. Continuam em aberto,
fora da lista: a **revisão visual por uma pessoa**, a conferência da integração
HTTP contra o backend, as imagens dos gráficos no relatório, os aditivos da pasta
na tela e os perfis medidos por profundidade; os aditivos da pasta continuam no
catálogo compartilhado.

**[REVISÃO DA HIDRÁULICA 2026-09-23]** Avaliada contra um poço real (survey
Gyrodata do MINA-28BD) e um modelo de referência independente: o atrito passou
para o método de R3 §4-6 (a tabela F-40 do Petroguia é descontínua em Re = 400),
a queda livre passou a ser resolvida com vazio em vez de interromper o cálculo, e
os fluidos de um programa novo partem da reologia do R3 §12-7. Caso de campo,
números e decisões em [cimentação primária §7.3, §7.5, §11.5 e §13.11](../../simulador/cimentacao-primaria.md).
Comparado depois com o iCem da Halliburton no MINA-02 ([§11.6 e §13.12](../../simulador/cimentacao-primaria.md)):
com as mesmas entradas e sem calibração, hidrostática a 7,1 psi (~1%) e ECD a 0,1 ppg
RMS das curvas do programa (2,9 psi e 0,047 ppg com caliper e reologia calibrados
contra o próprio iCem); os gráficos de hidrostática/ECD e de envelope seguem o desenho do iCem.
Validação: 773 testes em 78 arquivos aprovados (em lotes); `npm run build` exit 0.
**Nenhuma pessoa abriu a página ainda** — há teste de componente, não revisão visual.
Validação da etapa: 689 testes em 66 arquivos aprovados; `npm run build` exit 0.

**[ALTERADO 2026-09-17]** Squeeze/tampão passam a editar diâmetros somente por fase,
sem o resumo fixo de caliper, e começam com um exemplo de superfície seguido do
trecho da operação. Análise e compatibilidade em
[`simulador/geometria-poco.md`, §17](../../simulador/geometria-poco.md#17-diâmetros-por-fase-e-exemplo-iniciado-na-superfície).

## ⚠️ O comando de teste é `ng test` — nunca `vitest` direto

**[FATO 2026-09-10]** O alvo `test` em `angular.json` é `@angular/build:unit-test`. Ele roda sobre o
Vitest, mas é **ele** quem monta o ambiente: jsdom, os globais (`describe`/`it`), `zone.js`,
`@angular/compiler` e o `TestBed.initTestEnvironment`. É por isso que **não existe `vitest.config`
nem arquivo de setup** neste repositório — a ausência é o desenho, não um esquecimento.

```
npm test          # = ng test
npx ng test --watch=false
```

⚠️ **`npx vitest run` produz 38 falhas em 28 arquivos, e nenhuma é defeito.** Sem o builder faltam
todas aquelas peças, então os erros saem convincentes e enganosos: `JIT compilation failed for
injectable [class PlatformLocation]`, `describe is not defined`, `localStorage is not defined`,
`Need to call TestBed.initTestEnvironment() first`. **Um resultado de `npx vitest` não é evidência
sobre este repositório** — inclusive porque falha igual antes e depois de qualquer alteração, o que
faz uma comparação "com e sem a mudança" parecer inocentar o código quando ela só repetiu o erro de
comando.

**[FATO 2026-09-06]** Login inclui recuperação por e-mail. Rotas públicas
`/recuperar-senha` e `/redefinir-senha`, com token em memória e retorno ao login.
Contrato e configuração em
[`recuperacao-senha.md`](../../../../Geopetro-Backend/specs/recuperacao-senha.md).

**[FATO 2026-09-07]** Menu **Configurações**, aba horizontal **E-mail**, exclusiva
para ADMIN. Configuração SMTP persistida, edição de credencial e teste de conexão.
Contrato em [configuração SMTP](../../../../Geopetro-Backend/specs/configuracao-smtp.md).

## Organização por feature

Espelha `src/app/features/`:

```
specs/
├── auth/               ← login, guard, interceptor, sessão
├── dashboard/
├── cadastros/          ← empresas, regionais, setores, unidades-sondas
├── usuarios/           ← admin de usuários + meu-usuario
├── monitoramento/      ← séries de telemetria
└── simulador/          ← squeeze, tampão, relatórios
```

**[DECIDIDO 2026-09-05]** Primeira spec de feature escrita neste repositório:
[`simulador/geometria-poco.md`](../../simulador/geometria-poco.md) — estrutura do poço, trajetória direcional
e o vínculo com a nova entidade `Poço`. As entregas estão registradas ao final do documento.

**[FATO 2026-09-06]** [`simulador/receitas-pasta.md`](../../simulador/receitas-pasta.md)
registra a correção da composição e escala das receitas, encerrando as quatro
falhas conhecidas dos testes. Suíte completa do frontend: 280 testes aprovados.

**[FATO 2026-09-06 — entrega seguinte]** As relações entre campos de
[`simulador/faixas-validacao.md`](../../simulador/faixas-validacao.md) agora geram avisos
nas duas operações; as faixas quantitativas ainda precisam ser preenchidas.
Suíte completa atual: 299 testes aprovados em 32 arquivos.

**Nota [FATO]:** `almoxarifado/` e `compra/` existem em `src/app/features/` como pastas com
subdiretórios nomeados e **zero arquivos**. Foram **descontinuados**
([DECIDIDO 2026-08-26](../../../../specs/technical-debt.md#dt-001--código-fonte-perdido-de-almoxarifado-e-compras)).
Não recebem spec — e as pastas vazias devem ser removidas.

## Mapa de rotas

**[FATO 2026-08-28]** Fonte única: `src/app/app.routes.ts`. Todas as telas usam `loadComponent`;
assim Dashboard, Cadastros e principalmente o Simulador não entram no bundle inicial. A mudança
reduziu o carregamento inicial sem alterar URLs, guards ou componentes standalone.

**Verificação:** `npm run build` conclui com exit code 0. O bundle inicial de produção caiu de
**1,48 MB para 506,60 kB**; o Simulador passou para chunks carregados somente quando a rota é aberta.

| Rota | Componente | Roles | Lazy |
|---|---|---|---|
| `/login` | `LoginPageComponent` | público | sim |
| `/acesso-negado` | `AcessoNegadoComponent` | público | sim |
| `/app` | `ShellComponent` | autenticado | sim |
| `/app/dashboard` | `DashboardPageComponent` | `ADMIN` | sim |
| `/app/simulador` | `SimuladorIndexComponent` | `ADMIN` · `(CLIENTE\|INTERNO)`+`SIMULADOR`+`CIMENTACAO` | sim |
| `/app/simulador/squeeze` | `SimuladorSqueezeComponent` | herda | sim |
| `/app/simulador/tampao` | `SimuladorTampaoComponent` | herda | sim |
| `/app/simulador/primaria` | `SimuladorPrimariaComponent` | herda | sim |
| `/app/cadastros` | `CadastrosPageComponent` | `ADMIN` | sim |
| `/app/cadastros/usuarios` | `UsuariosAdminPageComponent` | `ADMIN` | sim |
| `/app/cadastros/empresas` | `EmpresasPageComponent` | `ADMIN` | sim |
| `/app/cadastros/regionais` | `RegionaisPageComponent` | `ADMIN` | sim |
| `/app/cadastros/setores` | `SetoresPageComponent` | `ADMIN` | sim |
| `/app/cadastros/unidades-sondas` | `UnidadesSondasPageComponent` | `ADMIN` | sim |
| `/app/monitoramento-sondas` | `MonitoramentoSondaPageComponent` | `ADMIN` · `(CLIENTE\|INTERNO)`+`MONITORAMENTO` | **sim** |
| `/app/tempo-real` | `TempoRealPageComponent` | `ADMIN` · `(CLIENTE\|INTERNO)`+`MONITORAMENTO_REAL` | **sim** |
| `/app/limites-alarme` | `LimitesAlarmePageComponent` | mesma regra do Tempo Real (RN-069) | **sim** |
| `/app/historico-alarmes` | `HistoricoAlarmesPageComponent` | mesma regra do Tempo Real (RN-069) | **sim** |
| `/app/configuracoes` | `SettingsPageComponent` | `ADMIN`, `SUPORTE` | sim |
| `/app/meu-usuario` | `MeuUsuarioPageComponent` | autenticado | sim |
| `/app/administracao/usuarios` | — | redirect legado → `/app/cadastros/usuarios` | — |

## Padrões arquiteturais estabelecidos

**[FATO]** Convenções observadas que novas features devem seguir:

| Aspecto | Padrão |
|---|---|
| Componentes | **Standalone** — não há NgModules |
| Change detection | **Zoneless** (`provideZonelessChangeDetection()`) |
| Estado global | NGXS — hoje só `AuthState`, persistido via storage plugin |
| Estado local | Signals (`signal()`, `computed()`) |
| Formulários | ⚠️ **Misto** — template-driven na maioria, Reactive Forms só no simulador |
| Erros de API | `parseApiError()` em `core/http/api-error.ts` — **usar sempre** |
| Feedback ao usuário | `ToastService` — `success`/`error`/`warning`/`info` |
| Paginação | `Pagina<T>` de `shared/models/pagina.model.ts` — 0-based |
| Busca | `SearchBoxComponent` com debounce de 350ms |
| Modais | `ModalComponent` genérico com slot `modal-footer` |

⚠️ **[PENDENTE]** A mistura template-driven / Reactive Forms não tem critério declarado. Definir qual
é o padrão para novas features.

## Autenticação

**[FATO 2026-09-06]** Login e serviços de usuários usam `/api/auth/login` e
`/api/usuarios/**`. Proxy local e Nginx foram atualizados; `environment.apiUrl`
permanece a raiz do servidor. Seis testes HTTP novos cobrem os caminhos e payloads.
Suíte completa atual: 305 testes aprovados. Contrato em
[`api-prefix.md`](../../../../Geopetro-Backend/specs/api-prefix.md).

**[FATO]**
1. `LoginPageComponent` despacha `Login` (NGXS) → `POST {apiUrl}/api/auth/login`.
2. `AuthState` guarda `{user, token, isAuthenticated}`, persistido pelo storage plugin.
3. `authTokenInterceptor` adiciona `Authorization: Bearer {token}` a **todas** as requisições.
4. Qualquer `401` dispara `SessionExpired` → limpa o state → redireciona a `/login`.
5. Redirecionamento pós-login por role em `rotaInicial()`.

⚠️ **[FATO]** O interceptor **não filtra por URL** — o header `Authorization` é anexado inclusive nas
chamadas ao **ViaCEP** (`https://viacep.com.br/...`), um serviço externo de terceiros. O token do
usuário está sendo enviado para fora da infraestrutura da Braserv.

> Isso não estava em `security-findings.md` porque é do frontend, mas merece correção: o interceptor
> deve pular hosts externos.

⚠️ **[FATO]** Não há refresh token. Qualquer `401` derruba a sessão imediatamente.

## Contrato com o backend

**[FATO]** Base URL por ambiente:

| Ambiente | `apiUrl` |
|---|---|
| dev | `''` (proxy `proxy.conf.json` → `localhost:8080`) |
| prod | `https://api.geopetro-io.braserv.com.br` |
| k8s | `''` (same-origin, nginx faz proxy reverso) |

⚠️ **[FATO]** `environment.telemetriaUrl` está declarado nos três ambientes e **nunca é consumido**.
O frontend sempre passa pelo Geopetro-Backend — ver
[`rest-monitoramento.md`](../../../../specs/contracts/rest-monitoramento.md).

## Dívida técnica específica

Inventário completo em [DT-015](../../../../specs/technical-debt.md#dt-015--código-morto-inventário).
Itens de maior impacto:

| Item | Ação sugerida |
|---|---|
| ⚠️ Interceptor envia token ao ViaCEP | Filtrar hosts externos |
| Pastas `almoxarifado/` e `compra/` vazias | Remover |
| `@maskito/*` instalado, nunca usado | Usar (telefone/CEP/CNPJ sem máscara) ou remover |
| `MOCK_USERS` com senhas em texto puro | Remover |
| `RichTextEditorComponent` órfão | Remover ou usar |
| `tests/hydraulics.spec.js` referencia arquivo inexistente | ✅ Resolvido em 2026-09-09; os cenários úteis foram migrados para `squeeze-hydraulic-simulation.service.spec.ts` e o arquivo e o script `test:hydraulics` saíram |
| Simulador sem `Validators` em ~40 campos críticos | [OQ-009](../../../../specs/open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador) |
| Roles divergentes do backend | ✅ Resolvido em 2026-08-27; ver [DT-011](../../../../specs/technical-debt.md#dt-011--divergência-de-roles-backend--frontend) |
| Mojibake em `meu-usuario-page.component.html:43` | Corrigir encoding |

## Feature removida — Projetos

**[DECIDIDO 2026-08-26]** A tela de Projetos foi removida junto com o módulo `projeto` do backend.

**O que saiu [FATO]:**

| Item | Caminho |
|---|---|
| Componente | `features/cadastros/pages/projetos-page/projetos-page.component.ts` |
| Service | `features/cadastros/services/projeto.service.ts` |
| Modelos | `Projeto` e `ProjetoPayload` em `cadastros.model.ts` |
| Rota | `/app/cadastros/projetos` + import em `app.routes.ts` |
| Aba | Entrada "Projetos" em `CadastrosPageComponent.tabs` |

**Ajustes decorrentes [FATO]:**
- O redirect de `/app/cadastros` apontava para `projetos` — passou a apontar para `usuarios`.
- O subtítulo da página ("Gerencie projetos e demais cadastros...") foi ajustado.
- A mensagem de confirmação de exclusão em `regionais-page.component.ts` não menciona mais projetos.

**Verificação [FATO]:** `npx tsc --noEmit -p tsconfig.app.json` → **exit 0**.

## Alinhamento com o backend

**[FATO]** Após as remoções de 2026-08-26, **o frontend cobre todos os domínios do backend**. Não há
mais nenhum módulo de backend sem interface — a lacuna registrada em
[DT-005](../../../../specs/technical-debt.md#dt-005--módulos-de-backend-sem-interface) foi resolvida pela
remoção dos módulos órfãos (Processos, Anotações, Observações e Químicos).

| Domínio do backend | Tela no frontend |
|---|---|
| Autenticação | `/login` |
| Usuários | `/app/cadastros/usuarios` · `/app/meu-usuario` |
| Empresas · Regionais · Setores · Unidades/Sondas | `/app/cadastros/*` |
| Simulador | `/app/simulador/*` |
| Monitoramento de sondas | `/app/monitoramento-sondas` |

✅ **[FATO]** `/app/monitoramento-sondas` está integrada ao Geopetro-Telemetria por meio do
Geopetro-Backend. O frontend continua sem acesso direto ao InfluxDB e ao serviço de telemetria.


### Desempenho do gráfico de histórico (2026-08-31)

⚠️ **[FATO] O travamento da aba Monitoramento era complexidade quadrática, não volume de dados.**
O Geopetro-Telemetria já limita a **2000 pontos por série** (`maxPontosPorSerie`), agregando por
janela acima disso — o payload nunca foi o problema.

Em `GraficoMonitoramentoComponent`, `minV`/`maxV` eram *getters* que refaziam `.map()` sobre a série
inteira e aplicavam `Math.min(...)` com spread. Como `toY()` os consultava e `originalSvg()` chamava
`toY()` por ponto, montar **uma** polyline custava O(n²):

| Pontos | Antes | Depois | Fator |
|---:|---:|---:|---:|
| 200 | 7,0 ms | 0,25 ms | 27× |
| 1000 | 40,0 ms | 0,38 ms | 105× |
| 2000 | 159,8 ms | 0,61 ms | 261× |

Com seis dispositivos e duas curvas cada, **~1 segundo de thread principal bloqueada por ciclo de
detecção de mudanças** — e como tudo eram métodos chamados do template, isso se repetia a cada
ciclo, não só ao carregar.

**Correções:**

- extremos calculados numa passada só, memoizados em `computed`
- `originalSvg` / `suavizadaSvg` / `gridLinhas` / `labelsX` viraram `computed` — não são mais
  recalculados quando nada mudou
- `changeDetection: OnPush`
- média móvel por janela deslizante (soma incremental), sem `slice()` por ponto

⚠️ **[FATO]** `Math.min(...array)` com spread também era risco de estouro de pilha em séries
grandes, independentemente do desempenho.

**[DECIDIDO] Não foi usado Web Worker.** O custo não era cálculo pesado que valesse mandar para
outra thread — era trabalho repetido desnecessariamente. Eliminada a repetição, o processamento cai
para menos de 1 ms e um worker só acrescentaria serialização e complexidade. Se um dia o teto de
2000 pontos subir muito, a saída seguinte é reduzir os pontos *desenhados* (LTTB preserva picos),
não paralelizar.

**Testes:** `grafico-monitoramento.component.spec.ts` — 8 casos, incluindo a equivalência numérica
entre a média móvel nova e a anterior (a troca foi por desempenho, não podia mudar a curva) e um
teto de tempo que detecta regressão de complexidade.
## Identidade visual e Taiga UI (revisão 2026-08-31)

**[DECIDIDO]** O arquivo [`../../specs/index.html`](../../../../specs/index.html) é a fonte normativa dos
tokens visuais Braserv. O Front continua usando **Taiga UI 5.2**; a biblioteca não é substituída.
Seus tokens CSS são sobrescritos em `src/styles.css`, que o `angular.json` carrega **depois** do
tema Taiga — é essa ordem que faz os tokens da marca vencerem os padrões da biblioteca.

- azul-marinho `#051833` na estrutura, no texto principal **e nas ações primárias**;
- azul `#154a7a` para interação: foco, borda de campo ativo, links;
- laranja `#d4852f` como **acento** — destaque e seleção, nunca ação;
- vermelho `#d92d20` / `#b42318` apenas como **semântica de erro** e ação destrutiva;
- canvas `#F7F9FC`, superfícies brancas e borda `#D6DEEB`;
- tipografia `Coco Gothic` com os fallbacks do Design System; mono `Cascadia Code`;
- raios contidos de 3 a 9 px e sombras azuladas de baixa opacidade.

⚠️ **[DECIDIDO 2026-08-31] O primário deixou de ser vermelho.** Antes `--color-primary` e
`--tui-background-accent-1` apontavam para `#c50d15`, o que pintava de vermelho toda ação comum.
Vermelho passou a ser exclusivamente semântico. A troca foi feita **na camada de tokens** — 25 usos
de `--color-primary` mudaram sem tocar em nenhum componente.

⚠️ **[FATO]** `--brand-red-700/600/500` foram **removidos**. Chegaram a existir por um dia como
aliases para `--danger-*`, mas isso preservou o valor sem corrigir o significado: os pontos que os
usavam continuaram vermelhos, embora nenhum deles representasse erro. Cada uso foi reclassificado
(ver abaixo) e os aliases saíram, para que ninguém volte a espalhar vermelho por engano.

### Vermelho reclassificado por significado

O vermelho não era decoração: marcava **seleção**. Cada caso foi remapeado conforme a fonte
normativa, não trocado por uma cor qualquer.

| Onde | Antes | Agora | Regra na fonte normativa |
|---|---|---|---|
| Item ativo da navegação | vermelho | laranja `rgba(212,133,47,.18)` | `.side-nav a.active` |
| Barra indicadora, borda do topo, botão de recolher | vermelho | `--brand-orange-600` | acento |
| Chip / check / segmento / página ativa | vermelho | `--brand-blue-600` | `accent-color` dos controles |
| Logout | `#f87171` | `--danger-200` | **continua vermelho** — sair é destrutivo |

**[FATO]** A sidebar segue `.side-nav` do `index.html`: fundo com gradiente navy **mais halo laranja**
(`radial-gradient` no canto superior direito), item ativo em laranja translúcido com barra de 4 px,
hover com deslize de 2 px, rótulo de seção em branco `.45` / `.12em`.

⚠️ **[FATO] Duas formas de escrever cor que escapam do grep óbvio** — as duas custaram uma rodada
cada:

1. **`rgba()` em decimal.** O fundo do item ativo era `rgba(197, 13, 21, .22)` — o mesmo `#c50d15`,
   invisível para uma busca por hexadecimal ou por nome de token.
2. **Estilo dentro de um `.ts`.** `paginator.component.ts` declara CSS no decorator do componente,
   fora de qualquer `.css`. Como o alias já tinha sido removido, a variável ficaria órfã e o botão
   sem fundo.

**Verificação que pega os dois:** conferir o **bundle compilado** (`dist/`), não o fonte. Uma busca
por `brand-red` lá deve voltar vazia.

**Regra de implementação:** componentes funcionais continuam sendo `tuiButton`, `tuiIcon` e os
demais controles Taiga. Cores, tipografia, foco e superfícies devem consumir os tokens da aplicação,
não criar uma segunda biblioteca visual paralela.
### Demonstração local da SPT-145

**[FATO 2026-08-27]** No build de desenvolvimento, `environment.telemetriaDemoSondaId` identifica
a `SPT-145`. Quando ela estiver presente na resposta autorizada de `/api/sondas/minhas`, a tela a
seleciona e consulta automaticamente, exibindo um aviso de que os dados são sintéticos.

- a sonda **não** é adicionada estaticamente à lista: ela precisa existir no MySQL e estar acessível
  ao usuário, preservando o contrato de autorização;
- builds `prod` e `k8s` configuram esse identificador como `null`, sem seleção automática nem aviso;
- as séries continuam sendo consultadas exclusivamente pelo Geopetro-Backend.

---

## Tempo Real (2026-08-27)

**[FATO]** Nova rota `/app/tempo-real`, no menu **Sonda/Unidade → Tempo Real** (o grupo "Sonda" foi
renomeado para "Sonda/Unidade").

| Arquivo | Responsabilidade |
|---|---|
| `services/stomp-client.ts` | Cliente STOMP mínimo sobre WebSocket nativo |
| `services/realtime.service.ts` | Conexão, assinatura, reconexão, estado |
| `pages/tempo-real-page/` | Seletor de sonda, botão Conectar, cards e gráficos |
| `components/grafico-tempo-real/` | Gráfico de tendência da janela deslizante (SVG puro) |

### Por que um cliente STOMP próprio

**[FATO]** O projeto tem um **conflito de peer dependencies pré-existente** no Taiga UI. Instalar
`@stomp/stompjs` exigiria `--legacy-peer-deps`, mexendo no lockfile de um projeto já frágil nesse
ponto. O cliente precisa de CONNECT, SUBSCRIBE, UNSUBSCRIBE e DISCONNECT — escrever isso direto custa
menos que o risco.

### Comportamento

- Estados visíveis: `Offline` · `Conectando` · `Online` · `Reconectando`
- Reconexão automática com backoff de 2s a 30s
- Trocar de sonda **cancela a assinatura anterior** — sem isso, dois fluxos se misturariam
- Mensagem de outra unidade é descartada (pode chegar durante a troca)
- Sair da tela encerra o canal

⚠️ **[FATO] Indicador de defasagem.** Estar "Online" não garante dado fresco: se a sonda parar de
publicar, a conexão permanece aberta e os cards congelariam sem aviso. A tela alerta após 5 segundos.

### Relação com Monitoramento

| | Monitoramento | Tempo Real |
|---|---|---|
| Origem | InfluxDB via REST | WebSocket |
| Endereçamento | `idSondaUnidade` (nome) | `id` (numérico) |
| Pergunta | "o que aconteceu?" | "o que está acontecendo?" |

**[FATO]** `SondaDisponivel` ganhou o campo `id` para endereçar o tópico. O nome continua sendo a
chave do histórico.

### Gráficos de tendência (2026-08-27)

**[FATO]** Abaixo dos cards, as mesmas 6 grandezas aparecem como gráficos de linha — ambas as faixas
em **fileiras de 3**. Os cards continuam intactos: o card diz "quanto é agora", o gráfico diz "está
subindo ou caindo". Uma pressão de 1.450 psi isolada não informa; a curva mostra se estabilizou.

- `RealtimeService` mantém `historico`, janela deslizante de **120 leituras** (`JANELA_GRAFICO`),
  ~2 min a 1 leitura/s. Limpa ao trocar de sonda e ao desconectar.
- `TempoRealPageComponent.series` é **um único `computed`** para as 6 séries — os gráficos leem dali
  em vez de cada um varrer o histórico por conta própria a cada segundo.
- Grid `repeat(3, 1fr)`, quebrando para 2 abaixo de 1100px e 1 abaixo de 700px.

⚠️ **[DECIDIDO] Não reusa `GraficoMonitoramentoComponent`.** Aquele serve ao histórico consultado e
traz suavização por média móvel de 8 pontos, própria de séries longas. Numa janela de 2 minutos a
suavização achataria exatamente a variação que se quer enxergar, e os toggles seriam ruído numa tela
de acompanhamento. SVG puro, sem biblioteca: são poucas dezenas de pontos redesenhados a cada segundo.

⚠️ **[FATO] Escala Y recalculada a cada render**, sobre a janela visível — não fixa a partir de zero.
Com escala fixa, uma pressão oscilando entre 1.450 e 1.455 psi apareceria como linha reta. Dois casos
de borda que quebrariam a curva em silêncio, ambos cobertos por teste:

- **Série constante** (amplitude zero): centraliza em vez de dividir por zero — o `NaN` resultante
  faria o navegador descartar o path e o gráfico simplesmente sumiria.
- **Valor `null`**: descartado, não convertido em 0 — um zero falso desenharia um mergulho na curva
  sugerindo queda de pressão que não houve.

**Testes [FATO]** · 6 casos em `grafico-tempo-real.component.spec.ts`.


## GeoPetro Vision — integração prevista (11/09/2026)

**[DECIDIDO 2026-09-11]** O GeoPetro Vision monitorará localmente as câmeras de cada unidade e alimentará o Geopetro-Backend com registros de não conformidade SMS e fotos. O Geopetro-Front existente disponibilizará o histórico sincronizado; não haverá nova central nem vídeo ao vivo remoto nesta etapa. ADMIN/SUPORTE poderão consultar todas as unidades; os demais acessos respeitarão o escopo autorizado. Retenção do Vision é indefinida e distinta da telemetria. Requisitos ainda não implementados.

Decisões, permissões, operação offline e contrato pendente: [GeoPetro Vision](../../../../specs/features/geopetro-vision.md).

**[DECIDIDO 2026-09-11 — entrevista encerrada]** Frontend somente consulta histórico; avaliações/correções e configuração de turnos/zonas exclusivamente no desktop. Câmeras cadastradas manualmente, quantidade variável. Tempos por zona e turnos definidos localmente. Offline-first mantém consulta/avaliação da sessão já iniciada; ao reconectar com token expirado exige relogin na interface sem parar monitoramento/transporte. Não enviar e-mail ao SMS por falha de câmera/IA. Especificações atualizadas, sem implementação.

## Decisão final de sessão e executor — revisão 11/09/2026

**[DECIDIDO 2026-09-11]** Esta decisão substitui a previsão anterior de retomada automática após reboot offline. Monitoramento somente inicia após login online autorizado no Vision, inclusive depois de reiniciar Windows. Bloquear tela mantém a captura; trocar usuário Windows ou encerrar sessão Windows para a captura. Fechar janela mantém execução na conta atual. Logout Vision bloqueia a instalação inteira até qualquer usuário autorizado fazer novo login online.

**[DECIDIDO 2026-09-11]** Cada pessoa tem sua conta Windows; unidade/câmeras são configuração compartilhada de todos os usuários daquele computador. Sessão humana não é compartilhada. Executor separado da UI na sessão atual, sem serviço Windows permanente de monitoramento; uma captura ativa por instalação.

**[DECIDIDO 2026-09-11]** SUPORTE/ADMIN seleciona unidade consultando GeoPetro IO dentro do próprio app desktop. Não haverá liberação manual em portal ou cadastro externo. Ao salvar vínculo, app obtém automaticamente credencial técnica da instalação; mecanismo remoto ainda precisa de contrato/implementação. Essa credencial permite transporte independente do token humano durante execução, mas não substitui login exigido para iniciar monitoramento ou usar interface.

**[PENDENTE]** Cofre compartilhado entre contas Windows, rotação/revogação da credencial técnica e comportamento do transporte após logoff/logout; não prometer envio local com todos os processos encerrados nem reintroduzir serviço permanente implicitamente. Nenhum endpoint/papel/código alterado nesta entrega documental.
