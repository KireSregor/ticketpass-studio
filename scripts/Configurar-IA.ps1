$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$secretValue = Read-Host 'Pega tu clave de Groq (la entrada permanece oculta)' -AsSecureString
$credential = [System.Net.NetworkCredential]::new('', $secretValue)
$groqValue = $credential.Password
if (-not $groqValue.StartsWith('gsk_')) { throw 'La clave no tiene el formato esperado de Groq.' }
$targetFile = Join-Path $projectDirectory '.env'
$lines = @()
if (Test-Path -LiteralPath $targetFile) {
    $lines = @(Get-Content -LiteralPath $targetFile | Where-Object { $_ -notmatch '^(GROQ_API_KEY|ALLOW_BASIC_EXTRACTION)=' })
}
$lines += 'GROQ_API_KEY=' + $groqValue
$lines += 'ALLOW_BASIC_EXTRACTION=false'
[System.IO.File]::WriteAllLines($targetFile, $lines, [System.Text.UTF8Encoding]::new($false))
$groqValue = $null
$credential = $null
$secretValue.Dispose()
Write-Output 'Configuración guardada en .env (excluido de Git). Reinicia el backend para activarla.'
