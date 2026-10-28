export const CITY_QUERY_MAX_LENGTH = 64;

/** 城市搜索词只做基础清洗；空字符串等价于“不过滤”。 */
export function normalizeCityQuery(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** 城市中心坐标必须落在合法经纬度范围内，且不能是 NaN / Infinity。 */
export function isValidCityCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}
