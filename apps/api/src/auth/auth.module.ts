import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error('JWT_SECRET 환경변수가 필요합니다. apps/api/.env 를 확인하세요.');
}

@Global()
@Module({
  imports: [JwtModule.register({ secret, signOptions: { expiresIn: '7d' } })],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
