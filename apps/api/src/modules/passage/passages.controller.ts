import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiConflictResponse,
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
import { PassageListQueryDto } from './dto/passage.dto';
import {
  PassageListDto,
  PassageSummaryDto,
} from './dto/passage-response.dto';
import { PassageService } from './passage.service';

const passageIdPipe = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 404 });

@ApiTags('passages')
@ApiCookieAuth()
@Controller('passages')
@UseGuards(SessionGuard)
export class PassagesController {
  constructor(private readonly passages: PassageService) {}

  @Get()
  @ApiOperation({
    summary: '我参与的共途列表',
    description: '只返回本人参与的共途；非参与者不会出现在列表中。',
  })
  @ApiOkResponse({ type: PassageListDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PassageListQueryDto,
  ): Promise<PassageListDto> {
    return this.passages.list(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '共途详情',
    description: '仅参与者可读；非参与者统一返回不可访问，避免枚举。',
  })
  @ApiOkResponse({ type: PassageSummaryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', passageIdPipe) id: string,
  ): Promise<PassageSummaryDto> {
    return this.passages.get(user, id);
  }

  @Post(':id/pause')
  @HttpCode(200)
  @ApiOperation({
    summary: '停泊本人许可',
    description: '只改变当前用户的通信意愿；不会改变对方状态，也不会取消已寄出的信。',
  })
  @ApiOkResponse({ type: PassageSummaryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', passageIdPipe) id: string,
  ): Promise<PassageSummaryDto> {
    return this.passages.pause(user, id);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @ApiOperation({
    summary: '续程本人许可',
    description: '只恢复当前用户的意愿；不能替代对方恢复，也不会自动恢复已完成的共途。',
  })
  @ApiOkResponse({ type: PassageSummaryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', passageIdPipe) id: string,
  ): Promise<PassageSummaryDto> {
    return this.passages.resume(user, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: '完成这段共途',
    description: '只改变经历进度，不改变任何一方的通信意愿，也不会自动成为信友。',
  })
  @ApiOkResponse({ type: PassageSummaryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', passageIdPipe) id: string,
  ): Promise<PassageSummaryDto> {
    return this.passages.complete(user, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOperation({
    summary: '归档这段共途',
    description: '经历级归档：从进行中列表消失，但历史与详情仍对参与者可读。',
  })
  @ApiOkResponse({ type: PassageSummaryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', passageIdPipe) id: string,
  ): Promise<PassageSummaryDto> {
    return this.passages.archive(user, id);
  }
}
