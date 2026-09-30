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
| [`product-context.md`](product-context.md) | **Para quem o sistema existe, quem usa cada superfície, realidade de campo** — a camada que não vem do código |
| [`system-overview.md`](system-overview.md) | Arquitetura, aplicações, infraestrutura, deploy |
| [`domain-map.md`](domain-map.md) | Domínios, módulos e relacionamentos |
| [`current-features.md`](current-features.md) | Inventário de funcionalidades existentes |
| [`business-rules.md`](business-rules.md) | Regras de negócio identificadas no código |
| [`security-findings.md`](security-findings.md) | Falhas de autorização exploráveis — **ação imediata** |
| [`technical-debt.md`](technical-debt.md) | Inconsistências, duplicação, código morto |
| [`open-questions.md`](open-questions.md) | Dúvidas pendentes de confirmação |
| [`contracts/`](contracts/) | Contratos de integração entre aplicações — MQTT, REST e **WebSocket tempo real** |
| [`features/`](features/) | Specs de feature que **atravessam aplicações** e por isso não cabem em um repositório só |
| [`renomeacao-projetos.md`](renomeacao-projetos.md) | Renomeação dos quatro projetos, e o que ela alcança |

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
| Geopetro-Telemetria | ✅ **Implementado em 2026-08-27**, spec-first — primeiro componente do sistema a nascer sob SDD |
| Acesso ao InfluxDB | **Via proxy**, não direto. O Geopetro-Telemetria é o único dono do schema; o Geopetro-Backend só consome REST |
| Contrato MQTT alvo | **Batch com payload rico** — 1 mensagem por ciclo, campos ricos no array de leituras |
| **Papéis MQTT** | **Produtor: Geopetro-Desktop · Consumidor: Geopetro-Telemetria.** Geopetro-Backend não participa |
| **Módulo Químicos** | **Removido** do Geopetro-Backend |
| **Módulos Projetos, Processos, Observações** | **Removidos** do Geopetro-Backend e do Front |
| Almoxarifado / Compra | **Descontinuados**. Não entram como escopo ativo |
| Política de senha | **Sem política definida** — pendente de definição formal |
| Roles não utilizadas | **Roadmap de módulos** — mantidas no modelo de autorização |
| Desktops (Sonda / Cimentação) | **Permanecem separados** — produtos distintos, duplicação aceita |
| Falhas de segurança | Documento priorizado + correção imediata |
| **Escopo de sondas** | Perfis operacionais veem a **frota inteira**; `CLIENTE` só as **concedidas no cadastro** |
| **Tempo real** | **WebSocket/STOMP** Desktop → Geopetro-Backend → Angular, **sem persistência** |

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

---

## Entrevista de produto — 2026-09-05

**[DECIDIDO 2026-09-05]** Primeira rodada de perguntas cuja resposta **não estava no código**. Até
aqui, toda a base respondia *"o que o sistema faz"*. Faltava *"para quem, para decidir o quê, e com que
operação por trás"* — e é isso que decide o que vale construir.

Registro completo em [`product-context.md`](product-context.md); decisões item a item em
[`open-questions.md`](open-questions.md#entrevista-de-produto--2026-09-05).

| Tema | Decisão |
|---|---|
| Público das telas web | **Supervisão remota e cliente** — o operador na sonda não é usuário da web |
| **Alarmes por limite** | **Essenciais.** Borda e servidor · por sonda, ajustável na hora · tela + Desktop · evento com histórico |
| **Poço** | **Vira entidade** — nasceu da necessidade de reaproveitar geometria entre cenários |
| Relatório do simulador | **Entregável ao cliente** — eleva a validação de entrada a crítica |
| Trajetória do poço | **Survey digitado** — o modelo em curso não comporta |
| Perda de telemetria | **Inaceitável** — buffer de contingência entra na spec |
| Retenção | **5 anos** |
| Auto-update do Desktop | **Necessário** — não existe, e bloqueia quase tudo que é novo na borda |

### O que mudou de lugar

| Antes | Agora |
|---|---|
| O Geopetro-Desktop era o produto na sonda | É **o sensor do sistema**; o valor aparece na web |
| Alarme não existia como conceito | É requisito essencial, com spec própria em [`features/alarmes.md`](features/alarmes.md) |
| Perda de telemetria era pergunta aberta | Não é aceitável — a conectividade varia demais entre sondas |
| Simulador era cálculo interno | Produz **documento que sai da empresa** |

### Rodada 2 — mesma data

| Tema | Decisão |
|---|---|
| Senha · revogação · recuperação | Regra única no backend · **corte imediato** ao desativar · **autoatendimento por e-mail** (traz SMTP de volta) |
| Exclusão | **Bloquear quando houver vínculo**, em todos os cadastros |
| Vínculo usuário↔regional/setor | **Removido** — não influenciava nada desde 2026-08-27 |
| **Tipo da Unidade/Sonda** | `SONDA` · `UNIDADE_BOMBEIO` · `SLICKLINE_WIRELINE` · `CIMENTACAO` · `UCAQ` |
| Simulador | **Mínima curvatura** · cenário **referencia** o poço · metros e pés na tela, **metros gravados** |
| Alarmes | **Tempo mínimo** fora/dentro · quem vê a sonda **ajusta** o limite · silêncio da sonda **não** alarma |
| Retenção | **1 segundo durante os 5 anos**, sem agregação |
| Infra e campo | Auto-update **automático** · **um** usuário de serviço para a frota · firewall basta entre VMs · rack/slot iguais na frota |

### Rodadas 3 a 6 — fechamentos

| Tema | Decisão |
|---|---|
| Alarme | **Atenção e crítico** · tempos **por sonda** · limite guarda quem alterou |
| Exclusão de sonda | **Histórico conta como vínculo** — exige endpoint novo na Telemetria |
| Auto-update | **Só com o CLP desconectado** |
| Tipo da unidade | **Classificação apenas** — telemetria segue exclusiva de sonda |
| Simulador × telemetria | **Sem correlação** — encerra OQ-027 |
| Faixas do simulador | Equipe fornece — [tabela pronta](../Geopetro-Front/specs/simulador/faixas-validacao.md) |
| Broker · CLP · OneDrive · backup | Autenticação **depois** do auto-update · modelo **varia por sonda** · repos **ficam** no OneDrive · MySQL **sem backup**, InfluxDB **adiado** |

### Rodada final — arquitetura

| Tema | Decisão |
|---|---|
| **Event sourcing** | **Só nos alarmes** — log de `ABRIU`/`ESCALOU`/`REDUZIU`/`FECHOU` com projeção. Nada mais migra |
| **CQRS** | **Já existe no Geopetro-Telemetria** (escrita ≠ leitura) e **só lá**. MQTT é mensageria, não CQRS |
| **Escalada de alarme** | **Um episódio que escala**, não dois eventos |
| **Limites de alarme** | Sem perfil padrão · sonda sem limite **não alarma** · limite vale **até alguém trocar** |
| **API** | **Padronizar tudo em `/api`** — testes de `SecurityConfig` **antes** de mover as rotas |
| Kubernetes · rotas legadas · fora de ordem | Sem objeto (deploy é Compose) · migram · vira teste |

⚠️ **Saldo operacional da entrevista:** **cinco alterações de schema** decididas, todas manuais e
obrigatórias antes do próximo deploy — [DT-002](technical-debt.md#-fila-de-mudanças-manuais-criada-em-2026-09-05).

### Duas decisões que se corrigiram dentro da própria entrevista

**[DECIDIDO 2026-09-05]** Registradas porque a segunda resposta contradiz a primeira, e isso é
informação, não erro:

1. **Poço** começou como "texto livre" (pergunta feita pelo ângulo da telemetria) e terminou como
   **entidade** (pergunta feita pelo ângulo do simulador). Prevalece a segunda — é a que exige estrutura.
2. **Limite de alarme ajustável na web + avaliação na borda** exigem um caminho servidor → sonda que
   **não existia**: o Desktop só publicava, nunca recebia. A capacidade nova foi descoberta pela
   combinação de duas respostas, não por nenhuma delas isolada.


## GeoPetro Vision — integração prevista (11/09/2026)

**[DECIDIDO 2026-09-11]** O GeoPetro Vision monitorará localmente as câmeras de cada unidade e alimentará o Geopetro-Backend com registros de não conformidade SMS e fotos. O Geopetro-Front existente disponibilizará o histórico sincronizado; não haverá nova central nem vídeo ao vivo remoto nesta etapa. ADMIN/SUPORTE poderão consultar todas as unidades; os demais acessos respeitarão o escopo autorizado. Retenção do Vision é indefinida e distinta da telemetria. Requisitos ainda não implementados.

Decisões, permissões, operação offline e contrato pendente: [GeoPetro Vision](features/geopetro-vision.md).

**[DECIDIDO 2026-09-11 — entrevista encerrada]** Frontend somente consulta histórico; avaliações/correções e configuração de turnos/zonas exclusivamente no desktop. Câmeras cadastradas manualmente, quantidade variável. Tempos por zona e turnos definidos localmente. Offline-first mantém consulta/avaliação da sessão já iniciada; ao reconectar com token expirado exige relogin na interface sem parar monitoramento/transporte. Não enviar e-mail ao SMS por falha de câmera/IA. Especificações atualizadas, sem implementação.

## Decisão final de sessão e executor — revisão 11/09/2026

**[DECIDIDO 2026-09-11]** Esta decisão substitui a previsão anterior de retomada automática após reboot offline. Monitoramento somente inicia após login online autorizado no Vision, inclusive depois de reiniciar Windows. Bloquear tela mantém a captura; trocar usuário Windows ou encerrar sessão Windows para a captura. Fechar janela mantém execução na conta atual. Logout Vision bloqueia a instalação inteira até qualquer usuário autorizado fazer novo login online.

**[DECIDIDO 2026-09-11]** Cada pessoa tem sua conta Windows; unidade/câmeras são configuração compartilhada de todos os usuários daquele computador. Sessão humana não é compartilhada. Executor separado da UI na sessão atual, sem serviço Windows permanente de monitoramento; uma captura ativa por instalação.

**[DECIDIDO 2026-09-11]** SUPORTE/ADMIN seleciona unidade consultando GeoPetro IO dentro do próprio app desktop. Não haverá liberação manual em portal ou cadastro externo. Ao salvar vínculo, app obtém automaticamente credencial técnica da instalação; mecanismo remoto ainda precisa de contrato/implementação. Essa credencial permite transporte independente do token humano durante execução, mas não substitui login exigido para iniciar monitoramento ou usar interface.

**[PENDENTE]** Cofre compartilhado entre contas Windows, rotação/revogação da credencial técnica e comportamento do transporte após logoff/logout; não prometer envio local com todos os processos encerrados nem reintroduzir serviço permanente implicitamente. Nenhum endpoint/papel/código alterado nesta entrega documental.