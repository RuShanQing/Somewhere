import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { RECEPTION_MODES, type ReceptionModeValue } from '../domain/reception';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '公开昵称，1–32 个字符', example: '海边写信的人', minLength: 1, maxLength: 32 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString({ message: '昵称必须是字符串' })
  @Length(1, 32, { message: '昵称长度需要在 1–32 个字符之间' })
  nickname?: string;

  @ApiPropertyOptional({
    description: '城市 ID；传 null 表示清空城市',
    type: String,
    nullable: true,
    example: null,
  })
  @IsOptional()
  @IsUUID('4', { message: '城市 ID 不合法' })
  cityId?: string | null;

  @ApiPropertyOptional({
    description: '接信状态：OPEN 可接新信，RESTING 休息中，CLOSED 关闭',
    enum: RECEPTION_MODES,
    example: 'OPEN',
  })
  @IsOptional()
  @IsIn(RECEPTION_MODES, { message: '接信状态必须是 OPEN / RESTING / CLOSED' })
  receptionMode?: ReceptionModeValue;
}
