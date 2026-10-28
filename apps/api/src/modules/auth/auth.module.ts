import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { AuthRateLimitGuard } from './rate-limit/auth-rate-limit.guard';
import { AuthRateLimiter } from './rate-limit/auth-rate-limiter';
import { SessionRepository } from './repositories/session.repository';
import { UserRepository } from './repositories/user.repository';
import { SessionGuard } from './guards/session.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    UserRepository,
    SessionRepository,
    AuthRateLimiter,
    AuthRateLimitGuard,
    SessionGuard,
    AccountService,
  ],
  exports: [SessionGuard, SessionService, AccountService],
})
export class AuthModule {}
