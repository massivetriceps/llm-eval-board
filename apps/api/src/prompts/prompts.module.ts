import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [PromptsController],
  providers: [PromptsService],
})
export class PromptsModule {}
