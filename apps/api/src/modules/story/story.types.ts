/**
 * StoryModule 对外公开的只读类型。
 * 其他模块只能依赖这里的窄类型，不得引用 Prisma 的 Story 模型或 Repository 内部类型。
 */

/** 城市聚合结果：城市 ID、活跃公开故事数量、最近一次公开时间。 */
export interface PublicCityStorySummary {
  cityId: string;
  publicStoryCount: number;
  latestPublishedAt: Date;
}
