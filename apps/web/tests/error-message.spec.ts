import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/shared/api/client';
import { toFriendlyAuthMessage } from '../src/shared/api/error-message';

describe('认证错误文案', () => {
  it('凭据错误不区分账号是否存在', () => {
    expect(toFriendlyAuthMessage(new ApiError('AUTH_INVALID_CREDENTIALS', 401, '邮箱或密码不正确'))).toBe(
      '邮箱或密码不正确。',
    );
  });

  it('重复注册提示不指认邮箱是否已存在', () => {
    const message = toFriendlyAuthMessage(new ApiError('REGISTRATION_CONFLICT', 409, 'conflict'));
    expect(message).toContain('无法完成注册');
    expect(message).not.toContain('邮箱已');
  });

  it('校验错误只展示字段名，不回显输入值', () => {
    const message = toFriendlyAuthMessage(
      new ApiError('VALIDATION_ERROR', 422, 'invalid', 'req_1', ['password:length', 'email:isEmail']),
    );
    expect(message).toContain('密码');
    expect(message).toContain('邮箱');
    expect(message).not.toContain('length');
  });

  it('限流与服务不可用有独立提示', () => {
    expect(toFriendlyAuthMessage(new ApiError('RATE_LIMITED', 429, 'too many'))).toContain('尝试次数过多');
    expect(toFriendlyAuthMessage(new ApiError('SERVICE_UNAVAILABLE', 503, 'down'))).toContain('服务暂时不可用');
  });

  it('非 API 错误统一提示网络问题', () => {
    expect(toFriendlyAuthMessage(new Error('boom'))).toContain('网络');
  });
});
