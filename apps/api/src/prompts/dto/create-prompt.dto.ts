import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePromptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  // 질문이 들어갈 자리를 {{input}} 으로 표시한다
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  @Matches(/\{\{input\}\}/, { message: '템플릿에 {{input}} 이 포함되어야 합니다.' })
  template: string;
}
