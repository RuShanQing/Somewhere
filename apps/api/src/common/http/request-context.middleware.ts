import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { JsonLogger } from '../logging/json-logger';
import { sanitizeForLog } from '../logging/sanitize';
import type { RequestWithContext } from './request.types';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * 为每个请求生成 requestId，并在请求结束后输出结构化访问日志。
 * 只记录方法、路径、状态、耗时与用户 ID，不记录请求体、Cookie 或查询串。
 */
export function requestContextMiddleware(logger: JsonLogger): RequestHandler {
  return (req, res, next) => {
    const request = req as RequestWithContext;
    const incoming = req.header('x-request-id');
    const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

    request.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.record({
        level: 'info',
        msg: 'http_request',
        requestId,
        method: request.method,
        path: sanitizeForLog(request.path, 120),
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        ...(request.user ? { userId: request.user.id } : {}),
      });
    });

    next();
  };
}
