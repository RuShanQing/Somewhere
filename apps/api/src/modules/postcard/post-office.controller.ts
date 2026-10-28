import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/http/current-user.decorator';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { SessionGuard } from '../auth/guards/session.guard';
import { PostOfficeSummaryDto } from './dto/postcard-response.dto';
import { PostcardService } from './postcard.service';

@ApiTags('post-office')
@ApiCookieAuth()
@Controller('post-office')
@UseGuards(SessionGuard)
export class PostOfficeController {
  constructor(private readonly postcards: PostcardService) {}

  @Get('summary')
  @ApiOperation({
    summary: '邮局三栏摘要',
    description: '只返回新来信、在途与草稿的最小字段；正文不进入摘要。',
  })
  @ApiOkResponse({ type: PostOfficeSummaryDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  summary(@CurrentUser() user: AuthenticatedUser): Promise<PostOfficeSummaryDto> {
    return this.postcards.getSummary(user);
  }
}
