/** 信友授权纯函数：不依赖 NestJS、Prisma 或数据库。 */

export const PENPAL_CONSENT_STATES = ['ALLOW', 'REVOKED'] as const;
export const PENPAL_STATUSES = ['NONE', 'ONE_SIDED', 'ACTIVE', 'REVOKED'] as const;

export type PenpalConsentState = (typeof PENPAL_CONSENT_STATES)[number];
export type PenpalStatus = (typeof PENPAL_STATUSES)[number];

/** 一对用户在当前视角下的两条单方记录；缺失表示从未表达过。 */
export interface PenpalPairConsent {
  mine: PenpalConsentState | null;
  theirs: PenpalConsentState | null;
}

/** 列表展示归类；null 表示不进入任何一组。 */
export type PenpalView = 'ACTIVE' | 'INCOMING' | 'OUTGOING' | null;

export interface PenpalConsentEdge {
  ownerId: string;
  counterpartId: string;
  consentState: PenpalConsentState;
}

/**
 * 把一对用户的两条单方记录折叠成“我的 / 对方的”视角。
 * 服务层与跨模块 Reader 共用，避免两处各写一套归类。
 */
export function indexPenpalPairs(
  viewerId: string,
  rows: PenpalConsentEdge[],
): Map<string, PenpalPairConsent> {
  const mine = new Map<string, PenpalConsentState>();
  const theirs = new Map<string, PenpalConsentState>();
  const counterpartIds = new Set<string>();

  for (const row of rows) {
    if (row.ownerId === viewerId) {
      mine.set(row.counterpartId, row.consentState);
      counterpartIds.add(row.counterpartId);
    } else {
      theirs.set(row.ownerId, row.consentState);
      counterpartIds.add(row.ownerId);
    }
  }

  const pairs = new Map<string, PenpalPairConsent>();
  for (const counterpartId of counterpartIds) {
    pairs.set(counterpartId, {
      mine: mine.get(counterpartId) ?? null,
      theirs: theirs.get(counterpartId) ?? null,
    });
  }
  return pairs;
}

/**
 * 双方都 ALLOW 才是 ACTIVE；
 * 只有一方 ALLOW 是 ONE_SIDED；
 * 一方 REVOKED 且另一方仍 ALLOW 是 REVOKED；
 * 没有有效同意时回到 NONE。
 */
export function derivePenpalStatus(pair: PenpalPairConsent): PenpalStatus {
  if (pair.mine === 'ALLOW' && pair.theirs === 'ALLOW') {
    return 'ACTIVE';
  }
  if (pair.mine === 'ALLOW' && pair.theirs === null) {
    return 'ONE_SIDED';
  }
  if (pair.mine === null && pair.theirs === 'ALLOW') {
    return 'ONE_SIDED';
  }
  if (
    (pair.mine === 'REVOKED' && pair.theirs === 'ALLOW') ||
    (pair.mine === 'ALLOW' && pair.theirs === 'REVOKED')
  ) {
    return 'REVOKED';
  }
  return 'NONE';
}

export function toPenpalView(pair: PenpalPairConsent): PenpalView {
  if (pair.mine === 'ALLOW' && pair.theirs === 'ALLOW') {
    return 'ACTIVE';
  }
  if (pair.mine === 'ALLOW' && pair.theirs === null) {
    return 'OUTGOING';
  }
  if (pair.mine === null && pair.theirs === 'ALLOW') {
    return 'INCOMING';
  }
  return null;
}

/** 跨模块唯一判定入口：只有 ACTIVE 且不存在任一方向封锁时才允许继续联系。 */
export function canContinueContact(input: {
  status: PenpalStatus;
  blocked: boolean;
}): boolean {
  return input.status === 'ACTIVE' && !input.blocked;
}

/** 信友请求资格：必须是另一个人，且双方至少完成过一段共途。 */
export function canRequestPenpal(input: {
  hasCompletedPassage: boolean;
  isSelf: boolean;
}): boolean {
  return input.hasCompletedPassage && !input.isSelf;
}
