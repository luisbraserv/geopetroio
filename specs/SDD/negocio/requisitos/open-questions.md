# Dúvidas e decisões OQ — GeopetroIO

IDs OQ são permanentes. Este arquivo mantém **pendências atuais** e um resumo das decisões encerradas. Contexto, alternativas e evidências datadas estão no [histórico integral](historico/open-questions-2026-09.md).

## Em aberto ou com verificação pendente

### OQ-009 · Quais são os limites físicos aceitáveis no simulador?

⏳ **ENCAMINHADA 2026-09-05** · **[DECIDIDO 2026-09-05]** As faixas serão **fornecidas pela equipe
técnica**. A tabela a preencher, campo a campo, está em
[`Front/specs/simulador/faixas-validacao.md`](../../../../Geopetro-Front/specs/simulador/faixas-validacao.md).

**Segue bloqueada até os números chegarem** — mas as **regras entre campos** (ID < OD, TVD ≤ MD, base >
topo, fratura > poro) podem ser implementadas antes, porque não dependem de nenhuma faixa.
**Contexto [FATO]:** ~40 campos numéricos de engenharia sem nenhuma validação. Valores fisicamente
impossíveis produzem relatórios sem aviso.

**O que precisamos:** faixa mínima/máxima plausível por campo (MD/TVD, pesos de fluido, gradientes de
fratura e poro, pressão de operação, θ300..θ3, diâmetros). É conhecimento de engenharia de cimentação
que só a equipe técnica tem.

**Prioridade elevada:** é hoje o único domínio de negócio próprio do sistema.

⚠️ **[DECIDIDO 2026-09-05] Elevada a crítica.** O relatório do simulador é **entregue ao cliente**
([product-context §6](product-context.md#6-simulador--o-relatório-é-entregável-ao-cliente)). Deixa de
ser dívida de qualidade interna e passa a ser risco de relacionamento: um valor fisicamente impossível
produz hoje um relatório de aparência impecável, sem um único aviso, e esse relatório sai da empresa.

---

### OQ-015 · As colunas legadas ainda existem em produção?

⏳ **ENCAMINHADA 2026-09-05** · **[DECIDIDO 2026-09-05] É verificação, não decisão.** Conferir no banco
de produção antes do próximo deploy com `ddl-auto=validate` — divergência entre schema e entidades
impede a aplicação de subir.

**[FATO]** Flyway substituiu a execução manual prevista na entrevista. Ainda é
necessário conferir o estado real da base de produção antes do deploy, inclusive
a coluna `tipo`, os vínculos de usuário removidos e as tabelas órfãs
([DT-002](../../software/technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema)).

**Contexto original:**
**Contexto [FATO]:** `migration-regional.sql` tem passos comentados para remover `setores.regional` e
`projetos.setor_id`, com instrução *"após validar os dados"*. Sem registro de execução.

**Por que importa:** com `ddl-auto=validate` em produção, divergência entre schema e entidades impede
a aplicação de subir.

**Nota:** parte dessa pergunta perdeu urgência — `projetos` não é mais entidade mapeada.

---

### OQ-016 · A escala analógica do CLP foi confirmada?

✅ **RESOLVIDA 2026-08-31**

**Era [FATO]:** comentário no próprio código dizia *"A escala 0..1000 é preservada até sua confirmação
no PLC"* — a conversão inteira dependia de uma premissa que os desenvolvedores marcavam como não
validada.

**Resposta:** a escala **não era** 0–1000. O bloco *Analog Amplifier* está configurado com
*Measurement Range* −50..750 e `Offset -250`, então o Ax publicado vai de −50 (4 mA) a 750 (20 mA).
A conversão foi reescrita conforme [RN-030](../regras/business-rules.md#rn-030--conversão-do-ax-do-logo--psi)
e a escala antiga removida do código.

**[FATO]** A premissa errada tinha duas consequências que já se manifestavam: valores fora de faixa
e leitura *unsigned* de um Ax que pode ser negativo. Ambas corrigidas.

⚠️ **Permanece em aberto:** confirmar em campo, com calibrador de laço, que o amplificador de **cada
canal** está com essa mesma configuração. A conversão hoje assume −50..750 para os quatro. Um canal
configurado diferente produz leitura proporcionalmente errada, e o Ax cru no rodapé do card é o que
denuncia.
---

### OQ-031 · O consumidor tolera telemetria fora de ordem?

⏳ **ENCAMINHADA 2026-09-05** · **[DECIDIDO 2026-09-05] Não é decisão de produto — é tarefa técnica.**

**Como fechar:** testes cobrindo lote atrasado chegando depois de leituras mais novas, em três pontos —
`TelemetriaPayloadParser`, a agregação por janela da consulta, e a avaliação de alarme no servidor
([`features/alarmes.md §3`](alarmes.md#3-a-pergunta-que-a-avaliação-dupla-obriga-a-responder)).
A persistência já é segura: o InfluxDB aceita escrita fora de ordem e é idempotente por
`measurement + tags + timestamp`.

⚠️ **O caso que mais importa é o alarme:** um lote atrasado faz o evento nascer **depois** do fato. Uma
excursão de ontem, recebida hoje, não deve acender a tela como se estivesse acontecendo agora.
**Contexto:** com o buffer de contingência decidido em [OQ-019](#oq-019--perda-de-telemetria-em-falha-de-mqtt-é-aceitável),
a sonda passa a reenviar leituras acumuladas ao voltar da queda de rede. Elas chegam **depois** de
leituras mais novas.

**[FATO]** O InfluxDB aceita escrita fora de ordem e é idempotente por `measurement + tags + timestamp`,
então a **persistência** não quebra. O que **não** foi verificado: a agregação por janela na consulta,
o `TelemetriaDevSeeder` e a avaliação de alarmes no servidor
([`features/alarmes.md §3`](alarmes.md#3-a-pergunta-que-a-avaliação-dupla-obriga-a-responder))
diante de um lote atrasado.

**Nenhum teste hoje exercita esse caso.**

---

### OQ-035 · Como o Geopetro-Desktop se atualiza em campo?

**Contexto [DECIDIDO 2026-09-05]:** auto-update é necessário e **não existe**. Hoje a única via é
instalador `.exe` por instalação.

**Por que é o item mais bloqueante da lista:** trava simultaneamente o formato-alvo do MQTT, os limites
de alarme na borda, o buffer de contingência e a ativação da autenticação do broker — que
[deploy/README.md](../../../../deploy/README.md) exige fazer **depois** de atualizar a frota.

**O que precisamos:** mecanismo (canal de atualização, assinatura do pacote, *rollback*), e quem
autoriza a atualização de uma sonda em operação — atualizar durante uma manobra não é aceitável.

---

### OQ-042 · Backup do histórico de telemetria

**Contexto [DECIDIDO 2026-09-05]:** a retenção é de **5 anos em resolução de 1 segundo**, e o InfluxDB
da VM-2 é hoje a **única cópia**. Perder o disco, a VM ou sofrer ransomware significa perder o histórico
inteiro.

**[DECIDIDO 2026-09-05] Adiado** — será estruturado em outro momento.

**Nota [FATO]:** existe uma cópia parcial de fato — cada Desktop mantém em H2 local o registro completo
das leituras daquela sonda ([RN-039](../regras/business-rules.md#rn-039)).
Não é backup utilizável: a restauração seria manual, sonda por sonda, e só alcança máquinas ainda
instaladas e com disco íntegro. Serve como último recurso, não como plano.

⚠️ **[DECIDIDO 2026-09-05] O MySQL não terá backup** — risco aceito. Vale registrar o que isso inclui:
usuários, empresas, regionais, setores, unidades e **os cenários do simulador**, que são a origem dos
relatórios entregues a clientes. Nada disso é reconstruível a partir de outro lugar.

---

### OQ-048 · Validação de endereço

Nada impede apontar um card para fora do DB ou para o meio de outro valor. **O CLP não recusa** —
devolve bytes, e a conversão devolve um número plausível.

Dá para validar o alcance do DB lendo o CLP? Ou a proteção é só o valor bruto na tela, como já
acontece hoje com o `Ax`?

⚠️ **[DECIDIDO 2026-09-07] Ficou mais aguda, não menos.** A conferência ao vivo ao configurar foi
**recusada** ([RN-093](../regras/business-rules.md#rn-093--a-configuração-não-é-conferida-ao-vivo)): salva-se e
confere-se no dashboard. Com isso, **o valor bruto no card é a única proteção que resta** contra
apontar para o byte errado.

**Continua aberta:** validar o alcance do DB no momento de salvar seria a única barreira preventiva —
e é barata, já que o Desktop está conectado ao CLP enquanto se configura.

### OQ-049 · Como saber quais unidades da frota já foram configuradas

**[ABERTA 2026-09-08]** · ✅ **RESOLVIDA 2026-09-09** · ⚠️ **REABERTA 2026-09-10 — a solução foi
removida, com um dia de vida.**

> **[DECIDIDO 2026-09-10]** *"A frota não tá configurada, eu vou configurar tudo de uma vez, não faz
> sentido ter ela."*
>
> A tela existia para acompanhar um **mutirão espalhado no tempo**. A migração vai ser feita de uma
> vez, então não há pergunta para ela responder — e ela custaria manutenção sem resolver problema.
> Saíram a tela, `prontidao.service.ts`, `GET /api/sondas/prontidao`, `ProntidaoController`,
> `ProntidaoService`, `ProntidaoDaUnidade`, e os `Resumo`/`resumos()` de `CardsDeclarados` e
> `LimitesDeclarados`, que só ela usava. Ver
> [`configuracao-da-estacao.md §7`](configuracao-da-estacao.md).
>
> ⚠️ **A pergunta volta a não ter resposta.** Se entrar unidade nova na frota, ou uma for
> reconfigurada, **não haverá como saber de fora que ela ficou muda**. Aceito porque a migração é um
> evento único e acompanhado — registrado aqui para que a decisão não se perca se o cenário mudar.
>
> ⚠️ **O achado A05 da auditoria some junto**, por ausência de código e não por conserto — ver
> [`auditoria-alteracoes-2026-09.md`](../../software/testes/auditorias/auditoria-alteracoes-2026-09.md).
>
> **O texto abaixo fica como estava**: ele descreve o que a tela entregava, e é a especificação
> pronta caso o cenário volte a exigi-la.

Com [RN-088](../regras/business-rules.md#rn-088--sem-configuração-a-unidade-não-lê-nada) e a frota nascendo
vazia, a virada dos cards deixa cada unidade muda até alguém configurá-la pela tela do Desktop.

⚠️ **Não há como olhar de fora e saber quem já virou.** "A migração terminou" é hoje uma afirmação
sem como conferir — e uma unidade esquecida fica sem telemetria sem que nada acuse.

**Caminhos possíveis:**

| Caminho | Custo | Estado |
|---|---|---|
| Tela no Front listando unidades com e sem cards | O backend já tem o dado: basta uma consulta por `configuracao_cards` | ✅ **Adotado 2026-09-09** |
| Alerta quando uma unidade fica N horas sem publicar | Pega mais que falta de configuração — pega também sonda desligada, o que pode ser bom ou ruído | Não adotado |
| Relatório no deploy | Uma foto, não um acompanhamento | Não adotado |

### ✅ O que a tela entrega — **[FATO 2026-09-09]**

Ela distingue **quatro** situações, e não duas, porque exigem ações diferentes:

| Situação | O que significa | O que fazer |
|---|---|---|
| **Nunca configurada** | Revisão `0`: ninguém esteve lá | Configurar os cards no Desktop da unidade |
| **Sem card ativo** | Tem documento, e **todos os cards desativados** — tão muda quanto a anterior | Reativar pelo Desktop; não é falta de visita |
| **Sem alarme** | Lê e publica, e **nada a vigia** | Ajustar os limites em *Limites de Alarme* |
| **Pronta** | Lê, publica e tem alarme | — |

⚠️ **"Sem card ativo" não estava previsto nesta questão** e é um engano de configuração plausível: o
documento existe, alguém visitou a unidade, e mesmo assim ela não produz nada. Tratá-la junto com
"nunca configurada" mandaria alguém à sonda para um problema que se resolve na tela de Cards.

⚠️ **A tela cobre configuração, não disponibilidade.** Um CLP desligado, um cabo solto ou uma estação
sem energia aparecem como **prontos** — e a tela diz isso onde poderia enganar. Quem responde "está
chegando dado?" é o tempo real; o segundo caminho da tabela acima, o alerta por silêncio, continua
não adotado.

O escopo é o do monitoramento (RN-047): `CLIENTE` vê a prontidão só das sondas concedidas.

Ver [mqtt-telemetria §10](../../software/mqtt/mqtt-telemetria.md#10-o-que-a-virada-quebra).

### OQ-050 · Limite sobre card invisível nunca dispara

**[ABERTA 2026-09-09]** · ✅ **DECIDIDA 2026-09-09** — avisar dos dois lados, sem impedir. O aviso
existe na tela de **Cards do Desktop**, onde a visibilidade é escolhida, e na de **Limites**, onde o
limite é ajustado.

O servidor avalia o alarme pelo canal de tempo real
([RN-102](../regras/business-rules.md#rn-102--o-servidor-avalia-o-alarme-pelo-canal-de-tempo-real)), e o tempo
real carrega **só cards visíveis**
([RN-037](../regras/business-rules.md#rn-037)).

⚠️ **Um card ativo e invisível é lido, convertido e gravado na borda — e nunca chega ao servidor.** Um
limite sobre ele pode ser configurado, aparece salvo na tela e **não dispara nunca**. Hoje a
visibilidade controla, sem dizer, o que é vigiado.

As duas regras estão certas isoladamente: visibilidade é decisão de tela, e o canal de tempo real
existe para alimentar tela. O encontro delas é que produz o silêncio.

**Caminhos possíveis:**

| Caminho | Custo | Estado |
|---|---|---|
| Recusar limite sobre card invisível | Honesto, mas acopla duas configurações de autoridades diferentes: quem ajusta o limite (inclusive `CLIENTE`) não pode mexer no card | Não adotado |
| Avisar na tela de limites, sem recusar | Barato e não acopla. Deixa a decisão com quem configura | ✅ **Adotado 2026-09-09** |
| Publicar cards invisíveis no tempo real, marcados | Resolve na raiz e contraria RN-037 — a tela teria de filtrar | Não adotado |

✅ **[DECIDIDO 2026-09-09] A tela de limites avisa e não recusa.** A grandeza de um card invisível
aparece na lista, aceita limite e traz a marca *"o limite é salvo, mas não é avaliado enquanto o card
não aparecer no dashboard da unidade"*. Foi o caminho mínimo: recusar acoplaria duas configurações de
autoridades diferentes, e publicar os invisíveis contrariaria RN-037.

⚠️ **A questão continua aberta na raiz.** O aviso torna o silêncio visível para quem ajusta o limite —
**não o elimina**, e não existe na tela de cards do Desktop, que é onde a visibilidade é decidida.
Quem torna um card invisível não é avisado de que está desligando a vigilância dele.

✅ **[FATO 2026-09-09] A avaliação na borda cobre metade do buraco.** A estação lê **todos os cards
ativos**, inclusive os invisíveis ([RN-104](../regras/business-rules.md#rn-104--a-estação-sinaliza-o-alarme-o-servidor-o-registra)),
então o alarme **acende na sonda**.

✅ **[FATO 2026-09-09] O aviso passou a existir nos dois lugares onde a decisão é tomada.** A tela de
**Cards do Desktop** — onde a visibilidade é escolhida — mostra, ao deixar um card *ativo e
invisível*: "continua sendo lido e gravado nesta estação, e não é enviado ao monitoramento. Um limite
de alarme sobre ele acende aqui na sonda e não chega à supervisão." A tela de **Limites** avisa do
outro lado, para quem ajusta o limite.

⚠️ **Avisa e não impede, nos dois lugares.** Esconder um card do dashboard é escolha legítima de quem
configura; recusá-la acoplaria a tela de Cards (`ADMIN`/`SUPORTE`) à de limites (quem enxerga a
sonda, inclusive `CLIENTE` — RN-069).

### ⚠️ O que continua verdade, e não é o aviso que resolve

**Quem não está na sonda segue sem ver aquele episódio** — e é esse o público da feature. O alarme de
card invisível não entra no histórico nem no destaque remoto. As duas telas tornam a consequência
**visível para quem escolhe**; a assimetria entre borda e servidor permanece, por desenho.

Encerrada como **decidida** — a pergunta era o que fazer, e a resposta foi avisar dos dois lados.

### OQ-051 · Retenção do log de eventos de alarme

**[ABERTA 2026-09-09]**

A tabela `evento_alarme` é *append-only* e **não tem política de retenção**. A de 5 anos vale para a
série de telemetria no InfluxDB e nunca foi discutida para alarmes.

O log cresce por **transição**, não por leitura ([RN-056](../regras/business-rules.md#rn-056--um-evento-por-excursão-não-por-leitura)),
então o crescimento é modesto — o que torna a questão pouco urgente e fácil de esquecer. Convém
decidir antes de a tabela ficar grande, quando apagar passa a ser uma operação e não uma linha de SQL.

Era o item 1 de [alarmes §7](alarmes.md#continuam-abertos), agora com a tabela existindo.

⚠️ **[FATO 2026-09-09] A tela de histórico não espera essa decisão — ela se protege.** A consulta
exige janela (máximo 92 dias) e devolve no máximo 200 excursões, dizendo quando cortou. Isso impede
que a tela quebre com a tabela crescendo, **e não substitui a política**: os dados continuam lá para
sempre, e nada os apaga.

### OQ-052 · Como a estação mostra que suas definições de card estão velhas

**[ABERTA 2026-09-10]** · **[DECIDIDO 2026-09-10] Adiada de propósito** — *"isso é observabilidade, a
gente vai pensar futuramente nessa arquitetura"*. Não é correção de defeito, e sim decisão de
arquitetura de observabilidade; entra quando esse tema for tratado como um todo.

**O que abre a questão.** Com o tempo real desligado
([RN-114](../regras/business-rules.md#rn-114--os-interruptores-de-telemetria-nascem-ligados)) ou com o backend
fora do ar, os cards continuam sendo desenhados a partir do snapshot em disco — comportamento
deliberado, porque a alternativa esvaziaria o dashboard e calaria o alarme local.

⚠️ **O card não é só desenho.** Ele diz **onde ler** (`byteInicial`) e **como converter**
(`parâmetros`). Uma definição velha produz número plausível e errado: corrigido o raio de um tanque
de 1,20 m para 1,50 m no servidor, a estação desatualizada segue mostrando ~8.400 L onde há ~13.000 L.
**Nada acusa** — a tela está normal.

**É a mesma forma do `plcIp`** ([RN-113](../regras/business-rules.md#rn-113--a-conexão-do-clp-mora-na-unidade-não-na-estação)):
a tela exibindo algo que não é o que está em vigor. Só que na direção contrária — lá o campo não
valia nada; aqui a definição vale, e está atrasada.

**Caminho mais barato quando for a hora:** `MonitoringController` já guarda o documento inteiro em
`documentoAtual`, e `CardsDaUnidade` carrega `atualizadoPor`/`atualizadoEm`; `estadoMonitoramento` e
seu helper já existem. Uma linha — *"Definições dos cards de 03/09 14:22, por ana — tempo real
desligado, não se atualizam"* — fecha a lacuna sem arquitetura nova. Fica registrado como piso, não
como decisão: o desenho maior é o que a questão adia.

⚠️ **Relacionada a [OQ-049](#oq-049--como-saber-quais-unidades-da-frota-já-foram-configuradas)**, que
foi reaberta no mesmo dia. As duas são a mesma família: **de fora não se vê quem está mudo, e de
dentro não se vê que o que se mostra está velho.**

## Decisões encerradas

As seções abaixo preservam os IDs e links existentes. Requisitos detalhados pertencem às specs de feature, contratos e regras RN.

### OQ-002 · O vínculo regional/setor ainda serve para alguma coisa?

**[DECIDIDO]** Vínculos de usuário com regional/setor foram removidos; o acesso usa perfil e concessão à sonda. [Histórico](historico/open-questions-2026-09.md).

### OQ-004 · Qual é a política de senha?

**[DECIDIDO]** A política de senha de 8–20 caracteres e quatro classes deve ser aplicada no backend em todos os fluxos. [Histórico](historico/open-questions-2026-09.md).

### OQ-005 · Cenários do simulador têm dono?

**[DECIDIDO]** Cenários não têm dono individual; qualquer perfil autorizado no simulador pode editá-los. [Histórico](historico/open-questions-2026-09.md).

### OQ-007 · Qual é a política de exclusão do sistema?

**[DECIDIDO]** Exclusão de cadastro com vínculo é bloqueada com motivo explícito. [Histórico](historico/open-questions-2026-09.md).

### OQ-012 · Onde vivem os manifestos de deploy?

**[DECIDIDO]** Deploy usa Docker Compose; manifestos Kubernetes não se aplicam. [Histórico](historico/open-questions-2026-09.md).

### OQ-013 · Endpoints fora do padrão `/api` são deliberados?

**[DECIDIDO]** Rotas de API devem usar o prefixo /api; a migração foi implementada. [Histórico](historico/open-questions-2026-09.md).

### OQ-014 · ~~Qual é a lista canônica de roles?~~ — RESPONDIDA

**[DECIDIDO]** O modelo de acesso tem oito roles: tipos de conta, permissões de módulo, ADMIN e SUPORTE. [Histórico](historico/open-questions-2026-09.md).

### OQ-017 · Rack/slot do CLP valem para toda a frota?

**[DECIDIDO]** A resposta inicial de rack/slot fixos foi superada pela configuração da conexão do CLP na engrenagem da estação; veja [configuração da estação](configuracao-da-estacao.md#4-conexão-do-clp-na-engrenagem). [Histórico](historico/open-questions-2026-09.md).

### OQ-018 · Qual é o modelo real de CLP?

**[DECIDIDO]** O modelo de CLP varia por sonda; a documentação não deve assumir um modelo único. [Histórico](historico/open-questions-2026-09.md).

### OQ-019 · Perda de telemetria em falha de MQTT é aceitável?

**[DECIDIDO]** Perda de telemetria histórica por falha de MQTT não é aceitável; a borda precisa de contingência. [Histórico](historico/open-questions-2026-09.md).

### OQ-020 · A credencial do banco `braservone` ainda é válida?

**[DECIDIDO]** O banco braservone não existe mais; a pergunta perdeu objeto. [Histórico](historico/open-questions-2026-09.md).

### OQ-021 · Recuperação de senha é planejada?

**[DECIDIDO]** Recuperação de senha é por e-mail; ativação e teste corporativo ainda são tarefas de implantação. [Histórico](historico/open-questions-2026-09.md).

### OQ-022 · Revogação imediata de acesso é requisito?

**[DECIDIDO]** Desativação de conta deve cortar acesso imediatamente. [Histórico](historico/open-questions-2026-09.md).

### OQ-023 · Qual broker MQTT será usado em produção?

**[DECIDIDO]** O broker é Mosquitto; autenticação foi adiada até haver atualização automática da frota. [Histórico](historico/open-questions-2026-09.md).

### OQ-028 · Qual é a política de retenção do InfluxDB?

**[DECIDIDO]** O histórico no InfluxDB deve ser retido por cinco anos. [Histórico](historico/open-questions-2026-09.md).

### OQ-029 · A API de telemetria precisa de autenticação serviço-a-serviço?

**[DECIDIDO]** A comunicação entre VMs usa a restrição do firewall, sem autenticação adicional serviço a serviço nesta decisão. [Histórico](historico/open-questions-2026-09.md).

### OQ-025 · Os repositórios podem sair do OneDrive?

**[DECIDIDO]** Os repositórios permanecem no OneDrive, com o risco registrado. [Histórico](historico/open-questions-2026-09.md).

### OQ-026 · O que fazer com as tabelas órfãs?

**[DECIDIDO]** Tabelas órfãs dos módulos removidos devem ser descartadas; os scripts de limpeza exigem execução controlada. [Histórico](historico/open-questions-2026-09.md).

### OQ-027 · O simulador deve ganhar um consumidor de telemetria?

**[DECIDIDO]** Simulador e telemetria não serão correlacionados. [Histórico](historico/open-questions-2026-09.md).

### OQ-030 · 5 anos, em que resolução?

**[DECIDIDO]** A resolução de um segundo deve ser mantida durante os cinco anos de retenção. [Histórico](historico/open-questions-2026-09.md).

### OQ-032 · Quem pode ajustar o limite de alarme?

**[DECIDIDO]** Quem vê a sonda, inclusive CLIENTE nas concedidas, pode ajustar o limite remoto. [Histórico](historico/open-questions-2026-09.md).

### OQ-033 · Método de cálculo da trajetória

**[DECIDIDO]** A trajetória do survey usa mínima curvatura. [Histórico](historico/open-questions-2026-09.md).

### OQ-034 · Cenário referencia ou copia a geometria do poço?

**[DECIDIDO]** O cenário referencia a entidade Poço e acompanha alterações da geometria. [Histórico](historico/open-questions-2026-09.md).

### OQ-036 · Qual é o usuário de serviço de cada sonda?

**[DECIDIDO]** Um usuário de serviço atende a frota; o risco da credencial compartilhada permanece registrado. [Histórico](historico/open-questions-2026-09.md).

### OQ-037 · Quantos segundos de tempo mínimo no alarme?

**[DECIDIDO]** Tempos mínimos de abertura e fechamento do alarme são configuráveis por sonda. [Histórico](historico/open-questions-2026-09.md).

### OQ-038 · Alarme tem severidade?

**[DECIDIDO]** Alarmes têm dois níveis: atenção e crítico. [Histórico](historico/open-questions-2026-09.md).

### OQ-039 · Excluir sonda com histórico de telemetria

**[DECIDIDO]** Histórico de telemetria conta como vínculo e bloqueia a exclusão da sonda. [Histórico](historico/open-questions-2026-09.md).

### OQ-040 · Auto-update durante operação

**[DECIDIDO]** Atualização automática do Desktop só pode instalar com o CLP desconectado. [Histórico](historico/open-questions-2026-09.md).

### OQ-041 · O tipo da unidade define quais variáveis são monitoradas?

**[DECIDIDO]** Tipo da unidade é classificação; por ora, a telemetria continua exclusiva de sonda. [Histórico](historico/open-questions-2026-09.md).

### OQ-043 · Mapeamento configurável de card para endereço no CLP

**[DECIDIDO]** O endereço de leitura é configurado por card no Desktop. [Histórico](historico/open-questions-2026-09.md).

### OQ-044 · Um documento de configuração, duas autoridades

**[DECIDIDO]** Cards e limites são documentos separados, com autorização e revisão próprias. [Histórico](historico/open-questions-2026-09.md).

### OQ-045 · Unidade do volume do tanque

**[DECIDIDO]** Volume do tanque é publicado em bbl. [Histórico](historico/open-questions-2026-09.md).

### OQ-046 · O que acontece com a série de um card excluído

**[DECIDIDO]** Card não é excluído: a desativação conserva identidade, histórico e limite hibernado. [Histórico](historico/open-questions-2026-09.md).

### OQ-047 · Dois cards no mesmo endereço

**[DECIDIDO]** Dois cards podem apontar para o mesmo endereço do CLP. [Histórico](historico/open-questions-2026-09.md).

### OQ-053 · Como os serviços se autenticam nas rotas internas do core

**[DECIDIDO 2026-10-06]** Token de serviço emitido pelo próprio Braserv-Core, com escopos. As
credenciais dos sistemas ficam no banco do core e são geridas por ADMIN numa tela. Ver
[RN-117](../regras/business-rules.md#rn-117--só-o-braserv-core-emite-token) e
[braserv-core.md §6.5](../../software/backend/braserv-core.md#65-clientes-de-serviço-d-3).

### OQ-054 · O que o backend faz quando o core não responde

**[DECIDIDO 2026-10-06]** Usa o último acesso conhecido do usuário por até 5 min, registrando no
log; depois disso, nega. Ver [braserv-core.md §6.6](../../software/backend/braserv-core.md#66-acesso-atual-do-usuário-rn-062-e-rn-107).

### OQ-055 · O que uma Unidade inativa deixa de fazer

**[DECIDIDO 2026-10-06]** Some das listas de seleção e não recebe concessão nova; concessões
existentes, histórico, telemetria, tempo real e cópia de cards continuam. Ver
[RN-116](../regras/business-rules.md#rn-116--unidade-é-inativada-e-só-é-excluída-se-nunca-foi-usada).

### OQ-056 · Janela de manutenção para o corte

**[ENCERRADA 2026-10-06]** Não se aplica: o sistema ainda não está em produção. A mudança entra
inteira, sem janela de manutenção nem compatibilidade com nomes antigos.

### OQ-057 · Como corrigir uma Unidade cadastrada por engano

**[DECIDIDO 2026-10-06]** Exclusão física permitida para unidade que nunca foi usada. O core
pergunta ao Geopetro-Backend, que responde também pela telemetria; sem resposta, recusa. Ver
[RN-116](../regras/business-rules.md#rn-116--unidade-é-inativada-e-só-é-excluída-se-nunca-foi-usada).
