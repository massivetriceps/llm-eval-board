# Smoke test for the run engine using mock models (the API server must be running)
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\mock-run.ps1 -Model mock-flaky
#        ... -Scorer contains   (odd questions match the expected text, even ones do not)
#        ... -Scorer judge      (uses the mock-judge model as the grader)
param(
  [string]$Model = "mock-flaky",
  [int]$Items = 20,
  [ValidateSet("none", "exact", "contains", "judge")][string]$Scorer = "none",
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Email = "a@test.com",
  [string]$Password = "password123"
)

$ErrorActionPreference = "Stop"

function Api($Method, $Path, $Body = $null) {
  $params = @{
    Method      = $Method
    Uri         = "$BaseUrl$Path"
    Headers     = $script:Headers
    ContentType = "application/json"
  }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 5) }
  Invoke-RestMethod @params
}

# 1. Login
$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body $loginBody
$script:Headers = @{ Authorization = "Bearer $($login.accessToken)" }
$ws = @(Api GET "/workspaces")[0].id

# 2. Create dataset / prompt / model
if ($Scorer -eq "none" -or $Scorer -eq "judge") {
  $rows = 1..$Items | ForEach-Object { "question $_" }
  $csv = "input`n" + ($rows -join "`n")
} else {
  # expected text: matches the mock output for odd rows, never matches for even rows
  $rows = 1..$Items | ForEach-Object { if ($_ % 2 -eq 1) { "question $_,question $_" } else { "question $_,no-match" } }
  $csv = "input,expected`n" + ($rows -join "`n")
}
$dataset = Api POST "/workspaces/$ws/datasets" @{ name = "mock $Items items"; csv = $csv }
$prompt = Api POST "/workspaces/$ws/prompts" @{ name = "mock prompt"; template = "Answer briefly.`n{{input}}" }
$modelConfig = Api POST "/workspaces/$ws/models" @{ label = $Model; provider = "mock"; model = $Model }

# 3. Start the run
$body = @{
  datasetId     = $dataset.id
  promptId      = $prompt.id
  modelConfigId = $modelConfig.id
  scorer        = $Scorer
}
if ($Scorer -eq "judge") {
  $judge = Api POST "/workspaces/$ws/models" @{ label = "mock-judge"; provider = "mock"; model = "mock-judge" }
  $body.judgeModelConfigId = $judge.id
}
$run = Api POST "/workspaces/$ws/runs" $body
Write-Host "run started: $($run.id) ($Model, $Items items, scorer=$Scorer)"

# 4. Poll progress until the run finishes
do {
  Start-Sleep -Seconds 1
  $r = Api GET "/workspaces/$ws/runs/$($run.id)"
  Write-Host ("{0,-10} ok={1} failed={2} remaining={3}" -f $r.status, $r.progress.succeeded, $r.progress.failed, $r.progress.remaining)
} while ($r.status -in @("PENDING", "RUNNING"))

# 5. Print results
if ($r.error) { Write-Host "error: $($r.error)" }
Write-Host "--- summary ---"
$r.summary | Format-List
Write-Host "--- results ---"
$uri = "$BaseUrl/workspaces/$ws/runs/$($run.id)/results"
$resp = Invoke-WebRequest -Uri $uri -Headers $script:Headers -UseBasicParsing
# PowerShell 5.1 parses a JSON array as ONE object; piping through ForEach-Object unrolls it
$rows = @($resp.Content | ConvertFrom-Json | ForEach-Object { $_ })
Write-Host "rows: $($rows.Count)"
if ($rows.Count -eq 0 -or $null -eq $rows[0].position) {
  Write-Host "unexpected shape, raw response (first 400 chars):"
  Write-Host $resp.Content.Substring(0, [Math]::Min(400, $resp.Content.Length))
} else {
  $rows | Select-Object position, status, attempts, score, judgeReason, scoreError, error | Format-Table -AutoSize
}
