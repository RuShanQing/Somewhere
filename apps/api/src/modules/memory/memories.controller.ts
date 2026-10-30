import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/http/current-user.decorator';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { SessionGuard } from '../auth/guards/session.guard';
import {
  CreatePersonalMemoryDto,
  UpdatePersonalMemoryDto,
} from './dto/personal-memory.dto';
import {
  PersonalMemoryDto,
  PersonalMemoryListDto,
  PersonalMemoryListQueryDto,
} from './dto/personal-memory-response.dto';
import { MemoryService } from './memory.service';

const memoryIdPipe = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 404 });

@ApiTags('memories')
@ApiCookieAuth()
@Controller('memories/personal')
@UseGuards(SessionGuard)
export class MemoriesController {
  constructor(private readonly memories: MemoryService) {}

  @Get()
  @ApiOperation({
    summary: '我的个人记忆',
    description: '只返回本人记录，按最近更新时间倒序；不返回 email、ownerId 或关系字段。',
  })
  @ApiOkResponse({ type: PersonalMemoryListDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PersonalMemoryListQueryDto,
  ): Promise<PersonalMemoryListDto> {
    return this.memories.list(user, query);
  }

  @Post()
  @ApiOperation({
    summary: '新建个人记忆',
    description: '只归本人所有；默认私人，不提供公开或共享入口。',
  })
  @ApiCreatedResponse({ type: PersonalMemoryDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePersonalMemoryDto,
  ): Promise<PersonalMemoryDto> {
    return this.memories.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '编辑本人的个人记忆',
    description: '非本人或不存在的记录统一 404；标题与正文至少提供一个。',
  })
  @ApiOkResponse({ type: PersonalMemoryDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', memoryIdPipe) id: string,
    @Body() dto: UpdatePersonalMemoryDto,
  ): Promise<PersonalMemoryDto> {
    return this.memories.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: '删除本人的个人记忆',
    description: '只删除本人视图；重复删除或非本人记录返回 404。',
  })
  @ApiNoContentResponse({ description: '已删除' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', memoryIdPipe) id: string,
  ): Promise<void> {
    await this.memories.remove(user, id);
  }
}
