import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { datasets, documents, models, prompts, runs } from '../api/endpoints.ts'
import type { CreateRunInput, ScorerName } from '../api/types.ts'
import { useWorkspaceId } from '../auth/auth-context.ts'
import { EmptyState, ErrorBox, Loading } from '../components/Feedback.tsx'
import { buttonPrimary, card, input } from '../lib/ui.ts'
import { useResource } from '../lib/useResource.ts'

const SCORER_OPTIONS: { value: ScorerName; label: string; hint: string }[] = [
  { value: 'none', label: '채점 안 함', hint: '응답과 비용·지연시간만 기록합니다.' },
  { value: 'exact', label: '정답 일치', hint: '데이터셋의 expected 열과 (공백·대소문자 무시) 같으면 1점.' },
  { value: 'contains', label: '정답 포함', hint: '응답 안에 expected 가 들어 있으면 1점.' },
  { value: 'judge', label: 'LLM 심판', hint: '다른 모델이 1~5점으로 채점합니다. 심판 호출 비용이 따로 듭니다.' },
]

export function NewRunPage() {
  const workspaceId = useWorkspaceId()
  const navigate = useNavigate()
  const datasetList = useResource(`datasets:${workspaceId}`, () => datasets.list(workspaceId))
  const promptList = useResource(`prompts:${workspaceId}`, () => prompts.list(workspaceId))
  const modelList = useResource(`models:${workspaceId}`, () => models.list(workspaceId))
  const documentList = useResource(`documents:${workspaceId}`, () => documents.list(workspaceId))

  const [datasetId, setDatasetId] = useState('')
  const [promptId, setPromptId] = useState('')
  const [modelIds, setModelIds] = useState<string[]>([])
  const [scorer, setScorer] = useState<ScorerName>('none')
  const [judgeId, setJudgeId] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [topK, setTopK] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 모델마다 키를 하나씩 만들어 두고 재시도 때 같은 키를 쓴다. 네트워크 오류로 다시 눌러도 중복 실행이 생기지 않는다
  const keys = useRef(new Map<string, string>())

  const loading = datasetList.loading || promptList.loading || modelList.loading || documentList.loading
  const loadError = datasetList.error ?? promptList.error ?? modelList.error ?? documentList.error
  if (loadError) return <ErrorBox message={loadError} />
  if (loading || !datasetList.data || !promptList.data || !modelList.data || !documentList.data) {
    return <Loading />
  }

  const prompt = promptList.data.find((p) => p.id === promptId)
  const needsDocument = prompt?.template.includes('{{context}}') ?? false
  const missing =
    datasetList.data.length === 0 || promptList.data.length === 0 || modelList.data.length === 0

  function toggleModel(id: string) {
    setModelIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (modelIds.length === 0) return setError('모델을 하나 이상 선택해 주세요.')
    if (scorer === 'judge' && !judgeId) return setError('심판 모델을 선택해 주세요.')
    if (needsDocument && !documentId) {
      return setError('이 프롬프트는 {{context}} 를 쓰므로 문서를 선택해야 합니다.')
    }

    setBusy(true)
    const created: string[] = []
    try {
      // 선택한 모델마다 같은 조건으로 실행을 하나씩 만든다
      for (const modelConfigId of modelIds) {
        const body: CreateRunInput = {
          datasetId,
          promptId,
          modelConfigId,
          scorer,
          ...(scorer === 'judge' ? { judgeModelConfigId: judgeId } : {}),
          ...(needsDocument ? { documentId, topK } : {}),
        }
        const keyId = [datasetId, promptId, modelConfigId, scorer, judgeId, documentId, topK].join('|')
        let key = keys.current.get(keyId)
        if (!key) {
          key = crypto.randomUUID()
          keys.current.set(keyId, key)
        }
        const run = await runs.create(workspaceId, body, key)
        created.push(run.id)
      }
      navigate(created.length === 1 ? `/runs/${created[0]}` : `/compare?ids=${created.join(',')}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const done = created.length > 0 ? `\n(앞의 ${created.length}개 실행은 이미 시작되었습니다. 실행 목록에서 확인하세요.)` : ''
      setError(message + done)
      setBusy(false)
    }
  }

  if (missing) {
    return (
      <EmptyState>
        실행하려면 데이터셋, 프롬프트, 모델이 각각 하나 이상 필요합니다.{' '}
        <Link to="/library" className="text-blue-600 underline">
          라이브러리
        </Link>
        에서 먼저 만들어 주세요.
      </EmptyState>
    )
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-bold">새 실행</h1>
      {error && <ErrorBox message={error} />}

      <section className={`${card} space-y-4 p-5`}>
        <Field label="데이터셋">
          <select className={input} required value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            <option value="">선택...</option>
            {datasetList.data.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d._count.items}문항)
              </option>
            ))}
          </select>
        </Field>
        <Field label="프롬프트">
          <select className={input} required value={promptId} onChange={(e) => setPromptId(e.target.value)}>
            <option value="">선택...</option>
            {promptList.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} v{p.version}
              </option>
            ))}
          </select>
          {prompt && (
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              {prompt.template}
            </pre>
          )}
        </Field>
        <fieldset className="text-sm">
          <legend className="mb-1 font-medium">
            모델 <span className="font-normal text-slate-500">(여러 개를 고르면 같은 조건으로 한 번에 실행해 비교합니다)</span>
          </legend>
          <div className="space-y-1">
            {modelList.data.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={modelIds.includes(m.id)} onChange={() => toggleModel(m.id)} />
                <span className="font-medium">{m.label}</span>
                <span className="text-slate-400">
                  {m.provider} · {m.model}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className={`${card} space-y-4 p-5`}>
        <Field label="채점 방식">
          <select className={input} value={scorer} onChange={(e) => setScorer(e.target.value as ScorerName)}>
            {SCORER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{SCORER_OPTIONS.find((o) => o.value === scorer)?.hint}</p>
        </Field>
        {scorer === 'judge' && (
          <Field label="심판 모델">
            <select className={input} required value={judgeId} onChange={(e) => setJudgeId(e.target.value)}>
              <option value="">선택...</option>
              {modelList.data.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.model})
                </option>
              ))}
            </select>
          </Field>
        )}
      </section>

      {needsDocument && (
        <section className={`${card} space-y-4 p-5`}>
          <p className="text-sm text-slate-600">
            이 프롬프트에는 <code className="rounded bg-slate-100 px-1">{'{{context}}'}</code> 가 있어서, 질문마다 문서에서
            관련 문단을 찾아 넣습니다.
          </p>
          <Field label="문서">
            <select className={input} required value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              <option value="">선택...</option>
              {documentList.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d._count.chunks}조각)
                </option>
              ))}
            </select>
          </Field>
          <Field label="질문마다 가져올 문단 수 (1~10)">
            <input
              className={input}
              type="number"
              min={1}
              max={10}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
            />
          </Field>
        </section>
      )}

      <div className="flex justify-end">
        <button type="submit" className={buttonPrimary} disabled={busy}>
          {busy ? '시작하는 중...' : modelIds.length > 1 ? `${modelIds.length}개 실행 시작` : '실행 시작'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  )
}
