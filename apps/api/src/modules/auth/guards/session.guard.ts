import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { AppError } from '../../../common/errors/app-error';
import type { RequestWithContext } from '../../../common/http/request.types';
import { SessionService } from '../session.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[this.config.sessionCookieName];

    if (typeof token !== 'string' || token.length === 0) {
      throw AppError.authRequired();
    }

    const resolved = await this.sessions.resolve(token);
    if (!resolved) {
      throw AppError.authRequired();
    }

    request.user = resolved.user;
    request.sessionId = resolved.sessionId;
    return true;
  }
}
