import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 全仓库统一的错误响应契约，供各模块的 Swagger 标注复用。 */
export class ErrorResponseDto {
  @ApiProperty({ description: '稳定的业务错误码', example: 'AUTH_INVALID_CREDENTIALS' })
  code!: string;

  @ApiProperty({ description: '面向用户的错误说明', example: '邮箱或密码不正确' })
  message!: string;

  @ApiProperty({ description: '请求追踪 ID', example: '0f8d1f60-6f3f-4f2b-9d0a-2f0f3f2a1b4c' })
  requestId!: string;

  @ApiPropertyOptional({
    description: '字段级校验信息，仅包含字段名与规则，不回显输入值',
    type: [String],
    example: ['password:length'],
  })
  details?: string[];
}
