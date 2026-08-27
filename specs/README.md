# Specs — Sistema GeopetroIO

Base de **Spec Driven Development (SDD)** do ecossistema GeopetroIO (Braserv Petróleo).

Estes documentos foram produzidos por **engenharia reversa do código existente** em 2026-08-26.
O código é tratado como **fonte de evidência**, não como definição de correção: comportamento
implementado ≠ regra de negócio validada.

---

## Estrutura híbrida

O workspace **não é um monorepo** — são 5 repositórios Git independentes. A documentação segue
essa realidade:

| Nível | Local | Conteúdo | Versionado em |
|---|---|---|---|
| **Sistema** | `GeopetroIO/specs/` | Visão geral, mapa de domínios, contratos entre aplicações, dívida técnica, dúvidas | Repo próprio de specs |
| **Feature** | `<cada-repo>/specs/` | Specs por domínio, evoluindo no mesmo commit do código que as implementa | Repo da própria aplicação |

**Regra de ouro:** um contrato que atravessa aplicações (MQTT, REST entre serviços) mora em
`specs/contracts/` no nível de sistema. Duplicá-lo dentro dos repos garante divergência.

### Documentos de sistema

| Documento | Conteúdo |
|---|---|
| [`system-overview.md`](system-overview.md) | Arquitetura, aplicações, infraestrutura, deploy |
| [`domain-map.md`](domain-map.md) | Domínios, módulos e relacionamentos |
| [`current-features.md`](current-features.md) | Inventário de funcionalidades existentes |
| [`business-rules.md`](business-rules.md) | Regras de negócio identificadas no código |
| [`security-findings.md`](security-findings.md) | Falhas de autorização exploráveis — **ação imediata** |
| [`technical-debt.md`](technical-debt.md) | Inconsistências, duplicação, código morto |
| [`open-questions.md`](open-questions.md) | Dúvidas pendentes de confirmação |
| [`contracts/`](contracts/) | Contratos de integração entre aplicações — MQTT, REST e **WebSocket tempo real** |

---

## Convenção de marcação

Toda afirmação nestes documentos carrega um marcador de confiança. **Isto é essencial**: o valor
de uma spec de engenharia reversa depende de saber o que é verificado e o que é suposição.

| Marcador | Significado |
|---|---|
| **[FATO]** | Verificável no código, com referência a arquivo/linha |
| **[INFERÊNCIA]** | Dedução a partir de evidência indireta — pode estar errada |
| **[PENDENTE]** | Não determinável pelo código; exige confirmação humana |
| **[DECIDIDO]** | Confirmado pela equipe durante o levantamento, com data |

Ausência de marcador em texto descritivo (títulos, contexto) é aceitável. Em **afirmações sobre
comportamento do sistema**, não é.

---

## Como evoluir uma spec

1. Mudança de comportamento começa pela spec, **não pelo código**.
2. A spec de feature muda **no mesmo commit/PR** do código que a implementa.
3. Item marcado **[PENDENTE]** que for respondido vira **[DECIDIDO]** com data — nunca some silenciosamente.
4. Regra descoberta depois vira **[FATO]** com a referência de código que a comprova.

---

## Decisões registradas neste levantamento

Respostas dadas pela equipe em **2026-08-26**, durante a entrevista de levantamento:

| Tema | Decisão |
|---|---|
| Layout de specs | Híbrido (sistema na raiz + feature por repo) |
| Backend-Telemetria | ✅ **Implementado em 2026-08-27**, spec-first — primeiro componente do sistema a nascer sob SDD |
| Acesso ao InfluxDB | **Via proxy**, não direto. O Backend-Telemetria é o único dono do schema; o Backend-Sonda só consome REST |
| Contrato MQTT alvo | **Batch com payload rico** — 1 mensagem por ciclo, campos ricos no array de leituras |
| **Papéis MQTT** | **Produtor: Desktop-Sonda · Consumidor: Backend-Telemetria.** Backend-Sonda não participa |
| **Módulo Químicos** | **Removido** do Backend-Sonda |
| **Módulos Projetos, Processos, Observações** | **Removidos** do Backend-Sonda e do Front |
| Almoxarifado / Compra | **Descontinuados**. Não entram como escopo ativo |
| Política de senha | **Sem política definida** — pendente de definição formal |
| Roles não utilizadas | **Roadmap de módulos** — mantidas no modelo de autorização |
| Desktops (Sonda / Cimentação) | **Permanecem separados** — produtos distintos, duplicação aceita |
| Falhas de segurança | Documento priorizado + correção imediata |
| **Escopo de sondas** | Perfis operacionais veem a **frota inteira**; `CLIENTE` só as **concedidas no cadastro** |
| **Tempo real** | **WebSocket/STOMP** Desktop → Backend-Sonda → Angular, **sem persistência** |

### Escopo resultante

**[FATO]** Após as remoções, o sistema tem **três domínios ativos**:

1. **Identidade e Organização** — Empresa · Regional → Setor → Unidade/Sonda · Usuário
2. **Telemetria** — captura no CLP, com **dois caminhos**: histórico (MQTT → InfluxDB) e tempo real (WebSocket)
3. **Cimentação** — simulador web + desktop de monitoramento da bomba

O backend passou de 13 para **9 módulos Maven**. Os testes foram de 61 → 43 (remoções) → **61**
novamente, agora cobrindo autorização de sondas e do canal WebSocket.

### A divisão que organiza a telemetria

**[DECIDIDO 2026-08-27]** Duas responsabilidades, dois caminhos, nenhuma sobreposição:

| | MQTT | WebSocket |
|---|---|---|
| Responde | "o que aconteceu?" | "o que está acontecendo?" |
| Persistido | InfluxDB | **Não** |
| Perda aceitável | Não | **Sim, por desenho** |

Contratos em [`contracts/`](contracts/).
