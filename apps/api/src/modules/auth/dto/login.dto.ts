import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '注册时使用的邮箱', example: 'traveler@example.test', maxLength: 254 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: '邮箱必须是字符串' })
  @IsNotEmpty({ message: '请填写邮箱' })
  @MaxLength(254, { message: '邮箱长度不能超过 254 个字符' })
  email!: string;

  @ApiProperty({ description: '账号密码', example: 'a-fictional-passphrase', maxLength: 256 })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '请填写密码' })
  @MaxLength(256, { message: '密码长度不能超过 256 个字符' })
  password!: string;
}
