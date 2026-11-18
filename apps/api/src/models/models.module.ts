import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ModelsController } from './models.controller';
import { ModelsService } from './models.service';

@Module({
  imports: [WorkspacesModule, LlmModule],
  controllers: [ModelsController],
  providers: [ModelsService],
})
export class ModelsModule {}
