import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../common/errors/app-error';
import { DatabaseHealthService } from '../../prisma/database-health.service';
import { ErrorResponseDto } from '../../common/http/error-response.dto';

export class HealthResponseDto {
  @ApiProperty({ description: '服务状态', example: 'ok' })
  status!: 'ok';

  @ApiProperty({ description: '数据库连通性', example: 'up' })
  database!: 'up';

  @ApiProperty({ description: '检查时间（UTC ISO 8601）', example: '2026-10-28T08:00:00.000Z' })
  checkedAt!: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseHealthService) {}

  @Get()
  @ApiOperation({ summary: '健康检查（含数据库连通性）' })
  @ApiOkResponse({ description: 'API 与 PostgreSQL 均可访问', type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto, description: '数据库不可访问' })
  async health(): Promise<HealthResponseDto> {
    const reachable = await this.database.isReachable();
    if (!reachable) {
      throw AppError.serviceUnavailable();
    }
    return { status: 'ok', database: 'up', checkedAt: new Date().toISOString() };
  }
}
