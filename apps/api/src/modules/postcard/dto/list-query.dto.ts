import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PostcardListQueryDto {
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
