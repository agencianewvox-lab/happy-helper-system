# Integration checks use temporary Panel users/cards only. No WhatsApp sends, no CRM writes.
param([string]$TestCrmAccount='', [string]$TestMetaAccount='')
$ErrorActionPreference='Stop'
$panel='https://gorqyovidpdvuockzndm.supabase.co'
$publicKey='sb_publishable_O5FtBQw9ktXC8F46UOueqg_EDKlgp4j'
$createdUsers=[System.Collections.Generic.List[string]]::new()
$createdClients=[System.Collections.Generic.List[string]]::new()
$adminHeaders=$null
function Request-Json($path,$method,$headers,$body) {
 $args=@{Uri=$panel+$path;Method=$method;Headers=$headers;TimeoutSec=120;SkipHttpErrorCheck=$true}
 if($null-ne $body){$args.Body=ConvertTo-Json -InputObject $body -Depth 20 -Compress;$args.ContentType='application/json'}
 $r=Invoke-WebRequest @args
 $data=$null
 try{$data=$r.Content|ConvertFrom-Json}catch{}
 return @{Status=[int]$r.StatusCode;Data=$data}
}
function Assert($condition,$message){if(-not $condition){throw $message}}
function Staff($name,$master){
 $email='report-check-'+[guid]::NewGuid().ToString('N')+'@example.invalid'
 $password=[guid]::NewGuid().ToString('N')+'!Aa9'
 $r=Request-Json '/auth/v1/admin/users' 'POST' $adminHeaders @{email=$email;password=$password;email_confirm=$true;user_metadata=@{full_name=$name}}
 Assert ($r.Status-eq200) 'Could not create Panel validation user.'
 $uid=$r.Data.id;$createdUsers.Add($uid)
 $profile=Request-Json ('/rest/v1/profiles?user_id=eq.'+$uid) 'GET' $adminHeaders $null
 if(@($profile.Data).Count-eq0){
  $r=Request-Json '/rest/v1/profiles' 'POST' $adminHeaders @{user_id=$uid;full_name=$name;role=$(if($master){'admin'}else{'gestor'});is_master=$master}
 }else{
  $r=Request-Json ('/rest/v1/profiles?user_id=eq.'+$uid) 'PATCH' $adminHeaders @{full_name=$name;role=$(if($master){'admin'}else{'gestor'});is_master=$master}
 }
 Assert ($r.Status-in200,201,204) 'Could not prepare validation profile.'
 $auth=Request-Json '/auth/v1/token?grant_type=password' 'POST' @{apikey=$publicKey} @{email=$email;password=$password}
 Assert ($auth.Status-eq200) 'Could not authenticate validation user.'
 return @{Id=$uid;Headers=@{apikey=$publicKey;Authorization='Bearer '+$auth.Data.access_token}}
}
try{
 $raw=(& npx --yes supabase@2.101.0 projects api-keys --project-ref gorqyovidpdvuockzndm -o json 2>$null|Out-String)
 if($LASTEXITCODE-ne0){throw 'Panel CLI authentication unavailable.'}
 $serverKey=(($raw|ConvertFrom-Json)|Where-Object name -eq 'service_role'|Select-Object -First 1).api_key
 if(-not $serverKey){throw 'Panel server credential unavailable.'}
 $adminHeaders=@{apikey=$serverKey;Authorization='Bearer '+$serverKey;Prefer='return=representation'}
 $r=Request-Json '/functions/v1/reports-api' 'POST' @{apikey=$publicKey} @{action='bootstrap'}
 Assert ($r.Status-eq401) 'Anonymous report API was not rejected.'
 $master=Staff ('Report Master '+[guid]::NewGuid().ToString('N')) $true
 $managerName='Report Manager '+[guid]::NewGuid().ToString('N')
 $manager=Staff $managerName $false
 $r=Request-Json '/functions/v1/reports-api' 'POST' $master.Headers @{action='bootstrap'}
 Assert ($r.Status-eq200) 'Master bootstrap failed.'
 $existingCount=@($r.Data.clients).Count
 foreach($which in @('own','other')){
  $clientId=[guid]::NewGuid().ToString()
  $row=@{id=$clientId;nome='Temporary report validation '+$which;group_id='report-check-'+[guid]::NewGuid().ToString('N');gestor_responsavel=$(if($which-eq'own'){$managerName}else{'Other temporary team member'})}
  $r=Request-Json '/rest/v1/whatsapp_grupos' 'POST' $adminHeaders $row
  Assert ($r.Status-in200,201) 'Could not create temporary Panel card.'
  $createdClients.Add($clientId)
 }
 $own=$createdClients[0];$other=$createdClients[1]
 $r=Request-Json '/functions/v1/reports-api' 'POST' $manager.Headers @{action='bootstrap'}
 Assert ($r.Status-eq200-and @($r.Data.clients).Count-eq1-and $r.Data.clients[0].id-eq$own) 'Manager portfolio isolation failed.'
 $r=Request-Json '/functions/v1/reports-api' 'POST' $manager.Headers @{action='client-catalog';clientId=$other}
 Assert ($r.Status-eq403) 'Cross-client request was not denied.'
 $r=Request-Json '/functions/v1/reports-api' 'POST' $manager.Headers @{action='bind-source';clientId=$own;confirm=$true;accountId=[guid]::NewGuid().ToString()}
 Assert ($r.Status-eq403) 'Manager was able to replace the CRM source.'
 $r=Request-Json '/functions/v1/reports-api' 'POST' $master.Headers @{action='catalog'}
 Assert ($r.Status-eq200-and @($r.Data.accounts).Count-gt0) 'CRM catalog reader failed.'
 $crmCount=@($r.Data.accounts).Count;$accountId=$r.Data.accounts[0].id
 if($TestCrmAccount){Assert (@($r.Data.accounts|Where-Object id -eq $TestCrmAccount).Count-eq1) 'Test CRM account is not a canonical account.';$accountId=$TestCrmAccount}
 if($TestMetaAccount){
  Assert ($TestCrmAccount-and $TestMetaAccount-match '^[0-9]+$') 'Explicit verified CRM/Meta test pair required.'
  $r=Request-Json ('/rest/v1/whatsapp_grupos?id=eq.'+$own) 'PATCH' $adminHeaders @{ad_account_id=$TestMetaAccount}
  Assert ($r.Status-in200,204) 'Could not set the temporary verified Meta fixture.'
  $metaSettings=@{title='Validation Meta only';intro='No message will be sent.';metrics=@('spend','clicks','impressions','ctr','cpc','cpm');pipelines=@();stages=@{scheduled=@();attended=@()};period='custom';customStart='2026-10-01';customEnd='2026-10-07';frequency='once';onceDate='2026-10-08';weekdays=@(1);monthDay=1;time='09:00';timezone='America/Sao_Paulo';ranking='clicks';top=3;minLeads=1;includeAds=$true;includeCampaigns=$true;dataMode='meta';template='Investment: {{investimento}} · Clicks: {{cliques}}'}
  $r=Request-Json '/functions/v1/reports-api' 'POST' $master.Headers @{action='preview';clientId=$own;settings=$metaSettings;ownerUserId=$master.Id}
  Assert ($r.Status-eq200-and $null-ne$r.Data.result.metrics.spend-and $null-eq$r.Data.result.metrics.sales-and $null-eq$r.Data.result.metrics.leads) ('Meta-only preview without CRM failed: '+$r.Data.error)
  Assert ($r.Data.message-like 'Investment:*'-and $r.Data.message-notlike '*{{*') 'Custom message variables failed.'
  $metaSpend=$r.Data.result.metrics.spend
  $campaignId=@($r.Data.result.campaigns)[0].id
  Assert ($campaignId-match '^[0-9]+$') 'Live Meta fixture has no campaign activity.'
  $r=Request-Json '/functions/v1/reports-api' 'POST' $master.Headers @{action='campaign-catalog';clientId=$own}
  Assert ($r.Status-eq200-and @($r.Data.campaigns|Where-Object id -eq $campaignId).Count-eq1) 'Account-bound campaign catalog failed.'
  $metaSettings.campaignIds=@($campaignId)
  $r=Request-Json '/functions/v1/reports-api' 'POST' $master.Headers @{action='preview';clientId=$own;settings=$metaSettings;ownerUserId=$master.Id}
  Assert ($r.Status-eq200-and @($r.Data.result.campaigns).Count-eq1-and $r.Data.result.campaigns[0].id-eq$campaignId) ('Selected campaign preview failed: '+$r.Data.error)
  $r=Request-Json '/functions/v1/reports-api' 'POST' $manager.Headers @{action='save';clientId=$own;settings=$metaSettings;enabled=$false;version=0}
  Assert ($r.Status-eq200) 'Meta-only configuration without CRM could not be saved.'
  $null=Request-Json ('/rest/v1/report_configs?client_id=eq.'+$own) 'DELETE' $adminHeaders $null
  $r=Request-Json '/functions/v1/reports-api' 'POST' $manager.Headers @{action='campaign-catalog';clientId=$other}
  Assert ($r.Status-eq403) 'Cross-client Meta campaign catalog was exposed.'
  Write-Output ('PASS: Meta-only preview without CRM, custom period/text, selected campaign, disabled save and portfolio isolation. Spend='+$metaSpend+'. No send requests.')
 }
 $r=Request-Json '/functions/v1/reports-api' 'POST' $master.Headers @{action='bind-source';clientId=$own;accountId=$accountId;confirm=$true}
 Assert ($r.Status-eq200) 'Temporary source binding failed.'
 $r=Request-Json '/functions/v1/reports-api' 'POST' $manager.Headers @{action='client-catalog';clientId=$own}
 Assert ($r.Status-eq200) 'Authorized manager funnel read failed.'
 $r=Request-Json ('/rest/v1/report_sources?client_id=eq.'+$own) 'GET' $manager.Headers $null
 Assert ($r.Status-eq200-and @($r.Data).Count-eq1) 'RLS authorized source read failed.'
 $r=Request-Json '/rest/v1/report_configs' 'POST' $manager.Headers @{client_id=$other;owner_user_id=$manager.Id;settings=@{}}
 Assert ($r.Status-in401,403) 'Direct browser writes were not blocked.'
 $settings=@{title='Validation only';intro='No message will be sent.';metrics=@('leads','sales','spend','cpl');pipelines=@();stages=@{scheduled=@();attended=@()};period='last7';frequency='weekly';weekdays=@(1);monthDay=1;time='09:00';timezone='America/Sao_Paulo';ranking='leads';top=3;minLeads=1;includeAds=$true}
 $r=Request-Json '/functions/v1/reports-api' 'POST' $master.Headers @{action='preview';clientId=$own;settings=$settings;ownerUserId=$master.Id}
 Assert ($r.Status-eq200-and $null-ne$r.Data.result.metrics.leads-and $r.Data.message-and $r.Data.previewToken) ('Real CRM preview failed: '+$r.Data.error)
 $leadCount=$r.Data.result.metrics.leads
 if($TestMetaAccount){Assert ($null-ne$r.Data.result.metrics.spend) ('Live Meta collection failed: '+($r.Data.result.warnings-join '; '));Write-Output 'PASS: live Meta spend and verified account lookup, no Meta lead totals used.'}
 $r=Request-Json '/functions/v1/reports-api' 'POST' $manager.Headers @{action='save';clientId=$own;settings=$settings;enabled=$false;version=0}
 Assert ($r.Status-eq200) 'Disabled manager configuration save failed.'
 $r=Request-Json '/functions/v1/reports-api' 'POST' $manager.Headers @{action='save';clientId=$own;settings=$settings;enabled=$true;version=1}
 Assert ($r.Status-eq400) 'Activation without a verified preview/connection was accepted.'
 $r=Request-Json '/functions/v1/report-scheduler' 'POST' $manager.Headers @{}
 Assert ($r.Status-eq403) 'Manager was allowed to run the internal scheduler.'
 # Never run the service worker in a test: it could dispatch existing real queued jobs.
 Write-Output ('PASS: anonymous rejection, Master bootstrap ('+$existingCount+' cards), manager isolation, source restriction, read-only CRM catalog ('+$crmCount+' accounts), real CRM preview ('+$leadCount+' leads), disabled save, RLS browser-write rejection, activation guard, internal scheduler authorization. No messages sent.')
}finally{
 if($adminHeaders){
  foreach($clientId in $createdClients){$null=Request-Json ('/rest/v1/whatsapp_grupos?id=eq.'+$clientId) 'DELETE' $adminHeaders $null}
  foreach($userId in $createdUsers){$null=Request-Json ('/auth/v1/admin/users/'+$userId) 'DELETE' $adminHeaders $null}
 }
 $serverKey=$null;$raw=$null;$adminHeaders=$null
}
