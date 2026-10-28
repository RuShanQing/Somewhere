import { Injectable } from '@nestjs/common';
import {
  computeDeliveryPlan,
  type DeliveryPlan,
  type GeoPoint,
} from './domain/distance';

/**
 * DeliveryModule 的纯策略出口：只做距离与延迟计算，不读写数据库。
 * Worker 与 PostcardModule 都必须使用这一份规则，避免两套送达时间。
 */
@Injectable()
export class DeliveryPolicy {
  plan(sentAt: Date, origin: GeoPoint, destination: GeoPoint): DeliveryPlan {
    return computeDeliveryPlan(sentAt, origin, destination);
  }
}
