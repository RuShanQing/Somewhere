import type { PostcardStatusValue } from './visibility';

/**
 * 回信被拒绝的原因。顺序即优先级：
 * 身份 → 送达 → 是否共途 → 封锁 → 共途许可 → 是否已经回过。
 */
export type ReplyBlockReason =
  | 'OWN_POSTCARD'
  | 'NOT_RECEIVER'
  | 'NOT_DELIVERED'
  | 'NO_PASSAGE'
  | 'BLOCKED'
  | 'PASSAGE_CLOSED'
  | 'ALREADY_REPLIED';

export interface ReplyEligibilityInput {
  viewerId: string;
  senderId: string;
  receiverId: string;
  status: PostcardStatusValue;
  passageId: string | null;
  blocked: boolean;
  canSend: boolean;
  alreadyReplied: boolean;
}

/**
 * 只回答“这封信现在能不能被当前用户回信”，不访问数据库、不决定错误码。
 * 收件人、送达、共途、封锁与唯一性必须全部满足。
 */
export function replyBlockReason(input: ReplyEligibilityInput): ReplyBlockReason | null {
  if (input.viewerId === input.senderId) {
    return 'OWN_POSTCARD';
  }
  if (input.viewerId !== input.receiverId) {
    return 'NOT_RECEIVER';
  }
  if (input.status !== 'DELIVERED') {
    return 'NOT_DELIVERED';
  }
  if (!input.passageId) {
    return 'NO_PASSAGE';
  }
  if (input.blocked) {
    return 'BLOCKED';
  }
  if (!input.canSend) {
    return 'PASSAGE_CLOSED';
  }
  if (input.alreadyReplied) {
    return 'ALREADY_REPLIED';
  }
  return null;
}
