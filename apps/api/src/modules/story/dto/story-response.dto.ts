import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StoryCityDto {
  @ApiProperty({ description: '城市 ID' })
  id!: string;

  @ApiProperty({ description: '城市名', example: '里斯本' })
  name!: string;

  @ApiProperty({ description: '国家代码', example: 'PT' })
  countryCode!: string;
}

const REVIEW_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'REMOVED'] as const;

export class OwnStoryDto {
  @ApiProperty({ description: '故事 ID' })
  id!: string;

  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiProperty({ description: '正文；只返回给作者本人' })
  body!: string;

  @ApiProperty({ type: [String], description: '主题标签' })
  topicTags!: string[];

  @ApiProperty({ type: () => StoryCityDto })
  city!: StoryCityDto;

  @ApiProperty({ enum: REVIEW_STATUSES, description: '审核状态' })
  reviewStatus!: (typeof REVIEW_STATUSES)[number];

  @ApiPropertyOptional({ type: String, nullable: true, description: '提交审核时间' })
  submittedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '最近审核时间' })
  reviewedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '公开时间；审核通过但排队时为 null' })
  publishedAt!: string | null;

  @ApiPropertyOptional({
    enum: ['AUTHOR', 'MODERATOR'],
    nullable: true,
    description: '撤回/下架来源；仅作者本人可见',
  })
  removedBy!: 'AUTHOR' | 'MODERATOR' | null;

  @ApiProperty({ description: '创建时间（UTC ISO 8601）' })
  createdAt!: string;

  @ApiProperty({ description: '最后更新时间（UTC ISO 8601）' })
  updatedAt!: string;
}

export class PublicStoryItemDto {
  @ApiProperty({ description: '故事 ID' })
  id!: string;

  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiProperty({ description: '正文摘要' })
  excerpt!: string;

  @ApiProperty({ type: [String], description: '主题标签' })
  topicTags!: string[];

  @ApiProperty({ description: '作者公开昵称；不返回邮箱或用户 ID' })
  authorNickname!: string;

  @ApiProperty({ type: () => StoryCityDto })
  city!: StoryCityDto;

  @ApiProperty({ description: '公开时间（UTC ISO 8601）' })
  publishedAt!: string;
}

export class PublicStoryDetailDto {
  @ApiProperty({ description: '故事 ID' })
  id!: string;

  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiProperty({ description: '正文' })
  body!: string;

  @ApiProperty({ type: [String], description: '主题标签' })
  topicTags!: string[];

  @ApiProperty({ description: '作者公开昵称' })
  authorNickname!: string;

  @ApiProperty({ type: () => StoryCityDto })
  city!: StoryCityDto;

  @ApiProperty({ description: '公开时间（UTC ISO 8601）' })
  publishedAt!: string;
}

export class PublicStoryListDto {
  @ApiProperty({ type: () => [PublicStoryItemDto] })
  items!: PublicStoryItemDto[];

  @ApiPropertyOptional({ type: String, nullable: true, description: '下一页游标' })
  nextCursor!: string | null;
}

export class ModerationStoryItemDto {
  @ApiProperty({ description: '故事 ID' })
  id!: string;

  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiProperty({ description: '正文；仅管理员审核队列可见' })
  body!: string;

  @ApiProperty({ type: [String], description: '主题标签' })
  topicTags!: string[];

  @ApiProperty({ description: '作者公开昵称；不返回邮箱' })
  authorNickname!: string;

  @ApiProperty({ type: () => StoryCityDto })
  city!: StoryCityDto;

  @ApiProperty({ description: '提交审核时间（UTC ISO 8601）' })
  submittedAt!: string;
}

export class ModerationQueueDto {
  @ApiProperty({ type: () => [ModerationStoryItemDto] })
  items!: ModerationStoryItemDto[];

  @ApiPropertyOptional({ type: String, nullable: true, description: '下一页游标' })
  nextCursor!: string | null;
}

export class StoryDecisionResponseDto {
  @ApiProperty({ description: '故事 ID' })
  id!: string;

  @ApiProperty({ enum: REVIEW_STATUSES, description: '决策后的状态' })
  reviewStatus!: (typeof REVIEW_STATUSES)[number];

  @ApiPropertyOptional({ type: String, nullable: true, description: '公开时间；排队时为 null' })
  publishedAt!: string | null;
}
