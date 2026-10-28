import { ApiProperty } from '@nestjs/swagger';

export class CitySummaryDto {
  @ApiProperty({ description: '城市 ID（UUID）', example: '6b1e2f3a-4c5d-4e6f-8a9b-0c1d2e3f4a5b' })
  id!: string;

  @ApiProperty({ description: '城市名称', example: '上海' })
  name!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 国家代码', example: 'CN' })
  countryCode!: string;
}
