import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const PASSAGE_STATUS_FILTERS = ['ALL', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

export type PassageStatusFilter = (typeof PASSAGE_STATUS_FILTERS)[number];

export class PassageListQueryDto {
  @ApiPropertyOptional({
    description: '按经历进度筛选；缺省 ALL，只返回本人参与的共途',
    enum: PASSAGE_STATUS_FILTERS,
  })
  @IsOptional()
  @IsIn(PASSAGE_STATUS_FILTERS, { message: '共途状态筛选不合法' })
  status?: PassageStatusFilter;
}
