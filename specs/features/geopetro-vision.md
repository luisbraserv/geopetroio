# GeoPetro Vision — histórico de não conformidades SMS

**[DECIDIDO 2026-09-11]** Requisitos confirmados em entrevista. Estado: especificação para implementação futura; não constitui funcionalidade existente.

## Responsabilidades

**[DECIDIDO 2026-09-11]** Cada unidade tem um computador com GeoPetro Vision, responsável por captura RTSP, IA local, zonas, detecção, som, evidências e histórico local. Não será criada uma aplicação de central. O Vision alimentará o Geopetro-Backend com registros e fotos; o Geopetro-Front existente consultará o histórico recebido. O Vision, por sua vez, consome autenticação e unidades existentes do GeoPetro IO. Não haverá cadastro paralelo de sondas.

**[DECIDIDO 2026-09-11]** Somente histórico e fotos serão disponibilizados no frontend nesta etapa: vídeo ao vivo remoto e controle remoto de câmeras estão fora do escopo. Computador local visualiza somente câmeras de sua unidade. Unidade offline mantém processamento e registros; web mostra última sincronização e dados desatualizados explicitamente.

## Piloto e detecção

**[DECIDIDO 2026-09-11]** Piloto com uma unidade e quatro câmeras, com cadastro expansível e simultaneidade sujeita a hardware. Desktop i7 geração 14, 32 GB RAM, RTX 4070 e HD Purple 4 TB; resolução/modelos de câmeras pendentes. Primeira regra: falta de capacete exclusivamente em zonas de uso obrigatório, várias zonas por câmera.

**[DECIDIDO 2026-09-11]** Uma ocorrência por pessoa/câmera, sem duplicar por zonas sobrepostas. Primeira confirmação por zona (padrão 5 segundos, ajustável por ADMIN/SUPORTE); novos registros nos intervalos 1, depois 2, depois 4, depois 8 minutos desde início da detecção: marcos totais 1/3/7/15/31 minutos. Cada marco tem nova foto e permanece na mesma ocorrência. Foto inteira destaca posição da pessoa e não conformidade; não gravar clips como requisito inicial.

**[DECIDIDO 2026-09-11]** Som após confirmação e enquanto persistir situação. Conformidade/saída da zona pelo tempo configurado (padrão 3 segundos) encerra som e marca Situação encerrada. Perda de visibilidade pelo tempo configurado (padrão 5 segundos) interrompe som/escalonamentos daquela pessoa e marca Visibilidade perdida, sem afirmar resolução. Notificação abre detalhe; menu permite consultar registros.

## Papéis e avaliação

**[DECIDIDO 2026-09-11]** Configuração de câmeras, zonas, turnos, tempos por zona, destinatários e vínculo da estação: ADMIN/SUPORTE.

**[ATUALIZADO 2026-09-17]** Consulta/avaliação local: ADMIN, SUPORTE, e conta (CLIENTE ou INTERNO) com a permissão de módulo do Vision. GERENCIA e DIRETORIA **saíram do enum** — existiam só dentro de listas de permissão, sem regra própria ([RN-099](../business-rules.md#rn-099--acesso-por-combinação-tipo-de-conta--permissão-de-módulo)). COORDENADOR e ENCARREGADO continuam papéis a implementar, sem herdar privilégios de outros módulos.

⚠️ **[PENDENTE]** Qual permissão de módulo o Vision usa, e se ela se divide em níveis como o monitoramento (`MONITORAMENTO` × `MONITORAMENTO_REAL`). A decisão original distinguia "consulta local" de "consulta de todas as unidades" por role hierárquica; no modelo atual essa distinção é **escopo**, não permissão — a conta interna vê a frota, a de cliente vê o que foi concedido (RN-047). Definir antes do primeiro endpoint, não depois.

**[ATUALIZADO 2026-09-17]** ADMIN e SUPORTE podem consultar histórico de todas as unidades pelo frontend GeoPetro IO. Isso não transforma o desktop da unidade em central. Demais acessos devem respeitar concessões; CLIENTE não ganha acesso global.

**[DECIDIDO 2026-09-11]** Revisões: confirmado, falso alerta, resolvido. Justificativa obrigatória em falso alerta/resolvido; guardar autor, data e histórico. Avaliação humana é independente do fim observado. Marcar falso alerta não silencia e não suspende escalonamento. Cada mudança gera atualização de e-mail.

**[DECIDIDO 2026-09-11]** Frontend somente consulta histórico; avaliação/correção exclusivamente no desktop por usuário logado autorizado, inclusive ocorrências de turnos anteriores. Correção exige justificativa; preservar antes/depois/autor/horário e detectar conflito por versão antes de sobrescrever. **[PENDENTE]** Escopo web dos demais perfis além de ADMIN/SUPORTE. Backend atual não oferece os novos papéis e SUPORTE não acessa as listas de unidades analisadas: planejar autorização específica, sem liberação global de cadastros.

## Operação offline e e-mail

**[DECIDIDO 2026-09-11]** Primeiro login humano exige autenticação online. Offline-first: sessão já iniciada continua consultando/avaliando sem internet, mesmo com JWT online expirado. Ao reconectar com token expirado, exigir relogin na interface sem interromper monitoramento, sincronização ou envio de e-mails. Monitoramento iniciado após login online continua offline na sessão atual; após reiniciar Windows, aguarda novo login online Vision; fechar janela mantém execução em bandeja. Logout encerra monitoramento e bloqueia retomada inclusive após reboot até novo login online. Desconexão habitual de 24 horas não é limite de validade da aquisição.

**[DECIDIDO 2026-09-11]** Conta corporativa Outlook existente, lista única de SMS, configurada por ADMIN/SUPORTE. Online: e-mail no registro inicial e em cada marco, com foto/unidade/câmera/zona/horário/duração, além de atualizações de revisão. Offline: fila persistente; ao reconectar, resumo por ocorrência dos registros/fotos acumulados. Transporte e envio não podem depender de novo login humano.

**[INFERÊNCIA]** Recomenda-se identidade de dispositivo para ingestão e envio de e-mail pelo backend, preservando credencial corporativa centralizada. Isso requer novo contrato; não presumir que JWT humano expirado, endpoint de recuperação de senha ou WebSocket de telemetria atendam ao Vision.

**[PENDENTE]** Autorização Outlook/SMTP/Graph, provisionamento do agente, revogação remota, limite de anexos e divisão de resumo, comportamento da fila após logout explícito e cofre compartilhado e exclusividade entre sessões Windows.

## Histórico no frontend

**[DECIDIDO 2026-09-11]** O frontend será alimentado pelo backend, nunca acessará SQLite ou câmera local diretamente. Mostrar ocorrência, registros escalonados, fotos, duração, unidade/câmera/zonas, situação observada, avaliação e auditoria, com última sincronização. Dados ausentes/desatualizados não significam ausência de risco.

**[INFERÊNCIA]** Proposta de tela integrada ao shell existente: lista paginada, filtros por unidade/câmera/período/situação/avaliação e detalhe com linha do tempo e foto destacada. Usar padrões existentes do GeoPetro IO, sem nova identidade visual. Rotas web, DTOs e menu ainda não definidos.

## Persistência e aceite

**[DECIDIDO 2026-09-11]** Retenção indefinida de registros e fotos, local e remoto, sem exclusão automática por idade. Alertar espaço baixo; disco cheio não para detecção/som, mas falha de gravação deve ficar explícita. Sincronizar não autoriza apagar cópia local. Não aplicar ao Vision a retenção de cinco anos definida para telemetria.

**[PENDENTE]** Dimensionar armazenamento/backup/arquivamento e infraestrutura; retenção indefinida exige capacidade expansível. Se o disco impedir também gravação do evento, sinalizar perda, sem prometer recuperação durável de dado que não foi escrito.

**[DECIDIDO 2026-09-11]** Aceite: 5 s e marcos 1/3/7/15 min com fotos relacionadas; zonas sobrepostas sem duplicação; critérios 3 s/5 s de fim/perda; revisão auditada sem silenciar; logout persistente; reboot sem captura até novo login online; reconexão e resumo sem login humano; histórico no Front sem vídeo remoto; nenhum descarte automático por retenção.

Contrato transversal e pendências técnicas: [contrato Vision](../contracts/geopetro-vision.md).
## Fechamento da entrevista — 11/09/2026

**[DECIDIDO 2026-09-11]** Número de câmeras cadastrado manualmente, sem valor fixo quatro; quatro é somente previsão inicial do piloto. Câmeras fixas, mesma LAN, vídeo ao vivo por IP/RTSP, dia e noite em preto e branco. Cadastro por IP/porta/usuário/senha e URL RTSP manual alternativa. Marca/modelo ainda desconhecidos; usuário disponibilizará câmera IP ao vivo para validação acompanhada, sem necessidade de gravações prévias.

**[DECIDIDO 2026-09-11]** Identificar pessoa/cabeça e depois verificar capacete na cabeça. Cores de capacete variadas; capacete carregado/pendurado e boné/capuz sem capacete não atendem. Cabeça encoberta/ilegível é visibilidade insuficiente, não ausência automática. Foto inteira com destaque da pessoa/não conformidade e unidade, câmera, zona, data/hora e duração.

**[DECIDIDO 2026-09-11]** Tempos por zona ajustáveis por ADMIN/SUPORTE: padrões 5 segundos de confirmação, 3 de encerramento e 5 de perda de visibilidade. Sobreposição usa menor confirmação, sem duplicar ocorrência por pessoa/câmera, registrando zona acionadora. Escalonamento é fixo em intervalos 1/2/4/8 minutos desde início da detecção (marcos totais 1/3/7/15), sem opção de editar a sequência.

**[DECIDIDO 2026-09-11]** Turnos por unidade com nome, dias e início/fim, inclusive cruzando meia-noite; zona pode ter múltiplos turnos ou Sempre ativa. Configuração exclusivamente desktop por ADMIN/SUPORTE. Início da obrigatoriedade começa confirmação para pessoa já presente; continuidade entre turnos mantém ocorrência/contagem. Fim da obrigação encerra som/escalonamento com motivo Monitoramento da zona encerrado por horário, sem afirmar conformidade. Se outra zona sobreposta aplicável continua obrigatória, a ocorrência permanece. Editar zona/turno encerra ocorrência afetada como Configuração alterada e reavalia com nova versão.

**[DECIDIDO 2026-09-11]** Front GeoPetro IO é simplificado: exclusivamente consulta histórico/fotos/avaliações sincronizados. Sem avaliação/correção/configuração de turnos/zonas ou vídeo remoto para qualquer papel. Avaliação/correção exclusivamente no desktop, com usuário autorizado logado, inclusive ocorrências antigas. Justificativas e histórico de autor/horário/valores/versões preservados. ADMIN e SUPORTE consultam todas as unidades pela web. Cada desktop continua limitado à unidade vinculada.

**[DECIDIDO 2026-09-11]** Falhas de câmera ou IA somente na tela/logs; não enviar e-mail de falha ao SMS. E-mails por não conformidade/escalonamento/revisão e resumos de backlog permanecem conforme definido. Fluxo de configuração inicial: selecionar unidade, configurar turnos, cadastrar câmeras/zonas, por ADMIN/SUPORTE.

**[PENDENTE]** Fuso/configuração temporal da unidade; precedência de encerramento/perda distintos em sobreposições e confirmação maior que marco de escalonamento; limite de anexos; identidade/provisionamento do agente e ator offline; retorno de tracking; início após reboot resolvido: exige login online antes de capturar; configuração offline; infraestrutura de armazenamento/backup indefinido. Nenhuma dessas pendências autoriza parar monitoramento por mera expiração JWT. Entrevista encerrada; nenhuma funcionalidade implementada nesta entrega.
## Decisão final de sessão e executor — revisão 11/09/2026

**[DECIDIDO 2026-09-11]** Esta decisão substitui a previsão anterior de retomada automática após reboot offline. Monitoramento somente inicia após login online autorizado no Vision, inclusive depois de reiniciar Windows. Bloquear tela mantém a captura; trocar usuário Windows ou encerrar sessão Windows para a captura. Fechar janela mantém execução na conta atual. Logout Vision bloqueia a instalação inteira até qualquer usuário autorizado fazer novo login online.

**[DECIDIDO 2026-09-11]** Cada pessoa tem sua conta Windows; unidade/câmeras são configuração compartilhada de todos os usuários daquele computador. Sessão humana não é compartilhada. Executor separado da UI na sessão atual, sem serviço Windows permanente de monitoramento; uma captura ativa por instalação.

**[DECIDIDO 2026-09-11]** SUPORTE/ADMIN seleciona unidade consultando GeoPetro IO dentro do próprio app desktop. Não haverá liberação manual em portal ou cadastro externo. Ao salvar vínculo, app obtém automaticamente credencial técnica da instalação; mecanismo remoto ainda precisa de contrato/implementação. Essa credencial permite transporte independente do token humano durante execução, mas não substitui login exigido para iniciar monitoramento ou usar interface.

**[PENDENTE]** Cofre compartilhado entre contas Windows, rotação/revogação da credencial técnica e comportamento do transporte após logoff/logout; não prometer envio local com todos os processos encerrados nem reintroduzir serviço permanente implicitamente. Nenhum endpoint/papel/código alterado nesta entrega documental.