import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateStoryDto {
  @ApiProperty({ description: '故事所属城市 ID（静态城市目录）' })
  @IsUUID('4', { message: '城市 ID 不合法' })
  cityId!: string;

  @ApiProperty({ description: '标题，1–80 个 Unicode 字符', example: '雨夜书店' })
  @IsString({ message: '标题必须是字符串' })
  title!: string;

  @ApiProperty({
    description: '正文，20–3000 个 Unicode 字符，不能全是空白',
    example: '雨落在旧书店的玻璃上，店里的人都没有说话。',
  })
  @IsString({ message: '正文必须是字符串' })
  body!: string;

  @ApiPropertyOptional({
    description: '主题标签，最多 3 个，每个 1–24 字符',
    type: [String],
    example: ['城市日常', '雨天'],
  })
  @IsOptional()
  @IsArray({ message: '主题标签必须是数组' })
  @ArrayMaxSize(10, { message: '主题标签过多' })
  @IsString({ each: true, message: '主题标签必须是字符串' })
  topicTags?: string[];
}

export class UpdateStoryDto {
  @ApiPropertyOptional({ description: '标题，1–80 个 Unicode 字符' })
  @IsOptional()
  @IsString({ message: '标题必须是字符串' })
  title?: string;

  @ApiPropertyOptional({ description: '正文，20–3000 个 Unicode 字符' })
  @IsOptional()
  @IsString({ message: '正文必须是字符串' })
  body?: string;

  @ApiPropertyOptional({
    description: '主题标签，最多 3 个，每个 1–24 字符',
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: '主题标签必须是数组' })
  @ArrayMaxSize(10, { message: '主题标签过多' })
  @IsString({ each: true, message: '主题标签必须是字符串' })
  topicTags?: string[];

  @ApiPropertyOptional({ description: '故事所属城市 ID' })
  @IsOptional()
  @IsUUID('4', { message: '城市 ID 不合法' })
  cityId?: string;
}

export class PublicStoryListQueryDto {
  @ApiPropertyOptional({ description: '按城市筛选' })
  @IsOptional()
  @IsUUID('4', { message: '城市 ID 不合法' })
  cityId?: string;

  @ApiPropertyOptional({ description: '按主题标签精确筛选，最多 24 字符' })
  @IsOptional()
  @IsString({ message: '主题必须是字符串' })
  topic?: string;

  @ApiPropertyOptional({ description: '上一页返回的游标' })
  @IsOptional()
  @IsString({ message: '游标必须是字符串' })
  cursor?: string;

  @ApiPropertyOptional({ description: '每页数量，1–24，默认 12', minimum: 1, maximum: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit 必须是整数' })
  @Min(1, { message: 'limit 至少为 1' })
  @Max(24, { message: 'limit 最多为 24' })
  limit?: number;
}

export class ModerationQueueQueryDto {
  @ApiPropertyOptional({ description: '上一页返回的游标' })
  @IsOptional()
  @IsString({ message: '游标必须是字符串' })
  cursor?: string;

  @ApiPropertyOptional({ description: '每页数量，1–50，默认 20', minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit 必须是整数' })
  @Min(1, { message: 'limit 至少为 1' })
  @Max(50, { message: 'limit 最多为 50' })
  limit?: number;
}

export const STORY_REVIEW_REASONS = [
  'PRIVACY',
  'CONTACT_INFO',
  'HARASSMENT',
  'ILLEGAL',
  'OTHER',
] as const;

export class StoryDecisionDto {
  @ApiProperty({
    description: '审核动作；APPROVE/REJECT 只适用于 PENDING，REMOVE 适用于 PENDING/APPROVED',
    enum: ['APPROVE', 'REJECT', 'REMOVE'],
  })
  @IsIn(['APPROVE', 'REJECT', 'REMOVE'], { message: '审核动作不合法' })
  action!: 'APPROVE' | 'REJECT' | 'REMOVE';

  @ApiPropertyOptional({
    description: '固定原因码；只写入审计，不返回内部备注',
    enum: STORY_REVIEW_REASONS,
  })
  @IsOptional()
  @IsIn(STORY_REVIEW_REASONS, { message: '审核原因不合法' })
  reasonCode?: (typeof STORY_REVIEW_REASONS)[number];
}
