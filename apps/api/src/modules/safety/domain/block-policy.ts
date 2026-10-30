/** 封锁关系纯函数：不依赖 NestJS、Prisma 或数据库。 */

export interface BlockEdge {
  blockerId: string;
  blockedId: string;
}

/**
 * 封锁记录只保存“谁封锁谁”，但通信拦截对双方生效。
 * 自己与自己不构成封锁关系；自我封锁由 DTO / 服务层拒绝。
 */
export function isBlockedBetween(
  firstUserId: string,
  secondUserId: string,
  edges: BlockEdge[],
): boolean {
  if (firstUserId === secondUserId) {
    return false;
  }
  return edges.some(
    (edge) =>
      (edge.blockerId === firstUserId && edge.blockedId === secondUserId) ||
      (edge.blockerId === secondUserId && edge.blockedId === firstUserId),
  );
}

export function canContact(
  firstUserId: string,
  secondUserId: string,
  edges: BlockEdge[],
): boolean {
  return !isBlockedBetween(firstUserId, secondUserId, edges);
}
