import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/http/current-user.decorator';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { SessionGuard } from '../auth/guards/session.guard';
import {
  DiaryDetailDto,
  DiaryListDto,
  DiaryListQueryDto,
} from './dto/diary-response.dto';
import { MemoryService } from './memory.service';

const diaryIdPipe = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 404 });

@ApiTags('memories')
@ApiCookieAuth()
@Controller('memories/diaries')
@UseGuards(SessionGuard)
export class DiariesController {
  constructor(private readonly memories: MemoryService) {}

  @Get()
  @ApiOperation({
    summary: '我有权阅读的双城日记',
    description:
      '只返回页面元数据，不返回正文；只包含本人参与的共途，受限或已失效页面会被隐藏。',
  })
  @ApiOkResponse({ type: DiaryListDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DiaryListQueryDto,
  ): Promise<DiaryListDto> {
    return this.memories.listDiaries(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '双城日记单页详情',
    description:
      '仅该页两封明信片的收发者可读；非参与者、非法 ID、任一封受限统一返回不可访问。',
  })
  @ApiOkResponse({ type: DiaryDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', diaryIdPipe) id: string,
  ): Promise<DiaryDetailDto> {
    return this.memories.getDiary(user, id);
  }
}
