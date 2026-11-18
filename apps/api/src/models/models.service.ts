import { Injectable, NotFoundException } from '@nestjs/common';
import { assertDeletable } from '../common/run-usage';
import { PrismaService } from '../prisma/prisma.service';
import { CreateModelDto } from './dto/create-model.dto';

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  create(workspaceId: string, dto: CreateModelDto) {
    return this.prisma.modelConfig.create({
      data: {
        workspaceId,
        label: dto.label,
        provider: dto.provider,
        model: dto.model,
        temperature: dto.temperature,
        maxTokens: dto.maxTokens,
        inputPricePerM: dto.inputPricePerM ?? 0,
        outputPricePerM: dto.outputPricePerM ?? 0,
      },
    });
  }

  list(workspaceId: string) {
    return this.prisma.modelConfig.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const config = await this.prisma.modelConfig.findFirst({
      where: { id, workspaceId },
    });
    if (!config) throw new NotFoundException('모델 설정을 찾을 수 없습니다.');
    return config;
  }

  // 채점 모델(judgeModelConfigId)로 쓰인 실행도 같이 확인한다. 그쪽은 FK 가 없어서 직접 지워야 한다
  async remove(workspaceId: string, id: string, cascade = false) {
    const exists = await this.prisma.modelConfig.count({ where: { id, workspaceId } });
    if (exists === 0) throw new NotFoundException('모델 설정을 찾을 수 없습니다.');
    const usage = { OR: [{ modelConfigId: id }, { judgeModelConfigId: id }] };
    await assertDeletable(this.prisma, workspaceId, usage, '이 모델', cascade);
    await this.prisma.$transaction([
      this.prisma.run.deleteMany({ where: { workspaceId, ...usage } }),
      this.prisma.modelConfig.deleteMany({ where: { id, workspaceId } }),
    ]);
  }
}
