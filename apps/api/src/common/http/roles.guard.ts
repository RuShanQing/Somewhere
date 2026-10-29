import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { AppError } from '../errors/app-error';
import type { RequestWithContext } from './request.types';
import { ROLES_KEY } from './roles.decorator';

/**
 * 平台角色守卫：必须在 SessionGuard 之后执行。
 * 未登录返回 401；已登录但角色不足返回 403，且不查询目标资源。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<RequestWithContext>().user;
    if (!user) {
      throw AppError.authRequired();
    }
    if (!requiredRoles.includes(user.role)) {
      throw AppError.forbidden();
    }
    return true;
  }
}
