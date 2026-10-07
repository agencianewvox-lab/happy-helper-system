# Run only from an authenticated Supabase CLI session.
# Source project is never written to. Credential is confined to Panel server secrets.
$ErrorActionPreference = 'Stop'
$taskTemp = Join-Path ([IO.Path]::GetTempPath()) ('panel-report-secret-' + [guid]::NewGuid().ToString('N'))
$secretFile = Join-Path $taskTemp 'server.env'
try {
 New-Item -ItemType Directory -Path $taskTemp | Out-Null
 $acl = New-Object System.Security.AccessControl.DirectorySecurity
 $acl.SetAccessRuleProtection($true,$false)
 $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
 $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
 Set-Acl -LiteralPath $taskTemp -AclObject $acl
 $raw = (& npx --yes supabase@2.101.0 projects api-keys --project-ref kjwtfnabcqrxzfilqlom -o json 2>$null | Out-String)
 if ($LASTEXITCODE -ne 0) { throw 'Unable to read official source credentials.' }
 $keys = $raw | ConvertFrom-Json
 $key = ($keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1).api_key
 if (-not $key -or $key.Length -lt 100) { throw 'Official source server credential unavailable.' }
 # Generated runtime secret file, not source code. Restricted ACL, removed in finally.
 [IO.File]::WriteAllText($secretFile,('VOXI_READ_KEY='+$key+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
 $output = (& npx --yes supabase@2.101.0 secrets set --project-ref gorqyovidpdvuockzndm --env-file $secretFile 2>$null | Out-String)
 if ($LASTEXITCODE -ne 0) { throw 'Panel secret provisioning failed.' }
 Write-Output 'CRM reader credential installed only in Panel server secrets. Source unchanged.'
} finally {
 $key=$null; $raw=$null; $keys=$null; $output=$null
 if (Test-Path -LiteralPath $secretFile) { Remove-Item -LiteralPath $secretFile -Force }
 if (Test-Path -LiteralPath $taskTemp) { Remove-Item -LiteralPath $taskTemp -Force }
}
