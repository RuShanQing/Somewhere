import { ApiError } from '../../shared/api/client';
import { toFriendlyAuthMessage } from '../../shared/api/error-message';

/** 共途页面专用提示；不改变全局认证与故事文案。 */
export function toFriendlyPassageMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'RESOURCE_NOT_ACCESSIBLE':
        return '这段共途现在不可访问，可能不在你的参与范围内。';
      case 'PASSAGE_STATE_CONFLICT':
        return '共途状态已经变化，请刷新后重试。';
      case 'FORBIDDEN':
        return '你没有执行这个操作的权限。';
      default:
        return toFriendlyAuthMessage(error);
    }
  }
  return '网络暂时不可用，请稍后再试。';
}
