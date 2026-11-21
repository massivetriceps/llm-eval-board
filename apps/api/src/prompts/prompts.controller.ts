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
import { CreatePromptDto } from './dto/create-prompt.dto';
import { PromptsService } from './prompts.service';

@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/prompts')
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreatePromptDto,
  ) {
    return this.prompts.create(workspaceId, dto);
  }

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.prompts.list(workspaceId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Query('cascade') cascade?: string,
  ) {
    return this.prompts.remove(workspaceId, id, parseCascade(cascade));
  }
}
