import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RunExecutor } from './run-executor.service';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [WorkspacesModule, LlmModule],
  controllers: [RunsController],
  providers: [RunsService, RunExecutor],
})
export class RunsModule {}
