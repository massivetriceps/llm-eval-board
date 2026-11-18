import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  // DTO 검증: 정의되지 않은 필드는 제거하고, 형식이 틀리면 400으로 응답
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // 프런트엔드(다른 주소에서 실행)가 API 를 부를 수 있게 허용한다. WEB_ORIGIN 은 쉼표로 여러 개 지정 가능
  const origins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
