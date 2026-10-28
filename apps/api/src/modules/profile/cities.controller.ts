import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import { CityService } from './city.service';
import { CitiesQueryDto } from './dto/cities-query.dto';
import { CitySummaryDto } from './dto/city-summary.dto';

@ApiTags('cities')
@Controller('cities')
export class CitiesController {
  constructor(private readonly cities: CityService) {}

  @Get()
  @ApiOperation({
    summary: '公开城市目录',
    description: '只返回城市级信息，不返回经纬度、住址或实时位置。',
  })
  @ApiOkResponse({ type: [CitySummaryDto], description: '城市列表' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: '搜索词不合法' })
  list(@Query() query: CitiesQueryDto): Promise<CitySummaryDto[]> {
    return this.cities.list(query.query);
  }
}
