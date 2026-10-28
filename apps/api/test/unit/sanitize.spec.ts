import { describe, expect, it } from 'vitest';
import { sanitizeForLog } from '../../src/common/logging/sanitize';

describe('日志脱敏', () => {
  it('移除邮箱', () => {
    const text = sanitizeForLog('user traveler@example.test failed to login');
    expect(text).not.toContain('traveler@example.test');
    expect(text).toContain('[redacted-email]');
  });

  it('移除密码与会话字段的值', () => {
    const text = sanitizeForLog('password=super-secret-value token:abc.def sessionHash=ffff');
    expect(text).not.toContain('super-secret-value');
    expect(text).not.toContain('abc.def');
    expect(text).not.toContain('ffff');
    expect(text.match(/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('移除 Bearer 凭据', () => {
    const text = sanitizeForLog('authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature');
    expect(text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('移除数据库连接串中的口令', () => {
    const text = sanitizeForLog('failed to connect: postgresql://somewhere:somewhere_dev_pw@localhost:5432/db');
    expect(text).not.toContain('somewhere_dev_pw');
    expect(text).toContain('[redacted-connection-string]');
  });

  it('清理控制字符并限制长度', () => {
    const text = sanitizeForLog(`bad\u0000value ${'x'.repeat(1000)}`, 50);
    expect(text).not.toContain('\u0000');
    expect(text.length).toBeLessThanOrEqual(51);
  });
});
