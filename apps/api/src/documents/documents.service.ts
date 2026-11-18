import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { assertDeletable } from '../common/run-usage';
import { PrismaService } from '../prisma/prisma.service';
import { chunkText } from '../rag/text';
import { CreateDocumentDto } from './dto/create-document.dto';

const MAX_CHUNKS = 2000;

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, dto: CreateDocumentDto) {
    const chunks = chunkText(dto.text);
    if (chunks.length === 0) {
      throw new BadRequestException('문서에 내용이 없습니다.');
    }
    if (chunks.length > MAX_CHUNKS) {
      throw new BadRequestException(
        `문서가 너무 깁니다. 최대 ${MAX_CHUNKS}개 조각까지 올릴 수 있습니다.`,
      );
    }
    return this.prisma.document.create({
      data: {
        workspaceId,
        name: dto.name,
        chunks: {
          createMany: {
            data: chunks.map((text, position) => ({ position, text })),
          },
        },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
    });
  }

  list(workspaceId: string) {
    return this.prisma.document.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { chunks: true } },
        // 미리보기용으로 앞의 10조각만
        chunks: { orderBy: { position: 'asc' }, take: 10 },
      },
    });
    if (!document) throw new NotFoundException('문서를 찾을 수 없습니다.');
    return document;
  }

  async remove(workspaceId: string, id: string, cascade = false) {
    const exists = await this.prisma.document.count({ where: { id, workspaceId } });
    if (exists === 0) throw new NotFoundException('문서를 찾을 수 없습니다.');
    await assertDeletable(this.prisma, workspaceId, { documentId: id }, '이 문서', cascade);
    await this.prisma.$transaction([
      this.prisma.run.deleteMany({ where: { workspaceId, documentId: id } }),
      this.prisma.document.deleteMany({ where: { id, workspaceId } }),
    ]);
  }
}
