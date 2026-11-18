import { Injectable } from '@nestjs/common';
import { envNumber } from '../common/env';
import { GeminiProvider } from './gemini.provider';
import { LlmCallError, toLlmCallError } from './llm.errors';
import type { LlmProvider } from './llm.types';
import { MockProvider } from './mock.provider';
import { OpenAiProvider } from './openai.provider';

export interface ModelCallConfig {
  provider: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  inputPricePerM: number;
  outputPricePerM: number;
}

// 응답이 오지 않는 요청을 끊는다. (진행 중이던 HTTP 요청 자체는 취소하지 않고 결과만 버린다)
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new LlmCallError(`${ms}ms 안에 응답이 오지 않았습니다.`, true, 408),
      );
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class LlmService {
  constructor(
    private readonly openai: OpenAiProvider,
    private readonly gemini: GeminiProvider,
    private readonly mock: MockProvider,
  ) {}

  private pick(provider: string): LlmProvider {
    if (provider === 'openai') return this.openai;
    if (provider === 'gemini') return this.gemini;
    if (provider === 'mock') return this.mock;
    throw new LlmCallError(
      `지원하지 않는 provider 입니다: ${provider}`,
      false,
      undefined,
      true,
    );
  }

  // 실패하면 항상 LlmCallError 를 던진다 (재시도 가능 여부, 중단 여부가 담겨 있다)
  async generate(config: ModelCallConfig, prompt: string) {
    try {
      const provider = this.pick(config.provider);
      const result = await withTimeout(
        provider.generate(config.model, prompt, {
          temperature: config.temperature ?? undefined,
          maxTokens: config.maxTokens ?? undefined,
        }),
        envNumber('LLM_TIMEOUT_MS', 60_000),
      );
      // 단가는 100만 토큰당 USD
      const costUsd =
        (result.inputTokens * config.inputPricePerM +
          result.outputTokens * config.outputPricePerM) /
        1_000_000;
      return { ...result, costUsd };
    } catch (error) {
      throw toLlmCallError(error);
    }
  }
}
