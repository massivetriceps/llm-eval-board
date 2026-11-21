import { Injectable, NotFoundException } from '@nestjs/common';
import { assertDeletable } from '../common/run-usage';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromptDto } from './dto/create-prompt.dto';

@Injectable()
export class PromptsService {
  constructor(private readonly prisma: PrismaService) {}

  // 같은 이름으로 만들면 기존 것을 고치지 않고 version 을 1 올려 새로 쌓는다
  async create(workspaceId: string, dto: CreatePromptDto) {
    const last = await this.prisma.promptVersion.findFirst({
      where: { workspaceId, name: dto.name },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return this.prisma.promptVersion.create({
      data: {
        workspaceId,
        name: dto.name,
        template: dto.template,
        version: (last?.version ?? 0) + 1,
      },
    });
  }

  // 프롬프트 한 줄이 한 버전이다. 이 버전으로 돌린 실행 기록이 있으면 모델·데이터셋과 같은 규칙으로 보호한다
  async remove(workspaceId: string, id: string, cascade = false) {
    const exists = await this.prisma.promptVersion.count({ where: { id, workspaceId } });
    if (exists === 0) throw new NotFoundException('프롬프트를 찾을 수 없습니다.');
    await assertDeletable(this.prisma, workspaceId, { promptId: id }, '이 프롬프트', cascade);
    await this.prisma.$transaction([
      this.prisma.run.deleteMany({ where: { workspaceId, promptId: id } }),
      this.prisma.promptVersion.deleteMany({ where: { id, workspaceId } }),
    ]);
  }

  list(workspaceId: string) {
    return this.prisma.promptVersion.findMany({
      where: { workspaceId },
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
  }
}
