/**
 * 测试数据库安全门：任何清空/迁移脚本都必须先通过这里。
 * 只允许 DATABASE_URL 指向名称包含 test 的独立数据库。
 */
export function assertSafeTestDatabaseUrl(url, nodeEnv) {
  if (!url) {
    throw new Error('缺少 TEST_DATABASE_URL，请复制 apps/api/.env.example 为 apps/api/.env');
  }
  if (nodeEnv === 'production') {
    throw new Error('禁止在生产环境执行测试数据库操作');
  }

  const parsed = new URL(url);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const lowered = databaseName.toLowerCase();

  if (!lowered.includes('test')) {
    throw new Error(`拒绝操作非测试数据库：${databaseName}（库名必须包含 test）`);
  }
  if (lowered.includes('prod')) {
    throw new Error(`拒绝操作疑似生产数据库：${databaseName}`);
  }
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error(`测试数据库必须位于本机，当前主机为 ${parsed.hostname}`);
  }

  return databaseName;
}

export function readTestDatabaseUrl(env) {
  return env.TEST_DATABASE_URL ?? '';
}
