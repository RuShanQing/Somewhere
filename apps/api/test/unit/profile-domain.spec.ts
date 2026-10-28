import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeCityQuery,
  isValidCityCoordinate,
} from '../../src/modules/profile/domain/city';
import {
  RECEPTION_MODES,
  canReceiveNewMail,
  isReceptionMode,
} from '../../src/modules/profile/domain/reception';

interface CitySeed {
  name: string;
  countryCode: string;
  lat: number;
  lon: number;
}

describe('接信状态', () => {
  it('只接受三个枚举值', () => {
    expect(RECEPTION_MODES).toEqual(['OPEN', 'RESTING', 'CLOSED']);
    expect(isReceptionMode('OPEN')).toBe(true);
    expect(isReceptionMode('RESTING')).toBe(true);
    expect(isReceptionMode('CLOSED')).toBe(true);
    expect(isReceptionMode('open')).toBe(false);
    expect(isReceptionMode('ALWAYS')).toBe(false);
    expect(isReceptionMode(null)).toBe(false);
  });

  it('只有 OPEN 允许新的陌生人通信', () => {
    expect(canReceiveNewMail('OPEN')).toBe(true);
    expect(canReceiveNewMail('RESTING')).toBe(false);
    expect(canReceiveNewMail('CLOSED')).toBe(false);
  });
});

describe('城市搜索与坐标', () => {
  it('搜索词会裁剪首尾空白，空字符串视为不过滤', () => {
    expect(normalizeCityQuery('  上海 ')).toBe('上海');
    expect(normalizeCityQuery('   ')).toBeNull();
    expect(normalizeCityQuery(undefined)).toBeNull();
    expect(normalizeCityQuery(null)).toBeNull();
  });

  it('只接受合法经纬度', () => {
    expect(isValidCityCoordinate(31.23, 121.47)).toBe(true);
    expect(isValidCityCoordinate(-33.87, 151.21)).toBe(true);
    expect(isValidCityCoordinate(90, 180)).toBe(true);
    expect(isValidCityCoordinate(-90, -180)).toBe(true);
    expect(isValidCityCoordinate(91, 0)).toBe(false);
    expect(isValidCityCoordinate(0, 181)).toBe(false);
    expect(isValidCityCoordinate(Number.NaN, 0)).toBe(false);
    expect(isValidCityCoordinate(0, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('城市种子数据', () => {
  const cities = JSON.parse(
    readFileSync(resolve(process.cwd(), 'prisma/data/cities.json'), 'utf8'),
  ) as CitySeed[];

  it('保持 30–50 条，且国家 + 城市名唯一', () => {
    expect(cities.length).toBeGreaterThanOrEqual(30);
    expect(cities.length).toBeLessThanOrEqual(50);
    const keys = new Set(cities.map((city) => `${city.countryCode}:${city.name}`));
    expect(keys.size).toBe(cities.length);
  });

  it('每条都有合法国家代码与城市中心坐标', () => {
    for (const city of cities) {
      expect(city.name.trim().length).toBeGreaterThan(0);
      expect(city.countryCode).toMatch(/^[A-Z]{2}$/);
      expect(isValidCityCoordinate(city.lat, city.lon)).toBe(true);
    }
  });
});
