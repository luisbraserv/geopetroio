# Recuperação de senha por e-mail — OQ-021

**[DECIDIDO 2026-09-05]** Autoatendimento por e-mail, restrito à identidade.
SMTP não é canal de alarmes. A regra de senha continua RN-061.

## Contrato da entrega

**[INFERÊNCIA — escolhas técnicas]**

- `POST /api/auth/recuperacao-senha` recebe `{ email }` e retorna 202 com a mesma
  mensagem para conta existente, ausente ou desativada. Consulta/envio executam
  em fila limitada, fora da resposta HTTP. Serviço não configurado retorna 503.
- Link aleatório de 256 bits, uso único, expiração em 30 minutos. O banco guarda
  somente SHA-256 do token, com um registro por usuário. Nova emissão substitui
  o link anterior; abertura do link não consome o token.
- `POST /api/auth/recuperacao-senha/confirmar` recebe token, novaSenha e
  confirmacaoSenha. Transação com bloqueio por usuário consome o token e altera
  a senha atomicamente. Conta deve continuar ativa e com a mesma senha/e-mail
  da emissão. Troca normal da senha ou alteração do e-mail invalida o link.
- Mesma regra de senha do cadastro, confirmação obrigatória e senha diferente da
  atual. Falha de validação não consome o link. Resposta de link inválido/expirado
  não identifica a conta. Não autentica automaticamente após a troca.
- Envio limitado por endereço informado (3 solicitações/15 minutos), com teto
  global de 60 solicitações/minuto por instância; fila de 100 itens e cooldown
  persistido de 60 segundos por conta. Limites em memória reiniciam com o processo.
- Link usa URL pública configurada, nunca o Host recebido. Token no fragmento
  `#token=...`, retirado da barra pelo frontend e mantido somente em memória.
- E-mail de confirmação da troca, sem senha/token. Falha nesse aviso não desfaz
  a senha já alterada. Nenhum token ou destinatário é registrado em log.
- Tokens JWT existentes mantêm a validade definida no sistema (até 1 hora);
  revogação individual de sessão continua fora desta entrega.

## Configuração e implantação

**[FATO 2026-09-07]** SMTP também pode ser configurado por ADMIN em
**Configurações → E-mail**. A configuração salva prevalece sobre o ambiente e
passa a valer nos próximos envios, sem reinício. Credencial criptografada, chave
persistida separadamente e teste de conexão descritos em
[`configuracao-smtp.md`](configuracao-smtp.md).

SMTP desabilitado por padrão. Configurar `PASSWORD_RECOVERY_ENABLED`,
`PASSWORD_RECOVERY_FRONTEND_URL` (origem HTTPS; HTTP apenas localhost para dev),
`PASSWORD_RECOVERY_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`.
STARTTLS obrigatório por padrão, com timeouts de 5 segundos; variáveis permitem
SMTP local de teste. Não versionar credenciais.

As variáveis estão expostas em `deploy/vm1-transacional/docker-compose.yml` e
documentadas no `.env.example` dessa VM. A URL aceita somente a origem, sem caminho,
query ou fragmento. Os limites de envio são por instância, com cooldown adicional
persistido por conta; não há limitação por IP nesta entrega.

DTOs omitem dados sensíveis de `toString()`. Os loggers de leitura de corpos HTTP
e resolução de exceções ficam em INFO, evitando valores rejeitados da validação
em logs DEBUG herdados.

Migration nova `V2026.09.06.3__recuperacao_senha.sql`. Não altera scripts anteriores.
Esta entrega não envia mensagens reais nem faz deploy. Configuração SMTP e teste
de entrega com a infraestrutura corporativa permanecem necessários para ativação.

## Verificação — 2026-09-06

- Backend: 139 testes únicos aprovados, incluindo 13 de persistência/serviço,
  2 do remetente simulado e 14 da cadeia HTTP de identidade.
- MySQL 8.4 descartável: 6 testes Flyway aprovados. Base nova, base existente,
  repetição de migrations, unicidade do hash, tokens consumidos e chave estrangeira.
  Nenhuma alteração no MySQL de desenvolvimento.
- Frontend: 311 testes aprovados, incluindo 6 do fluxo de recuperação. Build
  aprovado com os avisos de orçamento existentes (bundle inicial e CSS do simulador).
- Navegador Edge: link do login, solicitação, confirmação, remoção do fragmento e
  layout em desktop/celular verificados com API simulada, sem erros de execução.
- Nenhum e-mail real enviado. JWTs já emitidos continuam sujeitos à validade
  configurada e à verificação de conta ativa.

Referências: [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
e [Spring Boot — Sending Email](https://docs.spring.io/spring-boot/reference/io/email.html).
