# Janela operacional de pressão no squeeze e no tampão

> SPEC de feature · 2026-09-25 · Origem: especificação colada pelo usuário e registrada em
> [squeeze-tampao §12.14](squeeze-tampao-graficos-motor.md). Escopo decidido em entrevista
> no mesmo dia (§1). Implementação registrada em §6.

## 1. Decisões

| Pergunta | Decisão |
|---|---|
| Poro e fratura com vários pontos por TVD, em ppg ou psi/ft | **Sim**, no squeeze e no tampão; o valor constante continua existindo e é o padrão dos cenários de hoje |
| Onde ficam as classes de margem (Normal, Atenção, Alerta, Crítico, Fratura) | **No cenário** |
| Onde procurar o ponto crítico | **No poço todo**, com o critério certo em cada trecho (§3.3): formação exposta contra poro e fratura; revestimento contra a ruptura, quando informada |

Por que o perfil faz sentido com a regra do poço todo: com um gradiente só, a janela é a
mesma em qualquer profundidade. Serve a um canhoneado de 10 m, não a centenas de metros de
poço aberto nem à comparação entre sapatas. A fraqueza costuma estar numa profundidade
intermediária (sapata, zona depletada), e só um perfil por TVD a representa.

Por que não "fratura" atrás de revestimento cimentado: a formação ali não recebe a pressão do
poço; quem recebe é o revestimento. A decisão de squeeze-tampão §12.11 ("poro e fratura só
onde há formação exposta") continua valendo. A varredura cobre o poço inteiro, e o critério
muda com o trecho.

## 2. O que já existe

Hidrostática por segmento de fluido (Σ ρᵢ · ΔTVDᵢ), poro e fratura pela TVD com volumes pela
MD, ECD = BHP / (K · TVD) com K = 0,052 × 3,28084, verificação em cada instante numa malha do
poço (`primary-hydraulics`, laço do envelope), menor margem até a fratura
(`narrowestFractureMargin`), a pressão máxima de superfície sem fraturar no squeeze
(`maxLowPressureSurfacePsi`) e o aviso de alta pressão (§6.7 do squeeze-tampão).

## 3. O que muda

### 3.1 Entrada (lateral do squeeze e do tampão, "Janela operacional")

- Unidade dos gradientes: **ppg (EMW)** ou **psi/ft**.
- Modo: **constante** (poro e fratura) ou **por TVD** (tabela TVD, poro, fratura; ao menos
  dois pontos).
- Interpolação **linear em TVD** entre pontos; fora da tabela, o valor do ponto mais próximo.
- Internamente tudo vira EMW em ppg: `ppg = (psi/ft) / 0,052`, o mesmo que o motor usa com K.
  É equivalente a normalizar em psi/ft.
- Classes de margem no cenário, em ppg de margem (a folga dividida por K · TVD), com padrão
  **Atenção < 1,0**, **Alerta < 0,5**, **Crítico < 0,25**; margem negativa é **Fratura** (ou
  **Influxo**, para a margem sobre o poro). Nada fixo no código além do padrão.
- Cenários salvos sem os campos novos abrem no modo constante em ppg, com os valores de hoje.

### 3.2 Motor

- O perfil vira linhas da janela (`pressureWindow`) com ponto de topo e de base, quebradas
  nas TVDs da tabela: o `windowAt` já interpola em TVD dentro da linha.
- Tampão: a janela cobre o poço todo e vale onde há poço aberto (regra atual).
- Squeeze: a janela é a dos canhoneados, marcada como exposta, com poro e fratura do perfil
  no topo e na base de cada intervalo.
- A compressão e o gráfico de risco de fratura usam a fratura do perfil na profundidade de
  cada ponto verificado, não mais um gradiente único.

### 3.3 Ponto crítico por etapa

Em cada instante, o motor já compara a pressão do poço com poro e fratura em toda a malha
exposta. Passa a guardar, **para cada etapa** (água à frente, pasta, água atrás,
deslocamento, e no squeeze a compressão), o ponto de menor margem até a fratura e o de menor
margem sobre o poro, com:

TVD, MD, elemento (canhoneado, sapata com poço aberto abaixo, poço aberto), pressão de poros,
pressão do poço, pressão de fratura, ECD, margem de fratura em psi e em ppg, margem para
influxo em psi e em ppg e situação pela classe do cenário.

No revestimento (squeeze, compressão), quando a ruptura está informada: maior pressão interna
contra a ruptura, com a profundidade (o motor já calcula o envelope do revestimento).

A tela mostra a tabela das etapas com a linha mais crítica em destaque; o relatório a leva
como tabela selecionável ("Ponto crítico por etapa"). A pergunta que o módulo responde: qual é
o ponto mais crítico do poço, em relação a poro e fratura, em cada etapa da operação.

## 4. Fora do escopo

Primária (tem janela própria por fase; pode receber a mesma tabela depois), correções de
perda de carga no Psup_max além das que o motor já faz, e classes por usuário ou
administrador.

## 5. Entregas

| Etapa | Conteúdo |
|---|---|
| J1 | Modelo e serviço do perfil (unidade, modo, interpolação, linhas da janela, classes) e testes |
| J2 | Motor: janela do perfil no tampão e no squeeze, compressão e risco de fratura pelo perfil, ponto crítico por etapa, profundidade crítica da compressão |
| J3 | Tela: seção "Janela operacional" na lateral, migração, tabela do ponto crítico, relatório |
| J4 | Registro, suíte completa e build |

## 6. Registro de implementação

### 6.1 J1–J3 (2026-09-25)

| Parte | Onde |
|---|---|
| Perfil (unidade, modo, interpolação, linhas da janela, classes, leitura do formulário) | [pressure-profile.ts](../../src/app/features/simulador/services/pressure-profile.ts), [pressure-profile.model.ts](../../src/app/features/simulador/models/pressure-profile.model.ts) |
| Motor: janela do perfil no poço aberto (tampão) e nos canhoneados (squeeze); fratura do perfil na compressão, no risco de fratura e nos valores de referência | `tampao-engine`, `squeeze-engine`, `squeeze-retainer`, `work-string-compression` (`fracturePpgAt`) |
| Ponto crítico por etapa | `primary-hydraulics` (`criticalByStep`, na mesma varredura da malha do envelope); a compressão guarda `criticalMD` e `criticalPressurePsi` |
| Montagem para tela e relatório (elemento, margens em psi e ppg, situação, revestimento) | [operation-critical-points.ts](../../src/app/features/simulador/services/operation-critical-points.ts) |
| Entrada na lateral ("4.3 Janela operacional") | `app-pressure-window-inputs`: unidade (a troca converte o que foi digitado), constantes ou por TVD (começa com os constantes na superfície e no fundo), classes |
| Painel na tela | `app-pressure-window-panel`: o ponto mais crítico (TVD, MD, elemento, poros, poço, fratura, ECD, margens, situação), a tabela por etapa e o revestimento |
| Relatório | Item "Janela operacional — ponto crítico por etapa" no catálogo, logo depois das premissas (e da compressão, no squeeze) |

Decisões de implementação:

- Os valores únicos que o motor ainda lê (relatório de conformidade, limiar de injetividade,
  validação de engenharia, resumo antigo) são os do perfil na TVD da referência: canhoneados
  no squeeze, base do tampão no tampão.
- Na compressão, a folga de cada instante é tirada na profundidade crítica (fratura do perfil ali
  menos a pressão do poço ali). Com vazio no topo da coluna, "limite de superfície − aplicada" não
  é a folga do instante; o gráfico de risco de fratura passou a usar a mesma conta.
- Elemento: canhoneado quando a MD cai num intervalo; "Sapata do X″" até 15 m abaixo de uma
  sapata; senão, poço aberto.

No PIR-259D (id 8, constante em ppg): no posicionamento, **Influxo** em todas as etapas (poro de
9,0 ppg contra completação de 8,4 ppg, margem de cerca de −0,6 ppg); na compressão, **Fratura**
no topo do canhoneado (1508 m), −163 psi (−0,66 ppg), com os 2000 psi.

Testes: [pressure-profile.spec.ts](../../src/app/features/simulador/services/pressure-profile.spec.ts)
(conversão, interpolação, linhas quebradas nas TVDs contra a regra do `windowAt`, classes,
formulário), tampão e squeeze no motor (perfil no poço aberto e nos canhoneados, a sapata como
ponto crítico, limite da compressão pelo perfil, revestimento) e
[janela-operacional.spec.ts](../../src/app/features/simulador/pages/janela-operacional.spec.ts)
(tabela em psi/ft até o motor, reabrir o cenário, cenário antigo, tampão, os dois componentes).

Verificação: **886 testes aprovados em 93 arquivos**, em cinco lotes (240 + 211 + 168 + 116 +
151); `npm.cmd run build` concluído, com os avisos de orçamento de sempre. A tabela do
relatório foi conferida impressa; o painel e a entrada da lateral, só por teste (sem navegador).
