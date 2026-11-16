import { Injectable } from '@nestjs/common';
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
}
