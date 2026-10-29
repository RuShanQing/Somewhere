import { describe, expect, it } from 'vitest';
import { resolvePassageRecipient } from '../../src/modules/postcard/domain/passage-binding';

describe('共途草稿收件人解析', () => {
  it('未指定收件人时使用共途对方', () => {
    expect(resolvePassageRecipient('counterpart-1', undefined)).toEqual({
      ok: true,
      recipientId: 'counterpart-1',
    });
    expect(resolvePassageRecipient('counterpart-1', null)).toEqual({
      ok: true,
      recipientId: 'counterpart-1',
    });
  });

  it('显式指定共途对方时通过', () => {
    expect(resolvePassageRecipient('counterpart-1', 'counterpart-1')).toEqual({
      ok: true,
      recipientId: 'counterpart-1',
    });
  });

  it('指定第三人时拒绝，不能借共途草稿联系其他人', () => {
    expect(resolvePassageRecipient('counterpart-1', 'third-user')).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });
});
