import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { StoryModule } from '../story/story.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

/**
 * 发现入口的只读组合模块。
 * 依赖方向单向：Discovery → Story（公开读取）+ Profile（城市目录）；不持有任何数据表。
 */
@Module({
  imports: [ProfileModule, StoryModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
