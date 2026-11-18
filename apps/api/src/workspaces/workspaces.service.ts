import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  // 항상 ownerId 조건을 걸어 다른 사람의 워크스페이스는 보이지 않게 한다
  list(ownerId: string) {
    return this.prisma.workspace.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(ownerId: string, name: string) {
    return this.prisma.workspace.create({ data: { name, ownerId } });
  }

  // 내 워크스페이스가 아니면 404. 남의 것과 없는 것을 구분해 알려 주지 않는다
  async assertOwner(userId: string, workspaceId: string) {
    const found = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, ownerId: userId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('워크스페이스를 찾을 수 없습니다.');
    }
  }
}
