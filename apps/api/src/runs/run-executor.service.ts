import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { envNumber } from '../common/env';
import { RetryFailure, withRetry } from '../common/retry';
import { Semaphore } from '../common/semaphore';
import { LlmCallError } from '../llm/llm.errors';
import { LlmService, type ModelCallConfig } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { Bm25Index } from '../rag/bm25';
import { normalize, type ScorerName } from '../scoring/scorers';

interface RunItem {
  id: string;
  position: number;
  input: string;
  expected: string | null;
  evidence: string | null;
}

interface Retrieval {
  index: Bm25Index;
  chunks: string[];
  topK: number;
}

interface RunContext {
  runId: string;
  template: string;
  modelConfig: ModelCallConfig;
  scorer: ScorerName;
  judge: ModelCallConfig | null;
  // RAG 실행이면 문서 검색기. 아니면 null
  retrieval: Retrieval | null;
  // 키 오류처럼 계속해도 의미 없는 오류가 나면 여기에 담고 실행을 멈춘다
  fatalError?: string;
}

interface ResultData {
  status: 'SUCCEEDED' | 'FAILED';
  output?: string;
  error?: string;
  attempts: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  costUsd?: number;
  score?: number | null;
  scoreError?: string;
  judgeReason?: string;
  judgeCostUsd?: number;
  retrieved?: { position: number; score: number }[];
  hit?: boolean | null;
}

const ACTIVE_STATUSES = ['PENDING', 'RUNNING'];

@Injectable()
export class RunExecutor implements OnApplicationBootstrap {
  private readonly logger = new Logger(RunExecutor.name);
  // 이 프로세스에서 실행 중인 run (같은 run 을 두 번 시작하지 않기 위함)
  private readonly active = new Set<string>();
  private readonly cancelled = new Set<string>();
  private readonly concurrency = envNumber('LLM_CONCURRENCY', 4);
  // 모든 run 이 공유하는 외부 API 동시 호출 제한
  private readonly limiter = new Semaphore(this.concurrency);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly scoring: ScoringService,
  ) {}

  // 서버가 꺼졌을 때 끝나지 못한 run 을 이어서 실행한다
  async onApplicationBootstrap() {
    const unfinished = await this.prisma.run.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: { id: true },
    });
    for (const { id } of unfinished) {
      this.logger.log(`미완료 실행을 이어서 시작합니다: ${id}`);
      this.enqueue(id);
    }
  }

  enqueue(runId: string) {
    if (this.active.has(runId)) return;
    this.active.add(runId);
    void this.execute(runId)
      .catch((error: unknown) => this.markCrashed(runId, error))
      .finally(() => {
        this.active.delete(runId);
        this.cancelled.delete(runId);
      });
  }

  cancel(runId: string) {
    if (this.active.has(runId)) this.cancelled.add(runId);
  }

  private async execute(runId: string) {
    // PENDING -> RUNNING 은 조건부 업데이트라 두 번 시작되어도 한 번만 성공한다
    await this.prisma.run.updateMany({
      where: { id: runId, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: { prompt: true, modelConfig: true },
    });
    if (!run || run.status !== 'RUNNING') return;

    // 이미 결과가 저장된 질문은 건너뛴다 (재시작 후 이어하기)
    const finished = await this.prisma.runResult.findMany({
      where: { runId },
      select: { itemId: true },
    });
    const items = await this.prisma.datasetItem.findMany({
      where: {
        datasetId: run.datasetId,
        id: { notIn: finished.map((result) => result.itemId) },
      },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        position: true,
        input: true,
        expected: true,
        evidence: true,
      },
    });

    const scorer = run.scorer as ScorerName;
    const judge =
      scorer === 'judge' && run.judgeModelConfigId
        ? await this.prisma.modelConfig.findUnique({
            where: { id: run.judgeModelConfigId },
          })
        : null;
    // RAG: 문서 조각을 불러와 검색기를 만든다. 문서가 지워졌다면 실행을 실패 처리한다
    let retrieval: Retrieval | null = null;
    if (run.documentId) {
      const rows = await this.prisma.documentChunk.findMany({
        where: { documentId: run.documentId },
        orderBy: { position: 'asc' },
        select: { text: true },
      });
      if (rows.length === 0) {
        throw new Error('실행에 쓰는 문서를 찾을 수 없습니다. (삭제되었을 수 있습니다)');
      }
      const chunks = rows.map((row) => row.text);
      retrieval = { index: new Bm25Index(chunks), chunks, topK: run.topK };
    }

    const context: RunContext = {
      runId,
      template: run.prompt.template,
      modelConfig: run.modelConfig,
      scorer,
      judge,
      retrieval,
    };
    const queue = [...items];
    const workers = Array.from(
      { length: Math.min(this.concurrency, queue.length) },
      () => this.worker(context, queue),
    );
    await Promise.all(workers);
    await this.finish(context);
  }

  private async worker(context: RunContext, queue: RunItem[]) {
    while (!this.cancelled.has(context.runId) && !context.fatalError) {
      const item = queue.shift();
      if (!item) return;
      await this.processItem(context, item);
    }
  }

  private async processItem(context: RunContext, item: RunItem) {
    // 질문과 비슷한 문단을 찾아 {{context}} 에 넣는다
    const hits = context.retrieval
      ? context.retrieval.index.search(item.input, context.retrieval.topK)
      : [];
    const contextText =
      hits.length > 0
        ? hits
            .map((found, i) => `[${i + 1}] ${context.retrieval?.chunks[found.index]}`)
            .join('\n\n')
        : 'No relevant passages found.';
    // 한 번에 치환해서, 질문이나 문서 안에 {{...}} 가 있어도 다시 치환되지 않게 한다.
    // (함수로 넘기면 $& 같은 특수 패턴도 해석되지 않는다)
    const prompt = context.template.replace(
      /\{\{(input|context)\}\}/g,
      (_match, key: string) => (key === 'input' ? item.input : contextText),
    );
    const retrieved = hits.map((found) => ({
      position: found.index,
      score: Math.round(found.score * 1000) / 1000,
    }));
    // 근거 글귀가 있는 질문만: 검색된 문단 중 하나라도 그 글귀를 포함하면 hit
    let evidenceHit: boolean | null = null;
    if (context.retrieval && item.evidence) {
      const evidence = normalize(item.evidence);
      evidenceHit = hits.some((found) =>
        normalize(context.retrieval?.chunks[found.index] ?? '').includes(evidence),
      );
    }
    try {
      const { value, attempts } = await withRetry(
        // 대기(백오프) 중에는 자리를 반납하도록 호출 1회 단위로만 제한한다
        () => this.limiter.run(() => this.llm.generate(context.modelConfig, prompt)),
        {
          maxAttempts: envNumber('LLM_MAX_ATTEMPTS', 4),
          baseDelayMs: envNumber('LLM_RETRY_BASE_MS', 1000),
          maxDelayMs: envNumber('LLM_RETRY_MAX_MS', 15_000),
        },
        (error) => error instanceof LlmCallError && error.retryable,
        (attempt, delayMs, error) =>
          this.logger.warn(
            `재시도 ${attempt}회차 실패, ${delayMs}ms 후 다시 시도 (run ${context.runId}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
      );
      // 생성이 끝난 뒤 채점한다. 채점이 실패해도 생성 결과는 그대로 저장한다
      const outcome = await this.scoring.score(
        {
          scorer: context.scorer,
          question: item.input,
          expected: item.expected,
          answer: value.text,
          judge: context.judge,
        },
        (task) => this.limiter.run(task),
      );
      if (outcome.fatal) context.fatalError = outcome.fatal;
      await this.save(context.runId, item, {
        status: 'SUCCEEDED',
        output: value.text,
        attempts,
        inputTokens: value.inputTokens,
        outputTokens: value.outputTokens,
        latencyMs: value.latencyMs,
        costUsd: value.costUsd,
        score: outcome.score,
        scoreError: outcome.error,
        judgeReason: outcome.reason,
        judgeCostUsd: outcome.judgeCostUsd,
        retrieved: context.retrieval ? retrieved : undefined,
        hit: evidenceHit,
      });
    } catch (error) {
      const attempts = error instanceof RetryFailure ? error.attempts : 1;
      const cause = error instanceof RetryFailure ? error.causeError : error;
      const message = cause instanceof Error ? cause.message : String(cause);
      if (cause instanceof LlmCallError && cause.fatal) {
        context.fatalError = message;
      }
      await this.save(context.runId, item, {
        status: 'FAILED',
        error: message,
        attempts,
      });
    }
  }

  private save(runId: string, item: RunItem, data: ResultData) {
    // (runId, itemId) 가 유일하므로 같은 질문을 다시 저장해도 한 행만 남는다
    return this.prisma.runResult.upsert({
      where: { runId_itemId: { runId, itemId: item.id } },
      create: { runId, itemId: item.id, position: item.position, ...data },
      update: { ...data },
    });
  }

  private async finish(context: RunContext) {
    // 취소는 cancel API 가 이미 상태를 바꿔 두었다
    if (this.cancelled.has(context.runId)) return;
    if (context.fatalError) {
      await this.prisma.run.updateMany({
        where: { id: context.runId, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          error: context.fatalError,
          finishedAt: new Date(),
        },
      });
      return;
    }
    await this.prisma.run.updateMany({
      where: { id: context.runId, status: 'RUNNING' },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });
  }

  private async markCrashed(runId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`실행 중 예상하지 못한 오류 (run ${runId}): ${message}`);
    try {
      await this.prisma.run.updateMany({
        where: { id: runId, status: { in: ACTIVE_STATUSES } },
        data: { status: 'FAILED', error: message, finishedAt: new Date() },
      });
    } catch (updateError) {
      this.logger.error(`실패 상태 기록에도 실패했습니다: ${String(updateError)}`);
    }
  }
}
