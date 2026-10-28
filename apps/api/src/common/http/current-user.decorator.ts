import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AppError } from '../errors/app-error';
import type { AuthenticatedUser, RequestWithContext } from './request.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    if (!request.user) {
      throw AppError.authRequired();
    }
    return request.user;
  },
);
