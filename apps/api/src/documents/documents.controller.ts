import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../workspaces/workspace-owner.guard';
import { parseCascade } from '../common/run-usage';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documents.create(workspaceId, dto);
  }

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.documents.list(workspaceId);
  }

  @Get(':id')
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.documents.findOne(workspaceId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Query('cascade') cascade?: string,
  ) {
    return this.documents.remove(workspaceId, id, parseCascade(cascade));
  }
}
