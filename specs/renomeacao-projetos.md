# Renomeação dos Projetos — Spec

> **[DECIDIDO 2026-09-07]** · Spec-first · **Não executada**
>
> Acompanha [`features/cards-configuraveis.md`](features/cards-configuraveis.md): o nome muda porque
> o produto mudou, não por estética.

## 1. Por que renomear

**[DECIDIDO 2026-09-07]** Com os cards configuráveis, o Desktop deixa de ser o app da sonda e passa a
ser o agente de borda de **qualquer unidade cadastrada** — sonda, unidade de bombeio,
slickline/wireline, cimentação ou UCAQ.

O nome `Desktop-Sonda-Geopetro-IO` passaria a mentir sobre o escopo. E o mesmo vale para os outros: o
Backend nunca foi só de sonda — o módulo sempre se chamou `unidade-sonda` justamente porque a entidade
sempre foi mais ampla ([RN-065](business-rules.md#rn-065--unidadesonda-tem-tipo)).

## 2. O mapa

| Hoje | Passa a ser |
|---|---|
| `Backend-Sonda-Geopetro-IO` | **`Geopetro-Backend`** |
| `Front-Sonda-Geopetro-IO` | **`Geopetro-Front`** |
| `Desktop-Sonda-Geopetro-IO` | **`Geopetro-Desktop`** |
| `Backend-Telemetria-Sonda-Geopetro-io` | **`Geopetro-Telemetria`** |
| `Braserv-Horus-Desktop` | *(inalterado)* |

**[DECIDIDO 2026-09-07]** A Telemetria entra na renomeação pela mesma razão: também carrega "Sonda" no
nome e também deixa de ser exclusiva de sonda — passa a receber série de qualquer tipo de unidade.

**Horus fica de fora.** É produto distinto, com duplicação aceita de propósito
([DT-010](technical-debt.md#dt-010--duplicação-entre-os-dois-desktops)). Renomeá-lo sugeriria uma
convergência que não foi decidida.

## 3. O que a renomeação alcança

**[FATO 2026-09-07]** Levantado por varredura, excluindo `.git`, `target`, `node_modules` e `dist`:

| Nome | Arquivos que o citam |
|---|---|
| `Backend-Sonda-Geopetro-IO` | 28 |
| `Front-Sonda-Geopetro-IO` | 19 |
| `Desktop-Sonda-Geopetro-IO` | 18 |
| `Backend-Telemetria-Sonda-Geopetro-io` | 12 |

Fora das specs, os pontos que **quebram se não forem trocados**:

| Categoria | Onde |
|---|---|
| Build | `app/pom.xml` (`<name>`, `<finalName>`), `Desktop/pom.xml`, `angular.json` |
| Deploy | `deploy/vm1-transacional/docker-compose.yml`, `vm2-telemetria/docker-compose.yml`, `mosquitto.conf`, `deploy/README.md` |
| Empacotamento | `Desktop/scripts/package-app-image.ps1`, `package-installer-exe.ps1` |
| Config de app | `application.properties` (`spring.application.name`), `application.properties` de teste |
| IDE | `.vscode/launch.json`, `.vscode/tasks.json`, `.project` |
| API | `OpenApiConfig` da Telemetria |

⚠️ **Um comentário dentro de uma migration já aplicada cita o caminho antigo**
(`V2026.09.05__simulador_pocos.sql`). **Não editar**: `validate-on-migrate` está ligado e alterar o
conteúdo de um script aplicado quebra o startup
([DT-002](technical-debt.md#dt-002--estratégias-conflitantes-de-evolução-de-schema)). O comentário
desatualizado é o preço correto a pagar.

## 4. O que **não** muda

**[DECIDIDO 2026-09-07]** A renomeação é de **pastas, artefatos e rótulos**. Não toca:

| Item | Por quê |
|---|---|
| Pacotes Java (`com.geopetro.*`, `com.braservpetroleo.telemetria.geopetroio.*`) | Refatoração de pacote é mudança de código em centenas de arquivos, com risco desproporcional ao ganho |
| `com.example.demo.*` no Desktop | Já era nome de scaffold; trocar agora misturaria duas mudanças |
| Nomes de tabela, coluna e `dispositivoId` | São contrato de dados. `unidades_sondas` continua `unidades_sondas` |
| Módulo Maven `unidade-sonda` | idem |
| Nome do banco (`geopetro_io`) | idem |
| Imagens Docker já publicadas | Tag nova, sem reescrever histórico de registry |

⚠️ **Renomear pasta e pacote no mesmo commit tornaria o diff ilegível** e impediria que o Git
reconhecesse os arquivos como renomeados. Se os pacotes forem renomeados um dia, que seja em commit
próprio.

## 5. Riscos

⚠️ **O caminho já é longo demais.** `DT-004` registra falha de `git diff` com *"Filename too long"* em
294 caracteres. Os nomes novos são **mais curtos** — `Geopetro-Backend` tem 16 caracteres contra 24 de
`Backend-Sonda-Geopetro-IO`. A renomeação **alivia** a manifestação 3 do DT-004, sem resolvê-la.

⚠️ **O OneDrive já corrompeu um `.git` neste workspace** e, durante estas sessões, falhou duas vezes ao
dar `stat` em arquivos. Renomear quatro diretórios de uma vez é exatamente a operação de movimentação
em massa que mais expõe o sincronizador.

**Mitigação:** commitar tudo antes, renomear com `git mv` (que preserva o histórico como *rename*),
e conferir `git status` antes de qualquer outra alteração.

⚠️ **A pasta do Desktop instalado (`%USERPROFILE%\.geopetro-io\`) não muda** — mudá-la faria cada
instalação em campo perder banco local e configuração. O nome do diretório de dados é estado do
usuário, não identidade do projeto.

## 6. Ordem sugerida

1. **Commitar o trabalho pendente.** Renomear com working tree sujo mistura rename e conteúdo no mesmo diff
2. `git mv` dos quatro diretórios
3. Trocar as referências das categorias da §3 — build, deploy, empacotamento, config, IDE
4. Compilar os quatro projetos e subir o Compose de dev
5. Atualizar as specs, que citam os caminhos antigos com frequência

⚠️ Fazer isto **antes** de implementar os cards configuráveis: os arquivos novos já nascem no lugar
certo, e o diff da feature não se mistura com o da renomeação.
