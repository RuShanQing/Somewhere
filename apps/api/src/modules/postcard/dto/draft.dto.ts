import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePostcardDraftDto {
  @ApiProperty({
    description: '明信片正文，1–2000 个 Unicode 字符，不能全是空白',
    example: '今天海面很安静，想把这句话慢慢寄给你。',
  })
  @IsString({ message: '正文必须是字符串' })
  body!: string;

  @ApiPropertyOptional({
    description: '收件人 ID；草稿阶段可以为空，寄出前必须填写',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4', { message: '收件人 ID 不合法' })
  recipientId?: string | null;
}

export class UpdatePostcardDraftDto {
  @ApiPropertyOptional({
    description: '明信片正文，1–2000 个 Unicode 字符，不能全是空白',
    example: '改短一点，也慢一点。',
  })
  @IsOptional()
  @IsString({ message: '正文必须是字符串' })
  body?: string;

  @ApiPropertyOptional({
    description: '收件人 ID；传 null 表示清空',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4', { message: '收件人 ID 不合法' })
  recipientId?: string | null;
}
