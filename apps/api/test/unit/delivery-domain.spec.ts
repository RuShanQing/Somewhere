import { describe, expect, it } from 'vitest';
import {
  computeDeliveryPlan,
  delayMinutesForDistance,
  haversineKm,
  MAX_DELAY_MINUTES,
  MIN_DELAY_MINUTES,
} from '../../src/modules/delivery/domain/distance';

const LISBON = { latitude: 38.7223, longitude: -9.1393 };
const PARIS = { latitude: 48.8566, longitude: 2.3522 };

describe('投递距离与延迟', () => {
  it('同城距离为 0，延迟固定 12 小时', () => {
    expect(haversineKm(LISBON, LISBON)).toBe(0);
    expect(delayMinutesForDistance(0)).toBe(720);
  });

  it('已知城市距离在合理范围，且最远不超过 120 小时', () => {
    const distance = haversineKm(LISBON, PARIS);
    expect(distance).toBeGreaterThan(1400);
    expect(distance).toBeLessThan(1700);
    expect(delayMinutesForDistance(distance)).toBeGreaterThan(720);
    expect(delayMinutesForDistance(20_000)).toBe(MAX_DELAY_MINUTES);
    expect(MAX_DELAY_MINUTES).toBe(7200);
    expect(MIN_DELAY_MINUTES).toBe(720);
  });

  it('延迟随距离单调不减，且始终位于 720–7200 分钟', () => {
    let previous = 0;
    for (const distance of [0, 1, 100, 500, 1000, 5000, 10_000, 16_200, 20_000]) {
      const delay = delayMinutesForDistance(distance);
      expect(delay).toBeGreaterThanOrEqual(previous);
      expect(delay).toBeGreaterThanOrEqual(MIN_DELAY_MINUTES);
      expect(delay).toBeLessThanOrEqual(MAX_DELAY_MINUTES);
      previous = delay;
    }
  });

  it('拒绝非法坐标与负数距离', () => {
    expect(() => haversineKm({ latitude: 91, longitude: 0 }, LISBON)).toThrow(RangeError);
    expect(() => haversineKm({ latitude: 0, longitude: 181 }, LISBON)).toThrow(RangeError);
    expect(() => haversineKm({ latitude: Number.NaN, longitude: 0 }, LISBON)).toThrow(RangeError);
    expect(() => delayMinutesForDistance(-1)).toThrow(RangeError);
    expect(() => delayMinutesForDistance(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('deliverAt 以 UTC 时间计算，不依赖本地时区', () => {
    const sentAt = new Date('2026-10-28T00:00:00.000Z');
    const plan = computeDeliveryPlan(sentAt, LISBON, LISBON);
    expect(plan.delayMinutes).toBe(720);
    expect(plan.deliverAt.toISOString()).toBe('2026-10-28T12:00:00.000Z');
    expect(sentAt.toISOString()).toBe('2026-10-28T00:00:00.000Z');
  });
});
