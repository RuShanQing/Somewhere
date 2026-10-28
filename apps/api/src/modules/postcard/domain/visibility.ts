export type PostcardStatusValue = 'IN_TRANSIT' | 'DELIVERED' | 'RESTRICTED';
export type PostcardRole = 'SENDER' | 'RECEIVER' | 'OTHER';

export interface PostcardAccessSnapshot {
  senderId: string;
  receiverId: string;
  status: PostcardStatusValue;
  deliverAt: Date;
}

export function postcardRoleFor(viewerId: string, postcard: PostcardAccessSnapshot): PostcardRole {
  if (viewerId === postcard.senderId) {
    return 'SENDER';
  }
  if (viewerId === postcard.receiverId) {
    return 'RECEIVER';
  }
  return 'OTHER';
}

/**
 * 寄件人始终可以查看自己写下的内容；收件人必须在服务端时间到达后，
 * 且状态已经是 DELIVERED。RESTRICTED 的正文对双方都不返回。
 */
export function canReadPostcardBody(
  viewerId: string,
  postcard: PostcardAccessSnapshot,
  now: Date,
): boolean {
  const role = postcardRoleFor(viewerId, postcard);
  if (role === 'OTHER' || postcard.status === 'RESTRICTED') {
    return false;
  }
  if (role === 'SENDER') {
    return true;
  }
  return postcard.status === 'DELIVERED' && postcard.deliverAt.getTime() <= now.getTime();
}
