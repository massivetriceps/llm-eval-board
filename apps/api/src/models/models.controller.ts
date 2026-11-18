import {
  BadGatewayException,
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
import { parseCascade } from '../common/run-usage';
import { LlmCallError } from '../llm/llm.errors';
import { LlmService } from '../llm/llm.service';
import { WorkspaceOwnerGuard } from '../workspaces/workspace-owner.guard';
import { CreateModelDto } from './dto/create-model.dto';
import { TestModelDto } from './dto/test-model.dto';
import { ModelsService } from './models.service';

@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/models')
export class ModelsController {
  constructor(
    private readonly models: ModelsService,
    private readonly llm: LlmService,
  ) {}

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateModelDto,
  ) {
    return this.models.create(workspaceId, dto);
  }

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.models.list(workspaceId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Query('cascade') cascade?: string,
  ) {
    return this.models.remove(workspaceId, id, parseCascade(cascade));
  }

  // 저장 없이 한 번 호출해 보는 용도 (응답 텍스트, 토큰, 지연시간, 비용)
  @Post(':id/test')
  @HttpCode(200)
  async test(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: TestModelDto,
  ) {
    const config = await this.models.findOne(workspaceId, id);
    try {
      return await this.llm.generate(config, dto.prompt);
    } catch (error) {
      if (error instanceof LlmCallError) {
        throw new BadGatewayException(`모델 호출에 실패했습니다: ${error.message}`);
      }
      throw error;
    }
  }
}
