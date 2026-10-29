import { ApiError } from '../api/client';
import { toFriendlyAuthMessage } from '../api/error-message';

/** 故事页面专用错误提示；不改变全局认证文案。 */
export function toFriendlyStoryMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'FORBIDDEN':
        return '你没有执行这个操作的权限。';
      case 'RESOURCE_NOT_ACCESSIBLE':
        return '这段故事现在不可见，可能已经撤回、下架或尚未通过审核。';
      case 'STORY_STATE_CONFLICT':
        return '故事状态已经变化，请刷新后重试。';
      case 'RATE_LIMITED':
        return '这段时间提交的故事已经够多了，请让它们先被读完。';
      default:
        return toFriendlyAuthMessage(error);
    }
  }
  return '网络暂时不可用，请稍后再试。';
}
