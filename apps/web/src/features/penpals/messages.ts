import { ApiError } from '../../shared/api/client';
import { toFriendlyAuthMessage } from '../../shared/api/error-message';

/** 信友页面专用提示；不改变全局认证与共途文案。 */
export function toFriendlyPenpalMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'RESOURCE_NOT_ACCESSIBLE':
        return '当前无法建立这段信友关系，可能缺少已完成的共途。';
      case 'CONTACT_BLOCKED':
        return '当前无法与这位用户联系。';
      case 'FORBIDDEN':
        return '你没有执行这个操作的权限。';
      default:
        return toFriendlyAuthMessage(error);
    }
  }
  return '网络暂时不可用，请稍后再试。';
}
