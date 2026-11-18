import { Module } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';
import { LlmService } from './llm.service';
import { MockProvider } from './mock.provider';
import { OpenAiProvider } from './openai.provider';

@Module({
  providers: [OpenAiProvider, GeminiProvider, MockProvider, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
