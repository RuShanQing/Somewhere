import { describe, expect, it } from 'vitest';
import {
  countPostcardCharacters,
  formatDateTime,
  postcardStatusLabel,
} from '../src/shared/format/postcard';

describe('写信页文本与状态展示', () => {
  it('按 Unicode 码点计数', () => {
    expect(countPostcardCharacters('🌊')).toBe(1);
    expect(countPostcardCharacters('你好🌊')).toBe(3);
    expect(countPostcardCharacters('   ')).toBe(3);
  });

  it('空时间与非法时间有明确占位，不抛异常', () => {
    expect(formatDateTime(null)).toBe('尚未确定');
    expect(formatDateTime('not-a-date')).toBe('时间不可用');
    expect(formatDateTime('2026-10-28T12:00:00.000Z')).toContain('2026');
  });

  it('状态文案不使用已读或催促语义', () => {
    expect(postcardStatusLabel('IN_TRANSIT')).toBe('正在路上');
    expect(postcardStatusLabel('DELIVERED')).toBe('已抵达');
    expect(postcardStatusLabel('RESTRICTED')).toBe('暂时受限');
    expect(postcardStatusLabel('UNKNOWN')).toBe('未知状态');
  });
});
