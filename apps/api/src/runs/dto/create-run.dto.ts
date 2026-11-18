import { IsUUID } from 'class-validator';

export class CreateRunDto {
  @IsUUID()
  datasetId: string;

  @IsUUID()
  promptId: string;

  @IsUUID()
  modelConfigId: string;
}
