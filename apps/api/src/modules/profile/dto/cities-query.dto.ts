import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CITY_QUERY_MAX_LENGTH } from '../domain/city';

export class CitiesQueryDto {
  @ApiPropertyOptional({
    description: '按城市名称模糊搜索；为空时返回全部城市',
    example: '北',
    maxLength: CITY_QUERY_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: '搜索词必须是字符串' })
  @MaxLength(CITY_QUERY_MAX_LENGTH, {
    message: `搜索词不能超过 ${CITY_QUERY_MAX_LENGTH} 个字符`,
  })
  query?: string;
}
