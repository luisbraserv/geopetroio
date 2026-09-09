param(
    [string]$FrontendUrl = 'http://localhost:4200',
    [string]$BackendUrl = 'http://localhost:8080',
    [string]$TelemetriaUrl = 'http://localhost:8081'
)

# Read-only smoke checks. Protected routes must reject unauthenticated requests.
# This verifies reachability and the authentication boundary, not authenticated CRUD.
$checks = @(
    @{ Url = "$FrontendUrl/"; Expected = 200 },
    @{ Url = "$BackendUrl/actuator/health"; Expected = 200 },
    @{ Url = "$TelemetriaUrl/actuator/health"; Expected = 200 }
)
$paths = @('/api/usuarios', '/api/empresas', '/api/regionais', '/api/setores',
    '/api/unidades-sondas', '/api/sondas/minhas', '/api/sondas/1/cards',
    '/api/sondas/1/configuracao', '/api/sondas/1/alarmes', '/api/sondas/1/alarmes/historico',
    '/api/sondas/prontidao',
    '/api/configuracoes/email',
    '/api/simulador/pocos', '/api/simulador/pastas', '/api/simulador/cenarios')
foreach ($path in $paths) {
    $checks += @{ Url = "$BackendUrl$path"; Expected = 401 }
    $checks += @{ Url = "$FrontendUrl$path"; Expected = 401 }
}
$results = foreach ($check in $checks) {
    $status = & curl.exe --silent --output NUL --write-out '%{http_code}' --max-time 5 $check.Url
    $connected = $LASTEXITCODE -eq 0
    [pscustomobject]@{
        Url = $check.Url
        Expected = $check.Expected
        Actual = $status
        Passed = $connected -and ([int]$status -eq $check.Expected)
    }
}
$results | Format-Table -AutoSize
if ($results.Passed -contains $false) { exit 1 }
