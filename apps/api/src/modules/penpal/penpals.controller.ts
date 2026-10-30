import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
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
import { PenpalConsentDto } from './dto/penpal.dto';
import {
  PenpalConsentResultDto,
  PenpalOverviewDto,
} from './dto/penpal-response.dto';
import { PenpalService } from './penpal.service';

const counterpartIdPipe = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 404 });

@ApiTags('penpals')
@ApiCookieAuth()
@Controller('penpals')
@UseGuards(SessionGuard)
export class PenpalsController {
  constructor(private readonly penpals: PenpalService) {}

  @Get()
  @ApiOperation({
    summary: '我的信友关系',
    description:
      '只返回本人视角的已建立信友、收到的请求与发出的请求；不返回对方是否撤销、日期或邮箱。',
  })
  @ApiOkResponse({ type: PenpalOverviewDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  list(@CurrentUser() user: AuthenticatedUser): Promise<PenpalOverviewDto> {
    return this.penpals.list(user);
  }

  @Post('consent')
  @HttpCode(200)
  @ApiOperation({
    summary: '记录本人持续通信意愿',
    description:
      '必须与对方至少完成过一段共途；双方分别同意后才是有效信友。重复调用幂等。',
  })
  @ApiOkResponse({ type: PenpalConsentResultDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  consent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PenpalConsentDto,
  ): Promise<PenpalConsentResultDto> {
    return this.penpals.consent(user, dto.counterpartId);
  }

  @Delete(':counterpartId/consent')
  @HttpCode(204)
  @ApiOperation({
    summary: '撤销本人持续通信许可',
    description:
      '只撤销本人意愿；收到请求时也可用它关闭请求。重复调用幂等，不删除历史。',
  })
  @ApiNoContentResponse({ description: '已撤销或本来不存在' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('counterpartId', counterpartIdPipe) counterpartId: string,
  ): Promise<void> {
    await this.penpals.revoke(user, counterpartId);
  }
}
