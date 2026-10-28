import { ApiProperty } from '@nestjs/swagger';
import { RECEPTION_MODES, type ReceptionModeValue } from '../domain/reception';
import { CitySummaryDto } from './city-summary.dto';

export class ProfileResponseDto {
  @ApiProperty({ description: '用户 ID（UUID）', example: '0b6a3b1e-2bd4-4a5f-9a2c-2a3f4c5d6e7f' })
  userId!: string;

  @ApiProperty({ description: '公开昵称', example: '海边写信的人' })
  nickname!: string;

  @ApiProperty({
    description: '城市；null 表示未设置。仅包含城市级信息',
    type: () => CitySummaryDto,
    nullable: true,
  })
  city!: CitySummaryDto | null;

  @ApiProperty({
    description: '接信状态',
    enum: RECEPTION_MODES,
    example: 'OPEN',
  })
  receptionMode!: ReceptionModeValue;
}
