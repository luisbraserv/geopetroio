# Renomeação dos Projetos — Spec

> **[DECIDIDO 2026-09-07]** · ✅ **Executada em 2026-09-07**
>
> Acompanha [`features/cards-configuraveis.md`](../negocio/requisitos/cards-configuraveis.md): o nome mudou porque
> o produto mudou, não por estética.

## 1. Por que renomear

**[DECIDIDO 2026-09-07]** Com os cards configuráveis, o Desktop deixa de ser o app da sonda e passa a
ser o agente de borda de **qualquer unidade cadastrada** — sonda, unidade de bombeio,
slickline/wireline, cimentação ou UCAQ.

O nome antigo passaria a mentir sobre o escopo. E o mesmo valia para os outros: o Backend nunca foi só
de sonda — o módulo sempre se chamou `unidade-sonda` justamente porque a entidade sempre foi mais
ampla ([RN-065](../negocio/regras/business-rules.md#rn-065--unidadesonda-tem-tipo)).

## 2. O mapa

| Antes | Agora |
|---|---|
| `Backend-Sonda-Geopetro-IO` | **`Geopetro-Backend`** |
| `Front-Sonda-Geopetro-IO` | **`Geopetro-Front`** |
| `Desktop-Sonda-Geopetro-IO` | **`Geopetro-Desktop`** |
| `Backend-Telemetria-Sonda-Geopetro-io` | **`Geopetro-Telemetria`** |
| `Braserv-Horus-Desktop` | *(inalterado)* |

**[DECIDIDO 2026-09-07]** A Telemetria entrou na renomeação pela mesma razão: também carregava "Sonda"
no nome e também deixa de ser exclusiva de sonda — passa a receber série de qualquer tipo de unidade.

**Horus ficou de fora.** É produto distinto, com duplicação aceita de propósito
([DT-010](technical-debt.md#dt-010--duplicação-entre-os-dois-desktops)) e sem convergência prevista
([RN-096](../negocio/regras/business-rules.md#rn-096--o-horus-continua-separado)). Renomeá-lo sugeriria uma convergência
que não foi decidida.

## 3. O que foi trocado

**[FATO 2026-09-07]** `git mv` nos quatro diretórios, preservando o histórico como *rename*, mais
substituição das referências em **47 arquivos**:

| Categoria | Onde |
|---|---|
| Build | `app/pom.xml` (`<name>`, `<finalName>`), `apps/geopetro-desktop/pom.xml` (`artifactId`), `angular.json`, `package.json` |
| Deploy | `vm1-transacional/docker-compose.yml`, `vm2-telemetria/docker-compose.yml`, `mosquitto.conf`, `deploy/README.md`, `Dockerfile` do Front, `wrangler.toml` |
| Empacotamento | `scripts/package-app-image.ps1`, `scripts/package-installer-exe.ps1` — derivam o nome do jar do `artifactId` |
| Config | `application.properties` (`spring.application.name`) e o de teste do Desktop |
| API | `OpenApiConfig` da Telemetria |
| Fluxo local | `start-dev.cmd`, `.vscode/launch.json`, `.vscode/tasks.json` |
| Specs | As deste diretório e as de cada repositório |

⚠️ **Duas migrations ficam congeladas com o nome antigo, de propósito:**
`V2026.09.04__baseline.sql` e `V2026.09.05__simulador_pocos.sql` citam `Backend-Sonda` em comentários.
**Não editar**: `validate-on-migrate` está ligado e o Flyway guarda o *checksum* de cada script
aplicado — mudar uma vírgula num script já rodado derruba o startup com *checksum mismatch*
([DT-002](technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema)). Um comentário
desatualizado é o preço correto por um histórico de migrations confiável.

Elas são a **única** exceção no repositório: um `git grep` pelos nomes antigos hoje devolve só essas
duas linhas (fora as citações intencionais aqui e em [DT-004](technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git), que contrastam o antes com o depois).

## 4. O que **não** mudou

**[DECIDIDO 2026-09-07]** A renomeação foi de **pastas, artefatos e rótulos**. Não tocou:

| Item | Por quê |
|---|---|
| Pacotes Java (`com.geopetro.*`, `com.braservpetroleo.telemetria.geopetroio.*`) | Refatoração de pacote é mudança em centenas de arquivos, com risco desproporcional ao ganho |
| `com.example.demo.*` no Desktop | Já era nome de scaffold; trocar agora misturaria duas mudanças |
| Nomes de tabela, coluna e `dispositivoId` | São contrato de dados. `unidades_sondas` continua `unidades_sondas` |
| Módulo Maven `unidade-sonda` | idem |
| Nome do banco (`geopetro_io`) | idem |
| `%USERPROFILE%\.geopetro-io\` no Desktop instalado | Mudá-lo faria cada instalação em campo **perder banco local e configuração**. É estado do usuário, não identidade do projeto |

⚠️ **Renomear pasta e pacote no mesmo commit tornaria o diff ilegível** e impediria o Git de reconhecer
os arquivos como renomeados. Se os pacotes forem renomeados um dia, que seja em commit próprio.

## 5. O que aconteceu na execução

**[FATO 2026-09-07]** Três dos quatro `git mv` passaram de primeira. O do Backend falhou com
`Permission denied`: os **language servers de Java e Spring Boot do VS Code** seguravam `target/`,
`.logs/` e `.settings/` — todos gitignorados, mas o Windows não renomeia diretório com filho travado.

Encerrar os processos não bastou: o VS Code os reinicia em segundos e eles reindexam o workspace antes
da próxima tentativa. **Resolveu-se encerrando e renomeando na mesma invocação**, sem ida e volta.

⚠️ **Registro para a próxima vez que houver movimentação em massa neste workspace** — a renomeação de
pacote, se um dia vier, vai esbarrar no mesmo.

✅ **O caminho ficou mais curto**, o que **alivia** a manifestação 3 do
[DT-004](technical-debt.md#dt-004--risco-de-onedrive-sobre-repositórios-git): `git diff` falhava com
*"Filename too long"* em 294 caracteres. `Geopetro-Backend` tem 16 caracteres contra 24 de
`Backend-Sonda-Geopetro-IO` — oito a menos em **todo** caminho do repositório. Não resolve o problema,
que nasce da profundidade da árvore do OneDrive, mas afasta a fronteira.

## 6. A segunda passada — o que a primeira não alcançou

**[FATO 2026-09-07]** A primeira passada trocou **identificadores**: pastas, `artifactId`, imagens
Docker, caminhos em scripts. Passou ao largo dos **textos de produto** — o que a pessoa lê na tela.
Só apareceu ao **rodar o app**: a janela abria escrita `Sonda Geopetro IO - Desktop`, justamente no
projeto que deixou de ser só de sonda.

| Onde | Era | Ficou |
|---|---|---|
| Título da janela, tray, alerta de instância única, splash | `Sonda Geopetro IO` | `Geopetro Desktop` |
| `spring.application.name`, `app.title`, `<name>` do pom, rodapé do PDF | `Geopetro IO - Sonda` | `Geopetro Desktop` |
| Título do Swagger | `Backend Sonda Geopetro IO` | `Geopetro Backend` |
| Javadoc e comentários nos quatro projetos | `Backend-Sonda`, `Desktop-Sonda` | `Geopetro-Backend`, `Geopetro-Desktop` |

⚠️ **A lição não é sobre renomeação, é sobre verificação.** Nenhum teste falhou entre uma passada e
outra, e nenhum falharia: título de janela e texto de Swagger não são asserção de ninguém. A primeira
passada foi conferida por `git grep` de nomes de **pasta** — e um `git grep` só encontra o que se
pensou em procurar. O que expôs a falha foi abrir a janela e ler o que estava escrito nela.

É o mesmo padrão do `spring-boot-flyway` no mesmo dia: teste verde, aplicação quebrada.
Ver [DT-002](technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema).
