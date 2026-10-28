import type { ValidationError } from 'class-validator';
import { AppError } from '../errors/app-error';

/**
 * 只返回“字段:规则”，不回显用户输入值，避免把邮箱/密码写进响应或日志。
 */
export function buildValidationDetails(errors: ValidationError[], parent = ''): string[] {
  const details: string[] = [];

  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const constraints = Object.keys(error.constraints ?? {});
    if (constraints.length > 0) {
      details.push(`${path}:${constraints.join('|')}`);
    }
    if (error.children && error.children.length > 0) {
      details.push(...buildValidationDetails(error.children, path));
    }
    if (constraints.length === 0 && (!error.children || error.children.length === 0)) {
      details.push(`${path}:invalid`);
    }
  }

  return details.length > 0 ? details : ['body:invalid'];
}

export function validationExceptionFactory(errors: ValidationError[]): AppError {
  return AppError.validation(buildValidationDetails(errors));
}
