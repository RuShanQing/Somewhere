import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import type { RequestWithContext } from '../../common/http/request.types';

export const CurrentSessionId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    if (!request.sessionId) {
      throw AppError.authRequired();
    }
    return request.sessionId;
  },
);
