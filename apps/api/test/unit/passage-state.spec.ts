import { describe, expect, it } from 'vitest';
import {
  decidePassageAction,
  type PassageActionContext,
} from '../../src/modules/passage/domain/passage-state';

/**
 * 共途状态机是停泊 / 续程 / 完成 / 归档的唯一判定来源。
 * 这里锁定「谁能改什么」以及「重复调用幂等」，防止后续为了省事把动作写成直接赋值。
 */

const activeAllow: PassageActionContext = {
  progressStatus: 'ACTIVE',
  ownConsentState: 'ALLOW',
};

describe('共途状态机', () => {
  it('ACTIVE + ALLOW 停泊后变为 PAUSED 并记录停泊时间', () => {
    const decision = decidePassageAction('PAUSE', activeAllow);
    expect(decision.outcome).toBe('APPLY');
    expect(decision.progressStatus).toBe('ACTIVE');
    expect(decision.consentState).toBe('PAUSED');
    expect(decision.setsPausedAt).toBe(true);
    expect(decision.clearPausedAt).toBe(false);
  });

  it('重复停泊是幂等的，不重复写事件', () => {
    const decision = decidePassageAction('PAUSE', {
      progressStatus: 'ACTIVE',
      ownConsentState: 'PAUSED',
    });
    expect(decision.outcome).toBe('NOOP');
    expect(decision.consentState).toBe('PAUSED');
  });

  it('已 CLOSED 的参与者不能停泊或续程', () => {
    expect(
      decidePassageAction('PAUSE', { progressStatus: 'ACTIVE', ownConsentState: 'CLOSED' }).outcome,
    ).toBe('CONFLICT');
    expect(
      decidePassageAction('RESUME', { progressStatus: 'ACTIVE', ownConsentState: 'CLOSED' }).outcome,
    ).toBe('CONFLICT');
  });

  it('已完成的共途不能再停泊或续程', () => {
    expect(
      decidePassageAction('PAUSE', { progressStatus: 'COMPLETED', ownConsentState: 'ALLOW' }).outcome,
    ).toBe('CONFLICT');
    expect(
      decidePassageAction('RESUME', { progressStatus: 'COMPLETED', ownConsentState: 'PAUSED' })
        .outcome,
    ).toBe('CONFLICT');
  });

  it('PAUSED 续程后回到 ALLOW 并清除停泊时间', () => {
    const decision = decidePassageAction('RESUME', {
      progressStatus: 'ACTIVE',
      ownConsentState: 'PAUSED',
    });
    expect(decision.outcome).toBe('APPLY');
    expect(decision.consentState).toBe('ALLOW');
    expect(decision.clearPausedAt).toBe(true);
    expect(decision.setsPausedAt).toBe(false);
  });

  it('已 ALLOW 时续程是幂等的', () => {
    expect(decidePassageAction('RESUME', activeAllow).outcome).toBe('NOOP');
  });

  it('完成只改经历进度，不改通信意愿', () => {
    const decision = decidePassageAction('COMPLETE', activeAllow);
    expect(decision.outcome).toBe('APPLY');
    expect(decision.progressStatus).toBe('COMPLETED');
    expect(decision.consentState).toBe('ALLOW');
    expect(decision.setsPausedAt).toBe(false);
    expect(decision.clearPausedAt).toBe(false);
  });

  it('已完成的共途不能再次完成；归档后也不能完成', () => {
    expect(
      decidePassageAction('COMPLETE', { progressStatus: 'COMPLETED', ownConsentState: 'ALLOW' })
        .outcome,
    ).toBe('NOOP');
    expect(
      decidePassageAction('COMPLETE', { progressStatus: 'ARCHIVED', ownConsentState: 'ALLOW' })
        .outcome,
    ).toBe('CONFLICT');
  });

  it('ACTIVE 与 COMPLETED 都可归档，归档后为终态', () => {
    const fromActive = decidePassageAction('ARCHIVE', activeAllow);
    expect(fromActive.outcome).toBe('APPLY');
    expect(fromActive.progressStatus).toBe('ARCHIVED');

    const fromCompleted = decidePassageAction('ARCHIVE', {
      progressStatus: 'COMPLETED',
      ownConsentState: 'ALLOW',
    });
    expect(fromCompleted.outcome).toBe('APPLY');
    expect(fromCompleted.progressStatus).toBe('ARCHIVED');

    const again = decidePassageAction('ARCHIVE', {
      progressStatus: 'ARCHIVED',
      ownConsentState: 'ALLOW',
    });
    expect(again.outcome).toBe('NOOP');
    expect(again.progressStatus).toBe('ARCHIVED');
  });

  it('归档不会把任何一方的意愿改成 CLOSED', () => {
    const decision = decidePassageAction('ARCHIVE', {
      progressStatus: 'ACTIVE',
      ownConsentState: 'PAUSED',
    });
    expect(decision.consentState).toBe('PAUSED');
  });
});
