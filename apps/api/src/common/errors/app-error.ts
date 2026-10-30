export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'REGISTRATION_CONFLICT'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'ORIGIN_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'RESOURCE_NOT_ACCESSIBLE'
  | 'STORY_STATE_CONFLICT'
  | 'PASSAGE_STATE_CONFLICT'
  | 'CONTACT_BLOCKED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

/**
 * 业务错误：只携带对外安全的 code / message / 字段名，绝不放入密码、邮箱或会话值。
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: string[];

  constructor(code: ErrorCode, status: number, message: string, details?: string[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    if (details !== undefined) {
      this.details = details;
    }
  }

  static validation(details: string[]): AppError {
    return new AppError('VALIDATION_ERROR', 422, '提交的内容不符合要求', details);
  }

  static registrationConflict(): AppError {
    return new AppError('REGISTRATION_CONFLICT', 409, '无法完成注册，请检查填写内容或直接登录');
  }

  static invalidCredentials(): AppError {
    return new AppError('AUTH_INVALID_CREDENTIALS', 401, '邮箱或密码不正确');
  }

  static authRequired(): AppError {
    return new AppError('AUTH_REQUIRED', 401, '需要登录后才能访问');
  }

  static forbidden(message = '没有权限执行此操作'): AppError {
    return new AppError('FORBIDDEN', 403, message);
  }

  static storyStateConflict(message = '故事当前状态不允许此操作'): AppError {
    return new AppError('STORY_STATE_CONFLICT', 409, message);
  }

  static storySubmissionLimitReached(): AppError {
    return new AppError(
      'RATE_LIMITED',
      429,
      '这段时间写下的故事已经够多了，请让它们先被读完',
    );
  }

  static passageStateConflict(message = '共途当前状态不允许此操作'): AppError {
    return new AppError('PASSAGE_STATE_CONFLICT', 409, message);
  }

  static contactBlocked(): AppError {
    return new AppError('CONTACT_BLOCKED', 403, '当前无法与这位用户联系');
  }

  static originNotAllowed(): AppError {
    return new AppError('ORIGIN_NOT_ALLOWED', 403, '请求来源不被允许');
  }

  static rateLimited(): AppError {
    return new AppError('RATE_LIMITED', 429, '请求过于频繁，请稍后再试');
  }

  static notFound(): AppError {
    return new AppError('NOT_FOUND', 404, '请求的资源不存在');
  }

  /** 私有资源统一用不可访问响应，避免通过 403/404 差异枚举他人内容。 */
  static resourceNotAccessible(): AppError {
    return new AppError('RESOURCE_NOT_ACCESSIBLE', 404, '当前内容不可访问');
  }

  static postcardLimitReached(): AppError {
    return new AppError(
      'RATE_LIMITED',
      429,
      '今天寄出的信已经够多了，请让它们先在路上走一会儿',
    );
  }

  static serviceUnavailable(): AppError {
    return new AppError('SERVICE_UNAVAILABLE', 503, '服务暂时不可用');
  }
}
