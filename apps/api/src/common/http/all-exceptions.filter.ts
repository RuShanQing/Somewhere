import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { JsonLogger } from '../logging/json-logger';
import { sanitizeForLog } from '../logging/sanitize';
import type { RequestWithContext } from './request.types';
import { resolveError } from './exception-mapping';

/**
 * 统一错误响应：{ code, message, requestId, details? }。
 * 不返回异常原文、请求体、邮箱或会话信息。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? 'req_unknown';
    const resolved = resolveError(exception);

    const logPayload = {
      level: resolved.logLevel,
      msg: 'request_failed',
      requestId,
      method: request.method,
      path: request.path,
      status: resolved.status,
      code: resolved.code,
      errorName: exception instanceof Error ? exception.name : typeof exception,
    };
    this.logger.record(logPayload);

    if (resolved.status >= 500 && exception instanceof Error) {
      this.logger.error(`unhandled ${exception.name}: ${sanitizeForLog(exception.message)}`, exception.stack);
    }

    if (response.headersSent) {
      return;
    }

    response.status(resolved.status).json({
      code: resolved.code,
      message: resolved.message,
      requestId,
      ...(resolved.details ? { details: resolved.details } : {}),
    });
  }
}
