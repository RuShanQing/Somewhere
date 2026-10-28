import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../domain/identity';

export class RegisterDto {
  @ApiProperty({
    description: '登录邮箱，大小写与前后空格会被正规化；不会展示给其他用户',
    example: 'traveler@example.test',
    maxLength: 254,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: '邮箱必须是字符串' })
  @MaxLength(254, { message: '邮箱长度不能超过 254 个字符' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @ApiProperty({
    description: '至少 12 个字符，允许更长的口令',
    example: 'a-fictional-passphrase',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString({ message: '密码必须是字符串' })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `密码长度需要在 ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 个字符之间`,
  })
  password!: string;

  @ApiProperty({ description: '1–32 个可显示字符的公开昵称', example: '海边写信的人', minLength: 1, maxLength: 32 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: '昵称必须是字符串' })
  @Length(1, 32, { message: '昵称长度需要在 1–32 个字符之间' })
  nickname!: string;

  @ApiProperty({ description: '成年人声明，必须为 true', example: true, type: Boolean })
  @IsBoolean({ message: '成年人声明必须是布尔值' })
  @Equals(true, { message: '需要确认已满 18 岁' })
  adultConfirmed!: boolean;
}
