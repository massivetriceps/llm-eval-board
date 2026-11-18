import { Injectable } from '@nestjs/common';
import { RetryFailure, withRetry } from '../common/retry';
import { LlmCallError } from '../llm/llm.errors';
import { LlmService, type ModelCallConfig } from '../llm/llm.service';
import { llmRetryOptions } from '../llm/retry-policy';
import {
  buildJudgePrompt,
  parseJudgeVerdict,
  scoreContains,
  scoreExact,
  type ScorerName,
} from './scorers';

export interface ScoreRequest {
  scorer: ScorerName;
  question: string;
  expected: string | null;
  answer: string;
  judge: ModelCallConfig | null;
}

export interface ScoreOutcome {
  // 0~1. 채점하지 않았거나 실패하면 null
  score: number | null;
  reason?: string;
  error?: string;
  judgeCostUsd: number;
  // 키 오류처럼 계속해도 의미 없는 심판 오류. 실행을 멈추는 데 쓴다
  fatal?: string;
}

// 외부 API 동시 호출 제한을 실행기와 공유하기 위해 호출 1회를 감싸는 함수를 받는다
export type Limit = <T>(task: () => Promise<T>) => Promise<T>;

@Injectable()
export class ScoringService {
  constructor(private readonly llm: LlmService) {}

  async score(request: ScoreRequest, limit: Limit): Promise<ScoreOutcome> {
    const { scorer, expected, answer } = request;
    if (scorer === 'none') return { score: null, judgeCostUsd: 0 };

    if (scorer === 'exact' || scorer === 'contains') {
      if (!expected || expected.trim() === '') {
        return {
          score: null,
          error: '정답(expected)이 없어 채점하지 않았습니다.',
          judgeCostUsd: 0,
        };
      }
      const score =
        scorer === 'exact'
          ? scoreExact(answer, expected)
          : scoreContains(answer, expected);
      return { score, judgeCostUsd: 0 };
    }

    return this.judge(request, limit);
  }

  private async judge(
    request: ScoreRequest,
    limit: Limit,
  ): Promise<ScoreOutcome> {
    const { judge } = request;
    if (!judge) {
      return {
        score: null,
        error: '채점 모델이 지정되지 않았습니다.',
        judgeCostUsd: 0,
      };
    }
    const prompt = buildJudgePrompt({
      question: request.question,
      expected: request.expected,
      answer: request.answer,
    });
    try {
      const { value } = await withRetry(
        () => limit(() => this.llm.generate(judge, prompt)),
        llmRetryOptions(),
        (error) => error instanceof LlmCallError && error.retryable,
      );
      const verdict = parseJudgeVerdict(value.text);
      if (!verdict) {
        // 호출 비용은 이미 발생했으므로 기록하되 점수는 비워 둔다
        return {
          score: null,
          error: '심판 응답을 해석하지 못했습니다.',
          judgeCostUsd: value.costUsd,
        };
      }
      return {
        score: verdict.score,
        reason: verdict.reason,
        judgeCostUsd: value.costUsd,
      };
    } catch (error) {
      const cause = error instanceof RetryFailure ? error.causeError : error;
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        score: null,
        error: `심판 호출 실패: ${message}`,
        judgeCostUsd: 0,
        fatal:
          cause instanceof LlmCallError && cause.fatal
            ? `채점 모델 오류: ${message}`
            : undefined,
      };
    }
  }
}
