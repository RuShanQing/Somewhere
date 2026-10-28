import 'dotenv/config';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('集成测试需要 TEST_DATABASE_URL，请参考 apps/api/.env.example');
}
if (!testDatabaseUrl.toLowerCase().includes('test')) {
  throw new Error('TEST_DATABASE_URL 必须指向名称包含 test 的隔离数据库');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.WEB_ORIGINS = 'http://localhost:5273,http://127.0.0.1:5273';
process.env.SESSION_TTL_HOURS = '168';
// 主测试应用使用高上限，避免用例之间互相触发限流；限流行为由独立应用验证。
process.env.AUTH_REGISTER_MAX_PER_IP = '500';
process.env.AUTH_LOGIN_MAX_PER_IP = '500';
process.env.AUTH_LOGIN_MAX_PER_IDENTITY = '500';

// TASK-004：演示收件人白名单与每日寄出上限（测试使用固定虚构账号）
process.env.POSTCARD_DEMO_RECIPIENT_EMAILS = 'postcard.recipient@example.test';
process.env.POSTCARD_MAX_SENDS_PER_DAY = '10';
