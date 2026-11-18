import { Injectable } from '@nestjs/common';
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

  list(workspaceId: string) {
    return this.prisma.promptVersion.findMany({
      where: { workspaceId },
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
  }
}
