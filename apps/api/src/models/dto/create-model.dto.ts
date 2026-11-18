import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PROVIDERS } from '../../llm/llm.types';

export class CreateModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  @IsIn(PROVIDERS)
  provider: (typeof PROVIDERS)[number];

  // 예: gpt-5-mini, gemini-2.5-flash (서비스 문서의 현재 모델명을 확인)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  model: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxTokens?: number;

  // 100만 토큰당 USD
  @IsOptional()
  @IsNumber()
  @Min(0)
  inputPricePerM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outputPricePerM?: number;
}
