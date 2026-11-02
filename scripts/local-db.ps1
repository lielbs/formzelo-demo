param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('status','start','stop','test','types','types-check','reset')]
  [string]$Action,
  [switch]$ConfirmSyntheticReset
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
if (Test-Path -LiteralPath (Join-Path $taskRoot 'supabase/.temp/project-ref')) {
  throw 'This local-only helper refuses linked checkouts. Use an isolated unlinked checkout.'
}
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'supabase/config.toml'))) {
  throw 'Missing local Supabase configuration.'
}
if ($Action -eq 'reset' -and -not $ConfirmSyntheticReset) {
  throw 'Reset deletes local database data. Re-run with -ConfirmSyntheticReset only for disposable synthetic data.'
}
if ($Action -in @('types','types-check')) {
  $taskGeneratedPath = Join-Path $taskRoot 'src/production/database.generated.ts'
  $taskTemporaryPath = [System.IO.Path]::GetTempFileName()
  try {
    [string[]]$taskGeneratedLines = & npx.cmd --yes supabase@3.0.0 gen types --schema public
    if ($LASTEXITCODE -ne 0) {
      throw "Supabase type generation failed with exit code $LASTEXITCODE."
    }
    $taskGeneratedText = (($taskGeneratedLines | ForEach-Object { $_.TrimEnd() }) -join "`n").TrimEnd() + "`n"
    [System.IO.File]::WriteAllText(
      $taskTemporaryPath,
      $taskGeneratedText,
      [System.Text.UTF8Encoding]::new($false)
    )
    if ($Action -eq 'types-check') {
      if (-not (Test-Path -LiteralPath $taskGeneratedPath)) {
        throw 'Generated database types are missing. Run -Action types.'
      }
      if ([System.IO.File]::ReadAllText($taskGeneratedPath) -cne [System.IO.File]::ReadAllText($taskTemporaryPath)) {
        throw 'Generated database types are stale. Run -Action types and review the schema diff.'
      }
      Write-Output 'Generated database types match the local public schema.'
    } else {
      [System.IO.File]::Copy($taskTemporaryPath, $taskGeneratedPath, $true)
      Write-Output "Generated database types: $taskGeneratedPath"
    }
  } finally {
    Remove-Item -LiteralPath $taskTemporaryPath -Force -ErrorAction SilentlyContinue
  }
  exit 0
}
[string[]]$taskArguments = switch ($Action) {
  'status' { @('status') }
  'start' { @('start') }
  'stop' { @('stop') }
  'test' { @('test','db') }
  'reset' { @('db','reset') }
}
# CLI 3.0.0 targets local by default. No arbitrary flags or remote targets are accepted.
& npx.cmd --yes supabase@3.0.0 @taskArguments
exit $LASTEXITCODE
