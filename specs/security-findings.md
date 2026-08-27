# Achados de Segurança — GeopetroIO

> Levantamento por engenharia reversa · 2026-08-26 · ver [convenção de marcação](README.md#convenção-de-marcação)
>
> Documento separado de [`technical-debt.md`](technical-debt.md) por decisão da equipe: estes itens
> eram exploráveis em produção por usuários já autenticados.

## Sumário

| ID | Achado | Severidade | Status |
|---|---|---|---|
| [SEC-001](#sec-001--bypass-de-autorização-por-rota-duplicada) | Bypass de autorização por rota duplicada | **Crítica** | ✅ **Corrigido e depois eliminado** |
| [SEC-002](#sec-002--apiregionais-sem-restrição-de-role) | `/api/regionais/**` sem restrição de role | **Crítica** | ✅ **Corrigido 2026-08-26** |
| [SEC-003](#sec-003--usuáriosme-exige-admin) | `/usuarios/me` exige ADMIN | **Alta** (funcional) | ✅ **Corrigido 2026-08-26** |
| [SEC-004](#sec-004--segredo-jwt-padrão-no-código) | Segredo JWT padrão no código | **Alta** | ✅ **Corrigido 2026-08-26** |
| [SEC-005](#sec-005--senha-smtp-em-texto-puro) | Senha SMTP em texto puro no banco | Média | ✅ **Eliminado** — módulo removido |
| [SEC-006](#sec-006--credencial-mysql-no-histórico-do-git) | Credencial MySQL no histórico do Git | **Alta** | ⏳ **Aberto — ação humana** |
| [SEC-007](#sec-007--senha-de-banco-em-texto-plano-versionada) | Senha de banco dev versionada | Média | ⏳ Aberto |
| [SEC-008](#sec-008--token-não-revogável-e-desacoplado-do-estado-do-usuário) | Token não revogável | Média | ⏳ Requer decisão |
| [SEC-009](#sec-009--broker-mqtt-sem-autenticação) | Broker MQTT sem autenticação | Média | ⏳ Antes do novo serviço |
| [SEC-010](#sec-010--observações-sem-controle-de-acesso) | Observações sem controle de acesso | Média | ✅ **Eliminado** — módulo removido |

**[FATO]** Das 10 falhas encontradas, **6 já não existem**: 4 foram corrigidas no código e 2 saíram
junto com os módulos removidos. Restam 4, sendo uma de ação puramente humana (SEC-006).

---

## Correções aplicadas em 2026-08-26

Build e suíte verificados após as alterações: **43 testes passando**, incluindo o `contextLoads()` que
sobe o contexto Spring completo.

### SEC-001 · rotas duplicadas protegidas — e depois eliminadas

**Correção inicial:** os caminhos sem `/api` passaram a exigir as **mesmas roles** dos caminhos com
`/api`. As rotas foram **protegidas, não removidas**, porque
[OQ-024](open-questions.md#oq-024--rotas-duplicadas-sem-api-têm-consumidor-legado) seguia sem resposta
— fechando a falha sem quebrar consumidores legados.

**Eliminação definitiva:** os quatro controllers com mapeamento duplo eram exatamente
`ProcessoController`, `AnotacaoController`, `AnotacaoRootController` e `ObservacaoController`. Com a
remoção dos módulos `processo` e `observacao` na mesma data, **a falha deixou de existir na raiz** —
não há mais nenhum controller com mapeamento duplo no sistema.

### SEC-002 · regionais com controle de acesso

Leitura liberada aos perfis internos; escrita restrita a `ADMIN`:

```java
.requestMatchers(HttpMethod.GET, "/api/regionais/**")
.hasAnyRole("INTERNO", "CIMENTACAO", "ADMIN")
.requestMatchers("/api/regionais/**")
.hasRole("ADMIN")
```

**Por que não apenas `ADMIN` em tudo:** as telas de Setor e Unidade/Sonda — acessíveis a `INTERNO` e
`CIMENTACAO` — precisam **listar** regionais para popular seus selects.

### SEC-003 · autoatendimento liberado

A regra de `/usuarios/me` foi declarada **antes** da regra genérica (a ordem é significativa):

```java
.requestMatchers("/usuarios/me", "/usuarios/me/**").authenticated()
.requestMatchers("/api/empresas/**", "/usuarios/**", "/api/usuarios/**").hasRole("ADMIN")
```

### SEC-004 · segredo JWT sem valor padrão

1. `JwtTokenAdapter` — removido o default do `@Value`; construtor lança `IllegalStateException` se o segredo vier vazio.
2. `application.properties` — removido o valor literal (este arquivo vale para **todos** os perfis).
3. `application-dev.properties` — segredo de desenvolvimento isolado no perfil dev, sobrescrevível por `JWT_SECRET`.

⚠️ **Impacto operacional:** um deploy que **não** ative o perfil `prod` e **não** defina `JWT_SECRET`
agora **falha ao subir**. Intencional — antes subia silenciosamente com o segredo do repositório.

---

## Falhas eliminadas por remoção de módulo

### SEC-005 · senha SMTP em texto puro

**[FATO]** `ConfiguracaoEmailEntity.senha` era gravada em texto puro no MySQL. A API não expunha o
valor (retornava `senhaConfigurada: boolean`) e o endpoint era `ADMIN`-only, mas em repouso estava
aberta — inconsistente com o BCrypt usado nas senhas de usuário.

✅ **Eliminado** com a remoção do módulo `quimico` em 2026-08-26.

⚠️ **Ação residual:** a tabela `configuracoes_email` **permanece no banco** com a senha em texto puro.
Se a conta SMTP ainda for usada em outro lugar, **rotacione a senha**. Ver o script de limpeza em
`Backend-Sonda-Geopetro-IO/db/cleanup/2026-08-26-remove-quimico.sql`.

### SEC-010 · observações sem controle de acesso

**[FATO]** `ObservacaoService` não aplicava nenhum filtro por setor ou regional — diferente de
`ProcessoService`. Qualquer usuário que alcançasse o endpoint lia, editava e excluía observações de
qualquer setor.

✅ **Eliminado** com a remoção do módulo `observacao` em 2026-08-26.

⚠️ **Lição preservada:** a assimetria era acidental, não deliberada. Se um novo domínio com escopo por
setor nascer, o filtro de acesso deve estar na spec antes do código —
[RN-014](business-rules.md#rn-014--observações-sem-controle-de-acesso--removida).

---

## Falhas em aberto

## SEC-006 · Credencial MySQL no histórico do Git

**Severidade: Alta** · Braserv-Horus-Desktop · ⏳ **Ação humana necessária**

**[FATO]** `src/main/resources/application.properties`, versionado **desde o commit inicial**, contém
um bloco Spring Boot com `spring.datasource.password` em texto plano, usuário `root`, banco
`braservone`.

O arquivo é **inerte em runtime** — o projeto não depende de Spring Boot, Spring Data JPA nem do
driver MySQL. **[INFERÊNCIA]** É resíduo de copy-paste de outro projeto.

### Impacto

A credencial está no **histórico do Git**, não apenas no working tree. Remover o arquivo agora não a
remove do histórico. **Deve ser tratada como comprometida.**

O banco `braservone` não tem relação identificada com o GeopetroIO —
[OQ-020](open-questions.md#oq-020--a-credencial-do-banco-braservone-ainda-é-válida).

### Correção proposta

1. **Rotacionar a credencial** — primeiro e independente do resto.
2. Remover o arquivo do projeto (é inerte).
3. Avaliar reescrita de histórico (`git filter-repo`), ponderando contra o custo de reescrever um repo compartilhado.

---

## SEC-007 · Senha de banco em texto plano versionada

**Severidade: Média** · Backend-Sonda

**[FATO]** `application-dev.properties` traz `spring.datasource.password=${DB_PASSWORD:<literal>}` —
um default em texto plano versionado.

Menos grave que SEC-006 por ser credencial de desenvolvimento local (`localhost:3306`), mas o padrão é
o mesmo e o valor pode ter sido reutilizado.

**Correção proposta** · remover o default, exigindo `DB_PASSWORD` também em dev.

**Não corrigido nesta rodada** para não quebrar o ambiente local da equipe sem aviso.

---

## SEC-008 · Token não revogável e desacoplado do estado do usuário

**Severidade: Média** · Backend-Sonda · ⏳ Requer decisão de negócio

**[FATO]**
- Sem refresh token, sem endpoint de logout, sem blacklist. Token vazado vale até expirar (1h).
- `JwtAuthenticationFilter` extrai as roles **do próprio token**, sem reconsultar o banco.

### Impacto

Desativar um usuário (`PATCH /usuarios/{username}/desativar`) **não tem efeito imediato** — ele
continua acessando com o token vigente até a expiração. O mesmo vale para remoção de roles.

**[PENDENTE]** Aceitável dado o TTL de 1h, ou é necessária revogação imediata? Se houver requisito de
desligamento imediato de acesso (demissão, incidente), o modelo atual não atende.
Ver [OQ-022](open-questions.md#oq-022--revogação-imediata-de-acesso-é-requisito).

---

## SEC-009 · Broker MQTT sem autenticação

**Severidade: Média** · Desktop-Sonda + futuro Backend-Telemetria

**[FATO]** O Desktop-Sonda conecta ao broker **sem credenciais**. As propriedades `mqtt.username` e
`mqtt.password` do Backend-Sonda estavam vazias — e saíram junto com o consumidor removido.

### Impacto

Qualquer host com acesso de rede ao broker pode **publicar telemetria forjada** em
`telemetria/{qualquer-unidade}/batch` ou **assinar e ler** toda a telemetria da frota.

Hoje o impacto é contido porque **nada consome o broker** — o consumidor no-op foi removido e o
Backend-Telemetria ainda não existe. **Isso muda no momento em que o novo serviço entrar em produção.**

### Correção proposta

Definir autenticação no broker **antes** de o Backend-Telemetria entrar em produção. É a janela ideal:
o consumidor será escrito do zero e pode já nascer autenticado.
Ver [`mqtt-telemetria.md`](contracts/mqtt-telemetria.md) e
[OQ-023](open-questions.md#oq-023--qual-broker-mqtt-será-usado-em-produção).

---

## Plano de correção

| Ordem | Item | Estado |
|---|---|---|
| 1 | SEC-006 — rotacionar credencial `braservone` | ⏳ **Pendente — ação humana**, independente de código |
| 2 | SEC-001, SEC-002, SEC-003, SEC-004 | ✅ Corrigidos em 2026-08-26 |
| 3 | SEC-005, SEC-010 | ✅ Eliminados com a remoção dos módulos |
| 4 | **Testes de `SecurityConfig`** | ⏳ **Pendente** — as correções não têm rede de proteção |
| 5 | SEC-009 | ⏳ Antes de o Backend-Telemetria entrar em produção |
| 6 | SEC-007, SEC-008 | ⏳ Requerem decisão |
| 7 | Rotacionar senha SMTP se a conta ainda for usada | ⏳ Ver SEC-005 |

### Próximo passo recomendado

**Testes de integração do `SecurityConfig`.** As correções aplicadas não têm rede de proteção: uma
alteração futura na ordem dos `requestMatchers` reintroduz qualquer uma delas silenciosamente. A ordem
das regras é significativa e não é óbvia ao ler o código.

Casos mínimos sugeridos, ajustados ao escopo atual:
- `CLIENTE` recebe `403` ao fazer `POST`/`DELETE` em `/api/regionais`
- `INTERNO` recebe `200` ao fazer `GET` em `/api/regionais`
- `INTERNO` recebe `200` em `PATCH /usuarios/me/senha` e `403` em `PATCH /usuarios/{outro}`
- `CLIENTE` recebe `403` em `/api/setores` e `/api/unidades-sondas`
- Contexto **falha ao subir** sem `security.jwt.secret`

**[FATO]** Hoje não existe nenhum teste HTTP no repositório — seria a primeira classe do tipo, e
exigiria adicionar `spring-boot-starter-test` ao módulo `security`
([DT-007](technical-debt.md#dt-007--ausência-de-testes-em-áreas-críticas)).
