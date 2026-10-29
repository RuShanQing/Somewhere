/**
 * 共途状态机：纯函数，不依赖 NestJS / Prisma / 数据库。
 *
 * 三个维度必须分开判断：
 * - progressStatus：这段共同经历走到哪一步；
 * - consentState：这个人自己是否允许新的共途通信；
 * - 记忆可见性：由 MemoryModule 单独判断，本文件不涉及。
 */

export type PassageProgressStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type PassageConsentState = 'ALLOW' | 'PAUSED' | 'CLOSED';
export type PassageAction = 'PAUSE' | 'RESUME' | 'COMPLETE' | 'ARCHIVE';
export type PassageActionOutcome = 'APPLY' | 'NOOP' | 'CONFLICT';

export interface PassageActionContext {
  progressStatus: PassageProgressStatus;
  ownConsentState: PassageConsentState;
}

export interface PassageActionDecision {
  outcome: PassageActionOutcome;
  progressStatus: PassageProgressStatus;
  consentState: PassageConsentState;
  setsPausedAt: boolean;
  clearPausedAt: boolean;
}

function decision(
  outcome: PassageActionOutcome,
  context: PassageActionContext,
  overrides: Partial<Pick<PassageActionDecision, 'progressStatus' | 'consentState' | 'setsPausedAt' | 'clearPausedAt'>> = {},
): PassageActionDecision {
  return {
    outcome,
    progressStatus: context.progressStatus,
    consentState: context.ownConsentState,
    setsPausedAt: false,
    clearPausedAt: false,
    ...overrides,
  };
}

export function decidePassageAction(
  action: PassageAction,
  context: PassageActionContext,
): PassageActionDecision {
  switch (action) {
    case 'PAUSE': {
      if (context.progressStatus !== 'ACTIVE') {
        return decision('CONFLICT', context);
      }
      if (context.ownConsentState === 'CLOSED') {
        return decision('CONFLICT', context);
      }
      if (context.ownConsentState === 'PAUSED') {
        return decision('NOOP', context);
      }
      return decision('APPLY', context, {
        consentState: 'PAUSED',
        setsPausedAt: true,
      });
    }

    case 'RESUME': {
      if (context.progressStatus !== 'ACTIVE') {
        return decision('CONFLICT', context);
      }
      if (context.ownConsentState === 'CLOSED') {
        return decision('CONFLICT', context);
      }
      if (context.ownConsentState === 'ALLOW') {
        return decision('NOOP', context);
      }
      return decision('APPLY', context, {
        consentState: 'ALLOW',
        clearPausedAt: true,
      });
    }

    case 'COMPLETE': {
      if (context.progressStatus === 'ARCHIVED') {
        return decision('CONFLICT', context);
      }
      if (context.progressStatus === 'COMPLETED') {
        return decision('NOOP', context);
      }
      return decision('APPLY', context, { progressStatus: 'COMPLETED' });
    }

    case 'ARCHIVE': {
      if (context.progressStatus === 'ARCHIVED') {
        return decision('NOOP', context);
      }
      return decision('APPLY', context, { progressStatus: 'ARCHIVED' });
    }
  }
}
