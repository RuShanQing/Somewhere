import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreatePersonalMemoryDto {
  @ApiProperty({
    description: '标题，1–80 个字符；去首尾空白后不能为空',
    example: '港口的风',
  })
  @IsString({ message: '标题必须是字符串' })
  title!: string;

  @ApiProperty({
    description: '正文，1–3000 个字符；去首尾空白后不能为空',
    example: '傍晚的港口有一点咸味。',
  })
  @IsString({ message: '正文必须是字符串' })
  body!: string;
}

export class UpdatePersonalMemoryDto {
  @ApiPropertyOptional({
    description: '新标题，1–80 个字符；不传表示不修改',
    example: '港口的风（改）',
  })
  @IsOptional()
  @IsString({ message: '标题必须是字符串' })
  title?: string;

  @ApiPropertyOptional({
    description: '新正文，1–3000 个字符；不传表示不修改',
    example: '重新整理后的片段。',
  })
  @IsOptional()
  @IsString({ message: '正文必须是字符串' })
  body?: string;
}
