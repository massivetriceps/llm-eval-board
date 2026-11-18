import { HttpException } from '@nestjs/common';

export class LlmCallError extends Error {
  constructor(
    message: string,
    // 같은 요청을 다시 보내면 성공할 수 있는 오류인가 (503, 429, 타임아웃 등)
    readonly retryable: boolean,
    readonly status?: number,
    // 실행 전체를 중단해야 하는 오류인가 (키 오류, 모델 없음 등)
    readonly fatal = false,
  ) {
    super(message);
    this.name = 'LlmCallError';
  }
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
  const retryable = status === 408 || status === 429 || status >= 500;
  const fatal = status === 401 || status === 403 || status === 404;
  return new LlmCallError(message, retryable, status, fatal);
}
