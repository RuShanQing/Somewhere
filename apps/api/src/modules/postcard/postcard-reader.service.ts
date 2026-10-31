import { Injectable } from '@nestjs/common';
import type { City, Postcard } from '@prisma/client';
import { AccountService } from '../auth/account.service';
import { CityService } from '../profile/city.service';
import { PostcardRepository } from './repositories/postcard.repository';

export type DiaryPostcardStatus = 'IN_TRANSIT' | 'DELIVERED' | 'RESTRICTED';

export interface DiaryCityRecord {
  id: string;
  name: string;
  countryCode: string;
}

export interface DiaryPostcardRecord {
  id: string;
  body: string;
  status: DiaryPostcardStatus;
  passageId: string | null;
  senderId: string;
  receiverId: string;
  replyToPostcardId: string | null;
  sentAt: Date;
  deliveredAt: Date | null;
  senderNickname: string;
  city: DiaryCityRecord;
}

export interface DiaryPairRecord {
  left: DiaryPostcardRecord;
  right: DiaryPostcardRecord;
}

export interface DiaryPairCandidate {
  left: {
    id: string;
    status: DiaryPostcardStatus;
    passageId: string | null;
    senderId: string;
    receiverId: string;
    replyToPostcardId: string | null;
  };
  right: {
    id: string;
    status: DiaryPostcardStatus;
    passageId: string | null;
    senderId: string;
    receiverId: string;
    replyToPostcardId: string | null;
  };
}

/**
 * PostcardModule 对纪念册公开的窄读取接口。
 * 只返回日记配对所需的最小字段；正文只在“两封均已送达且查看者是收发者”时返回。
 * 不向 MemoryModule 暴露 Prisma 模型、邮箱、坐标或会话。
 */
@Injectable()
export class PostcardReader {
  constructor(
    private readonly postcards: PostcardRepository,
    private readonly accounts: AccountService,
    private readonly cities: CityService,
  ) {}

  async listDiaryCandidates(limit: number): Promise<DiaryPairCandidate[]> {
    const replies = await this.postcards.listDeliveredReplies(limit);
    if (replies.length === 0) {
      return [];
    }
    const targetIds = replies
      .map((reply) => reply.replyToPostcardId)
      .filter((id): id is string => id !== null);
    const targets = await this.postcards.findByIds(targetIds);
    const targetById = new Map(targets.map((target) => [target.id, target]));

    const candidates: DiaryPairCandidate[] = [];
    for (const reply of replies) {
      if (!reply.replyToPostcardId) {
        continue;
      }
      const target = targetById.get(reply.replyToPostcardId);
      if (!target) {
        continue;
      }
      candidates.push({
        left: this.toCandidate(target),
        right: this.toCandidate(reply),
      });
    }
    return candidates;
  }

  /**
   * 只有结构上确实配对、两封均 DELIVERED、且查看者是这对收发者之一时才返回正文。
   * MemoryModule 仍会用领域纯函数再次校验，避免把“可读”建立在单一层上。
   */
  async readDeliveredPair(
    viewerId: string,
    leftId: string,
    rightId: string,
  ): Promise<DiaryPairRecord | null> {
    const [left, right] = await Promise.all([
      this.postcards.findById(leftId),
      this.postcards.findById(rightId),
    ]);
    if (!left || !right || !this.isPair(left, right)) {
      return null;
    }
    if (viewerId !== left.senderId && viewerId !== left.receiverId) {
      return null;
    }

    const [senders, leftCity, rightCity] = await Promise.all([
      this.accounts.findPublicByIds([left.senderId, right.senderId]),
      this.cities.findById(left.originCityId),
      this.cities.findById(right.originCityId),
    ]);
    const leftSender = senders.find((user) => user.id === left.senderId);
    const rightSender = senders.find((user) => user.id === right.senderId);
    if (!leftSender || !rightSender || !leftCity || !rightCity) {
      return null;
    }

    return {
      left: this.toRecord(left, leftSender.nickname, leftCity),
      right: this.toRecord(right, rightSender.nickname, rightCity),
    };
  }

  private isPair(left: Postcard, right: Postcard): boolean {
    if (left.status !== 'DELIVERED' || right.status !== 'DELIVERED') {
      return false;
    }
    if (!left.passageId || left.passageId !== right.passageId) {
      return false;
    }
    if (right.replyToPostcardId !== left.id) {
      return false;
    }
    if (left.senderId === right.senderId) {
      return false;
    }
    return (
      left.receiverId === right.senderId && right.receiverId === left.senderId
    );
  }

  private toCandidate(postcard: Postcard): DiaryPairCandidate['left'] {
    return {
      id: postcard.id,
      status: postcard.status,
      passageId: postcard.passageId,
      senderId: postcard.senderId,
      receiverId: postcard.receiverId,
      replyToPostcardId: postcard.replyToPostcardId,
    };
  }

  private toRecord(
    postcard: Postcard,
    senderNickname: string,
    city: City,
  ): DiaryPostcardRecord {
    return {
      id: postcard.id,
      body: postcard.body,
      status: postcard.status,
      passageId: postcard.passageId,
      senderId: postcard.senderId,
      receiverId: postcard.receiverId,
      replyToPostcardId: postcard.replyToPostcardId,
      sentAt: postcard.sentAt,
      deliveredAt: postcard.deliveredAt,
      senderNickname,
      city: {
        id: city.id,
        name: city.name,
        countryCode: city.countryCode,
      },
    };
  }
}
