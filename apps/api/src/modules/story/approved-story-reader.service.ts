import { Injectable } from '@nestjs/common';
import type { Story } from '@prisma/client';
import type { PublicStoryQuery } from './repositories/story.repository';
import { StoryRepository } from './repositories/story.repository';
import type { PublicCityStorySummary } from './story.types';

/**
 * 城市故事站与世界记忆地图唯一的公开读取入口。
 * 其他模块不得自行拼装 reviewStatus / publishedAt / archivedAt 条件。
 */
@Injectable()
export class ApprovedStoryReader {
  constructor(private readonly stories: StoryRepository) {}

  listPublic(query: PublicStoryQuery): Promise<Story[]> {
    return this.stories.listPublic(query);
  }

  findPublicById(id: string): Promise<Story | null> {
    return this.stories.findPublicById(id);
  }

  /** 有活跃公开故事的城市聚合；世界记忆地图入口只允许通过这里读取。 */
  listPublicCitySummaries(topic: string | null): Promise<PublicCityStorySummary[]> {
    return this.stories.groupPublicByCity(topic);
  }
}
