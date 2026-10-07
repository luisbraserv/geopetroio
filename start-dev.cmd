@echo off
setlocal EnableDelayedExpansion
title GeopetroIO - Ambiente de Desenvolvimento

REM ======================================================================
REM  GeopetroIO - sobe o ambiente completo de DESENVOLVIMENTO
REM
REM  Infraestrutura (Docker): MySQL, InfluxDB, Mosquitto
REM  Aplicacoes (nativas)    : Braserv-Core, Geopetro-Backend,
REM                            Telemetria, Frontend
REM
REM  As aplicacoes rodam nativamente, e nao em container, para permitir
REM  hot reload e debug pela IDE. Cada uma abre numa janela propria, com
REM  os logs a vista; a janela permanece aberta se o servico cair.
REM
REM  Para encerrar tudo: stop-dev.cmd
REM ======================================================================

set "RAIZ=%~dp0"
set "RAIZ=%RAIZ:~0,-1%"
set "COMPOSE=%RAIZ%\deploy\dev\docker-compose.yml"

REM Token fixo de desenvolvimento - precisa bater com o definido no compose.
set "INFLUX_TOKEN=dev-token-geopetro-local-0000000000"
set "INFLUX_URL=http://localhost:8086"
set "INFLUX_ORG=braserv"
set "INFLUX_BUCKET=telemetria"
set "MQTT_BROKER_URL=tcp://localhost:1883"
set "SPRING_PROFILES_ACTIVE=dev"
set "TELEMETRIA_SEED_HABILITADO=true"
set "TELEMETRIA_SEED_PONTOS_POR_VARIAVEL=28800"
if not defined DB_USERNAME set "DB_USERNAME=root"
if not defined DB_PASSWORD set "DB_PASSWORD=bilzao90"
if not defined CORE_CLIENTE_SEGREDO set "CORE_CLIENTE_SEGREDO=geopetro-dev-core-secret-2026-local-only"
if not defined CORE_SEGREDO_INICIAL_BACKEND set "CORE_SEGREDO_INICIAL_BACKEND=%CORE_CLIENTE_SEGREDO%"
set "PORTAS_APLICACOES=8082 8080 8081 4200"

set "FALHAS=0"

echo.
echo ======================================================================
echo   GeopetroIO - Ambiente de Desenvolvimento
echo ======================================================================
echo.

REM ---------------------------------------------------------------- 1/7
echo [1/7] Verificando pre-requisitos...

where docker >nul 2>&1
if errorlevel 1 (
    echo   [ERRO] Docker nao encontrado no PATH.
    echo          Instale o Docker Desktop e reabra este terminal.
    goto :erro_fatal
)

docker info >nul 2>&1
if errorlevel 1 (
    echo   [ERRO] O Docker esta instalado mas nao esta em execucao.
    echo          Abra o Docker Desktop, aguarde iniciar e rode novamente.
    goto :erro_fatal
)
echo   Docker ................ OK

where java >nul 2>&1
if errorlevel 1 (
    echo   [ERRO] Java nao encontrado no PATH. E necessario o JDK 21.
    goto :erro_fatal
)
echo   Java .................. OK

where node >nul 2>&1
if errorlevel 1 (
    echo   [ERRO] Node.js nao encontrado no PATH.
    goto :erro_fatal
)
echo   Node .................. OK
echo.

REM ---------------------------------------------------------------- 2/7
echo [2/7] Subindo infraestrutura...
echo.

REM O MySQL costuma ja estar instalado como servico do Windows nesta maquina.
REM Nesse caso usamos o banco existente: subir um container ocuparia a mesma
REM porta e apontaria o backend para um banco vazio.
set "PERFIL_MYSQL="
netstat -an | findstr /R /C:"LISTENING" | findstr /C:":3306 " >nul 2>&1
if errorlevel 1 (
    echo   MySQL local nao detectado. Um container sera usado.
    set "PERFIL_MYSQL=--profile mysql"
) else (
    echo   MySQL local detectado na porta 3306. Usando o banco existente.
)
echo.

docker compose -f "%COMPOSE%" %PERFIL_MYSQL% up -d
if errorlevel 1 (
    echo.
    echo   [ERRO] Falha ao subir os containers.
    echo.
    echo   Causa mais comum: porta ja em uso ^(8086 ou 1883^).
    echo   Verifique com:  netstat -ano ^| findstr "8086 1883"
    echo.
    goto :erro_fatal
)
echo.

REM ---------------------------------------------------------------- 3/7
echo [3/7] Aguardando os servicos ficarem prontos...
echo.

if defined PERFIL_MYSQL (
    echo       ^(o MySQL pode levar ate 1 minuto na primeira execucao^)
    call :aguardar_saude geopetro-dev-mysql "MySQL" 60
)
call :aguardar_saude geopetro-dev-influxdb  "InfluxDB"  40
call :aguardar_saude geopetro-dev-mosquitto "Mosquitto" 30

if "!FALHAS!" NEQ "0" (
    echo.
    echo   [ERRO] Nem todos os servicos de infraestrutura ficaram prontos.
    echo.
    call :mostrar_logs_docker
    goto :erro_fatal
)
echo.

REM ---------------------------------------------------------------- 4/7
echo [4/7] Preparando os bancos MySQL...
echo.

set "MYSQL_CONTAINER_ARG="
if defined PERFIL_MYSQL set "MYSQL_CONTAINER_ARG=-Container geopetro-dev-mysql"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%RAIZ%\deploy\dev\preparar-mysql.ps1" %MYSQL_CONTAINER_ARG%
if errorlevel 1 (
    echo.
    echo   [ERRO] Nao foi possivel preparar a separacao entre geopetro_io e braserv_core.
    echo          Os servicos nao serao iniciados para evitar alterar um banco inconsistente.
    goto :erro_fatal
)
echo   Bancos MySQL ............ OK
echo.

REM ---------------------------------------------------------------- 5/7
echo [5/7] Verificando dependencias do frontend...

if not exist "%RAIZ%\apps\geopetro-frontend\node_modules" (
    echo   node_modules ausente. Executando npm install...
    echo   ^(isto leva alguns minutos na primeira vez^)
    pushd "%RAIZ%\apps\geopetro-frontend"
    call npm install
    if errorlevel 1 (
        popd
        echo   [ERRO] npm install falhou. Veja as mensagens acima.
        goto :erro_fatal
    )
    popd
    echo   npm install ........... OK
) else (
    echo   node_modules .......... OK
)
echo.

REM ---------------------------------------------------------------- 6/7
echo [6/7] Liberando portas e iniciando as aplicacoes...
echo.

REM Uma execucao anterior ainda ativa ocuparia as portas e, pior, manteria os
REM jars abertos - o build falharia com "Unable to rename ... to .jar.original".
REM Encerra automaticamente os processos que estiverem escutando nessas portas.
set "FALHA_PORTA=0"
for %%P in (%PORTAS_APLICACOES%) do (
    call :liberar_porta %%P
    if errorlevel 1 set "FALHA_PORTA=1"
)

if "!FALHA_PORTA!" NEQ "0" (
    echo.
    echo   [ERRO] Nao foi possivel liberar todas as portas da aplicacao.
    echo          Execute este arquivo como Administrador ou encerre os
    echo          processos indicados acima manualmente.
    goto :erro_fatal
)
echo.

REM Projeto multi-modulo: 'spring-boot:run' com '-am' seria executado em TODOS os
REM modulos do reactor, comecando pelo pom raiz, que nao tem main class e falha com
REM "Unable to find a suitable main class". Por isso sao dois passos: primeiro
REM instala as dependencias no repositorio local, depois roda SOMENTE o modulo app.
start "GeopetroIO :: Braserv-Core (8082)" cmd /k ^
    "cd /d ""%RAIZ%\apps\core"" && echo Perfil: dev ^(MySQL local^) && echo. && echo [1/2] Compilando os modulos... && mvnw.cmd -q -pl app -am -DskipTests clean install && echo [2/2] Iniciando a aplicacao... && mvnw.cmd -pl app spring-boot:run"
echo   Braserv-Core ............. iniciando  (porta 8082)

REM O Backend precisa do JWKS e do cliente de servico criados pelo Core.
echo   Aguardando o Braserv-Core antes de iniciar o Backend...
call :aguardar_http "http://localhost:8082/actuator/health" "Braserv-Core" 240
if "!FALHAS!" NEQ "0" goto :erro_fatal
echo.

start "GeopetroIO :: Geopetro-Backend (8080)" cmd /k ^
    "cd /d ""%RAIZ%\apps\geopetro-backend"" && echo Perfil: dev ^(MySQL local^) && echo. && echo [1/2] Compilando os modulos... && mvnw.cmd -q -pl app -am -DskipTests clean install && echo [2/2] Iniciando a aplicacao... && mvnw.cmd -pl app spring-boot:run"
echo   Geopetro-Backend ......... iniciando  (porta 8080)

call :aguardar_http "http://localhost:8080/actuator/health" "Geopetro-Backend" 180
if "!FALHAS!" NEQ "0" goto :erro_fatal

REM Uma base nova passa primeiro pelo baseline historico do Backend. Limpa as
REM tabelas organizacionais vazias que ele cria, depois que as migrations acabam.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%RAIZ%\deploy\dev\preparar-mysql.ps1" %MYSQL_CONTAINER_ARG%
if errorlevel 1 goto :erro_fatal
echo.

REM Evita compilar todas as aplicacoes ao mesmo tempo e saturar a maquina.

start "GeopetroIO :: Telemetria (8081)" cmd /k ^
    "cd /d ""%RAIZ%\apps\geopetro-telemetria"" && echo INFLUX_URL=%INFLUX_URL%  MQTT=%MQTT_BROKER_URL% && echo. && mvnw.cmd spring-boot:run"
echo   Telemetria ............ iniciando  (porta 8081)

call :dormir 10

start "GeopetroIO :: Frontend (4200)" cmd /k ^
    "cd /d ""%RAIZ%\apps\geopetro-frontend"" && npm start"
echo   Frontend .............. iniciando  (porta 4200)
echo.

REM ---------------------------------------------------------------- 7/7
echo [7/7] Aguardando as aplicacoes responderem...
echo       ^(a primeira compilacao pode levar varios minutos^)
echo.

call :aguardar_http "http://localhost:8082/actuator/health" "Braserv-Core"     30
call :aguardar_http "http://localhost:8080/actuator/health" "Geopetro-Backend" 30
call :aguardar_http "http://localhost:8081/actuator/health" "Telemetria"    180
call :aguardar_http "http://localhost:4200"                 "Frontend"      180

echo.
echo ======================================================================
if "!FALHAS!" NEQ "0" (
    echo   ATENCAO: !FALHAS! servico^(s^) nao responderam a tempo.
    echo ======================================================================
    echo.
    echo   Verifique a janela do servico correspondente - o erro estara la.
    echo   As janelas permanecem abertas mesmo se o servico cair.
    echo.
    echo   Diagnostico rapido:
    echo     - Porta ocupada:  netstat -ano ^| findstr "8082 8080 8081 4200"
    echo     - Infra Docker :  docker compose -f "%COMPOSE%" ps
    echo     - Logs da infra:  docker compose -f "%COMPOSE%" logs --tail=50
    echo.
) else (
    echo   AMBIENTE PRONTO
    echo ======================================================================
    echo.
    echo     Frontend .......... http://localhost:4200
    echo     Braserv-Core ...... http://localhost:8082
    echo       Swagger ......... http://localhost:8082/swagger-ui.html
    echo     Geopetro-Backend ..... http://localhost:8080
    echo       Swagger ......... http://localhost:8080/swagger-ui.html
    echo     Telemetria ........ http://localhost:8081
    echo       Swagger ......... http://localhost:8081/swagger-ui.html
    echo     InfluxDB UI ....... http://localhost:8086   ^(admin / devpassword123^)
    echo     MQTT broker ....... tcp://localhost:1883    ^(sem autenticacao^)
    echo.
    echo   Para encerrar tudo: stop-dev.cmd
    echo.
)

echo Pressione qualquer tecla para fechar esta janela.
echo ^(as aplicacoes continuam rodando nas janelas proprias^)
pause >nul
exit /b 0


REM ======================================================================
REM  Sub-rotinas
REM ======================================================================

:aguardar_saude
REM  %~1 = nome do container   %~2 = rotulo   %~3 = tentativas
set "CONTAINER=%~1"
set "ROTULO=%~2"
set "MAX=%~3"
set /a TENTATIVA=0

:loop_saude
set /a TENTATIVA+=1
for /f "usebackq delims=" %%s in (`docker inspect -f "{{.State.Health.Status}}" %CONTAINER% 2^>nul`) do set "SAUDE=%%s"

if "!SAUDE!"=="healthy" (
    echo   !ROTULO! pronto.
    exit /b 0
)

REM Container parou de existir ou morreu: nao adianta continuar esperando.
for /f "usebackq delims=" %%e in (`docker inspect -f "{{.State.Status}}" %CONTAINER% 2^>nul`) do set "ESTADO=%%e"
if "!ESTADO!"=="exited" (
    echo   [ERRO] !ROTULO! encerrou inesperadamente.
    set /a FALHAS+=1
    exit /b 1
)

if !TENTATIVA! GEQ %MAX% (
    echo   [ERRO] !ROTULO! nao ficou pronto ^(estado: !SAUDE!^).
    set /a FALHAS+=1
    exit /b 1
)

call :dormir 2
goto :loop_saude


:aguardar_http
REM  %~1 = url   %~2 = rotulo   %~3 = tentativas
set "URL=%~1"
set "ROTULO=%~2"
set "MAX=%~3"
set /a TENTATIVA=0

:loop_http
set /a TENTATIVA+=1
curl --fail -s -o nul -m 3 "%URL%" >nul 2>&1
if not errorlevel 1 (
    echo   !ROTULO! respondendo.
    exit /b 0
)

if !TENTATIVA! GEQ %MAX% (
    echo   [ERRO] !ROTULO! nao respondeu em %URL%
    set /a FALHAS+=1
    exit /b 1
)

call :dormir 2
goto :loop_http


:porta_em_uso
REM  %~1 = porta.  Retorna errorlevel 0 se estiver em uso, 1 se estiver livre.
netstat -an | findstr /R /C:"LISTENING" | findstr /C:":%~1 " >nul 2>&1
exit /b %errorlevel%


:liberar_porta
REM  %~1 = porta. Encerra os processos TCP em escuta e confirma a liberacao.
setlocal EnableDelayedExpansion
set "PORTA=%~1"
set "PIDS="

for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:"LISTENING" ^| findstr /C:":%~1 "') do (
    set "PIDS=!PIDS! %%P"
)

if not defined PIDS (
    echo   Porta !PORTA! ............ livre
    endlocal & exit /b 0
)

echo   Porta !PORTA! ocupada por PID^(s^): !PIDS!
for %%P in (!PIDS!) do (
    echo     Encerrando PID %%P e seus processos filhos...
    taskkill /PID %%P /T /F >nul 2>&1
)

REM Da tempo ao Windows para remover o listener antes de conferir novamente.
call :dormir 1
call :porta_em_uso !PORTA!
if not errorlevel 1 (
    echo     [ERRO] A porta !PORTA! continua ocupada.
    endlocal & exit /b 1
)

echo     Porta !PORTA! liberada.
endlocal & exit /b 0


:dormir
REM  %~1 = segundos
REM  Usa ping em vez de "timeout": o timeout exige console interativo e falha
REM  com "nao ha suporte para o redirecionamento de entrada" quando o script
REM  roda por pipe, agendador ou CI. O ping funciona em qualquer contexto.
set /a PINGS=%~1+1
ping -n %PINGS% 127.0.0.1 >nul 2>&1
exit /b 0


:mostrar_logs_docker
echo   ---------------- ultimas linhas dos containers ----------------
docker compose -f "%COMPOSE%" logs --tail=25
echo   ---------------------------------------------------------------
exit /b 0


:erro_fatal
echo.
echo ======================================================================
echo   FALHA AO SUBIR O AMBIENTE
echo ======================================================================
echo.
echo Pressione qualquer tecla para fechar.
pause >nul
exit /b 1
