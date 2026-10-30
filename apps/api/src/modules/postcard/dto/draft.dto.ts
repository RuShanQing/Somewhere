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
    description:
      '收件人 ID；草稿阶段可以为空。若同时提供 passageId，则必须与共途对方一致',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4', { message: '收件人 ID 不合法' })
  recipientId?: string | null;

  @ApiPropertyOptional({
    description:
      '共途 ID；提供后收件人由服务端解析为共途对方，创建后不可改绑',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4', { message: '共途 ID 不合法' })
  passageId?: string | null;

  @ApiPropertyOptional({
    description:
      '被回信的明信片 ID；提供后收件人与共途由原信推导，创建后不可改绑',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4', { message: '回信目标不合法' })
  replyToPostcardId?: string | null;
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
