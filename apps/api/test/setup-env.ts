// 통합 테스트용 환경 설정. 앱 모듈이 읽히기 전에 실행된다 (jest-e2e.json 의 setupFiles)
import 'dotenv/config';

process.env.JWT_SECRET ??= 'e2e-test-secret';
// 재시도 대기를 짧게 해서 테스트가 빨리 끝나게 한다
process.env.LLM_MAX_ATTEMPTS = '3';
process.env.LLM_RETRY_BASE_MS = '5';
process.env.LLM_RETRY_MAX_MS = '20';
