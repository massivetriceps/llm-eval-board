import { Injectable, NotFoundException } from '@nestjs/common';
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

  async remove(workspaceId: string, id: string) {
    const { count } = await this.prisma.modelConfig.deleteMany({
      where: { id, workspaceId },
    });
    if (count === 0) throw new NotFoundException('모델 설정을 찾을 수 없습니다.');
  }
}
