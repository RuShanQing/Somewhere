/**
 * 公开故事的唯一可见性谓词。
 *
 * 城市故事站、世界记忆地图城市聚合、公开详情与容量提升必须共用这份条件；
 * 任何地方都不得重新拼装 reviewStatus / publishedAt / archivedAt / publicConsentAt，
 * 否则会出现“地图有计数、点进去却读不到”的第二套可见性规则。
 *
 * 组合示例：
 *   { ...PUBLIC_STORY_CONDITION }                    // 公开集合
 *   { ...PUBLIC_STORY_CONDITION, publishedAt: null }  // 已通过但排队等待名额
 */
export const PUBLIC_STORY_CONDITION = {
  reviewStatus: 'APPROVED',
  publishedAt: { not: null },
  archivedAt: null,
  publicConsentAt: { not: null },
} as const;
