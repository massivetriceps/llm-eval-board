import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../workspaces/workspace-owner.guard';
import { CreateRunDto } from './dto/create-run.dto';
import { RunsService } from './runs.service';

@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  // 실행은 백그라운드에서 진행되므로 접수만 하고 202 로 응답한다
  @Post()
  @HttpCode(202)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateRunDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.runs.create(workspaceId, dto, idempotencyKey);
  }

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.runs.list(workspaceId);
  }

  // 같은 데이터셋으로 실행한 결과 2~6개를 나란히 비교한다. :id 보다 먼저 선언해야 한다
  @Get('compare')
  compare(
    @Param('workspaceId') workspaceId: string,
    @Query('ids') ids?: string,
  ) {
    return this.runs.compare(workspaceId, ids);
  }

  @Get(':id')
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.runs.findOne(workspaceId, id);
  }

  @Get(':id/results')
  results(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.runs.results(workspaceId, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.runs.cancel(workspaceId, id);
  }
}
