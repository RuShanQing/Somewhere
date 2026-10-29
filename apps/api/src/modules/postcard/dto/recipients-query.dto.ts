import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class RecipientsQueryDto {
  @ApiPropertyOptional({
    description:
      '共途 ID；提供时只返回该共途对方（且当前允许新的通信时），缺省使用演示白名单',
    type: String,
  })
  @IsOptional()
  @IsUUID('4', { message: '共途 ID 不合法' })
  passageId?: string;
}
