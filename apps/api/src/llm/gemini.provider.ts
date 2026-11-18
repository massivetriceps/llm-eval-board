import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import type { GenerateOptions, LlmProvider, LlmResult } from './llm.types';

@Injectable()
export class GeminiProvider implements LlmProvider {
  private client?: GoogleGenAI;

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY 가 설정되지 않았습니다.',
      );
    }
    this.client ??= new GoogleGenAI({ apiKey });
    return this.client;
  }

  async generate(
    model: string,
    prompt: string,
    options: GenerateOptions,
  ): Promise<LlmResult> {
    const client = this.getClient();
    const startedAt = performance.now();
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    });
    const usage = response.usageMetadata;
    return {
      text: response.text ?? '',
      inputTokens: usage?.promptTokenCount ?? 0,
      // 생각(thinking) 토큰도 출력 단가로 과금되므로 함께 더한다
      outputTokens:
        (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}
