param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-zA-Z0-9_-]+$')]
    [string]$Profile,
    [string]$DshCommand = 'dsh'
)
$ErrorActionPreference = 'Stop'
$pluginDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$entry = Join-Path $pluginDirectory 'lib\client.js'
if (-not (Test-Path -LiteralPath $entry)) {
    throw 'Missing built lib/client.js. Run npm run build first.'
}
$dshExecutable = Get-Command $DshCommand -ErrorAction Stop
$pluginSource = 'link:' + $pluginDirectory.Replace('\', '/')
& $dshExecutable.Source plugin --profile $Profile add $pluginSource
if ($LASTEXITCODE -ne 0) { throw "DSH installation failed with exit code $LASTEXITCODE." }
Write-Host "Installed into profile '$Profile'. Restart that Harness instance and open the Plugin Store sidebar entry."
