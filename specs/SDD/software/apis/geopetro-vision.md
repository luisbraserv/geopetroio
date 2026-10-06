# Contrato proposto — GeoPetro Vision → GeoPetro IO

**[DECIDIDO 2026-09-11]** Contrato transversal em especificação; endpoints/DTOs de ingestão e consulta ainda não implementados ou definidos. Não é permitido interpretar nomes conceituais abaixo como contrato HTTP existente.

## Fluxo

**[DECIDIDO 2026-09-11]** Vision executa localmente por unidade e publica registros/fotos/revisões em fila durável. Backend armazena e disponibiliza histórico ao Front; nenhum stream de vídeo ou comando remoto de câmera neste escopo. A fonte de unidades e login humano permanece o backend existente.

**[INFERÊNCIA]** Modelo proposto: InstallationBinding (installationId, unitId, geração); Occurrence (UUID, unidade/câmera, track/época local, início/fim/motivo); OccurrenceRecord (UUID, occurrenceId, ordinal, marco/duração, horário, foto); Evidence (UUID, recordId, hash, tamanho, estado); Review (UUID, occurrenceId, versão, avaliação, justificativa, ator, horário); Delivery (destinatários, lote/watermark, estado). Campos são conceituais até aprovação dos DTOs.

## Segurança e integridade

**[DECIDIDO 2026-09-11]** Sincronização e e-mail não dependem de novo login humano. Primeiro login humano online é obrigatório; usuário já autenticado continua consulta/avaliação offline. Na reconexão com token expirado, interface exige relogin, sem parar captura/transporte. ADMIN/SUPORTE atribuem unidade e consultam todo histórico. Respeitar concessões para os demais perfis.

**[INFERÊNCIA]** Propor credencial de dispositivo provisionada/revogável com acesso restrito à unidade, separada do JWT humano; validar vínculo no servidor, não confiar no unitId informado. Guardar segredos no cofre Windows/DPAPI; nunca no SQLite em texto puro. Foto consultada exige autorização no backend, sem URL pública por padrão. Reatribuição preserva unidade de origem dos registros anteriores.

**[PENDENTE]** Mecanismo de credencial, renovação/revogação, autorização das filas antigas após reatribuir unidade e efeito da desativação remota sobre captura. Não distribuir segredo HMAC do servidor nem reutilizar token humano expirado.

## Entrega e reconexão

**[INFERÊNCIA]** Transporte com retry e idempotência por installationId/evento/registro/foto/revisão. Confirmar metadados e arquivos separadamente; validar hash/tamanho; manter pendência até confirmação. Chave única occurrenceId/ordinal evita duplicação de marco. Não ordenar fatos por horário de chegada; preservar horários UTC e duração observada. Upload pode chegar fora de ordem.

**[DECIDIDO 2026-09-11]** Online: e-mail por registro e por avaliação. Reconexão: resumo dos pendentes por ocorrência, com fotos. Preservar horário do fato e informar atraso. Não excluir histórico local após confirmação remota.

**[INFERÊNCIA]** Backend deve coordenar lote de resumo com watermark para não enviar imediatamente um e-mail por registro recebido de um backlog. Novos registros ficam para lote seguinte/envio normal; retry mantém chave do lote. Usar ledger de entrega e reconciliação de resposta ambígua do provedor; não prometer exactly-once no Outlook. Foto indisponível deve ser informada sem bloquear silenciosamente todo o histórico.

**[PENDENTE]** Tamanho de lote/anexos, paginação e filtros HTTP, upload, mecanismo de versionamento/conflito de revisões locais sincronizadas, origem/validação do ator offline, storage remoto, método Outlook e estados de disponibilidade. Iniciar contrato de API e testes antes de implementar produtor/consumidor.

Feature e decisões de produto: [GeoPetro Vision](../../negocio/requisitos/geopetro-vision.md).
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