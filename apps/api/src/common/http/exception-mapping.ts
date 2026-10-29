import { HttpException } from '@nestjs/common';
import { AppError, type ErrorCode } from '../errors/app-error';

export interface ResolvedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: string[];
  logLevel: 'warn' | 'error';
}

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'AUTH_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'VALIDATION_ERROR',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

export function resolveError(exception: unknown): ResolvedError {
  if (exception instanceof AppError) {
    return {
      status: exception.status,
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
      logLevel: exception.status >= 500 ? 'error' : 'warn',
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
    return {
      status,
      code,
      message: messageForStatus(status),
      logLevel: status >= 500 ? 'error' : 'warn',
    };
  }

  // express.json 解析失败由 body-parser 抛出带 status 的 SyntaxError
  if (exception instanceof SyntaxError && 'status' in exception && exception.status === 400) {
    return {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: '提交的内容不符合要求',
      logLevel: 'warn',
    };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: '服务暂时不可用',
    logLevel: 'error',
  };
}

function messageForStatus(status: number): string {
  switch (status) {
    case 401:
      return '需要登录后才能访问';
    case 403:
      return '没有权限执行此操作';
    case 404:
      return '请求的资源不存在';
    case 429:
      return '请求过于频繁，请稍后再试';
    case 503:
      return '服务暂时不可用';
    default:
      return status >= 500 ? '服务暂时不可用' : '提交的内容不符合要求';
  }
}
