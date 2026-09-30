$ErrorActionPreference = 'Stop'
$auditWorkspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
Set-Location -LiteralPath $auditWorkspace
$auditJava = 'C:/Program Files/Eclipse Adoptium/bin'
$report = Join-Path $auditWorkspace 'Geopetro-Backend/app/target/surefire-reports/TEST-com.geopetro.alarmes.MotorDeAlarmesTest.xml'
if (-not (Test-Path -LiteralPath $report)) { throw 'Execute os testes do Backend antes das reproducoes.' }
[xml]$suite = Get-Content -LiteralPath $report -Raw
$auditClasspath = ($suite.testsuite.properties.property | Where-Object name -eq 'java.class.path').value.Replace('\', '/')
$probeClasses = 'Geopetro-Backend/target/month-probe-classes'
New-Item -ItemType Directory -Force -Path $probeClasses | Out-Null
$compileArguments = @('--class-path', ('"' + $auditClasspath + '"'), '-d', $probeClasses,
    'deploy/dev/audit-september/AlarmAuditProbe.java', 'deploy/dev/audit-september/WebSocketAuditProbe.java')
[IO.File]::WriteAllLines((Join-Path $auditWorkspace 'Geopetro-Backend/target/audit-probe-compile.args'), $compileArguments)
& "$auditJava/javac.exe" '@Geopetro-Backend/target/audit-probe-compile.args'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar reproducoes.' }
foreach ($probeName in @('AlarmAuditProbe', 'WebSocketAuditProbe')) {
    $runArguments = @('--class-path', ('"' + $probeClasses + ';' + $auditClasspath + '"'), "com.geopetro.alarmes.$probeName")
    [IO.File]::WriteAllLines((Join-Path $auditWorkspace 'Geopetro-Backend/target/audit-probe-run.args'), $runArguments)
    & "$auditJava/java.exe" '@Geopetro-Backend/target/audit-probe-run.args'
    if ($LASTEXITCODE -ne 0) { throw "Cenario nao reproduzido: $probeName" }
}
& 'C:/Program Files/nodejs/node.exe' deploy/dev/audit-september/frontend-probe.cjs
if ($LASTEXITCODE -ne 0) { throw 'Cenario do Frontend nao reproduzido.' }
