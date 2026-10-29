import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import {
  PublicStoryListQueryDto,
} from './dto/story.dto';
import {
  PublicStoryDetailDto,
  PublicStoryListDto,
} from './dto/story-response.dto';
import { StoryService } from './story.service';

const storyIdPipe = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 404 });

@ApiTags('stories')
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoryService) {}

  @Get()
  @ApiOperation({
    summary: '公开城市故事列表',
    description:
      '只返回审核通过、已获得公开授权、已发布且未归档的故事；支持城市、主题和游标分页。匿名可访问。',
  })
  @ApiOkResponse({ type: PublicStoryListDto })
  list(@Query() query: PublicStoryListQueryDto): Promise<PublicStoryListDto> {
    return this.stories.listPublic(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '公开故事详情',
    description: '未审核、驳回、撤回或下架的故事统一返回不可访问，避免暴露存在性。',
  })
  @ApiOkResponse({ type: PublicStoryDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('id', storyIdPipe) id: string): Promise<PublicStoryDetailDto> {
    return this.stories.getPublicStory(id);
  }
}
