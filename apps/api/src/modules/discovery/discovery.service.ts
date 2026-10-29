import { Injectable } from '@nestjs/common';
import { CityService } from '../profile/city.service';
import { ApprovedStoryReader } from '../story/approved-story-reader.service';
import type { CityMemoryListDto } from './dto/city-memory-response.dto';

/**
 * 发现入口的只读组合层：只负责把“已审核公开故事的城市聚合”与城市目录拼起来。
 * 可见性、数量与排序都由 StoryModule 的 ApprovedStoryReader 决定，本层不得重复判断。
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly publicStories: ApprovedStoryReader,
    private readonly cities: CityService,
  ) {}

  async listCityMemories(topic: string | undefined): Promise<CityMemoryListDto> {
    const normalizedTopic = topic?.trim() ? topic.trim() : null;
    const summaries = await this.publicStories.listPublicCitySummaries(normalizedTopic);
    if (summaries.length === 0) {
      return { items: [] };
    }

    const cities = await this.cities.findManyByIds(summaries.map((summary) => summary.cityId));
    const cityById = new Map(cities.map((city) => [city.id, city]));

    return {
      items: summaries.flatMap((summary) => {
        const city = cityById.get(summary.cityId);
        if (!city) {
          // 城市目录由外键约束保证存在；缺失时宁可不显示，也不返回不完整的城市信息。
          return [];
        }
        return [
          {
            city: { id: city.id, name: city.name, countryCode: city.countryCode },
            publicStoryCount: summary.publicStoryCount,
            latestPublishedAt: summary.latestPublishedAt.toISOString(),
          },
        ];
      }),
    };
  }
}
