[CmdletBinding()]
param(
    [string] $Container
)

$ErrorActionPreference = 'Stop'

$mysqlHost = if ($env:DB_HOST) { $env:DB_HOST } else { '127.0.0.1' }
$dbPort = if ($env:DB_PORT) { $env:DB_PORT } else { '3306' }
$dbUser = if ($env:DB_USERNAME) { $env:DB_USERNAME } else { 'root' }
$dbPassword = if ($null -ne $env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'bilzao90' }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$moveScript = Join-Path $repoRoot 'deploy\vm-unica\core\mover-para-core.sql'
$defaultsFile = $null

function Find-MySqlClient {
    $command = Get-Command mysql.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $knownPath = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
    if (Test-Path -LiteralPath $knownPath) {
        return $knownPath
    }

    throw 'Cliente mysql.exe nao encontrado. Instale o MySQL 8 Client ou adicione-o ao PATH.'
}

function Invoke-MySql {
    param(
        [Parameter(Mandatory)] [string] $Sql,
        [switch] $ReturnRows
    )

    if ($Container) {
        $output = $Sql | docker exec -i -e "MYSQL_PWD=$dbPassword" $Container `
            mysql --user=$dbUser --batch --skip-column-names 2>&1
    }
    else {
        $output = & $script:mySqlClient "--defaults-extra-file=$defaultsFile" `
            "--host=$mysqlHost" "--port=$dbPort" --protocol=TCP `
            --batch --skip-column-names --execute=$Sql 2>&1
    }

    if ($LASTEXITCODE -ne 0) {
        throw "MySQL recusou a operacao:`n$($output -join [Environment]::NewLine)"
    }

    if ($ReturnRows) {
        return @($output | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    }
}

function Invoke-MySqlFile {
    param([Parameter(Mandatory)] [string] $Path)

    if ($Container) {
        $output = Get-Content -LiteralPath $Path -Raw | docker exec -i -e "MYSQL_PWD=$dbPassword" $Container `
            mysql --user=$dbUser 2>&1
    }
    else {
        $output = Get-Content -LiteralPath $Path -Raw | & $script:mySqlClient `
            "--defaults-extra-file=$defaultsFile" "--host=$mysqlHost" "--port=$dbPort" --protocol=TCP 2>&1
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao executar $Path`:`n$($output -join [Environment]::NewLine)"
    }
}

function Get-Scalar {
    param([Parameter(Mandatory)] [string] $Sql)
    $rows = @(Invoke-MySql -Sql $Sql -ReturnRows)
    if ($rows.Count -ne 1) {
        throw "Consulta deveria retornar uma linha, mas retornou $($rows.Count): $Sql"
    }
    return [long]$rows[0]
}

try {
    if (-not $Container) {
        $script:mySqlClient = Find-MySqlClient
        $defaultsFile = Join-Path ([IO.Path]::GetTempPath()) ("geopetro-mysql-{0}.cnf" -f [guid]::NewGuid())
        @(
            '[client]'
            "user=$dbUser"
            "password=$dbPassword"
        ) | Set-Content -LiteralPath $defaultsFile -Encoding Ascii
    }

    Write-Host '  Conferindo schemas geopetro_io e braserv_core...'
    Invoke-MySql -Sql @'
CREATE DATABASE IF NOT EXISTS geopetro_io CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS braserv_core CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
'@

    $sourceTables = Get-Scalar @'
SELECT COUNT(*) FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'geopetro_io' AND TABLE_TYPE = 'BASE TABLE'
   AND TABLE_NAME IN ('regionais','setores','unidades_sondas','empresas','usuarios',
                      'usuario_roles','usuario_cliente_unidades','recuperacao_senha','configuracao_smtp');
'@

    $destinationTables = Get-Scalar @'
SELECT COUNT(*) FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'braserv_core' AND TABLE_TYPE = 'BASE TABLE'
   AND TABLE_NAME IN ('regionais','setores','unidades','empresas','usuarios',
                      'usuario_roles','usuario_cliente_unidades','recuperacao_senha','configuracao_smtp');
'@

    $sourceRows = 0
    if ($sourceTables -gt 0) {
        $sourceTableNames = Invoke-MySql -Sql @'
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'geopetro_io' AND TABLE_TYPE = 'BASE TABLE'
   AND TABLE_NAME IN ('regionais','setores','unidades_sondas','empresas','usuarios',
                      'usuario_roles','usuario_cliente_unidades','recuperacao_senha','configuracao_smtp')
 ORDER BY TABLE_NAME;
'@ -ReturnRows

        foreach ($table in $sourceTableNames) {
            if ($table -notmatch '^[a-zA-Z0-9_]+$') {
                throw "Nome de tabela inesperado no geopetro_io: $table"
            }
            $sourceRows += Get-Scalar "SELECT COUNT(*) FROM geopetro_io.``$table``;"
        }
    }

    if ($sourceRows -gt 0) {
        if ($sourceTables -ne 9) {
            throw "Schema geopetro_io esta em estado parcial e contem dados: $sourceTables de 9 tabelas do Core. Nenhuma alteracao foi feita."
        }

        $businessTables = Invoke-MySql -Sql @'
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'braserv_core' AND TABLE_TYPE = 'BASE TABLE'
   AND TABLE_NAME <> 'flyway_schema_history'
 ORDER BY TABLE_NAME;
'@ -ReturnRows

        foreach ($table in $businessTables) {
            if ($table -notmatch '^[a-zA-Z0-9_]+$') {
                throw "Nome de tabela inesperado no braserv_core: $table"
            }
            $rows = Get-Scalar "SELECT COUNT(*) FROM braserv_core.``$table``;"
            if ($rows -gt 0) {
                throw "braserv_core.$table contem $rows registro(s). A movimentacao foi cancelada para nao sobrescrever dados."
            }
        }

        Write-Host '  Movendo os cadastros existentes para braserv_core...'
        Invoke-MySql -Sql @'
DROP DATABASE braserv_core;
CREATE DATABASE braserv_core CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
'@
        Invoke-MySqlFile -Path $moveScript
        Write-Host '  Cadastros movidos e contagens conferidas.'
    }
    elseif ($sourceTables -gt 0 -and $destinationTables -eq 9) {
        Write-Host "  Removendo $sourceTables tabela(s) legada(s) vazia(s) de geopetro_io..."
        Invoke-MySql -Sql @'
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS geopetro_io.recuperacao_senha,
                     geopetro_io.usuario_cliente_unidades,
                     geopetro_io.usuario_roles,
                     geopetro_io.usuarios,
                     geopetro_io.empresas,
                     geopetro_io.unidades_sondas,
                     geopetro_io.setores,
                     geopetro_io.regionais,
                     geopetro_io.configuracao_smtp;
SET FOREIGN_KEY_CHECKS = 1;
'@
        Write-Host '  Tabelas legadas vazias removidas.'
    }
    elseif ($sourceTables -eq 9 -and $destinationTables -eq 0) {
        Write-Host '  Movendo a estrutura legada vazia para braserv_core...'
        Invoke-MySql -Sql @'
DROP DATABASE braserv_core;
CREATE DATABASE braserv_core CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
'@
        Invoke-MySqlFile -Path $moveScript
        Write-Host '  Estrutura movida e conferida.'
    }
    elseif ($sourceTables -gt 0) {
        throw "Schemas em estado parcial: origem=$sourceTables e destino=$destinationTables de 9 tabelas esperadas. Nenhuma alteracao foi feita."
    }
    elseif ($destinationTables -eq 9) {
        Write-Host '  Banco ja esta separado; nenhuma movimentacao necessaria.'
    }
    elseif ($destinationTables -eq 0) {
        Write-Host '  Bancos novos detectados; o Flyway criara as estruturas.'
    }
    else {
        throw "Schema braserv_core esta em estado parcial: $destinationTables de 9 tabelas esperadas. Nenhuma alteracao foi feita."
    }
}
finally {
    if ($defaultsFile -and (Test-Path -LiteralPath $defaultsFile)) {
        Remove-Item -LiteralPath $defaultsFile -Force
    }
}
