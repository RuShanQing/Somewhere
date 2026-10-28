import { describe, expect, it } from 'vitest';
import { ValidationError } from 'class-validator';
import { buildValidationDetails } from '../../src/common/http/validation';

function error(property: string, constraints: Record<string, string>, value: unknown): ValidationError {
  const validationError = new ValidationError();
  validationError.property = property;
  validationError.constraints = constraints;
  validationError.value = value;
  return validationError;
}

describe('校验错误详情', () => {
  it('只暴露字段名与规则，不回显输入值', () => {
    const details = buildValidationDetails([
      error('email', { isEmail: '邮箱格式不正确' }, 'secret-address@example.test'),
      error('password', { minLength: '密码太短' }, 'short'),
    ]);

    expect(details).toEqual(['email:isEmail', 'password:minLength']);
    expect(details.join(',')).not.toContain('secret-address@example.test');
    expect(details.join(',')).not.toContain('short');
  });

  it('没有约束时返回兜底标识，绝不返回空数组', () => {
    const validationError = new ValidationError();
    validationError.property = 'unknown';
    expect(buildValidationDetails([validationError])).toEqual(['unknown:invalid']);
    expect(buildValidationDetails([])).toEqual(['body:invalid']);
  });
});
