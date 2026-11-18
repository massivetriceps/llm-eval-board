import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRunDto } from './dto/create-run.dto';
import { RunExecutor } from './run-executor.service';

const RUN_INCLUDE = {
  dataset: { select: { name: true } },
  prompt: { select: { name: true, version: true } },
  modelConfig: { select: { label: true, provider: true, model: true } },
} as const;

interface Counts {
  succeeded: number;
  failed: number;
}

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
        select: { id: true },
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
    const counts = await this.countsByRun(runs.map((run) => run.id));
    return runs.map((run) => this.withProgress(run, counts.get(run.id)));
  }

  async findOne(workspaceId: string, id: string) {
    const run = await this.prisma.run.findFirst({
      where: { id, workspaceId },
      include: RUN_INCLUDE,
    });
    if (!run) throw new NotFoundException('실행을 찾을 수 없습니다.');

    const [counts, aggregate] = await Promise.all([
      this.countsByRun([id]),
      this.prisma.runResult.aggregate({
        where: { runId: id },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        _avg: { latencyMs: true },
      }),
    ]);
    return {
      ...this.withProgress(run, counts.get(id)),
      summary: {
        inputTokens: aggregate._sum.inputTokens ?? 0,
        outputTokens: aggregate._sum.outputTokens ?? 0,
        costUsd: aggregate._sum.costUsd ?? 0,
        avgLatencyMs: Math.round(aggregate._avg.latencyMs ?? 0),
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
