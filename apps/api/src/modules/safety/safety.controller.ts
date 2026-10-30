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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/http/current-user.decorator';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { SessionGuard } from '../auth/guards/session.guard';
import { BlockUserDto } from './dto/block.dto';
import { BlockedUserDto, BlockListDto } from './dto/block-response.dto';
import { SafetyService } from './safety.service';

const userIdPipe = new ParseUUIDPipe({ version: '4', errorHttpStatusCode: 404 });

@ApiTags('safety')
@ApiCookieAuth()
@Controller('safety')
@UseGuards(SessionGuard)
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Get('blocks')
  @ApiOperation({
    summary: '我发起的封锁',
    description: '只返回本人主动封锁的用户；不返回谁封锁了我，也不返回邮箱。',
  })
  @ApiOkResponse({ type: BlockListDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  list(@CurrentUser() user: AuthenticatedUser): Promise<BlockListDto> {
    return this.safety.list(user);
  }

  @Post('blocks')
  @HttpCode(200)
  @ApiOperation({
    summary: '封锁用户',
    description: '封锁后新的通信行为被拒绝；重复调用幂等。不能封锁自己。',
  })
  @ApiOkResponse({ type: BlockedUserDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  block(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BlockUserDto,
  ): Promise<BlockedUserDto> {
    return this.safety.block(user, dto.userId);
  }

  @Delete('blocks/:userId')
  @HttpCode(204)
  @ApiOperation({
    summary: '解除本人发起的封锁',
    description: '只能解除本人发起的封锁；重复调用幂等。',
  })
  @ApiNoContentResponse({ description: '已解除或本来不存在' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', userIdPipe) targetUserId: string,
  ): Promise<void> {
    await this.safety.unblock(user, targetUserId);
  }
}
