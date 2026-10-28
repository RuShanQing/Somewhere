import { Body, Controller, Get, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { CurrentUser } from '../../common/http/current-user.decorator';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { AuthService } from './auth.service';
import { clearSessionCookie, setSessionCookie } from './auth.cookie';
import { CurrentSessionId } from './current-session.decorator';
import { ErrorResponseDto } from '../../common/http/error-response.dto';
import { AuthSessionUserDto, AuthUserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionGuard } from './guards/session.guard';
import { AuthRateLimitGuard } from './rate-limit/auth-rate-limit.guard';
import { AuthRateLimited } from './rate-limit/rate-limit.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  @HttpCode(201)
  @AuthRateLimited('register')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({
    summary: '注册并直接建立会话',
    description: '邮箱会正规化并唯一化；密码只保存 Argon2id 哈希；响应不返回 email。',
  })
  @ApiCreatedResponse({ type: AuthSessionUserDto, description: '注册成功，响应包含会话 Cookie' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: '无法完成注册（重复邮箱）' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: '输入校验失败' })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: '注册请求过于频繁' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionUserDto> {
    const result = await this.auth.register(dto);
    setSessionCookie(response, this.config, result.session);
    return result.user;
  }

  @Post('login')
  @HttpCode(200)
  @AuthRateLimited('login')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({
    summary: '登录并轮换会话',
    description: '失败时统一返回 AUTH_INVALID_CREDENTIALS；成功后新会话生效并撤销该账号其他活动会话。',
  })
  @ApiOkResponse({ type: AuthSessionUserDto, description: '登录成功，响应包含新的会话 Cookie' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: '邮箱或密码不正确' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: '输入校验失败' })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: '登录尝试过于频繁' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionUserDto> {
    const result = await this.auth.login(dto);
    setSessionCookie(response, this.config, result.session);
    return result.user;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: '退出并撤销当前会话' })
  @ApiNoContentResponse({ description: '会话已在服务端撤销，Cookie 被清理' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: '当前未登录' })
  async logout(
    @CurrentSessionId() sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(sessionId);
    clearSessionCookie(response, this.config);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: '返回当前登录用户的最小资料', description: '这是唯一返回本人 email 的认证接口。' })
  @ApiOkResponse({ type: AuthUserDto, description: '当前用户' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: '未登录或会话已失效' })
  me(@CurrentUser() user: AuthenticatedUser): AuthUserDto {
    return user;
  }
}
