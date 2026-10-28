import { Injectable, type LoggerService } from '@nestjs/common';
import { sanitizeForLog } from './sanitize';

export type LogRecord = Record<string, unknown>;

/**
 * 结构化 JSON 日志。只输出显式传入的字段；本类不读取请求体、Cookie 或请求头。
 */
@Injectable()
export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write({ level: 'info', msg: sanitizeForLog(message), context });
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write({
      level: 'error',
      msg: sanitizeForLog(message),
      context,
      ...(stack ? { stack: sanitizeForLog(stack, 1200) } : {}),
    });
  }

  warn(message: unknown, context?: string): void {
    this.write({ level: 'warn', msg: sanitizeForLog(message), context });
  }

  debug(message: unknown, context?: string): void {
    this.write({ level: 'debug', msg: sanitizeForLog(message), context });
  }

  verbose(message: unknown, context?: string): void {
    this.write({ level: 'verbose', msg: sanitizeForLog(message), context });
  }

  record(record: LogRecord): void {
    this.write(record);
  }

  private write(record: LogRecord): void {
    const payload = { time: new Date().toISOString(), ...record };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }
}
