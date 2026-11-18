import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ScoringService } from './scoring.service';

@Module({
  imports: [LlmModule],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
