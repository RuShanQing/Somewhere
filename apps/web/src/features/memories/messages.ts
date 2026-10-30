import { ApiError } from '../../shared/api/client';
import { toFriendlyAuthMessage } from '../../shared/api/error-message';

/** 个人记忆操作提示；不回显正文，也不把越权细节暴露给用户。 */
export function toFriendlyMemoryMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'RESOURCE_NOT_ACCESSIBLE':
        return '这段记忆不存在，或不属于当前账号。';
      case 'AUTH_REQUIRED':
        return '登录已过期，请重新登录。';
      default:
        return toFriendlyAuthMessage(error);
    }
  }
  return '网络暂时不可用，请稍后再试。';
}
