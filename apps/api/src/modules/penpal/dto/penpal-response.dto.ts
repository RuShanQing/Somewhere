import { ApiProperty } from '@nestjs/swagger';
import { PENPAL_STATUSES } from '../domain/penpal-policy';

export class PenpalCityDto {
  @ApiProperty({ description: '城市 ID' })
  id!: string;

  @ApiProperty({ description: '城市名', example: '里斯本' })
  name!: string;

  @ApiProperty({ description: '国家代码', example: 'PT' })
  countryCode!: string;
}

/**
 * 信友对方的最小公开资料。
 * 不返回 email、角色、接信状态、对方同意状态或撤销原因。
 */
export class PenpalCounterpartDto {
  @ApiProperty({ description: '对方用户 ID' })
  id!: string;

  @ApiProperty({ description: '对方公开昵称' })
  nickname!: string;

  @ApiProperty({ type: () => PenpalCityDto, nullable: true, description: '对方公开城市' })
  city!: PenpalCityDto | null;
}

export class PenpalActiveDto {
  @ApiProperty({ type: () => PenpalCounterpartDto })
  counterpart!: PenpalCounterpartDto;
}

export class PenpalPendingDto {
  @ApiProperty({ type: () => PenpalCounterpartDto })
  counterpart!: PenpalCounterpartDto;
}

export class PenpalOverviewDto {
  @ApiProperty({ type: () => [PenpalActiveDto], description: '双方都已同意的信友' })
  active!: PenpalActiveDto[];

  @ApiProperty({ type: () => [PenpalPendingDto], description: '收到的持续通信请求' })
  incoming!: PenpalPendingDto[];

  @ApiProperty({ type: () => [PenpalPendingDto], description: '本人发出、等待回应的请求' })
  outgoing!: PenpalPendingDto[];
}

export class PenpalConsentResultDto {
  @ApiProperty({
    enum: PENPAL_STATUSES,
    description: '写入本人同意后的聚合状态；不暴露对方是否撤销',
  })
  state!: (typeof PENPAL_STATUSES)[number];
}
