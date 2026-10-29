import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/http/current-user.decorator';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { SessionGuard } from '../auth/guards/session.guard';
import { CreateStoryDto, UpdateStoryDto } from './dto/story.dto';
import { OwnStoryDto } from './dto/story-response.dto';
import { StoryService } from './story.service';

const storyIdPipe = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 404 });

@ApiTags('stories')
@ApiCookieAuth()
@Controller('stories')
@UseGuards(SessionGuard)
export class StoryActionsController {
  constructor(private readonly stories: StoryService) {}

  @Post()
  @ApiOperation({ summary: '创建故事草稿', description: '草稿只对作者可见，提交后才能进入审核。' })
  @ApiCreatedResponse({ type: OwnStoryDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStoryDto,
  ): Promise<OwnStoryDto> {
    return this.stories.createStory(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑我的草稿或未通过故事' })
  @ApiOkResponse({ type: OwnStoryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', storyIdPipe) id: string,
    @Body() dto: UpdateStoryDto,
  ): Promise<OwnStoryDto> {
    return this.stories.updateStory(user, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: '提交故事审核',
    description: '草稿或未通过故事进入 PENDING；滚动 7 天最多提交 3 次。',
  })
  @ApiOkResponse({ type: OwnStoryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', storyIdPipe) id: string,
  ): Promise<OwnStoryDto> {
    return this.stories.submitStory(user, id);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @ApiOperation({
    summary: '撤回故事公开授权',
    description: 'PENDING/APPROVED 变为 REMOVED，并立即退出公开集合。',
  })
  @ApiOkResponse({ type: OwnStoryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', storyIdPipe) id: string,
  ): Promise<OwnStoryDto> {
    return this.stories.withdrawStory(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除故事草稿', description: '只有 DRAFT 可以删除；已提交故事只能撤回。' })
  @ApiNoContentResponse({ description: '草稿已删除' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', storyIdPipe) id: string,
  ): Promise<void> {
    await this.stories.deleteStory(user, id);
  }
}
