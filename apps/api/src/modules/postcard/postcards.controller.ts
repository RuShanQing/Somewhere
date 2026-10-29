import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
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
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/http/current-user.decorator';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { SessionGuard } from '../auth/guards/session.guard';
import {
  CreatePostcardDraftDto,
  UpdatePostcardDraftDto,
} from './dto/draft.dto';
import { PostcardListQueryDto } from './dto/list-query.dto';
import { RecipientsQueryDto } from './dto/recipients-query.dto';
import {
  InboxItemDto,
  PostcardDetailDto,
  PostcardDraftResponseDto,
  RecipientResponseDto,
  SendPostcardResponseDto,
  TransitItemDto,
} from './dto/postcard-response.dto';
import { PostcardService } from './postcard.service';

@ApiTags('postcards')
@ApiCookieAuth()
@Controller('postcards')
@UseGuards(SessionGuard)
export class PostcardsController {
  constructor(private readonly postcards: PostcardService) {}

  @Get('recipients')
  @ApiOperation({
    summary: '本阶段可用的演示收件人',
    description:
      '只返回服务端白名单中已注册、接信状态为 OPEN 且已有城市的账号；不开放用户搜索，不返回邮箱或坐标。',
  })
  @ApiOkResponse({ type: [RecipientResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  listRecipients(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RecipientsQueryDto,
  ): Promise<RecipientResponseDto[]> {
    return this.postcards.listRecipients(user, query.passageId);
  }

  @Get('drafts')
  @ApiOperation({ summary: '我的未发送草稿' })
  @ApiOkResponse({ type: [PostcardDraftResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  listDrafts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PostcardListQueryDto,
  ): Promise<PostcardDraftResponseDto[]> {
    return this.postcards.listDrafts(user, query);
  }

  @Post('drafts')
  @HttpCode(201)
  @ApiOperation({ summary: '创建草稿', description: '草稿只对作者可见，不等于已经寄出。' })
  @ApiCreatedResponse({ type: PostcardDraftResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePostcardDraftDto,
  ): Promise<PostcardDraftResponseDto> {
    return this.postcards.createDraft(user, dto);
  }

  @Get('drafts/:id')
  @ApiOperation({ summary: '读取我的草稿' })
  @ApiOkResponse({ type: PostcardDraftResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  getDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PostcardDraftResponseDto> {
    return this.postcards.getDraft(user, id);
  }

  @Patch('drafts/:id')
  @ApiOperation({ summary: '修改我的未发送草稿' })
  @ApiOkResponse({ type: PostcardDraftResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePostcardDraftDto,
  ): Promise<PostcardDraftResponseDto> {
    return this.postcards.updateDraft(user, id, dto);
  }

  @Delete('drafts/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除我的未发送草稿' })
  @ApiNoContentResponse({ description: '草稿已删除' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async deleteDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.postcards.deleteDraft(user, id);
  }

  @Post('drafts/:id/send')
  @HttpCode(201)
  @ApiOperation({
    summary: '寄出草稿',
    description:
      '服务端重新校验收件人、接信状态、城市与每日上限，按城市距离生成 deliverAt；同一草稿或同一 Idempotency-Key 不会产生第二张信。',
  })
  @ApiCreatedResponse({ type: SendPostcardResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  sendDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SendPostcardResponseDto> {
    return this.postcards.sendDraft(user, id, idempotencyKey);
  }

  @Get('transit')
  @ApiOperation({ summary: '我寄出的在途明信片', description: '只返回状态与预计到达时间，不含正文。' })
  @ApiOkResponse({ type: [TransitItemDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  listTransit(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PostcardListQueryDto,
  ): Promise<TransitItemDto[]> {
    return this.postcards.listTransit(user, query);
  }

  @Get('inbox')
  @ApiOperation({ summary: '我已收到的明信片', description: '只返回已送达且本人可读的来信。' })
  @ApiOkResponse({ type: [InboxItemDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  listInbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PostcardListQueryDto,
  ): Promise<InboxItemDto[]> {
    return this.postcards.listInbox(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '读取明信片详情',
    description: '收件人只有在服务端确认送达后才能读取正文；其他人统一返回不可访问。',
  })
  @ApiOkResponse({ type: PostcardDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  getPostcard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PostcardDetailDto> {
    return this.postcards.getPostcard(user, id);
  }
}
