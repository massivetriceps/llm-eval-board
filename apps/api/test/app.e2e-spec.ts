import { randomUUID } from 'node:crypto';
import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module';
import { configureApp } from '../src/app.setup';
import { DatasetsModule } from '../src/datasets/datasets.module';
import { DocumentsModule } from '../src/documents/documents.module';
import { ModelsModule } from '../src/models/models.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PromptsModule } from '../src/prompts/prompts.module';
import { RunExecutor } from '../src/runs/run-executor.service';
import { RunsModule } from '../src/runs/runs.module';
import { WorkspacesModule } from '../src/workspaces/workspaces.module';

// 실제 DB(Postgres)와 mock 모델로 API 전체를 검증한다. 외부 LLM 호출은 없다.
// Observe(원격 모니터링)는 테스트에 필요 없어서 뺀 모듈 구성을 쓴다.
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    DatasetsModule,
    DocumentsModule,
    PromptsModule,
    ModelsModule,
    RunsModule,
  ],
})
class TestAppModule {}

interface Auth {
  email: string;
  token: string;
  workspaceId: string;
}

interface Fixtures {
  datasetId: string
  promptId: string
  modelConfigId: string
}

interface RunBody {
  id: string
  status: string
  progress: { total: number; succeeded: number; failed: number; remaining: number }
  summary: {
    avgScore: number | null;
    overallScore: number | null;
    hitRate: number | null;
  }
  error: string | null
}

interface ResultBody {
  output: string | null
  status: string
  attempts: number
  score: number | null
}

describe('API (통합 테스트, 실제 DB + mock 모델)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // 테스트가 만든 사용자를 지우면 워크스페이스, 데이터셋, 실행 기록이 연쇄 삭제된다
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  async function signup(): Promise<Auth> {
    const email = `e2e-${randomUUID()}@test.dev`;
    createdEmails.push(email);
    const res = await api()
      .post('/auth/signup')
      .send({ email, password: 'password123' })
      .expect(201);
    const token = (res.body as { accessToken: string }).accessToken;
    const list = await api().get('/workspaces').set(bearer(token)).expect(200);
    const workspaceId = (list.body as { id: string }[])[0].id;
    return { email, token, workspaceId };
  }

  // 데이터셋, 프롬프트, 모델 설정을 만든다. 질문은 "question N", 정답은 같은 문자열이다
  async function createFixtures(
    user: Auth,
    options: { model?: string; label?: string; items?: number } = {},
  ): Promise<Fixtures> {
    const w = `/workspaces/${user.workspaceId}`;
    const model = options.model ?? 'mock';
    const rows = Array.from({ length: options.items ?? 5 }, (_, i) => `question ${i + 1},question ${i + 1}`);
    const dataset = await api()
      .post(`${w}/datasets`)
      .set(bearer(user.token))
      .send({ name: 'qa', csv: `input,expected\n${rows.join('\n')}` })
      .expect(201);
    const prompt = await api()
      .post(`${w}/prompts`)
      .set(bearer(user.token))
      .send({ name: 'p', template: 'Answer: {{input}}' })
      .expect(201);
    const modelConfig = await api()
      .post(`${w}/models`)
      .set(bearer(user.token))
      .send({ label: options.label ?? model, provider: 'mock', model })
      .expect(201);
    return {
      datasetId: (dataset.body as { id: string }).id,
      promptId: (prompt.body as { id: string }).id,
      modelConfigId: (modelConfig.body as { id: string }).id,
    };
  }

  function startRun(user: Auth, body: Record<string, unknown>, headers: Record<string, string> = {}) {
    return api()
      .post(`/workspaces/${user.workspaceId}/runs`)
      .set(bearer(user.token))
      .set(headers)
      .send(body);
  }

  async function getRun(user: Auth, runId: string): Promise<RunBody> {
    const res = await api()
      .get(`/workspaces/${user.workspaceId}/runs/${runId}`)
      .set(bearer(user.token))
      .expect(200);
    return res.body as RunBody;
  }

  async function waitForRun(user: Auth, runId: string, timeoutMs = 20000): Promise<RunBody> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const run = await getRun(user, runId);
      if (run.status !== 'PENDING' && run.status !== 'RUNNING') return run;
      if (Date.now() > deadline) throw new Error(`실행이 ${timeoutMs}ms 안에 끝나지 않았습니다: ${run.status}`);
      await sleep(100);
    }
  }

  async function getResults(user: Auth, runId: string): Promise<ResultBody[]> {
    const res = await api()
      .get(`/workspaces/${user.workspaceId}/runs/${runId}/results`)
      .set(bearer(user.token))
      .expect(200);
    return res.body as ResultBody[];
  }

  describe('인증', () => {
    it('가입하면 토큰과 기본 워크스페이스가 생긴다', async () => {
      const user = await signup();
      const me = await api().get('/auth/me').set(bearer(user.token)).expect(200);
      expect((me.body as { email: string }).email).toBe(user.email);
    });

    it('같은 이메일(대소문자 무시)로 다시 가입하면 409', async () => {
      const user = await signup();
      await api()
        .post('/auth/signup')
        .send({ email: user.email.toUpperCase(), password: 'password123' })
        .expect(409);
    });

    it('비밀번호가 틀리면 401, 맞으면 200', async () => {
      const user = await signup();
      await api().post('/auth/login').send({ email: user.email, password: 'wrong-password' }).expect(401);
      await api().post('/auth/login').send({ email: user.email, password: 'password123' }).expect(200);
    });

    it('너무 짧은 비밀번호는 400', async () => {
      const email = `e2e-${randomUUID()}@test.dev`;
      createdEmails.push(email);
      await api().post('/auth/signup').send({ email, password: 'short' }).expect(400);
    });

    it('토큰이 없거나 잘못되면 401', async () => {
      await api().get('/workspaces').expect(401);
      await api().get('/workspaces').set(bearer('not-a-token')).expect(401);
    });
  });

  describe('워크스페이스 분리', () => {
    it('다른 사람의 워크스페이스는 404 로 보이지 않는다', async () => {
      const alice = await signup();
      const bob = await signup();
      await createFixtures(alice);

      await api().get(`/workspaces/${alice.workspaceId}/datasets`).set(bearer(bob.token)).expect(404);
      await api().get(`/workspaces/${alice.workspaceId}/runs`).set(bearer(bob.token)).expect(404);
    });

    it('내 워크스페이스에서 남의 데이터셋 id 로 실행을 만들 수 없다', async () => {
      const alice = await signup();
      const bob = await signup();
      const aliceFixtures = await createFixtures(alice);
      const bobFixtures = await createFixtures(bob);

      await startRun(bob, { ...bobFixtures, datasetId: aliceFixtures.datasetId }).expect(404);
    });
  });

  describe('입력 검증', () => {
    it('input 열이 없는 CSV 는 400', async () => {
      const user = await signup();
      await api()
        .post(`/workspaces/${user.workspaceId}/datasets`)
        .set(bearer(user.token))
        .send({ name: 'bad', csv: 'question\nhello' })
        .expect(400);
    });

    it('프롬프트에 {{input}} 이 없으면 400, 같은 이름으로 만들면 버전이 오른다', async () => {
      const user = await signup();
      const url = `/workspaces/${user.workspaceId}/prompts`;
      await api().post(url).set(bearer(user.token)).send({ name: 'p', template: 'no placeholder' }).expect(400);
      const v1 = await api().post(url).set(bearer(user.token)).send({ name: 'p', template: '{{input}}' }).expect(201);
      const v2 = await api().post(url).set(bearer(user.token)).send({ name: 'p', template: '{{input}}!' }).expect(201);
      expect((v1.body as { version: number }).version).toBe(1);
      expect((v2.body as { version: number }).version).toBe(2);
    });

    it('{{context}} 프롬프트와 documentId 는 짝이 맞아야 한다', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user);
      const w = `/workspaces/${user.workspaceId}`;
      const ctxPrompt = await api()
        .post(`${w}/prompts`)
        .set(bearer(user.token))
        .send({ name: 'ctx', template: '{{context}}\n{{input}}' })
        .expect(201);
      const doc = await api()
        .post(`${w}/documents`)
        .set(bearer(user.token))
        .send({ name: 'd', text: 'some text' })
        .expect(201);

      // {{context}} 가 있는데 문서가 없다
      await startRun(user, { ...fixtures, promptId: (ctxPrompt.body as { id: string }).id }).expect(400);
      // 문서를 줬는데 프롬프트에 {{context}} 가 없다
      await startRun(user, { ...fixtures, documentId: (doc.body as { id: string }).id }).expect(400);
    });

    it('정답 열이 없는 데이터셋은 exact 채점을 할 수 없다', async () => {
      const user = await signup();
      const w = `/workspaces/${user.workspaceId}`;
      const fixtures = await createFixtures(user);
      const noExpected = await api()
        .post(`${w}/datasets`)
        .set(bearer(user.token))
        .send({ name: 'no-expected', csv: 'input\nhello' })
        .expect(201);
      await startRun(user, {
        ...fixtures,
        datasetId: (noExpected.body as { id: string }).id,
        scorer: 'exact',
      }).expect(400);
    });
  });

  describe('실행 엔진', () => {
    it('실행이 끝나면 모든 질문의 결과와 요약이 저장된다', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user, { items: 5 });
      const started = await startRun(user, fixtures).expect(202);

      const run = await waitForRun(user, (started.body as { id: string }).id);
      expect(run.status).toBe('COMPLETED');
      expect(run.progress).toEqual({ total: 5, succeeded: 5, failed: 0, remaining: 0 });
      expect(await getResults(user, run.id)).toHaveLength(5);
    });

    it('contains 는 정답이 응답에 있으면 1점, exact 는 완전히 같아야 1점', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user, { items: 3 });

      const contains = await startRun(user, { ...fixtures, scorer: 'contains' }).expect(202);
      const containsRun = await waitForRun(user, (contains.body as { id: string }).id);
      expect(containsRun.summary.avgScore).toBe(1);
      // 실패한 질문이 없으면 전체 기준 정답률도 같다
      expect(containsRun.summary.overallScore).toBe(1);

      // mock 응답은 "[mock] ..." 로 시작하므로 정답과 완전히 같지는 않다
      const exact = await startRun(user, { ...fixtures, scorer: 'exact' }).expect(202);
      const exactRun = await waitForRun(user, (exact.body as { id: string }).id);
      expect(exactRun.summary.avgScore).toBe(0);
      expect(exactRun.summary.overallScore).toBe(0);
    });

    it('재시도를 모두 써도 실패하면 그 질문만 FAILED 로 기록하고 실행은 끝까지 간다', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user, { model: 'mock-down', items: 2 });
      const started = await startRun(user, fixtures).expect(202);

      const run = await waitForRun(user, (started.body as { id: string }).id);
      expect(run.status).toBe('COMPLETED');
      expect(run.progress.failed).toBe(2);
      const results = await getResults(user, run.id);
      // setup-env.ts 에서 LLM_MAX_ATTEMPTS=3
      expect(results.every((result) => result.status === 'FAILED' && result.attempts === 3)).toBe(true);
    });

    it('키 오류(401)는 재시도 없이 실행 전체를 중단한다', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user, { model: 'mock-bad-key', items: 6 });
      const started = await startRun(user, fixtures).expect(202);

      const run = await waitForRun(user, (started.body as { id: string }).id);
      expect(run.status).toBe('FAILED');
      expect(run.error).toContain('invalid api key');
      const results = await getResults(user, run.id);
      expect(results.every((result) => result.attempts === 1)).toBe(true);
    });

    it('같은 조건의 실행이 진행 중이면 409, 취소하면 CANCELLED', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user, { model: 'mock-slow', items: 1 });
      const started = await startRun(user, fixtures).expect(202);
      const runId = (started.body as { id: string }).id;

      await startRun(user, fixtures).expect(409);

      await api()
        .post(`/workspaces/${user.workspaceId}/runs/${runId}/cancel`)
        .set(bearer(user.token))
        .expect(200);
      expect((await getRun(user, runId)).status).toBe('CANCELLED');
      // 이미 끝난 실행은 다시 취소할 수 없다
      await api()
        .post(`/workspaces/${user.workspaceId}/runs/${runId}/cancel`)
        .set(bearer(user.token))
        .expect(409);

      // 이미 호출 중이던 질문(mock-slow 3초)이 끝나서 DB 쓰기가 마무리되길 기다린다
      await sleep(3500);
    });

    it('같은 Idempotency-Key 로 다시 요청하면 같은 실행을 돌려준다', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user, { items: 2 });
      const key = randomUUID();

      const first = await startRun(user, fixtures, { 'Idempotency-Key': key }).expect(202);
      const second = await startRun(user, fixtures, { 'Idempotency-Key': key }).expect(202);
      expect((second.body as { id: string }).id).toBe((first.body as { id: string }).id);

      await waitForRun(user, (first.body as { id: string }).id);
      const list = await api().get(`/workspaces/${user.workspaceId}/runs`).set(bearer(user.token)).expect(200);
      expect(list.body as unknown[]).toHaveLength(1);
    });

    it('서버가 멈췄다 다시 시작하면 저장된 결과는 그대로 두고 남은 질문만 이어서 실행한다', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user, { items: 3 });
      const dataset = await api()
        .get(`/workspaces/${user.workspaceId}/datasets/${fixtures.datasetId}`)
        .set(bearer(user.token))
        .expect(200);
      const items = (dataset.body as { items: { id: string; position: number }[] }).items;

      // "첫 질문만 끝내고 서버가 멈춘" 상태를 DB 에 직접 만든다
      const run = await prisma.run.create({
        data: {
          workspaceId: user.workspaceId,
          ...fixtures,
          total: 3,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
      await prisma.runResult.create({
        data: {
          runId: run.id,
          itemId: items[0].id,
          position: items[0].position,
          status: 'SUCCEEDED',
          output: 'saved-before-restart',
        },
      });

      app.get(RunExecutor).enqueue(run.id);
      const done = await waitForRun(user, run.id);

      expect(done.status).toBe('COMPLETED');
      const results = await getResults(user, run.id);
      expect(results).toHaveLength(3);
      expect(results[0].output).toBe('saved-before-restart');
    });
  });

  describe('RAG', () => {
    it('문서에서 관련 문단을 찾아 프롬프트에 넣고, 검색 적중률을 계산한다', async () => {
      const user = await signup();
      const w = `/workspaces/${user.workspaceId}`;
      const paragraphs = [
        'The Zorblax engine runs on purple hydrogen and needs no oil.',
        'Mount Quillon is the tallest peak on the island of Verra.',
        'The Marlow library opens at nine and closes at five on weekdays.',
      ];
      const doc = await api()
        .post(`${w}/documents`)
        .set(bearer(user.token))
        .send({ name: 'facts', text: paragraphs.join('\n\n') })
        .expect(201);
      const csv = [
        'input,expected,evidence',
        'What fuel does the Zorblax engine use?,purple hydrogen,purple hydrogen',
        'Which is the tallest peak on Verra?,Quillon,tallest peak',
        'When does the Marlow library close on weekdays?,five,closes at five',
      ].join('\n');
      const dataset = await api().post(`${w}/datasets`).set(bearer(user.token)).send({ name: 'rag', csv }).expect(201);
      const prompt = await api()
        .post(`${w}/prompts`)
        .set(bearer(user.token))
        .send({ name: 'rag', template: 'Use the context.\n{{context}}\n\nQuestion: {{input}}' })
        .expect(201);
      // mock-rag 는 검색 1등 문단을 그대로 답한다
      const model = await api()
        .post(`${w}/models`)
        .set(bearer(user.token))
        .send({ label: 'rag', provider: 'mock', model: 'mock-rag' })
        .expect(201);

      const started = await startRun(user, {
        datasetId: (dataset.body as { id: string }).id,
        promptId: (prompt.body as { id: string }).id,
        modelConfigId: (model.body as { id: string }).id,
        scorer: 'contains',
        documentId: (doc.body as { id: string }).id,
        topK: 2,
      }).expect(202);

      const run = await waitForRun(user, (started.body as { id: string }).id);
      expect(run.status).toBe('COMPLETED');
      expect(run.summary.hitRate).toBe(1);
      expect(run.summary.avgScore).toBe(1);
    });
  });

  describe('실행 비교', () => {
    it('같은 데이터셋의 실행 2개를 지표와 질문별 결과로 비교한다', async () => {
      const user = await signup();
      const w = `/workspaces/${user.workspaceId}`;
      const first = await createFixtures(user, { items: 4, label: 'model-a' });
      const secondModel = await api()
        .post(`${w}/models`)
        .set(bearer(user.token))
        .send({ label: 'model-b', provider: 'mock', model: 'mock' })
        .expect(201);

      const runA = await startRun(user, { ...first, scorer: 'contains' }).expect(202);
      const runB = await startRun(user, {
        ...first,
        modelConfigId: (secondModel.body as { id: string }).id,
        scorer: 'contains',
      }).expect(202);
      const idA = (runA.body as { id: string }).id;
      const idB = (runB.body as { id: string }).id;
      await waitForRun(user, idA);
      await waitForRun(user, idB);

      const res = await api().get(`${w}/runs/compare?ids=${idA},${idB}`).set(bearer(user.token)).expect(200);
      const body = res.body as {
        runs: { id: string; metrics: { total: number; avgScore: number } }[]
        items: { cells: Record<string, unknown> }[]
      };
      expect(body.runs.map((run) => run.id)).toEqual([idA, idB]);
      expect(body.runs.every((run) => run.metrics.total === 4 && run.metrics.avgScore === 1)).toBe(true);
      expect(body.items).toHaveLength(4);
      expect(body.items.every((item) => idA in item.cells && idB in item.cells)).toBe(true);
    });

    it('1개만 고르거나 데이터셋이 다르면 400', async () => {
      const user = await signup();
      const a = await createFixtures(user, { items: 1 });
      const b = await createFixtures(user, { items: 1 });
      const runA = await startRun(user, a).expect(202);
      const runB = await startRun(user, b).expect(202);
      const idA = (runA.body as { id: string }).id;
      const idB = (runB.body as { id: string }).id;
      await waitForRun(user, idA);
      await waitForRun(user, idB);

      const w = `/workspaces/${user.workspaceId}`;
      await api().get(`${w}/runs/compare?ids=${idA}`).set(bearer(user.token)).expect(400);
      await api().get(`${w}/runs/compare?ids=${idA},${idB}`).set(bearer(user.token)).expect(400);
    });
  });

  describe('삭제 보호', () => {
    const del = (user: Auth, path: string) =>
      api().delete(`/workspaces/${user.workspaceId}/${path}`).set(bearer(user.token));

    async function finishedRun(user: Auth) {
      const fixtures = await createFixtures(user, { items: 2 });
      const started = await startRun(user, fixtures).expect(202);
      const run = await waitForRun(user, (started.body as { id: string }).id);
      return { fixtures, runId: run.id };
    }

    it('실행 기록이 없는 데이터셋은 바로 지워진다', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user, { items: 1 });
      await del(user, `datasets/${fixtures.datasetId}`).expect(204);
      await del(user, `datasets/${fixtures.datasetId}`).expect(404);
    });

    it('실행 기록이 있으면 409(HAS_RUNS)와 건수를 돌려주고, 아무것도 지우지 않는다', async () => {
      const user = await signup();
      const { fixtures, runId } = await finishedRun(user);

      for (const path of [`datasets/${fixtures.datasetId}`, `models/${fixtures.modelConfigId}`]) {
        const res = await del(user, path).expect(409);
        const body = res.body as { code: string; runCount: number };
        expect(body.code).toBe('HAS_RUNS');
        expect(body.runCount).toBe(1);
      }
      expect((await getRun(user, runId)).status).toBe('COMPLETED');
    });

    it('cascade=true 로 지우면 실행 기록도 함께 지워진다', async () => {
      const user = await signup();
      const { fixtures, runId } = await finishedRun(user);

      await del(user, `datasets/${fixtures.datasetId}?cascade=true`).expect(204);
      await api()
        .get(`/workspaces/${user.workspaceId}/runs/${runId}`)
        .set(bearer(user.token))
        .expect(404);
    });

    it('채점 모델로만 쓰인 모델도 실행 기록이 있으면 막는다', async () => {
      const user = await signup();
      const { runId } = await finishedRun(user);
      const judge = await api()
        .post(`/workspaces/${user.workspaceId}/models`)
        .set(bearer(user.token))
        .send({ label: 'judge', provider: 'mock', model: 'mock' })
        .expect(201);
      const judgeId = (judge.body as { id: string }).id;
      await prisma.run.update({ where: { id: runId }, data: { judgeModelConfigId: judgeId } });

      const res = await del(user, `models/${judgeId}`).expect(409);
      expect((res.body as { code: string }).code).toBe('HAS_RUNS');
      await del(user, `models/${judgeId}?cascade=true`).expect(204);
      await api()
        .get(`/workspaces/${user.workspaceId}/runs/${runId}`)
        .set(bearer(user.token))
        .expect(404);
    });

    it('진행 중인 실행이 있으면 cascade=true 여도 막는다', async () => {
      const user = await signup();
      const fixtures = await createFixtures(user, { model: 'mock-slow', items: 1 });
      const started = await startRun(user, fixtures).expect(202);
      const runId = (started.body as { id: string }).id;

      const res = await del(user, `datasets/${fixtures.datasetId}?cascade=true`).expect(409);
      expect((res.body as { code?: string }).code).toBeUndefined();

      await api()
        .post(`/workspaces/${user.workspaceId}/runs/${runId}/cancel`)
        .set(bearer(user.token))
        .expect(200);
      // 호출 중이던 mock-slow 질문(3초)이 끝나길 기다린다
      await sleep(3500);
    });
  });
});
