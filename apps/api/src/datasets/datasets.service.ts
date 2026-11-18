import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { assertDeletable } from '../common/run-usage';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDatasetDto } from './dto/create-dataset.dto';

const MAX_ITEMS = 1000;

@Injectable()
export class DatasetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, dto: CreateDatasetDto) {
    const items = this.parseCsv(dto.csv);
    return this.prisma.dataset.create({
      data: {
        workspaceId,
        name: dto.name,
        items: { createMany: { data: items } },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    });
  }

  list(workspaceId: string) {
    return this.prisma.dataset.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { items: true } },
        // 미리보기용으로 앞의 20건만
        items: { orderBy: { position: 'asc' }, take: 20 },
      },
    });
    if (!dataset) throw new NotFoundException('데이터셋을 찾을 수 없습니다.');
    return dataset;
  }

  async remove(workspaceId: string, id: string, cascade = false) {
    const exists = await this.prisma.dataset.count({ where: { id, workspaceId } });
    if (exists === 0) throw new NotFoundException('데이터셋을 찾을 수 없습니다.');
    await assertDeletable(this.prisma, workspaceId, { datasetId: id }, '이 데이터셋', cascade);
    await this.prisma.$transaction([
      this.prisma.run.deleteMany({ where: { workspaceId, datasetId: id } }),
      this.prisma.dataset.deleteMany({ where: { id, workspaceId } }),
    ]);
  }

  private parseCsv(csv: string) {
    let records: Record<string, string>[];
    try {
      records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
      }) as Record<string, string>[];
    } catch {
      throw new BadRequestException('CSV 형식이 올바르지 않습니다.');
    }
    if (records.length === 0) {
      throw new BadRequestException('CSV 에 데이터 행이 없습니다.');
    }
    if (records.length > MAX_ITEMS) {
      throw new BadRequestException(`최대 ${MAX_ITEMS}행까지 올릴 수 있습니다.`);
    }
    if (!('input' in records[0])) {
      throw new BadRequestException('CSV 헤더에 input 열이 필요합니다.');
    }
    return records.map((record, index) => {
      const input = (record.input ?? '').trim();
      if (!input) {
        throw new BadRequestException(`${index + 2}번째 줄의 input 이 비어 있습니다.`);
      }
      const expected = (record.expected ?? '').trim();
      const evidence = (record.evidence ?? '').trim();
      return {
        position: index,
        input,
        expected: expected || null,
        evidence: evidence || null,
      };
    });
  }
}
