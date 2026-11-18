export type RunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type ScorerName = 'none' | 'exact' | 'contains' | 'judge'
export type ProviderName = 'openai' | 'gemini' | 'mock'

export interface Workspace {
  id: string
  name: string
}

export interface Dataset {
  id: string
  name: string
  createdAt: string
  _count: { items: number }
}

export interface PromptVersion {
  id: string
  name: string
  version: number
  template: string
  createdAt: string
}

export interface ModelConfig {
  id: string
  label: string
  provider: ProviderName
  model: string
  temperature: number | null
  maxTokens: number | null
  inputPricePerM: number
  outputPricePerM: number
}

export interface DocumentSummary {
  id: string
  name: string
  createdAt: string
  _count: { chunks: number }
}

export interface Progress {
  total: number
  succeeded: number
  failed: number
  remaining: number
}

export interface RunListSummary {
  avgScore: number | null
  overallScore: number | null
  costUsd: number
  avgLatencyMs: number
}

export interface RunBase {
  id: string
  status: RunStatus
  total: number
  scorer: ScorerName
  topK: number
  documentId: string | null
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  dataset: { name: string }
  prompt: { name: string; version: number }
  modelConfig: { label: string; provider: ProviderName; model: string }
  progress: Progress
}

export interface RunListItem extends RunBase {
  summary: RunListSummary
}

export interface RunDetail extends RunBase {
  summary: {
    inputTokens: number
    outputTokens: number
    costUsd: number
    judgeCostUsd: number
    avgLatencyMs: number
    avgScore: number | null
    scoredCount: number
    overallScore: number | null
    hitRate: number | null
  }
}

export interface RunResultRow {
  id: string
  itemId: string
  position: number
  status: 'SUCCEEDED' | 'FAILED'
  output: string | null
  error: string | null
  attempts: number
  inputTokens: number
  outputTokens: number
  latencyMs: number
  costUsd: number
  score: number | null
  scoreError: string | null
  judgeReason: string | null
  hit: boolean | null
  retrieved: { position: number; score: number }[] | null
  item: { input: string; expected: string | null }
}

export interface ScoreInterval {
  low: number
  high: number
}

export interface RunMetrics {
  total: number
  succeeded: number
  failed: number
  successRate: number
  avgScore: number | null
  scoredCount: number
  overallScore: number | null
  overallScoreCi: ScoreInterval | null
  hitRate: number | null
  costUsd: number
  judgeCostUsd: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  inputTokens: number
  outputTokens: number
  avgAttempts: number
}

export interface CompareRun {
  id: string
  status: RunStatus
  scorer: ScorerName
  topK: number
  usesDocument: boolean
  dataset: { name: string }
  prompt: { name: string; version: number }
  modelConfig: { label: string; provider: ProviderName; model: string }
  metrics: RunMetrics
}

export interface CompareCell {
  status: string
  score: number | null
  output: string | null
}

export interface CompareItem {
  itemId: string
  position: number
  input: string
  expected: string | null
  cells: Record<string, CompareCell>
}

export interface CompareResponse {
  runs: CompareRun[]
  items: CompareItem[]
}

export interface CreateRunInput {
  datasetId: string
  promptId: string
  modelConfigId: string
  scorer: ScorerName
  judgeModelConfigId?: string
  documentId?: string
  topK?: number
}
