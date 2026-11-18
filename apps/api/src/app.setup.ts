import { INestApplication, ValidationPipe } from '@nestjs/common';

// 서버(main.ts)와 통합 테스트가 같은 설정을 쓰도록 한곳에 모은다
export function configureApp(app: INestApplication) {
  // DTO 검증: 정의되지 않은 필드는 제거하고, 형식이 틀리면 400으로 응답
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // 프런트엔드(다른 주소에서 실행)가 API 를 부를 수 있게 허용한다. WEB_ORIGIN 은 쉼표로 여러 개 지정 가능
  const origins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });
}
