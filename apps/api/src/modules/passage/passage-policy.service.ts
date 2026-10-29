import { Injectable } from '@nestjs/common';
import {
  canSendPassage,
  type PassagePolicyInput,
} from './domain/passage-policy';

/**
 * PassageModule 对其他模块公开的通信许可入口。
 * 当前没有其他模块消费；TASK-008 接入邮局时只能通过这里判断，
 * 不能在 PostcardModule 里硬编码共途状态。
 */
@Injectable()
export class PassagePolicy {
  canSend(input: PassagePolicyInput): boolean {
    return canSendPassage(input);
  }
}
