import { Module } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';
import { LlmService } from './llm.service';
import { OpenAiProvider } from './openai.provider';

@Module({
  providers: [OpenAiProvider, GeminiProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
