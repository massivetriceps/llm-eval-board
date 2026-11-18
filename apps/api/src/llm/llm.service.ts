import { BadGatewayException, Injectable } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';
import type { LlmProvider } from './llm.types';
import { OpenAiProvider } from './openai.provider';

export interface ModelCallConfig {
  provider: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  inputPricePerM: number;
  outputPricePerM: number;
}

@Injectable()
export class LlmService {
  constructor(
    private readonly openai: OpenAiProvider,
    private readonly gemini: GeminiProvider,
  ) {}

  private pick(provider: string): LlmProvider {
    if (provider === 'openai') return this.openai;
    if (provider === 'gemini') return this.gemini;
    throw new BadGatewayException(`지원하지 않는 provider 입니다: ${provider}`);
  }

  async generate(config: ModelCallConfig, prompt: string) {
    const provider = this.pick(config.provider);
    try {
      const result = await provider.generate(config.model, prompt, {
        temperature: config.temperature ?? undefined,
        maxTokens: config.maxTokens ?? undefined,
      });
      // 단가는 100만 토큰당 USD
      const costUsd =
        (result.inputTokens * config.inputPricePerM +
          result.outputTokens * config.outputPricePerM) /
        1_000_000;
      return { ...result, costUsd };
    } catch (error) {
      // 키 미설정 등 이미 HTTP 예외인 것은 그대로 올린다
      if (error instanceof Error && 'getStatus' in error) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`모델 호출에 실패했습니다: ${message}`);
    }
  }
}
