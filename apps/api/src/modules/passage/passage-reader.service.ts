import { Injectable } from '@nestjs/common';
import { canSendPassage } from './domain/passage-policy';
import { PassageRepository } from './repositories/passage.repository';

export interface PassageSendContext {
  passageId: string;
  senderId: string;
  receiverId: string;
  canSend: boolean;
}

/**
 * PassageModule 对邮局公开的最小读取入口。
 * 只返回发送所需的对方 ID 与许可结果，不暴露许可原因、记忆或事件。
 */
@Injectable()
export class PassageReader {
  constructor(private readonly passages: PassageRepository) {}

  async findSendContext(
    passageId: string,
    senderId: string,
  ): Promise<PassageSendContext | null> {
    const record = await this.passages.findForUser(passageId, senderId);
    if (!record) {
      return null;
    }
    const counterpart = record.participants.find(
      (participant) => participant.userId !== senderId,
    );
    if (!counterpart) {
      return null;
    }
    return {
      passageId: record.id,
      senderId,
      receiverId: counterpart.userId,
      canSend: canSendPassage({
        viewerId: senderId,
        progressStatus: record.progressStatus,
        participants: record.participants.map((participant) => ({
          userId: participant.userId,
          consentState: participant.consentState,
        })),
      }),
    };
  }
}
