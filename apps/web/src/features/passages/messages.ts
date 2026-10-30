import { ApiError } from '../../shared/api/client';
import { toFriendlyAuthMessage } from '../../shared/api/error-message';

/** 共途页面专用提示；不改变全局认证与故事文案。 */
/** 共途详情页的信友入口提示；与独立信友页保持同一语义。 */
export function toFriendlyPenpalActionMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'RESOURCE_NOT_ACCESSIBLE') {
    return '当前无法建立这段信友关系，可能缺少已完成的共途。';
  }
  return toFriendlyAuthMessage(error);
}

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
