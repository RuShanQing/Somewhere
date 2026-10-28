import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
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
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiCookieAuth()
@Controller('profile')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: '读取本人资料', description: '只返回昵称、城市与接信状态；不返回 email。' })
  @ApiOkResponse({ type: ProfileResponseDto, description: '本人资料' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: '未登录或会话已失效' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponseDto> {
    return this.profiles.getForUser(user);
  }

  @Patch('me')
  @ApiOperation({ summary: '修改本人资料', description: '只能修改本人昵称、城市与接信状态。' })
  @ApiOkResponse({ type: ProfileResponseDto, description: '修改后的本人资料' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: '未登录或会话已失效' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: '输入不合法或城市不存在' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profiles.updateForUser(user, dto);
  }
}
