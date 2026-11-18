import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { datasets, documents, models, prompts, type CreateModelInput } from '../api/endpoints.ts'
import type { ProviderName } from '../api/types.ts'
import { useWorkspaceId } from '../auth/auth-context.ts'
import { EmptyState, ErrorBox, Loading } from '../components/Feedback.tsx'
import { formatDate } from '../lib/format.ts'
import { buttonDanger, buttonPrimary, buttonSecondary, card, input, td, th } from '../lib/ui.ts'
import { useResource } from '../lib/useResource.ts'

type Tab = 'datasets' | 'prompts' | 'models' | 'documents'

const TABS: { id: Tab; label: string }[] = [
  { id: 'datasets', label: '데이터셋' },
  { id: 'prompts', label: '프롬프트' },
  { id: 'models', label: '모델' },
  { id: 'documents', label: '문서 (RAG)' },
]

export function LibraryPage() {
  const [tab, setTab] = useState<Tab>('datasets')
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">라이브러리</h1>
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === item.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'datasets' && <DatasetsTab />}
      {tab === 'prompts' && <PromptsTab />}
      {tab === 'models' && <ModelsTab />}
      {tab === 'documents' && <DocumentsTab />}
    </div>
  )
}

// 폼 제출 공통 처리: 중복 제출 막기, 오류 표시, 성공하면 목록 새로고침
function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<unknown>, event?: FormEvent): Promise<boolean> {
    event?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}

async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<{ name: string; text: string } | null> {
  const file = event.target.files?.[0]
  if (!file) return null
  return { name: file.name.replace(/\.[^.]+$/, ''), text: await file.text() }
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${card} space-y-3 p-5`}>
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{text}</span>
      {children}
    </label>
  )
}

function DatasetsTab() {
  const workspaceId = useWorkspaceId()
  const list = useResource(`datasets:${workspaceId}`, () => datasets.list(workspaceId))
  const [name, setName] = useState('')
  const [csv, setCsv] = useState('')
  const form = useSubmit(list.reload)

  async function remove(id: string, label: string) {
    if (!window.confirm(`"${label}" 을(를) 삭제할까요?\n이 데이터셋으로 실행한 기록도 함께 삭제됩니다.`)) return
    await form.run(() => datasets.remove(workspaceId, id))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
      <Panel title="데이터셋 추가">
        <form
          className="space-y-3"
          onSubmit={(event) =>
            void form.run(() => datasets.create(workspaceId, name, csv), event).then((ok) => {
              if (ok) {
                setName('')
                setCsv('')
              }
            })
          }
        >
          {form.error && <ErrorBox message={form.error} />}
          <Label text="이름">
            <input className={input} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Label>
          <Label text="CSV 파일 또는 직접 입력">
            <input
              type="file"
              accept=".csv,text/csv"
              className="mb-2 block text-sm"
              onChange={(event) =>
                void readFile(event).then((file) => {
                  if (!file) return
                  setCsv(file.text)
                  setName((prev) => prev || file.name)
                })
              }
            />
            <textarea
              className={`${input} h-40 font-mono text-xs`}
              required
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={'input,expected\n대한민국의 수도는?,서울'}
            />
          </Label>
          <p className="text-xs text-slate-500">
            첫 줄은 헤더입니다. <code>input</code> 열은 필수, <code>expected</code>(정답)와 <code>evidence</code>(RAG 정답 근거
            글귀) 열은 선택입니다. 최대 1000행.
          </p>
          <button type="submit" className={buttonPrimary} disabled={form.busy}>
            추가
          </button>
        </form>
      </Panel>
      <Panel title="내 데이터셋">
        {list.error && <ErrorBox message={list.error} />}
        {list.loading && <Loading />}
        {list.data?.length === 0 && <EmptyState>아직 데이터셋이 없습니다.</EmptyState>}
        {list.data && list.data.length > 0 && (
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th}>이름</th>
                <th className={th}>문항</th>
                <th className={th}>만든 날</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((d) => (
                <tr key={d.id}>
                  <td className={td}>{d.name}</td>
                  <td className={`${td} tabular-nums`}>{d._count.items}</td>
                  <td className={`${td} text-slate-500`}>{formatDate(d.createdAt)}</td>
                  <td className={`${td} text-right`}>
                    <button type="button" className={buttonDanger} onClick={() => void remove(d.id, d.name)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

function PromptsTab() {
  const workspaceId = useWorkspaceId()
  const list = useResource(`prompts:${workspaceId}`, () => prompts.list(workspaceId))
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('')
  const form = useSubmit(list.reload)

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
      <Panel title="프롬프트 추가">
        <form
          className="space-y-3"
          onSubmit={(event) =>
            void form.run(() => prompts.create(workspaceId, name, template), event).then((ok) => {
              if (ok) setTemplate('')
            })
          }
        >
          {form.error && <ErrorBox message={form.error} />}
          <Label text="이름 (같은 이름으로 추가하면 새 버전이 쌓입니다)">
            <input className={input} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Label>
          <Label text="템플릿">
            <textarea
              className={`${input} h-40 font-mono text-xs`}
              required
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder={'다음 질문에 한 문장으로 답하세요.\n\n질문: {{input}}'}
            />
          </Label>
          <p className="text-xs text-slate-500">
            <code>{'{{input}}'}</code> 은 필수이고, 문서 검색(RAG)을 쓰려면 <code>{'{{context}}'}</code> 도 넣으세요.
          </p>
          <button type="submit" className={buttonPrimary} disabled={form.busy}>
            추가
          </button>
        </form>
      </Panel>
      <Panel title="내 프롬프트">
        {list.error && <ErrorBox message={list.error} />}
        {list.loading && <Loading />}
        {list.data?.length === 0 && <EmptyState>아직 프롬프트가 없습니다.</EmptyState>}
        <div className="space-y-3">
          {list.data?.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-medium">
                {p.name} <span className="text-slate-400">v{p.version}</span>
              </div>
              <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{p.template}</pre>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

const MODEL_HINTS: Record<ProviderName, string> = {
  openai: '예: gpt-5-mini (서비스 문서의 현재 모델명 확인)',
  gemini: '예: gemini-2.5-flash',
  mock: 'mock, mock-flaky, mock-down, mock-judge, mock-rag',
}

// API 키 없이 화면과 엔진을 써 볼 수 있는 가짜 모델들
const MOCK_PRESETS: CreateModelInput[] = [
  { label: 'mock', provider: 'mock', model: 'mock' },
  { label: 'mock-flaky (40% 오류)', provider: 'mock', model: 'mock-flaky' },
  { label: 'mock-judge (심판용)', provider: 'mock', model: 'mock-judge' },
  { label: 'mock-rag (검색 1등 문단을 답함)', provider: 'mock', model: 'mock-rag' },
]

function ModelsTab() {
  const workspaceId = useWorkspaceId()
  const list = useResource(`models:${workspaceId}`, () => models.list(workspaceId))
  const [provider, setProvider] = useState<ProviderName>('gemini')
  const [label, setLabel] = useState('')
  const [model, setModel] = useState('')
  const [inputPrice, setInputPrice] = useState('')
  const [outputPrice, setOutputPrice] = useState('')
  const [temperature, setTemperature] = useState('')
  const [maxTokens, setMaxTokens] = useState('')
  const form = useSubmit(list.reload)
  const [notice, setNotice] = useState<string | null>(null)

  function build(): CreateModelInput {
    return {
      label,
      provider,
      model,
      ...(inputPrice !== '' ? { inputPricePerM: Number(inputPrice) } : {}),
      ...(outputPrice !== '' ? { outputPricePerM: Number(outputPrice) } : {}),
      ...(temperature !== '' ? { temperature: Number(temperature) } : {}),
      ...(maxTokens !== '' ? { maxTokens: Number(maxTokens) } : {}),
    }
  }

  async function remove(id: string, text: string) {
    if (!window.confirm(`"${text}" 을(를) 삭제할까요?\n이 모델로 실행한 기록도 함께 삭제됩니다.`)) return
    await form.run(() => models.remove(workspaceId, id))
  }

  async function addMocks() {
    setNotice(null)
    const existing = new Set((list.data ?? []).map((m) => m.model))
    const missing = MOCK_PRESETS.filter((preset) => !existing.has(preset.model))
    if (missing.length === 0) {
      setNotice('데모용 mock 모델이 이미 모두 있습니다. 오른쪽 "내 모델"에서 확인하세요.')
      return
    }
    const ok = await form.run(async () => {
      for (const preset of missing) await models.create(workspaceId, preset)
    })
    if (ok) setNotice(`mock 모델 ${missing.length}개를 추가했습니다.`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
      <Panel title="모델 추가">
        <form
          className="space-y-3"
          onSubmit={(event) =>
            void form.run(() => models.create(workspaceId, build()), event).then((ok) => {
              if (ok) {
                setLabel('')
                setModel('')
              }
            })
          }
        >
          {form.error && <ErrorBox message={form.error} />}
          {notice && (
            <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {notice}
            </div>
          )}
          <Label text="제공자">
            <select className={input} value={provider} onChange={(e) => setProvider(e.target.value as ProviderName)}>
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="mock">Mock (테스트용)</option>
            </select>
          </Label>
          <Label text="표시 이름">
            <input className={input} required maxLength={100} value={label} onChange={(e) => setLabel(e.target.value)} />
          </Label>
          <Label text="모델명">
            <input
              className={input}
              required
              maxLength={100}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={MODEL_HINTS[provider]}
            />
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <Label text="입력 단가 ($/100만 토큰)">
              <input className={input} type="number" min={0} step="any" value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} />
            </Label>
            <Label text="출력 단가 ($/100만 토큰)">
              <input className={input} type="number" min={0} step="any" value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} />
            </Label>
            <Label text="temperature (0~2, 선택)">
              <input className={input} type="number" min={0} max={2} step="any" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            </Label>
            <Label text="최대 출력 토큰 (선택)">
              <input className={input} type="number" min={1} max={100000} step={1} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
            </Label>
          </div>
          <p className="text-xs text-slate-500">
            단가를 비워 두면 비용이 $0 으로 계산됩니다. 비용 비교가 필요하면 제공자 가격표를 보고 입력하세요.
          </p>
          <div className="flex gap-2">
            <button type="submit" className={buttonPrimary} disabled={form.busy}>
              추가
            </button>
            <button type="button" className={buttonSecondary} disabled={form.busy} onClick={() => void addMocks()}>
              데모용 mock 모델 추가
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="내 모델">
        {list.error && <ErrorBox message={list.error} />}
        {list.loading && <Loading />}
        {list.data?.length === 0 && <EmptyState>아직 모델이 없습니다.</EmptyState>}
        {list.data && list.data.length > 0 && (
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th}>이름</th>
                <th className={th}>제공자 · 모델</th>
                <th className={th}>단가 (입력/출력)</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((m) => (
                <tr key={m.id}>
                  <td className={td}>{m.label}</td>
                  <td className={`${td} text-slate-500`}>
                    {m.provider} · {m.model}
                  </td>
                  <td className={`${td} tabular-nums text-slate-500`}>
                    ${m.inputPricePerM} / ${m.outputPricePerM}
                  </td>
                  <td className={`${td} text-right`}>
                    <button type="button" className={buttonDanger} onClick={() => void remove(m.id, m.label)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

function DocumentsTab() {
  const workspaceId = useWorkspaceId()
  const list = useResource(`documents:${workspaceId}`, () => documents.list(workspaceId))
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const form = useSubmit(list.reload)

  async function remove(id: string, label: string) {
    if (!window.confirm(`"${label}" 문서를 삭제할까요?`)) return
    await form.run(() => documents.remove(workspaceId, id))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
      <Panel title="문서 추가">
        <form
          className="space-y-3"
          onSubmit={(event) =>
            void form.run(() => documents.create(workspaceId, name, text), event).then((ok) => {
              if (ok) {
                setName('')
                setText('')
              }
            })
          }
        >
          {form.error && <ErrorBox message={form.error} />}
          <Label text="이름">
            <input className={input} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Label>
          <Label text="텍스트 파일(.txt, .md) 또는 직접 입력">
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="mb-2 block text-sm"
              onChange={(event) =>
                void readFile(event).then((file) => {
                  if (!file) return
                  setText(file.text)
                  setName((prev) => prev || file.name)
                })
              }
            />
            <textarea
              className={`${input} h-40 text-xs`}
              required
              maxLength={200000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Label>
          <p className="text-xs text-slate-500">
            빈 줄로 문단을 나누고, 문단 하나가 검색 단위(조각)가 됩니다. 문단이 너무 길면 500자 안팎으로 잘라 저장합니다.
          </p>
          <button type="submit" className={buttonPrimary} disabled={form.busy}>
            추가
          </button>
        </form>
      </Panel>
      <Panel title="내 문서">
        {list.error && <ErrorBox message={list.error} />}
        {list.loading && <Loading />}
        {list.data?.length === 0 && <EmptyState>아직 문서가 없습니다.</EmptyState>}
        {list.data && list.data.length > 0 && (
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th}>이름</th>
                <th className={th}>조각</th>
                <th className={th}>만든 날</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((d) => (
                <tr key={d.id}>
                  <td className={td}>{d.name}</td>
                  <td className={`${td} tabular-nums`}>{d._count.chunks}</td>
                  <td className={`${td} text-slate-500`}>{formatDate(d.createdAt)}</td>
                  <td className={`${td} text-right`}>
                    <button type="button" className={buttonDanger} onClick={() => void remove(d.id, d.name)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
