import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * 唯一允许直接持有 PrismaClient 的位置：领域模块只能通过自己的 Repository 访问数据库。
 * 不在此处主动连接，避免仅生成 OpenAPI 或静态检查时强依赖数据库在线。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
