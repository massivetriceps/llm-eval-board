import { Injectable } from '@nestjs/common';
import type { LlmProvider, LlmResult } from './llm.types';

class MockApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 외부 API 없이 개발·테스트하기 위한 가짜 모델. model 이름으로 동작이 정해진다.
//  mock           : 빠르게 성공
//  mock-slow      : 3초 지연 후 성공 (타임아웃 확인용)
//  mock-flaky     : 40% 확률로 503 (재시도 확인용)
//  mock-down      : 항상 503 (재시도 소진 확인용)
//  mock-bad-key   : 항상 401 (실행 중단 확인용)
@Injectable()
export class MockProvider implements LlmProvider {
  async generate(model: string, prompt: string): Promise<LlmResult> {
    const startedAt = performance.now();
    await sleep(model === 'mock-slow' ? 3000 : 100 + Math.random() * 200);

    if (model === 'mock-bad-key') {
      throw new MockApiError('invalid api key', 401);
    }
    if (model === 'mock-down') {
      throw new MockApiError('service unavailable', 503);
    }
    if (model === 'mock-flaky' && Math.random() < 0.4) {
      throw new MockApiError('service unavailable', 503);
    }

    const text = `[mock] ${prompt.slice(-40)}`;
    return {
      text,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}
