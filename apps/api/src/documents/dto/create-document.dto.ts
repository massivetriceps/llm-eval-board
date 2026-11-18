import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  // 검색 대상이 되는 본문. 빈 줄로 문단을 나눈다
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  text: string;
}
