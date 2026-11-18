import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import type { GenerateOptions, LlmProvider, LlmResult } from './llm.types';

@Injectable()
export class OpenAiProvider implements LlmProvider {
  private client?: OpenAI;

  private getClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY 가 설정되지 않았습니다.',
      );
    }
    this.client ??= new OpenAI({ apiKey });
    return this.client;
  }

  async generate(
    model: string,
    prompt: string,
    options: GenerateOptions,
  ): Promise<LlmResult> {
    const client = this.getClient();
    const startedAt = performance.now();
    // 일부 모델은 temperature 를 지원하지 않으므로 값이 있을 때만 보낸다
    const response = await client.responses.create({
      model,
      input: prompt,
      ...(options.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.maxTokens !== undefined
        ? { max_output_tokens: options.maxTokens }
        : {}),
    });
    return {
      text: response.output_text,
      // output_tokens 에는 추론(reasoning) 토큰이 포함된다
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}
