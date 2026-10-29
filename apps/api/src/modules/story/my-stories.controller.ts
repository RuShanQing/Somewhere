import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/http/current-user.decorator';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { SessionGuard } from '../auth/guards/session.guard';
import { OwnStoryDto } from './dto/story-response.dto';
import { StoryService } from './story.service';

const storyIdPipe = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 404 });

@ApiTags('stories')
@ApiCookieAuth()
@Controller('stories/mine')
@UseGuards(SessionGuard)
export class MyStoriesController {
  constructor(private readonly stories: StoryService) {}

  @Get()
  @ApiOperation({ summary: '我的城市故事（全部状态）' })
  @ApiOkResponse({ type: [OwnStoryDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  list(@CurrentUser() user: AuthenticatedUser): Promise<OwnStoryDto[]> {
    return this.stories.listMine(user);
  }

  @Get(':id')
  @ApiOperation({ summary: '我的单条故事详情（包含未公开内容）' })
  @ApiOkResponse({ type: OwnStoryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', storyIdPipe) id: string,
  ): Promise<OwnStoryDto> {
    return this.stories.getMine(user, id);
  }
}
