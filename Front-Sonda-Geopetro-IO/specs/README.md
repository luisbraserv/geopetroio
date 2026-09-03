# Specs — Front-Sonda-Geopetro-IO

> SPA web do GeopetroIO · Angular 21.2.7 · standalone + zoneless · Taiga UI 5.2 · NGXS 21
>
> Specs de **sistema** em [`../../specs/`](../../specs/). Aqui ficam as specs de **feature**.

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

**Nota [FATO]:** `almoxarifado/` e `compra/` existem em `src/app/features/` como pastas com
subdiretórios nomeados e **zero arquivos**. Foram **descontinuados**
([DECIDIDO 2026-08-26](../../specs/technical-debt.md#dt-001--código-fonte-perdido-de-almoxarifado-e-compras)).
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
| `/app/simulador` | `SimuladorIndexComponent` | `CIMENTACAO`, `ADMIN`, `GERENCIA`, `DIRETORIA` | sim |
| `/app/simulador/squeeze` | `SimuladorSqueezeComponent` | herda | sim |
| `/app/simulador/tampao` | `SimuladorTampaoComponent` | herda | sim |
| `/app/cadastros` | `CadastrosPageComponent` | `ADMIN` | sim |
| `/app/cadastros/usuarios` | `UsuariosAdminPageComponent` | `ADMIN` | sim |
| `/app/cadastros/empresas` | `EmpresasPageComponent` | `ADMIN` | sim |
| `/app/cadastros/regionais` | `RegionaisPageComponent` | `ADMIN` | sim |
| `/app/cadastros/setores` | `SetoresPageComponent` | `ADMIN` | sim |
| `/app/cadastros/unidades-sondas` | `UnidadesSondasPageComponent` | `ADMIN` | sim |
| `/app/monitoramento-sondas` | `MonitoramentoSondaPageComponent` | `ADMIN`, `SONDA`, `CIMENTACAO`, `GERENCIA`, `DIRETORIA`, `CLIENTE` | **sim** |
| `/app/tempo-real` | `TempoRealPageComponent` | mesmas roles do Monitoramento | **sim** |
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

**[FATO]**
1. `LoginPageComponent` despacha `Login` (NGXS) → `POST {apiUrl}/auth/login`.
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
O frontend sempre passa pelo Backend-Sonda — ver
[`rest-monitoramento.md`](../../specs/contracts/rest-monitoramento.md).

## Dívida técnica específica

Inventário completo em [DT-015](../../specs/technical-debt.md#dt-015--código-morto-inventário).
Itens de maior impacto:

| Item | Ação sugerida |
|---|---|
| ⚠️ Interceptor envia token ao ViaCEP | Filtrar hosts externos |
| Pastas `almoxarifado/` e `compra/` vazias | Remover |
| `@maskito/*` instalado, nunca usado | Usar (telefone/CEP/CNPJ sem máscara) ou remover |
| `MOCK_USERS` com senhas em texto puro | Remover |
| `RichTextEditorComponent` órfão | Remover ou usar |
| `tests/hydraulics.spec.js` referencia arquivo inexistente | Remover (e o script `test:hydraulics`) |
| Simulador sem `Validators` em ~40 campos críticos | [OQ-009](../../specs/open-questions.md#oq-009--quais-são-os-limites-físicos-aceitáveis-no-simulador) |
| Roles divergentes do backend | ✅ Resolvido em 2026-08-27; ver [DT-011](../../specs/technical-debt.md#dt-011--divergência-de-roles-backend↔frontend) |
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
[DT-005](../../specs/technical-debt.md#dt-005--módulos-de-backend-sem-interface) foi resolvida pela
remoção dos módulos órfãos (Processos, Anotações, Observações e Químicos).

| Domínio do backend | Tela no frontend |
|---|---|
| Autenticação | `/login` |
| Usuários | `/app/cadastros/usuarios` · `/app/meu-usuario` |
| Empresas · Regionais · Setores · Unidades/Sondas | `/app/cadastros/*` |
| Simulador | `/app/simulador/*` |
| Monitoramento de sondas | `/app/monitoramento-sondas` |

✅ **[FATO]** `/app/monitoramento-sondas` está integrada ao Backend-Telemetria por meio do
Backend-Sonda. O frontend continua sem acesso direto ao InfluxDB e ao serviço de telemetria.


### Desempenho do gráfico de histórico (2026-08-31)

⚠️ **[FATO] O travamento da aba Monitoramento era complexidade quadrática, não volume de dados.**
O Backend-Telemetria já limita a **2000 pontos por série** (`maxPontosPorSerie`), agregando por
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

**[DECIDIDO]** O arquivo [`../../specs/index.html`](../../specs/index.html) é a fonte normativa dos
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
- as séries continuam sendo consultadas exclusivamente pelo Backend-Sonda.

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
