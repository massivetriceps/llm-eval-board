import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../workspaces/workspace-owner.guard';
import { DatasetsService } from './datasets.service';
import { CreateDatasetDto } from './dto/create-dataset.dto';

@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/datasets')
export class DatasetsController {
  constructor(private readonly datasets: DatasetsService) {}

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateDatasetDto,
  ) {
    return this.datasets.create(workspaceId, dto);
  }

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.datasets.list(workspaceId);
  }

  @Get(':id')
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.datasets.findOne(workspaceId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.datasets.remove(workspaceId, id);
  }
}
