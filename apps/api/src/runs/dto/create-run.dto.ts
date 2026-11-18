import { IsIn, IsOptional, IsUUID } from 'class-validator';
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
}
