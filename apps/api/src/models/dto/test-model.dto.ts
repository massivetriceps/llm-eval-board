import { IsString, MaxLength, MinLength } from 'class-validator';

export class TestModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  prompt: string;
}
