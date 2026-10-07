# GeopetroIO

O GeopetroIO reúne cadastro e monitoramento de sondas, aquisição de dados em campo, histórico de telemetria e simulação de operações de cimentação. Este repositório é um monorepo com seis aplicações. As [SPECs do sistema](specs/SDD/README.md) detalham regras de negócio e contratos; este README serve para entender o conjunto e iniciar o ambiente de desenvolvimento.

## Estrutura

```text
apps/        uma pasta por aplicação implantável
packages/    bibliotecas compartilhadas entre aplicações (vazio por ora)
deploy/      compose e scripts de implantação
specs/       SDD: regras de negócio, contratos e decisões
```

## As seis aplicações

| Aplicação | Papel |
|---|---|
| [Braserv-Core](apps/core/) | Cadastro organizacional e identidade da Braserv: usuários, empresas, regionais, setores, unidades, login e clientes de serviço. Os outros sistemas consomem o Core. |
| [Geopetro-Backend](apps/geopetro-backend/) | API Spring Boot de simulador e monitoramento. Usa o Braserv-Core para identidade e cadastros, persiste seus dados no MySQL e entrega o tempo real ao Front por WebSocket/STOMP. |
| [Geopetro-Front](apps/geopetro-frontend/) | Aplicação Angular para cadastro, monitoramento, alarmes, simuladores e relatórios. Consome as APIs do Backend. |
| [Geopetro-Desktop](apps/geopetro-desktop/) | Aplicação JavaFX instalada na unidade. Lê o CLP, mostra o painel local e publica telemetria por MQTT (histórico) e WebSocket/STOMP (tempo real). O alarme da estação funciona localmente. |
| [Geopetro-Telemetria](apps/geopetro-telemetria/) | Serviço Spring Boot que consome MQTT, grava séries no InfluxDB e oferece consultas de histórico ao Backend. |
| [Braserv-Horus-Desktop](apps/horus-desktop/) | Aplicação JavaFX de cimentação, apresentada como **GeoPetro IO - Cimentação**. Lê seu CLP, acompanha a bomba e gera carta de operação em PDF. É autônoma em relação às demais aplicações. |

O fluxo principal de dados é:

```text
Geopetro-Desktop --MQTT--> Mosquitto --> Geopetro-Telemetria --> InfluxDB
Geopetro-Desktop --WebSocket/STOMP--> Geopetro-Backend --WebSocket/STOMP--> Geopetro-Front
Geopetro-Front --REST--> Geopetro-Backend --REST--> Geopetro-Telemetria (consulta o InfluxDB)
              --REST--> Braserv-Core <--------> Geopetro-Backend
                            |                         |
                     MySQL/braserv_core       MySQL/geopetro_io
```

## Iniciar o ambiente completo no Windows

### Pré-requisitos

- Docker Desktop em execução, com `docker compose` disponível no PATH;
- JDK 21 (`java` no PATH), Node.js e npm;
- acesso à internet na primeira execução para baixar dependências Maven, Gradle, npm e imagens Docker;
- para leituras reais, CLPs acessíveis e configurados nos respectivos aplicativos Desktop.

Na raiz do repositório, execute em **Prompt de Comando** ou PowerShell:

```bat
start-dev.cmd
```

O script sobe **MySQL** em container se a porta 3306 estiver livre; caso já exista um MySQL local nessa porta, utiliza o serviço existente. Ele prepara os schemas `braserv_core` e `geopetro_io`, movendo com conferência os cadastros de uma base local anterior quando necessário. Também sobe **InfluxDB** e **Mosquitto** no Docker, instala as dependências do Front quando necessário e abre janelas separadas para **Braserv-Core**, **Backend**, **Telemetria** e **Front**. Ele libera as portas 8082, 8080, 8081 e 4200 encerrando processos que já estejam escutando nelas; salve o trabalho dessas aplicações antes de executá-lo. Se usar MySQL local, configure `DB_USERNAME` e `DB_PASSWORD` quando os padrões `root` / `bilzao90` não corresponderem.

Espere as verificações de saúde terminarem. A primeira compilação pode levar alguns minutos.

| Serviço | Endereço local |
|---|---|
| Front | <http://localhost:4200> |
| Braserv-Core / Swagger | <http://localhost:8082/swagger-ui.html> |
| Backend / Swagger | <http://localhost:8080/swagger-ui.html> |
| Telemetria / Swagger | <http://localhost:8081/swagger-ui.html> |
| InfluxDB | <http://localhost:8086> |
| Broker MQTT | `tcp://localhost:1883` |

Para iniciar **os dois aplicativos Desktop**, abra outros terminais na raiz do repositório:

```powershell
cd apps\geopetro-desktop
.\mvnw.cmd javafx:run
```

```powershell
cd apps\horus-desktop
.\gradlew.bat run
```

O Horus pode ser iniciado independentemente do ambiente web. O Desktop da sonda precisa de configuração da unidade e do CLP para mostrar leituras reais; sem CLP, a infraestrutura e as interfaces ainda podem ser desenvolvidas. O `start-dev.cmd` ativa o seed sintético de telemetria do perfil `dev` para exercitar o histórico sem um CLP.

Para parar Braserv-Core, Backend, Telemetria, Front e os containers, execute `stop-dev.cmd` na raiz. O comando preserva os volumes Docker. Feche os dois aplicativos Desktop separadamente. Veja [deploy/README.md](deploy/README.md) para a implantação nas VMs; o ambiente descrito aqui é de desenvolvimento.
