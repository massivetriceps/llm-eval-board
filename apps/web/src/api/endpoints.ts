import { request } from './client.ts'
import type {
  CompareResponse,
  CreateRunInput,
  Dataset,
  DatasetDetail,
  DocumentSummary,
  ModelConfig,
  PromptVersion,
  ProviderName,
  RunDetail,
  RunListItem,
  RunResultRow,
  Workspace,
} from './types.ts'

const ws = (workspaceId: string) => `/workspaces/${workspaceId}`

export const auth = {
  login: (email: string, password: string) =>
    request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRedirect: true,
    }),
  signup: (email: string, password: string) =>
    request<{ accessToken: string }>('/auth/signup', {
      method: 'POST',
      body: { email, password },
      skipAuthRedirect: true,
    }),
  me: () => request<{ id: string; email: string }>('/auth/me'),
}

export const workspaces = {
  list: () => request<Workspace[]>('/workspaces'),
}

export const datasets = {
  list: (w: string) => request<Dataset[]>(`${ws(w)}/datasets`),
  get: (w: string, id: string) => request<DatasetDetail>(`${ws(w)}/datasets/${id}`),
  create: (w: string, name: string, csv: string) =>
    request<Dataset>(`${ws(w)}/datasets`, { method: 'POST', body: { name, csv } }),
  // cascade=true 면 이 항목을 쓴 실행 기록도 함께 지운다
  remove: (w: string, id: string, cascade = false) =>
    request<void>(`${ws(w)}/datasets/${id}${cascade ? '?cascade=true' : ''}`, { method: 'DELETE' }),
}

export const prompts = {
  list: (w: string) => request<PromptVersion[]>(`${ws(w)}/prompts`),
  create: (w: string, name: string, template: string) =>
    request<PromptVersion>(`${ws(w)}/prompts`, { method: 'POST', body: { name, template } }),
  remove: (w: string, id: string, cascade = false) =>
    request<void>(`${ws(w)}/prompts/${id}${cascade ? '?cascade=true' : ''}`, { method: 'DELETE' }),
}

export interface CreateModelInput {
  label: string
  provider: ProviderName
  model: string
  temperature?: number
  maxTokens?: number
  inputPricePerM?: number
  outputPricePerM?: number
}

export const models = {
  list: (w: string) => request<ModelConfig[]>(`${ws(w)}/models`),
  create: (w: string, input: CreateModelInput) =>
    request<ModelConfig>(`${ws(w)}/models`, { method: 'POST', body: input }),
  // cascade=true 면 이 항목을 쓴 실행 기록도 함께 지운다
  remove: (w: string, id: string, cascade = false) =>
    request<void>(`${ws(w)}/models/${id}${cascade ? '?cascade=true' : ''}`, { method: 'DELETE' }),
}

export const documents = {
  list: (w: string) => request<DocumentSummary[]>(`${ws(w)}/documents`),
  create: (w: string, name: string, text: string) =>
    request<DocumentSummary>(`${ws(w)}/documents`, { method: 'POST', body: { name, text } }),
  // cascade=true 면 이 항목을 쓴 실행 기록도 함께 지운다
  remove: (w: string, id: string, cascade = false) =>
    request<void>(`${ws(w)}/documents/${id}${cascade ? '?cascade=true' : ''}`, { method: 'DELETE' }),
}

export const runs = {
  list: (w: string) => request<RunListItem[]>(`${ws(w)}/runs`),
  get: (w: string, id: string) => request<RunDetail>(`${ws(w)}/runs/${id}`),
  results: (w: string, id: string) => request<RunResultRow[]>(`${ws(w)}/runs/${id}/results`),
  // 같은 요청을 두 번 보내도 실행이 한 번만 만들어지도록 Idempotency-Key 를 붙인다
  create: (w: string, input: CreateRunInput, idempotencyKey: string) =>
    request<RunListItem>(`${ws(w)}/runs`, {
      method: 'POST',
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  remove: (w: string, id: string) =>
    request<void>(`${ws(w)}/runs/${id}`, { method: 'DELETE' }),
  cancel: (w: string, id: string) =>
    request<unknown>(`${ws(w)}/runs/${id}/cancel`, { method: 'POST' }),
  compare: (w: string, ids: string[]) =>
    request<CompareResponse>(`${ws(w)}/runs/compare?ids=${ids.join(',')}`),
}
