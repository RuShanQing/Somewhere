import { ApiProperty } from '@nestjs/swagger';

/** 城市级信息：只允许 id / name / countryCode，禁止坐标或作者信息。 */
export class DiscoveryCityDto {
  @ApiProperty({ description: '城市 ID' })
  id!: string;

  @ApiProperty({ description: '城市名', example: '里斯本' })
  name!: string;

  @ApiProperty({ description: '国家代码', example: 'PT' })
  countryCode!: string;
}

export class CityMemoryItemDto {
  @ApiProperty({ type: () => DiscoveryCityDto, description: '故事发生的城市' })
  city!: DiscoveryCityDto;

  @ApiProperty({ description: '该城市当前活跃公开故事数量' })
  publicStoryCount!: number;

  @ApiProperty({ description: '该城市最近一次公开时间（UTC ISO 8601）' })
  latestPublishedAt!: string;
}

export class CityMemoryListDto {
  @ApiProperty({
    type: () => [CityMemoryItemDto],
    description: '有活跃公开故事的城市；按最近公开时间倒序，不按数量排序',
  })
  items!: CityMemoryItemDto[];
}
