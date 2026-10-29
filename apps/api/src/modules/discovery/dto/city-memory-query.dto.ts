import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 与 StoryModule 的主题标签上限保持一致，避免两处筛选语义漂移。 */
export const CITY_MEMORY_TOPIC_MAX_LENGTH = 24;

export class CityMemoryQueryDto {
  @ApiPropertyOptional({
    description: '按主题标签精确筛选；为空时返回全部有公开故事的城市',
    example: '雨天',
    maxLength: CITY_MEMORY_TOPIC_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: '主题必须是字符串' })
  @MaxLength(CITY_MEMORY_TOPIC_MAX_LENGTH, {
    message: `主题不能超过 ${CITY_MEMORY_TOPIC_MAX_LENGTH} 个字符`,
  })
  topic?: string;
}
