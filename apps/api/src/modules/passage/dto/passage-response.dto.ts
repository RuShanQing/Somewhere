import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const PASSAGE_KINDS = ['ONE_OFF', 'ONGOING', 'SEASONAL'] as const;
export const PASSAGE_PROGRESS_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export const PASSAGE_CONSENT_STATES = ['ALLOW', 'PAUSED', 'CLOSED'] as const;

export class PassageCityDto {
  @ApiProperty({ description: '城市 ID' })
  id!: string;

  @ApiProperty({ description: '城市名', example: '里斯本' })
  name!: string;

  @ApiProperty({ description: '国家代码', example: 'PT' })
  countryCode!: string;
}

export class PassageSelfDto {
  @ApiProperty({ enum: PASSAGE_CONSENT_STATES, description: '本人当前通信意愿' })
  consentState!: (typeof PASSAGE_CONSENT_STATES)[number];

  @ApiPropertyOptional({ type: String, nullable: true, description: '本次停泊时间' })
  pausedAt!: string | null;
}

export class PassageCounterpartDto {
  @ApiProperty({ description: '对方公开昵称；不返回邮箱或用户 ID' })
  nickname!: string;

  @ApiPropertyOptional({ type: () => PassageCityDto, nullable: true, description: '对方公开城市' })
  city!: PassageCityDto | null;

  @ApiProperty({ enum: PASSAGE_CONSENT_STATES, description: '对方当前通信意愿；不返回原因' })
  consentState!: (typeof PASSAGE_CONSENT_STATES)[number];
}

export class PassagePermissionsDto {
  @ApiProperty({
    description: '当前是否允许开展新的共途通信；由进度与双方意愿共同决定',
  })
  canSend!: boolean;
}

export class PassageSummaryDto {
  @ApiProperty({ description: '共途 ID' })
  id!: string;

  @ApiProperty({ description: '共同主题' })
  topic!: string;

  @ApiProperty({ enum: PASSAGE_KINDS, description: '共途类型' })
  kind!: (typeof PASSAGE_KINDS)[number];

  @ApiProperty({ enum: PASSAGE_PROGRESS_STATUSES, description: '经历进度' })
  progressStatus!: (typeof PASSAGE_PROGRESS_STATUSES)[number];

  @ApiProperty({ description: '创建时间（UTC ISO 8601）' })
  createdAt!: string;

  @ApiProperty({ description: '最后更新时间（UTC ISO 8601）' })
  updatedAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: '完成时间' })
  completedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '归档时间' })
  archivedAt!: string | null;

  @ApiProperty({ type: () => PassageSelfDto })
  me!: PassageSelfDto;

  @ApiProperty({ type: () => PassageCounterpartDto })
  counterpart!: PassageCounterpartDto;

  @ApiProperty({ type: () => PassagePermissionsDto })
  permissions!: PassagePermissionsDto;
}

export class PassageListDto {
  @ApiProperty({ type: () => [PassageSummaryDto] })
  items!: PassageSummaryDto[];
}
