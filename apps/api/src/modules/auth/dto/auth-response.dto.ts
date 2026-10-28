import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 注册/登录的响应：只包含会话用户字段，不包含 email。 */
export class AuthSessionUserDto {
  @ApiProperty({ description: '用户 ID（UUID）', example: '0b6a3b1e-2bd4-4a5f-9a2c-2a3f4c5d6e7f' })
  id!: string;

  @ApiProperty({ description: '公开昵称', example: '海边写信的人' })
  nickname!: string;

  @ApiProperty({ description: '邮箱验证状态；本阶段尚未实现邮件发送', example: false })
  emailVerified!: boolean;

  @ApiPropertyOptional({
    description: '城市 ID，个人资料模块实现后填充',
    type: String,
    example: null,
    nullable: true,
  })
  cityId!: string | null;
}

/** 仅 `/auth/me`（以及未来的本人设置接口）返回的本人资料，额外包含 email。 */
export class AuthUserDto {
  @ApiProperty({ description: '用户 ID（UUID）', example: '0b6a3b1e-2bd4-4a5f-9a2c-2a3f4c5d6e7f' })
  id!: string;

  @ApiProperty({ description: '公开昵称', example: '海边写信的人' })
  nickname!: string;

  @ApiProperty({ description: '仅返回给本人的邮箱', example: 'traveler@example.test' })
  email!: string;

  @ApiProperty({ description: '邮箱验证状态；本阶段尚未实现邮件发送', example: false })
  emailVerified!: boolean;

  @ApiPropertyOptional({
    description: '城市 ID，个人资料模块实现后填充',
    type: String,
    example: null,
    nullable: true,
  })
  cityId!: string | null;
}
