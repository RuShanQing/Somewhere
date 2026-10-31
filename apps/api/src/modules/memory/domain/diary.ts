export type DiaryPostcardStatus = 'IN_TRANSIT' | 'DELIVERED' | 'RESTRICTED';

/**
 * 一张双页必须来自同一段共途的一次完整交换：
 * left 是被回信的原信，right 是显式引用它的回信。
 */
export type DiaryPairBlockReason =
  | 'LEFT_NOT_DELIVERED'
  | 'RIGHT_NOT_DELIVERED'
  | 'NOT_SAME_PASSAGE'
  | 'NOT_REPLY'
  | 'SAME_AUTHOR'
  | 'PARTICIPANTS_MISMATCH';

export interface DiaryPairInput {
  leftId: string;
  leftStatus: DiaryPostcardStatus;
  leftPassageId: string | null;
  leftSenderId: string;
  leftReceiverId: string;
  rightStatus: DiaryPostcardStatus;
  rightPassageId: string | null;
  rightSenderId: string;
  rightReceiverId: string;
  rightReplyToPostcardId: string | null;
}

export function diaryPairBlockReason(input: DiaryPairInput): DiaryPairBlockReason | null {
  if (input.leftStatus !== 'DELIVERED') {
    return 'LEFT_NOT_DELIVERED';
  }
  if (input.rightStatus !== 'DELIVERED') {
    return 'RIGHT_NOT_DELIVERED';
  }
  if (!input.leftPassageId || input.leftPassageId !== input.rightPassageId) {
    return 'NOT_SAME_PASSAGE';
  }
  if (input.rightReplyToPostcardId !== input.leftId) {
    return 'NOT_REPLY';
  }
  if (input.leftSenderId === input.rightSenderId) {
    return 'SAME_AUTHOR';
  }
  if (
    input.leftReceiverId !== input.rightSenderId ||
    input.rightReceiverId !== input.leftSenderId
  ) {
    return 'PARTICIPANTS_MISMATCH';
  }
  return null;
}

/** 只有该页两封的收发者可以阅读；第三方（含管理员）不获得直通权限。 */
export function canReadDiary(
  viewerId: string,
  leftSenderId: string,
  leftReceiverId: string,
): boolean {
  return viewerId === leftSenderId || viewerId === leftReceiverId;
}
