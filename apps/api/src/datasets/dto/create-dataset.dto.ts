import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDatasetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  // 헤더가 input[,expected] 인 CSV 텍스트
  @IsString()
  @MinLength(1)
  csv: string;
}
