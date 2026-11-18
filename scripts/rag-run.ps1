# RAG smoke test with mock models (the API server must be running)
# Compares a run WITHOUT documents (baseline) against a run WITH document retrieval.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\rag-run.ps1
param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Email = "a@test.com",
  [string]$Password = "password123",
  [int]$TopK = 2
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

function Wait-Run($ws, $id) {
  do {
    Start-Sleep -Seconds 1
    $r = Api GET "/workspaces/$ws/runs/$id"
  } while ($r.status -in @("PENDING", "RUNNING"))
  return $r
}

# 1. Login
$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body $loginBody
$script:Headers = @{ Authorization = "Bearer $($login.accessToken)" }
$ws = @(Api GET "/workspaces")[0].id

# 2. Document: one fact per paragraph (blank line = chunk boundary)
$paragraphs = @(
  "The Zorblax engine runs on purple hydrogen and needs no oil.",
  "Mount Quillon is the tallest peak on the island of Verra.",
  "The Marlow library opens at nine and closes at five on weekdays.",
  "Captain Delphine sailed the ship called Nimbus across the Silver Sea.",
  "Glimmerwood tea is brewed with seven mint leaves and one pinch of salt.",
  "The Tarn festival celebrates the first snowfall every December."
)
$doc = Api POST "/workspaces/$ws/documents" @{ name = "rag test doc"; text = ($paragraphs -join "`n`n") }
Write-Host "document: $($doc.id) chunks=$($doc._count.chunks)"

# 3. Dataset: input,expected,evidence
$lines = @(
  "What fuel does the Zorblax engine use?,purple hydrogen,purple hydrogen",
  "Which is the tallest peak on Verra?,Quillon,tallest peak",
  "When does the Marlow library close on weekdays?,five,closes at five",
  "What is the name of Captain Delphine's ship?,Nimbus,ship called Nimbus",
  "How many mint leaves go into Glimmerwood tea?,seven,seven mint leaves",
  "When is the Tarn festival held?,December,first snowfall"
)
$csv = "input,expected,evidence`n" + ($lines -join "`n")
$dataset = Api POST "/workspaces/$ws/datasets" @{ name = "rag test questions"; csv = $csv }

# 4. Prompts: with {{context}} and without
$ragPrompt = Api POST "/workspaces/$ws/prompts" @{ name = "rag prompt"; template = "Answer using the context.`n{{context}}`n`nQuestion: {{input}}" }
$basePrompt = Api POST "/workspaces/$ws/prompts" @{ name = "no-context prompt"; template = "Question: {{input}}" }
$model = Api POST "/workspaces/$ws/models" @{ label = "mock-rag"; provider = "mock"; model = "mock-rag" }

# 5. Guard checks: the API should reject mismatched prompt / document combinations
try {
  Api POST "/workspaces/$ws/runs" @{ datasetId = $dataset.id; promptId = $ragPrompt.id; modelConfigId = $model.id; scorer = "contains" } | Out-Null
  Write-Host "FAIL: {{context}} prompt without document was accepted"
} catch { Write-Host "ok: {{context}} prompt without documentId is rejected" }
try {
  Api POST "/workspaces/$ws/runs" @{ datasetId = $dataset.id; promptId = $basePrompt.id; modelConfigId = $model.id; scorer = "contains"; documentId = $doc.id } | Out-Null
  Write-Host "FAIL: document with a prompt lacking {{context}} was accepted"
} catch { Write-Host "ok: documentId with a prompt lacking {{context}} is rejected" }

# 6. Baseline run (no documents) and RAG run
$base = Api POST "/workspaces/$ws/runs" @{ datasetId = $dataset.id; promptId = $basePrompt.id; modelConfigId = $model.id; scorer = "contains" }
$rag = Api POST "/workspaces/$ws/runs" @{ datasetId = $dataset.id; promptId = $ragPrompt.id; modelConfigId = $model.id; scorer = "contains"; documentId = $doc.id; topK = $TopK }
$baseDone = Wait-Run $ws $base.id
$ragDone = Wait-Run $ws $rag.id

Write-Host ""
Write-Host "--- comparison ---"
Write-Host ("baseline (no docs): status={0} avgScore={1} hitRate={2}" -f $baseDone.status, $baseDone.summary.avgScore, $baseDone.summary.hitRate)
Write-Host ("RAG (topK={0})     : status={1} avgScore={2} hitRate={3}" -f $TopK, $ragDone.status, $ragDone.summary.avgScore, $ragDone.summary.hitRate)

# 7. Per-question results of the RAG run
Write-Host ""
Write-Host "--- RAG results ---"
$resp = Invoke-WebRequest -Uri "$BaseUrl/workspaces/$ws/runs/$($rag.id)/results" -Headers $script:Headers -UseBasicParsing
# PowerShell 5.1 parses a JSON array as ONE object; piping through ForEach-Object unrolls it
$rows = @($resp.Content | ConvertFrom-Json | ForEach-Object { $_ })
$rows | Select-Object position, score, hit, @{ n = "question"; e = { $_.item.input } }, @{ n = "retrieved"; e = { ($_.retrieved | ForEach-Object { $_.position }) -join "," } } | Format-Table -AutoSize
