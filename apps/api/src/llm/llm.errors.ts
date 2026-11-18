import { HttpException } from '@nestjs/common';

export class LlmCallError extends Error {
  constructor(
    message: string,
    // 같은 요청을 다시 보내면 성공할 수 있는 오류인가 (503, 429, 타임아웃 등)
    readonly retryable: boolean,
    readonly status?: number,
    // 실행 전체를 중단해야 하는 오류인가 (키 오류, 모델 없음 등)
    readonly fatal = false,
    // 제공자가 "이만큼 기다렸다가 다시 보내라"고 알려 준 시간(ms)
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LlmCallError';
  }
}

// 429 응답에 담긴 대기 시간을 읽는다. 예: "retryDelay":"29s", "Please retry in 29.49s."
export function parseRetryAfterMs(message: string): number | undefined {
  const match =
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(message) ??
    /retry in (\d+(?:\.\d+)?)\s*s/i.exec(message);
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
}

// 하루 한도(예: 무료 티어 하루 20회)를 다 쓴 429 인가. 몇 시간 뒤에나 풀리므로 기다려도 소용이 없다
export function isDailyQuotaExceeded(message: string): boolean {
  return /PerDay|requests per day|per day limit/i.test(message);
}

function describeDailyQuota(message: string): string {
  const model = /model:\s*([\w.\-]+)/.exec(message)?.[1];
  const delayMs = parseRetryAfterMs(message);
  const hours =
    delayMs === undefined ? '' : ` 약 ${Math.ceil(delayMs / 3_600_000)}시간 뒤에 초기화됩니다.`;
  return `일일 호출 한도를 모두 사용했습니다${model ? ` (${model})` : ''}.${hours} 다른 모델을 쓰거나 한도가 초기화된 뒤 다시 실행하세요.`;
}

function extractStatus(error: unknown, message: string): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status;
  }
  // Gemini SDK 는 오류 본문(JSON)을 메시지에 담아 주므로 거기서 code 를 읽는다
  const match = /"code"\s*:\s*(\d{3})/.exec(message);
  return match ? Number(match[1]) : undefined;
}

export function toLlmCallError(error: unknown): LlmCallError {
  if (error instanceof LlmCallError) return error;
  // API 키 미설정 같은 우리 쪽 설정 문제: 재시도해도 소용없고 실행 전체가 의미 없다
  if (error instanceof HttpException) {
    return new LlmCallError(error.message, false, error.getStatus(), true);
  }
  const message = error instanceof Error ? error.message : String(error);
  const status = extractStatus(error, message);
  if (status === undefined) {
    // 상태 코드가 없으면 네트워크 오류 등으로 보고 재시도 대상으로 둔다
    return new LlmCallError(message, true);
  }
  // 일일 한도는 재시도해도 소용이 없고 다음 질문도 같은 이유로 실패하므로 실행 전체를 멈춘다
  if (status === 429 && isDailyQuotaExceeded(message)) {
    return new LlmCallError(describeDailyQuota(message), false, status, true);
  }
  const retryable = status === 408 || status === 429 || status >= 500;
  const fatal = status === 401 || status === 403 || status === 404;
  return new LlmCallError(
    message,
    retryable,
    status,
    fatal,
    status === 429 ? parseRetryAfterMs(message) : undefined,
  );
}
