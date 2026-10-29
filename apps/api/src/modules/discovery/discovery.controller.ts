import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import { DiscoveryService } from './discovery.service';
import { CityMemoryQueryDto } from './dto/city-memory-query.dto';
import { CityMemoryListDto } from './dto/city-memory-response.dto';

@ApiTags('discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('cities')
  @ApiOperation({
    summary: '世界记忆地图城市入口',
    description:
      '只返回拥有活跃公开故事的城市；与城市故事站共用同一审核与公开条件，匿名可读，不返回作者信息、坐标或实时位置。',
  })
  @ApiOkResponse({ type: CityMemoryListDto, description: '有公开故事的城市聚合' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: '主题参数不合法' })
  list(@Query() query: CityMemoryQueryDto): Promise<CityMemoryListDto> {
    return this.discovery.listCityMemories(query.topic);
  }
}
