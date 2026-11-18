import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { SCORERS, type ScorerName } from '../../scoring/scorers';

export class CreateRunDto {
  @IsUUID()
  datasetId: string;

  @IsUUID()
  promptId: string;

  @IsUUID()
  modelConfigId: string;

  // 채점 방식. 생략하면 채점하지 않는다
  @IsOptional()
  @IsIn(SCORERS)
  scorer?: ScorerName;

  // scorer 가 judge 일 때 채점을 맡을 모델 설정
  @IsOptional()
  @IsUUID()
  judgeModelConfigId?: string;

  // RAG: 프롬프트의 {{context}} 에 넣을 문서. 지정하면 질문마다 관련 문단을 찾아 넣는다
  @IsOptional()
  @IsUUID()
  documentId?: string;

  // 질문마다 가져올 문단 수 (기본 3)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  topK?: number;
}
