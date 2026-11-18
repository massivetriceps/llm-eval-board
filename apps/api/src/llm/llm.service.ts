import { Injectable } from '@nestjs/common';
import { envNumber } from '../common/env';
import { IntervalLimiter, intervalForRpm } from '../common/rate-limiter';
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
  // 모델마다 따로 둔다. 제공자의 분당 호출 제한은 보통 모델 단위로 적용된다
  private readonly limiters = new Map<string, IntervalLimiter>();

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

  // LLM_RPM(분당 호출 수)을 정하면 호출 시작 간격을 벌려서 제한을 넘지 않게 한다.
  // 무료 티어처럼 분당 5회로 묶인 키에서도 끝까지 돌 수 있다. 정하지 않으면 제한 없음
  private limiterFor(config: ModelCallConfig): IntervalLimiter | null {
    const rpm = envNumber('LLM_RPM', 0);
    if (rpm <= 0 || config.provider === 'mock') return null;
    const key = `${config.provider}:${config.model}`;
    let limiter = this.limiters.get(key);
    if (!limiter) {
      limiter = new IntervalLimiter(intervalForRpm(rpm));
      this.limiters.set(key, limiter);
    }
    return limiter;
  }

  // 실패하면 항상 LlmCallError 를 던진다 (재시도 가능 여부, 중단 여부가 담겨 있다)
  async generate(config: ModelCallConfig, prompt: string) {
    try {
      const provider = this.pick(config.provider);
      // 차례를 기다리는 시간은 응답 타임아웃에 포함하지 않는다
      await this.limiterFor(config)?.acquire();
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
