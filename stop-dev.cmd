@echo off
setlocal
title GeopetroIO - Encerrando ambiente de desenvolvimento

REM ======================================================================
REM  Encerra o ambiente de desenvolvimento do GeopetroIO.
REM
REM  Por padrao PRESERVA os dados (volumes Docker). Para apagar tudo e
REM  comecar do zero:  stop-dev.cmd --limpar
REM ======================================================================

set "RAIZ=%~dp0"
set "RAIZ=%RAIZ:~0,-1%"
set "COMPOSE=%RAIZ%\deploy\dev\docker-compose.yml"

echo.
echo ======================================================================
echo   GeopetroIO - Encerrando ambiente de desenvolvimento
echo ======================================================================
echo.

echo [1/2] Fechando as janelas das aplicacoes...

REM As janelas foram abertas com titulos conhecidos pelo start-dev.cmd.
taskkill /FI "WINDOWTITLE eq GeopetroIO :: Backend-Sonda (8080)*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq GeopetroIO :: Telemetria (8081)*"    /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq GeopetroIO :: Frontend (4200)*"      /T /F >nul 2>&1
echo   Janelas encerradas.
echo.

echo [2/2] Parando a infraestrutura Docker...
echo.

REM --profile mysql garante que o container opcional tambem seja parado,
REM caso ele tenha sido usado na subida.
if /I "%~1"=="--limpar" (
    echo   ATENCAO: os volumes do Docker serao APAGADOS.
    echo   Isso remove todo o historico do InfluxDB e, se o MySQL estiver
    echo   em container, tambem o banco.
    echo.
    echo   Um MySQL instalado como servico do Windows NAO e afetado.
    echo.
    choice /C SN /M "   Confirma a exclusao dos dados"
    if errorlevel 2 (
        echo.
        echo   Cancelado. Parando os containers sem apagar os dados.
        docker compose -f "%COMPOSE%" --profile mysql down
    ) else (
        echo.
        docker compose -f "%COMPOSE%" --profile mysql down -v
        echo.
        echo   Volumes removidos. Na proxima execucao o ambiente sobe do zero.
    )
) else (
    docker compose -f "%COMPOSE%" --profile mysql down
    echo.
    echo   Containers parados. Os dados foram preservados.
    echo   Para apagar os dados tambem:  stop-dev.cmd --limpar
)

echo.
echo ======================================================================
echo   Ambiente encerrado.
echo ======================================================================
echo.
echo Pressione qualquer tecla para fechar.
pause >nul
