import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DiaryCityDto {
  @ApiProperty({ description: '城市 ID' })
  id!: string;

  @ApiProperty({ description: '城市名称', example: '东京' })
  name!: string;

  @ApiProperty({ description: '国家代码', example: 'JP' })
  countryCode!: string;
}

export class DiarySummaryDto {
  @ApiProperty({ description: '日记页面 ID' })
  id!: string;

  @ApiProperty({ description: '所属共途 ID' })
  passageId!: string;

  @ApiProperty({ description: '共途主题', example: '雨夜的东京' })
  topic!: string;

  @ApiProperty({ type: () => DiaryCityDto, description: '原信寄出城市' })
  leftCity!: DiaryCityDto;

  @ApiProperty({ type: () => DiaryCityDto, description: '回信寄出城市' })
  rightCity!: DiaryCityDto;

  @ApiProperty({ description: '原信寄出时间（UTC ISO 8601）' })
  leftSentAt!: string;

  @ApiProperty({ description: '回信寄出时间（UTC ISO 8601）' })
  rightSentAt!: string;

  @ApiProperty({ description: '页面形成时间（UTC ISO 8601）' })
  createdAt!: string;
}

export class DiaryListDto {
  @ApiProperty({ type: () => [DiarySummaryDto] })
  items!: DiarySummaryDto[];
}

export class DiaryPostcardDto {
  @ApiProperty({ description: '明信片 ID' })
  id!: string;

  @ApiProperty({ description: '寄件者公开昵称' })
  senderNickname!: string;

  @ApiProperty({ description: '正文；只返回给该页的两位参与者' })
  body!: string;

  @ApiProperty({ description: '寄出时间（UTC ISO 8601）' })
  sentAt!: string;

  @ApiPropertyOptional({
    description: '送达时间（UTC ISO 8601）；本页形成时必然已送达',
    type: String,
    nullable: true,
  })
  deliveredAt!: string | null;

  @ApiProperty({ type: () => DiaryCityDto, description: '寄出城市快照' })
  city!: DiaryCityDto;
}

export class DiaryDetailDto {
  @ApiProperty({ description: '日记页面 ID' })
  id!: string;

  @ApiProperty({ description: '所属共途 ID' })
  passageId!: string;

  @ApiProperty({ description: '共途主题', example: '雨夜的东京' })
  topic!: string;

  @ApiProperty({ description: '页面形成时间（UTC ISO 8601）' })
  createdAt!: string;

  @ApiProperty({ type: () => DiaryPostcardDto, description: '左页：被回信的原信' })
  left!: DiaryPostcardDto;

  @ApiProperty({ type: () => DiaryPostcardDto, description: '右页：回信' })
  right!: DiaryPostcardDto;
}

export class DiaryListQueryDto {
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
