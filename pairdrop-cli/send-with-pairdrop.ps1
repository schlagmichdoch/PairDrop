$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

& "$scriptDir\pairdrop.sh" $args