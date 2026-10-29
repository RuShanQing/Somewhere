import type {
  PassageConsentState,
  PassageProgressStatus,
} from './passage-state';

/**
 * 共途通信许可：跨模块唯一出口。
 *
 * 只有以下条件同时成立才允许新的共途通信：
 * 1. 查看者本人是参与者；
 * 2. 参与者恰好两名且互不相同；
 * 3. 经历仍在进行中（ACTIVE）；
 * 4. 双方当前意愿都是 ALLOW。
 *
 * 记忆可见性、封锁与安全处置不在这里推导；封锁由后续 SafetyModule 优先拦截。
 */

export interface PassagePolicyParticipant {
  userId: string;
  consentState: PassageConsentState;
}

export interface PassagePolicyInput {
  viewerId: string;
  progressStatus: PassageProgressStatus;
  participants: PassagePolicyParticipant[];
}

export function isValidParticipantPair(userIds: string[]): boolean {
  if (userIds.length !== 2) {
    return false;
  }
  const [first, second] = userIds;
  if (!first || !second) {
    return false;
  }
  return first !== second;
}

export function canSendPassage(input: PassagePolicyInput): boolean {
  if (input.progressStatus !== 'ACTIVE') {
    return false;
  }
  if (!isValidParticipantPair(input.participants.map((item) => item.userId))) {
    return false;
  }
  if (!input.participants.some((item) => item.userId === input.viewerId)) {
    return false;
  }
  return input.participants.every((item) => item.consentState === 'ALLOW');
}
