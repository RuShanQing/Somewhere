import { describe, expect, it } from 'vitest';
import {
  countPostcardCharacters,
  POSTCARD_BODY_MAX_LENGTH,
  validatePostcardBody,
} from '../../src/modules/postcard/domain/body';
import { normalizeIdempotencyKey } from '../../src/modules/postcard/domain/idempotency';
import {
  canReadPostcardBody,
  postcardRoleFor,
  type PostcardStatusValue,
} from '../../src/modules/postcard/domain/visibility';

const NOW = new Date('2026-10-28T12:00:00.000Z');
const PAST = new Date('2026-10-28T11:00:00.000Z');
const FUTURE = new Date('2026-10-28T13:00:00.000Z');

function snapshot(status: PostcardStatusValue, deliverAt = PAST) {
  return {
    senderId: 'sender',
    receiverId: 'receiver',
    status,
    deliverAt,
  };
}

describe('明信片正文', () => {
  it('按 Unicode 码点计数，emoji 不会被算成两个字符', () => {
    expect(countPostcardCharacters('🌊')).toBe(1);
    expect(countPostcardCharacters('你好🌊')).toBe(3);
    expect(countPostcardCharacters('🌊'.repeat(2000))).toBe(2000);
  });

  it('接受 1–2000 字符并去除首尾空白', () => {
    expect(validatePostcardBody('  一封信  ')).toEqual({ ok: true, body: '一封信' });
    expect(validatePostcardBody('🌊'.repeat(POSTCARD_BODY_MAX_LENGTH)).ok).toBe(true);
  });

  it('拒绝全空白与超过 2000 字符', () => {
    expect(validatePostcardBody(' \n\t ')).toEqual({ ok: false, reason: 'blank' });
    expect(validatePostcardBody('慢'.repeat(2001))).toEqual({ ok: false, reason: 'length' });
    expect(validatePostcardBody('🌊'.repeat(2001))).toEqual({ ok: false, reason: 'length' });
  });
});

describe('明信片可见性', () => {
  it('识别寄件人、收件人与无关用户', () => {
    expect(postcardRoleFor('sender', snapshot('IN_TRANSIT'))).toBe('SENDER');
    expect(postcardRoleFor('receiver', snapshot('IN_TRANSIT'))).toBe('RECEIVER');
    expect(postcardRoleFor('stranger', snapshot('IN_TRANSIT'))).toBe('OTHER');
  });

  it('寄件人始终能读自己的正文，收件人必须已送达且到期', () => {
    expect(canReadPostcardBody('sender', snapshot('IN_TRANSIT'), NOW)).toBe(true);
    expect(canReadPostcardBody('sender', snapshot('DELIVERED'), NOW)).toBe(true);

    expect(canReadPostcardBody('receiver', snapshot('IN_TRANSIT'), NOW)).toBe(false);
    expect(canReadPostcardBody('receiver', snapshot('DELIVERED', FUTURE), NOW)).toBe(false);
    expect(canReadPostcardBody('receiver', snapshot('DELIVERED', PAST), NOW)).toBe(true);
  });

  it('无关用户与受限状态都不能读取正文', () => {
    expect(canReadPostcardBody('stranger', snapshot('DELIVERED'), NOW)).toBe(false);
    expect(canReadPostcardBody('sender', snapshot('RESTRICTED'), NOW)).toBe(false);
    expect(canReadPostcardBody('receiver', snapshot('RESTRICTED'), NOW)).toBe(false);
  });
});

describe('幂等键', () => {
  it('接受空值与合法键，拒绝过长或含空白的键', () => {
    expect(normalizeIdempotencyKey(undefined)).toBeNull();
    expect(normalizeIdempotencyKey('  ')).toBeNull();
    expect(normalizeIdempotencyKey(' send-1.key:abc ')).toBe('send-1.key:abc');
    expect(() => normalizeIdempotencyKey('a'.repeat(81))).toThrow(RangeError);
    expect(() => normalizeIdempotencyKey('带中文')).toThrow(RangeError);
    expect(() => normalizeIdempotencyKey('has space')).toThrow(RangeError);
  });
});
