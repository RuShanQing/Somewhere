export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface DeliveryPlan {
  distanceKm: number;
  delayMinutes: number;
  deliverAt: Date;
}

export const EARTH_RADIUS_KM = 6371.0088;
export const MIN_DELAY_MINUTES = 720;
export const MAX_DELAY_MINUTES = 7200;
const MINUTES_PER_KM = 60 / 150;

export function isValidGeoPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Haversine 球面距离；非法坐标直接拒绝，避免把 NaN 写进投递时间。 */
export function haversineKm(origin: GeoPoint, destination: GeoPoint): number {
  if (!isValidGeoPoint(origin) || !isValidGeoPoint(destination)) {
    throw new RangeError('城市坐标不合法');
  }

  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLon = toRadians(destination.longitude - origin.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  // 浮点误差可能让 a 略大于 1 或小于 0，夹紧后再开方。
  const clamped = Math.min(1, Math.max(0, a));
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clamped));
}

/** 产品拟定的慢邮速度：同城 12 小时，最远 120 小时，距离越远不得越快。 */
export function delayMinutesForDistance(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError('距离必须是非负有限数字');
  }
  const minutes = MIN_DELAY_MINUTES + Math.ceil(distanceKm * MINUTES_PER_KM);
  return Math.min(MAX_DELAY_MINUTES, Math.max(MIN_DELAY_MINUTES, minutes));
}

export function computeDeliveryPlan(
  sentAt: Date,
  origin: GeoPoint,
  destination: GeoPoint,
): DeliveryPlan {
  if (!(sentAt instanceof Date) || Number.isNaN(sentAt.getTime())) {
    throw new RangeError('发送时间不合法');
  }
  const distanceKm = haversineKm(origin, destination);
  const delayMinutes = delayMinutesForDistance(distanceKm);
  return {
    distanceKm,
    delayMinutes,
    deliverAt: new Date(sentAt.getTime() + delayMinutes * 60_000),
  };
}
