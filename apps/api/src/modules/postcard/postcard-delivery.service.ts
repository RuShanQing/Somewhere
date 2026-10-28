import { Injectable } from '@nestjs/common';
import { PostcardRepository } from './repositories/postcard.repository';

const DEFAULT_BATCH_SIZE = 50;

/**
 * Worker 的唯一投递入口。这里不生成通知，也不读取正文；
 * 重复扫描由数据库条件更新与 SKIP LOCKED 保证只投递一次。
 */
@Injectable()
export class PostcardDeliveryService {
  constructor(private readonly postcards: PostcardRepository) {}

  async deliverDue(batchSize = DEFAULT_BATCH_SIZE): Promise<number> {
    return this.postcards.deliverDue(batchSize);
  }
}
