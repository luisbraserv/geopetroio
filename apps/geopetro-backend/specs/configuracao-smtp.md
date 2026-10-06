# Configurações · E-mail

**[DECIDIDO 2026-09-07]** Configurar o SMTP corporativo na interface, pelo menu
**Configurações**, com menu horizontal e aba **E-mail**.

## Interface e acesso

- Item Configurações na seção Administração da barra lateral.
- `/app/configuracoes` redireciona para `/app/configuracoes/email`.
- **[INFERÊNCIA — acesso administrativo]** Menu e rota disponíveis somente para
  ADMIN. O backend exige ADMIN em todos os métodos de `/api/configuracoes/**`.
- Servidor, porta, STARTTLS/TLS/relay sem TLS, autenticação, usuário, senha,
  remetente, endereço público do sistema e ativação do envio.
- STARTTLS usa porta sugerida 587; TLS usa 465; relay usa 25. Portas personalizadas
  são preservadas ao mudar o tipo de segurança.
- Senha vazia preserva a credencial atual. Substituição é opcional; remoção exige
  marcar explicitamente “Remover a senha cadastrada ao salvar”.
- A configuração pode ser salva incompleta enquanto desativada. Para ativar,
  exige conexão configurada, credenciais quando houver autenticação, remetente
  válido e origem HTTPS do sistema (HTTP apenas localhost).
- Testar conexão usa os dados **salvos**. Alterações pendentes desabilitam o botão.
  O teste conecta/autentica no servidor, mas não envia e-mail nem comprova entrega.

## Contrato e persistência

| Método e rota | Comportamento |
|---|---|
| GET `/api/configuracoes/email` | Configuração e indicador `passwordConfigured`, nunca a senha |
| PUT `/api/configuracoes/email` | Substituição versionada da configuração; `password` vazio preserva e `clearPassword` remove |
| POST `/api/configuracoes/email/teste` | Testa conexão salva; 200 sucesso, 400 configuração inválida, 502 falha SMTP |

Campos: `enabled`, `host`, `port`, `transport` (STARTTLS/TLS/NONE), `auth`,
`username`, `from`, `frontendUrl`, `version`. PUT inclui `password` e
`clearPassword`; GET/PUT de resposta incluem apenas `passwordConfigured`.

Tabela única `configuracao_smtp`, criada por
`V2026.09.07.1__configuracao_smtp.sql`. A versão impede sobrescrever edições
concorrentes (409); o banco restringe a um registro e portas entre 1 e 65535.
Não reutiliza as tabelas antigas do módulo químico.

Sem registro salvo, usa as variáveis de ambiente já existentes. Após salvar,
o banco prevalece inclusive quando o envio é desativado. Recuperação de senha
consulta a configuração atual a cada envio, sem reiniciar o backend. Falhas na
leitura da configuração deixam a recuperação indisponível.

## Proteção da credencial

**[INFERÊNCIA — implementação]** AES-256-GCM, nonce aleatório de 96 bits, autenticação
de conteúdo e identificação de versão. A senha SMTP precisa ser recuperada para
autenticar no provedor, portanto é criptografada; senhas de usuários continuam BCrypt.
DTOs sensíveis omitem valores de `toString()`; falhas de conexão não expõem respostas
do provedor nem credenciais. A API nunca retorna a senha ou o ciphertext.

A chave é exclusiva do SMTP e fica fora do banco; não deriva de senhas ou JWT.
No desenvolvimento, é criada automaticamente em
`${user.home}/.geopetro/smtp-settings.key` no primeiro salvamento de uma senha.
`SMTP_SETTINGS_KEY_FILE` permite configurar outro local. A chave possui 32 bytes
aleatórios e acesso somente ao proprietário em sistemas com permissões POSIX.

Na VM transacional, o Dockerfile prepara `/app/secrets` para o usuário não
privilegiado da aplicação e o Compose mantém a chave no volume `smtp-secrets`.
**Backup/restauração precisa preservar tanto o banco quanto esse volume.**
Perder a chave exige recadastrar a senha SMTP. A leitura de uma senha existente
nunca gera automaticamente outra chave.

Opcionalmente, `SMTP_SETTINGS_ENCRYPTION_KEY` fornece 32 bytes em Base64 por
gestão externa de segredos e prevalece sobre o arquivo. Não versionar essa chave;
trocá-la exige recadastrar a credencial. Não usar `JWT_SECRET`.

STARTTLS é obrigatório quando selecionado; TLS verifica o nome do servidor.
Autenticação sem TLS é recusada. Relay sem TLS pode ser usado sem credenciais.
Conexão, leitura e escrita têm timeout de 5 segundos.

Referência técnica:
[OWASP · Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).

## Validação

**[FATO 2026-09-07]** 154 testes do backend e 7 testes de migração MySQL aprovados;
318 testes do frontend aprovados. Build aprovado com os avisos existentes de
orçamento do bundle inicial e CSS do simulador. Compose validado. MySQL de teste
descartável, sem alterações no banco de desenvolvimento.

Testes cobrem preservação/substituição/remoção da senha, criptografia e alteração
indevida do ciphertext, chave ausente, reinício, versão concorrente, configuração
de transporte, integração com recuperação e acesso HTTP por role. Frontend cobre
edição, falha de leitura, conflito e teste com dados salvos.

Navegador Edge: menu, aba padrão, salvar, limpar campo de senha, testar conexão,
bloqueio de não administrador e formulário em desktop/celular. SMTP/API simulados
nessas verificações; nenhum e-mail real enviado ou deploy realizado.
