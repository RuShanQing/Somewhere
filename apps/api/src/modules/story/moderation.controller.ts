import {
  Body,
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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/http/current-user.decorator';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { Roles } from '../../common/http/roles.decorator';
import { RolesGuard } from '../../common/http/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { ModerationQueueQueryDto, StoryDecisionDto } from './dto/story.dto';
import {
  ModerationQueueDto,
  StoryDecisionResponseDto,
} from './dto/story-response.dto';
import { StoryService } from './story.service';

const storyIdPipe = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 404 });

@ApiTags('moderation')
@ApiCookieAuth()
@Controller('moderation')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class ModerationController {
  constructor(private readonly stories: StoryService) {}

  @Get('queue')
  @ApiOperation({
    summary: '故事审核队列',
    description: '仅 ADMIN 可访问；只返回 PENDING，按提交时间升序。',
  })
  @ApiOkResponse({ type: ModerationQueueDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  queue(@Query() query: ModerationQueueQueryDto): Promise<ModerationQueueDto> {
    return this.stories.listModerationQueue(query);
  }

  @Post('stories/:id/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: '审核故事',
    description:
      '仅 ADMIN；APPROVE/REJECT 只适用于 PENDING，REMOVE 适用于 PENDING/APPROVED；管理员不能审核自己的故事。',
  })
  @ApiOkResponse({ type: StoryDecisionResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', storyIdPipe) id: string,
    @Body() dto: StoryDecisionDto,
  ): Promise<StoryDecisionResponseDto> {
    return this.stories.decideStory(user, id, dto);
  }
}
