import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PersonalMemoryDto {
  @ApiProperty({ description: '个人记忆 ID' })
  id!: string;

  @ApiProperty({ description: '标题', example: '港口的风' })
  title!: string;

  @ApiProperty({ description: '正文；只返回给本人', example: '傍晚的港口有一点咸味。' })
  body!: string;

  @ApiProperty({ description: '创建时间（UTC ISO 8601）' })
  createdAt!: string;

  @ApiProperty({ description: '最后更新时间（UTC ISO 8601）' })
  updatedAt!: string;
}

export class PersonalMemoryListDto {
  @ApiProperty({ type: () => [PersonalMemoryDto] })
  items!: PersonalMemoryDto[];
}

export class PersonalMemoryListQueryDto {
  @ApiPropertyOptional({ description: '返回数量，1–50，默认 20', minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit 必须是整数' })
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: '偏移量，默认 0', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset 必须是整数' })
  @Min(0)
  offset?: number;
}
