import type { Prisma } from '@prisma/client';

/** 共途及其两名参与者；只在本模块内部与 Repository 之间传递。 */
export type PassageRecord = Prisma.PassageGetPayload<{
  include: { participants: true };
}>;
