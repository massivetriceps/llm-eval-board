import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CredentialsDto {
  @IsEmail()
  email: string;

  // bcrypt는 72바이트까지만 해시에 반영하므로 상한을 둔다
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
