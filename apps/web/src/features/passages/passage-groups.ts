import type {
  PassageConsentState,
  PassageProgressStatus,
  PassageSummary,
} from '../../shared/api/client';

/** 已归档是经历级终态；其余（进行中、已完成）仍在本人的「正在进行」区域。 */
export function groupPassages(items: PassageSummary[]): {
  active: PassageSummary[];
  archived: PassageSummary[];
} {
  return {
    active: items.filter((item) => item.progressStatus !== 'ARCHIVED'),
    archived: items.filter((item) => item.progressStatus === 'ARCHIVED'),
  };
}

export function progressLabel(status: PassageProgressStatus): string {
  switch (status) {
    case 'ACTIVE':
      return '进行中';
    case 'COMPLETED':
      return '已完成';
    case 'ARCHIVED':
      return '已归档';
    default:
      return status;
  }
}

export function consentLabel(state: PassageConsentState): string {
  switch (state) {
    case 'ALLOW':
      return '可以继续';
    case 'PAUSED':
      return '已停泊';
    case 'CLOSED':
      return '已关闭';
    default:
      return state;
  }
}

export function canPause(passage: PassageSummary): boolean {
  return passage.progressStatus === 'ACTIVE' && passage.me.consentState === 'ALLOW';
}

export function canResume(passage: PassageSummary): boolean {
  return passage.progressStatus === 'ACTIVE' && passage.me.consentState === 'PAUSED';
}
