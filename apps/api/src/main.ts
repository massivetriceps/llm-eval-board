import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  configureApp(app);

  // API 문서: /docs 에서 엔드포인트를 확인하고 직접 호출해 볼 수 있다.
  // 통합 테스트는 이 파일을 거치지 않아서 영향이 없다
  const config = new DocumentBuilder()
    .setTitle('LLM Eval Board API')
    .setDescription('LLM 모델/프롬프트 비교 평가 API. 로그인 후 받은 accessToken 을 Authorize 에 넣으면 호출할 수 있다.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // 모든 엔드포인트에 Bearer 인증을 표시한다 (signup/login 은 토큰 없이도 호출된다)
  document.security = [{ bearer: [] }];
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
