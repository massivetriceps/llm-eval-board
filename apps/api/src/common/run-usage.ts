import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// 삭제하려는 데이터셋·모델·문서를 쓰는 실행을 가리키는 조건 (workspaceId 는 여기서 붙인다)
export type RunUsageWhere = Prisma.RunWhereInput;

export const HAS_RUNS = 'HAS_RUNS';

// 삭제 전에 실행 기록을 확인한다.
// - 진행 중(PENDING/RUNNING)인 실행이 있으면 cascade 여부와 상관없이 막는다 (실행기가 지워진 행에 쓰려다 깨진다)
// - 끝난 실행이 있으면 cascade=true 가 아닌 한 409(HAS_RUNS)로 알려 준다
// 반환값: cascade 로 함께 지워야 할 실행 수
export async function assertDeletable(
  prisma: PrismaService,
  workspaceId: string,
  usage: RunUsageWhere,
  subject: string,
  cascade: boolean,
): Promise<number> {
  const where: Prisma.RunWhereInput = { workspaceId, ...usage };
  const [total, active] = await Promise.all([
    prisma.run.count({ where }),
    prisma.run.count({ where: { ...where, status: { in: ['PENDING', 'RUNNING'] } } }),
  ]);
  if (active > 0) {
    throw new ConflictException(
      `${subject}을(를) 쓰는 실행이 ${active}건 진행 중이라 삭제할 수 없습니다. 끝나거나 취소된 뒤에 다시 시도해 주세요.`,
    );
  }
  if (total > 0 && !cascade) {
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: HAS_RUNS,
      runCount: total,
      message: `${subject}을(를) 쓴 실행 기록이 ${total}건 있습니다. 삭제하면 이 기록도 함께 지워집니다.`,
    });
  }
  return total;
}

export function parseCascade(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}
