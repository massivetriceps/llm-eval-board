import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRunDto } from './dto/create-run.dto';
import { RunExecutor } from './run-executor.service';
import { summarizeResults } from './run-stats';

const RUN_INCLUDE = {
  dataset: { select: { name: true } },
  prompt: { select: { name: true, version: true } },
  modelConfig: { select: { label: true, provider: true, model: true } },
} as const;

interface Counts {
  succeeded: number;
  failed: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: RunExecutor,
  ) {}

  async create(
    workspaceId: string,
    dto: CreateRunDto,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey && idempotencyKey.length > 200) {
      throw new BadRequestException('Idempotency-Key 는 200자 이하여야 합니다.');
    }

    // 같은 키로 이미 만든 실행이 있으면 새로 만들지 않고 그것을 돌려준다
    if (idempotencyKey) {
      const existing = await this.prisma.run.findFirst({
        where: { workspaceId, idempotencyKey },
      });
      if (existing) return existing;
    }

    // 세 대상이 모두 이 워크스페이스의 것이어야 한다
    const [dataset, prompt, model] = await Promise.all([
      this.prisma.dataset.findFirst({
        where: { id: dto.datasetId, workspaceId },
        select: { id: true, _count: { select: { items: true } } },
      }),
      this.prisma.promptVersion.findFirst({
        where: { id: dto.promptId, workspaceId },
        select: { id: true, template: true },
      }),
      this.prisma.modelConfig.findFirst({
        where: { id: dto.modelConfigId, workspaceId },
        select: { id: true },
      }),
    ]);
    if (!dataset) throw new NotFoundException('데이터셋을 찾을 수 없습니다.');
    if (!prompt) throw new NotFoundException('프롬프트를 찾을 수 없습니다.');
    if (!model) throw new NotFoundException('모델 설정을 찾을 수 없습니다.');
    if (dataset._count.items === 0) {
      throw new BadRequestException('질문이 없는 데이터셋은 실행할 수 없습니다.');
    }

    // RAG: 문서를 쓰는 실행과 {{context}} 가 있는 프롬프트는 짝이 맞아야 한다
    const usesContext = prompt.template.includes('{{context}}');
    if (dto.documentId) {
      const document = await this.prisma.document.findFirst({
        where: { id: dto.documentId, workspaceId },
        select: { id: true },
      });
      if (!document) throw new NotFoundException('문서를 찾을 수 없습니다.');
      if (!usesContext) {
        throw new BadRequestException(
          '문서를 쓰려면 프롬프트에 {{context}} 자리가 있어야 합니다.',
        );
      }
    } else if (usesContext) {
      throw new BadRequestException(
        '프롬프트에 {{context}} 가 있으면 documentId 가 필요합니다.',
      );
    }

    const scorer = dto.scorer ?? 'none';
    if (scorer === 'judge') {
      if (!dto.judgeModelConfigId) {
        throw new BadRequestException(
          'judge 채점에는 judgeModelConfigId 가 필요합니다.',
        );
      }
      const judge = await this.prisma.modelConfig.findFirst({
        where: { id: dto.judgeModelConfigId, workspaceId },
        select: { id: true },
      });
      if (!judge) {
        throw new NotFoundException('채점 모델 설정을 찾을 수 없습니다.');
      }
    }
    if (scorer === 'exact' || scorer === 'contains') {
      const withExpected = await this.prisma.datasetItem.count({
        where: { datasetId: dto.datasetId, expected: { not: null } },
      });
      if (withExpected === 0) {
        throw new BadRequestException(
          '정답(expected) 컬럼이 없는 데이터셋은 exact/contains 로 채점할 수 없습니다.',
        );
      }
    }

    // 같은 조합이 이미 돌고 있으면 중복 실행을 막는다
    const running = await this.prisma.run.findFirst({
      where: {
        workspaceId,
        datasetId: dto.datasetId,
        promptId: dto.promptId,
        modelConfigId: dto.modelConfigId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      select: { id: true },
    });
    if (running) {
      throw new ConflictException(
        `같은 조건의 실행이 이미 진행 중입니다. (runId: ${running.id})`,
      );
    }

    let run;
    try {
      run = await this.prisma.run.create({
        data: {
          workspaceId,
          datasetId: dto.datasetId,
          promptId: dto.promptId,
          modelConfigId: dto.modelConfigId,
          total: dataset._count.items,
          scorer,
          judgeModelConfigId:
            scorer === 'judge' ? (dto.judgeModelConfigId ?? null) : null,
          documentId: dto.documentId ?? null,
          topK: dto.topK ?? 3,
          idempotencyKey: idempotencyKey ?? null,
        },
      });
    } catch (error) {
      // 같은 키의 요청이 동시에 들어온 경우: DB 유니크 제약이 하나만 통과시킨다
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.prisma.run.findFirst({
          where: { workspaceId, idempotencyKey },
        });
        if (existing) return existing;
      }
      throw error;
    }

    this.executor.enqueue(run.id);
    return run;
  }

  async list(workspaceId: string) {
    const runs = await this.prisma.run.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: RUN_INCLUDE,
    });
    const ids = runs.map((run) => run.id);
    const [counts, aggregates] = await Promise.all([
      this.countsByRun(ids),
      this.prisma.runResult.groupBy({
        by: ['runId'],
        where: { runId: { in: ids } },
        _avg: { score: true, latencyMs: true },
        _sum: { costUsd: true, judgeCostUsd: true },
      }),
    ]);
    const byRun = new Map(aggregates.map((row) => [row.runId, row]));
    return runs.map((run) => {
      const aggregate = byRun.get(run.id);
      return {
        ...this.withProgress(run, counts.get(run.id)),
        // 목록 화면용 요약. 자세한 값은 상세 조회에 있다
        summary: {
          avgScore: aggregate?._avg.score ?? null,
          costUsd:
            (aggregate?._sum.costUsd ?? 0) + (aggregate?._sum.judgeCostUsd ?? 0),
          avgLatencyMs: Math.round(aggregate?._avg.latencyMs ?? 0),
        },
      };
    });
  }

  // 같은 데이터셋으로 돌린 실행들을 나란히 비교한다.
  // runs: 실행별 지표, items: 질문별로 실행마다의 점수와 응답
  async compare(workspaceId: string, idsParam?: string) {
    const ids = [
      ...new Set(
        (idsParam ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
    if (ids.length < 2 || ids.length > 6) {
      throw new BadRequestException('비교할 실행을 2~6개 골라 주세요.');
    }
    if (!ids.every((id) => UUID_PATTERN.test(id))) {
      throw new BadRequestException('실행 id 형식이 올바르지 않습니다.');
    }

    const runs = await this.prisma.run.findMany({
      where: { id: { in: ids }, workspaceId },
      include: RUN_INCLUDE,
    });
    if (runs.length !== ids.length) {
      throw new NotFoundException('일부 실행을 찾을 수 없습니다.');
    }
    if (new Set(runs.map((run) => run.datasetId)).size > 1) {
      throw new BadRequestException(
        '같은 데이터셋으로 실행한 결과끼리만 비교할 수 있습니다.',
      );
    }

    const results = await this.prisma.runResult.findMany({
      where: { runId: { in: ids } },
      orderBy: { position: 'asc' },
      include: { item: { select: { input: true, expected: true } } },
    });

    const rowsByRun = new Map<string, typeof results>();
    const items = new Map<
      string,
      {
        itemId: string;
        position: number;
        input: string;
        expected: string | null;
        cells: Record<
          string,
          { status: string; score: number | null; output: string | null }
        >;
      }
    >();
    for (const result of results) {
      const list = rowsByRun.get(result.runId) ?? [];
      list.push(result);
      rowsByRun.set(result.runId, list);

      const entry = items.get(result.itemId) ?? {
        itemId: result.itemId,
        position: result.position,
        input: result.item.input,
        expected: result.item.expected,
        cells: {},
      };
      entry.cells[result.runId] = {
        status: result.status,
        score: result.score,
        // 비교 화면에서는 앞부분만 보여 주면 충분하다
        output: result.output ? result.output.slice(0, 300) : null,
      };
      items.set(result.itemId, entry);
    }

    // 요청한 순서대로 돌려준다
    const byId = new Map(runs.map((run) => [run.id, run]));
    return {
      runs: ids.map((id) => {
        const run = byId.get(id);
        if (!run) throw new NotFoundException('실행을 찾을 수 없습니다.');
        return {
          id: run.id,
          status: run.status,
          scorer: run.scorer,
          topK: run.topK,
          usesDocument: run.documentId !== null,
          dataset: run.dataset,
          prompt: run.prompt,
          modelConfig: run.modelConfig,
          metrics: summarizeResults(rowsByRun.get(id) ?? []),
        };
      }),
      items: [...items.values()].sort((a, b) => a.position - b.position),
    };
  }

  async findOne(workspaceId: string, id: string) {
    const run = await this.prisma.run.findFirst({
      where: { id, workspaceId },
      include: RUN_INCLUDE,
    });
    if (!run) throw new NotFoundException('실행을 찾을 수 없습니다.');

    const [counts, aggregate, hitCount, hitTotal] = await Promise.all([
      this.countsByRun([id]),
      this.prisma.runResult.aggregate({
        where: { runId: id },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          costUsd: true,
          judgeCostUsd: true,
        },
        _avg: { latencyMs: true, score: true },
        _count: { score: true },
      }),
      this.prisma.runResult.count({ where: { runId: id, hit: true } }),
      this.prisma.runResult.count({ where: { runId: id, hit: { not: null } } }),
    ]);
    return {
      ...this.withProgress(run, counts.get(id)),
      summary: {
        inputTokens: aggregate._sum.inputTokens ?? 0,
        outputTokens: aggregate._sum.outputTokens ?? 0,
        costUsd: aggregate._sum.costUsd ?? 0,
        avgLatencyMs: Math.round(aggregate._avg.latencyMs ?? 0),
        judgeCostUsd: aggregate._sum.judgeCostUsd ?? 0,
        // 0~1. 채점된 결과가 하나도 없으면 null (exact 채점이면 정확도와 같다)
        avgScore: aggregate._avg.score,
        scoredCount: aggregate._count.score,
        // RAG: 정답 근거가 검색 결과에 들어 있던 비율. 근거가 있는 질문이 없으면 null
        hitRate: hitTotal > 0 ? hitCount / hitTotal : null,
      },
    };
  }

  async results(workspaceId: string, id: string) {
    const run = await this.prisma.run.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('실행을 찾을 수 없습니다.');
    return this.prisma.runResult.findMany({
      where: { runId: id },
      orderBy: { position: 'asc' },
      take: 500,
      include: { item: { select: { input: true, expected: true } } },
    });
  }

  async cancel(workspaceId: string, id: string) {
    const { count } = await this.prisma.run.updateMany({
      where: { id, workspaceId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.run.findFirst({
        where: { id, workspaceId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('실행을 찾을 수 없습니다.');
      throw new ConflictException('이미 끝난 실행은 취소할 수 없습니다.');
    }
    this.executor.cancel(id);
    return { id, status: 'CANCELLED' };
  }

  private async countsByRun(runIds: string[]) {
    const rows = await this.prisma.runResult.groupBy({
      by: ['runId', 'status'],
      where: { runId: { in: runIds } },
      _count: { _all: true },
    });
    const counts = new Map<string, Counts>();
    for (const row of rows) {
      const entry = counts.get(row.runId) ?? { succeeded: 0, failed: 0 };
      if (row.status === 'SUCCEEDED') entry.succeeded += row._count._all;
      else entry.failed += row._count._all;
      counts.set(row.runId, entry);
    }
    return counts;
  }

  private withProgress<T extends { total: number }>(
    run: T,
    counts: Counts = { succeeded: 0, failed: 0 },
  ) {
    return {
      ...run,
      progress: {
        total: run.total,
        succeeded: counts.succeeded,
        failed: counts.failed,
        remaining: run.total - counts.succeeded - counts.failed,
      },
    };
  }
}
