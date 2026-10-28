import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiRoot = resolve(root, 'apps/api');
const exporter = resolve(apiRoot, 'dist/tools/export-openapi.js');
const clientPath = resolve(root, 'packages/api-client/src/generated.ts');

interface OpenApiOperation {
  responses?: Record<
    string,
    { content?: Record<string, { schema?: { $ref?: string } }> }
  >;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

function responseSchemaName(
  document: OpenApiDocument,
  path: string,
  method: string,
  status: string,
): string | undefined {
  const operation = document.paths[path]?.[method] as OpenApiOperation | undefined;
  const ref = operation?.responses?.[status]?.content?.['application/json']?.schema?.$ref;
  return ref?.split('/').pop();
}

function fail(message: string): never {
  process.stderr.write(`[contract] FAIL: ${message}\n`);
  process.exit(1);
}

if (!existsSync(exporter)) {
  process.stdout.write('[contract] 未找到 API 编译产物，先构建\n');
  execFileSync('pnpm', ['--filter', '@somewhere/api', 'build'], { cwd: root, stdio: 'inherit' });
}

const workDir = mkdtempSync(join(tmpdir(), 'somewhere-contract-'));
const openapiPath = join(workDir, 'openapi.json');
const generatedPath = join(workDir, 'generated.ts');

try {
  process.env.DATABASE_URL ??= 'postgresql://contract:contract@127.0.0.1:5432/somewhere_contract_placeholder';
  execFileSync(process.execPath, [exporter, openapiPath], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: process.env,
  });

  execFileSync('pnpm', ['exec', 'openapi-typescript', openapiPath, '--output', generatedPath], {
    cwd: root,
    stdio: 'inherit',
  });

  const document = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocument;
  const expectedPaths = [
    '/api/v1/auth/register',
    '/api/v1/auth/login',
    '/api/v1/auth/logout',
    '/api/v1/auth/me',
    '/api/v1/cities',
    '/api/v1/profile/me',
    '/api/v1/health',
    '/api/v1/post-office/summary',
    '/api/v1/postcards/recipients',
    '/api/v1/postcards/drafts',
    '/api/v1/postcards/drafts/{id}',
    '/api/v1/postcards/drafts/{id}/send',
    '/api/v1/postcards/transit',
    '/api/v1/postcards/inbox',
    '/api/v1/postcards/{id}',
  ];
  for (const path of expectedPaths) {
    if (!document.paths[path]) {
      fail(`OpenAPI 缺少路径 ${path}`);
    }
  }

  const registerSchema = responseSchemaName(document, '/api/v1/auth/register', 'post', '201');
  const loginSchema = responseSchemaName(document, '/api/v1/auth/login', 'post', '200');
  const meSchema = responseSchemaName(document, '/api/v1/auth/me', 'get', '200');

  if (registerSchema !== 'AuthSessionUserDto' || loginSchema !== 'AuthSessionUserDto') {
    fail(`注册/登录成功响应必须使用 AuthSessionUserDto，实际为 ${registerSchema} / ${loginSchema}`);
  }
  if (meSchema !== 'AuthUserDto') {
    fail(`/auth/me 成功响应必须使用 AuthUserDto，实际为 ${meSchema}`);
  }

  const sessionUserSchema = JSON.stringify(document.components?.schemas?.AuthSessionUserDto ?? {});
  if (!sessionUserSchema.includes('"nickname"') || !sessionUserSchema.includes('"emailVerified"')) {
    fail('AuthSessionUserDto 响应契约缺少必要字段');
  }
  if (/"email"\s*:/.test(sessionUserSchema)) {
    fail('AuthSessionUserDto 不能包含 email');
  }

  const authUserSchema = JSON.stringify(document.components?.schemas?.AuthUserDto ?? {});
  if (!authUserSchema.includes('"nickname"') || !authUserSchema.includes('"emailVerified"')) {
    fail('AuthUserDto 响应契约缺少必要字段');
  }
  if (!/"email"\s*:/.test(authUserSchema)) {
    fail('AuthUserDto 必须包含本人 email');
  }
  if (/password/i.test(`${sessionUserSchema}${authUserSchema}`)) {
    fail('认证响应契约不能包含任何密码字段');
  }

  const cookieScheme = JSON.stringify(document.components?.securitySchemes ?? {});
  if (!cookieScheme.includes('sw_session') || !cookieScheme.includes('"in":"cookie"')) {
    fail('OpenAPI 缺少会话 Cookie 安全方案');
  }

  const citySchema = JSON.stringify(document.components?.schemas?.CitySummaryDto ?? {});
  if (!citySchema.includes('"name"') || !citySchema.includes('"countryCode"')) {
    fail('CitySummaryDto 缺少城市名或国家代码');
  }
  if (/centroidLat|centroidLon|latitude|longitude/.test(citySchema)) {
    fail('公开城市契约不能包含经纬度');
  }

  const profileSchema = JSON.stringify(document.components?.schemas?.ProfileResponseDto ?? {});
  if (!profileSchema.includes('"nickname"') || !profileSchema.includes('"receptionMode"')) {
    fail('ProfileResponseDto 缺少昵称或接信状态');
  }
  if (/"email"\s*:/.test(profileSchema)) {
    fail('ProfileResponseDto 不能包含 email');
  }

  const summarySchema = JSON.stringify(
    document.components?.schemas?.PostOfficeSummaryDto ?? {},
  );
  if (!summarySchema.includes('"incoming"') || !summarySchema.includes('"inTransit"')) {
    fail('PostOfficeSummaryDto 缺少新来信或在途字段');
  }
  if (/"body"\s*:/.test(summarySchema)) {
    fail('邮局摘要契约不能包含正文 body');
  }

  const recipientSchema = JSON.stringify(
    document.components?.schemas?.RecipientResponseDto ?? {},
  );
  if (!recipientSchema.includes('"nickname"') || !recipientSchema.includes('"city"')) {
    fail('RecipientResponseDto 缺少昵称或城市');
  }
  if (/"email"\s*:/.test(recipientSchema) || /centroidLat|centroidLon/.test(recipientSchema)) {
    fail('收件人契约不能包含邮箱或经纬度');
  }

  const detailSchema = JSON.stringify(
    document.components?.schemas?.PostcardDetailDto ?? {},
  );
  if (!detailSchema.includes('"body"') || !detailSchema.includes('DELIVERED')) {
    fail('PostcardDetailDto 缺少正文或送达状态');
  }
  if (/"email"\s*:/.test(detailSchema)) {
    fail('PostcardDetailDto 不能包含 email');
  }

  const draftSchema = JSON.stringify(
    document.components?.schemas?.PostcardDraftResponseDto ?? {},
  );
  if (/"email"\s*:/.test(draftSchema)) {
    fail('草稿契约不能包含 email');
  }

  const committed = readFileSync(clientPath, 'utf8').replace(/\r\n/g, '\n');
  const fresh = readFileSync(generatedPath, 'utf8').replace(/\r\n/g, '\n');

  if (committed !== fresh) {
    const committedLines = committed.split('\n');
    const freshLines = fresh.split('\n');
    const diffIndex = committedLines.findIndex((line, index) => line !== freshLines[index]);
    fail(
      `客户端生成产物与 OpenAPI 不一致（首个差异行 ${diffIndex + 1}）。请运行 pnpm api-client:generate 并提交结果。`,
    );
  }

  process.stdout.write(
    [
      '[contract] PASS: OpenAPI 路径齐全且不含密码字段',
      '[contract] PASS: 注册/登录响应引用 AuthSessionUserDto（无 email），/auth/me 引用 AuthUserDto',
      '[contract] PASS: 城市契约不含经纬度，资料契约不含 email',
      `[contract] PASS: ${expectedPaths.length} 条路径与 Cookie 安全方案已验证`,
      '[contract] PASS: packages/api-client/src/generated.ts 与当前 OpenAPI 完全一致',
      '',
    ].join('\n'),
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
