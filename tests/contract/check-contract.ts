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
  parameters?: Array<{
    name?: string;
    in?: string;
    schema?: { $ref?: string };
  }>;
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
    '/api/v1/stories',
    '/api/v1/stories/{id}',
    '/api/v1/stories/mine',
    '/api/v1/stories/mine/{id}',
    '/api/v1/stories/{id}/submit',
    '/api/v1/stories/{id}/withdraw',
    '/api/v1/discovery/cities',
    '/api/v1/passages',
    '/api/v1/passages/{id}',
    '/api/v1/passages/{id}/pause',
    '/api/v1/passages/{id}/resume',
    '/api/v1/passages/{id}/complete',
    '/api/v1/passages/{id}/archive',
    '/api/v1/moderation/queue',
    '/api/v1/moderation/stories/{id}/decision',
    '/api/v1/safety/blocks',
    '/api/v1/safety/blocks/{userId}',
    '/api/v1/penpals',
    '/api/v1/penpals/consent',
    '/api/v1/penpals/{counterpartId}/consent',
    '/api/v1/memories/personal',
    '/api/v1/memories/personal/{id}',
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
  if (!/"role"\s*:/.test(sessionUserSchema) || !sessionUserSchema.includes('ADMIN')) {
    fail('AuthSessionUserDto 必须包含 USER/ADMIN 角色');
  }

  const authUserSchema = JSON.stringify(document.components?.schemas?.AuthUserDto ?? {});
  if (!authUserSchema.includes('"nickname"') || !authUserSchema.includes('"emailVerified"')) {
    fail('AuthUserDto 响应契约缺少必要字段');
  }
  if (!/"email"\s*:/.test(authUserSchema)) {
    fail('AuthUserDto 必须包含本人 email');
  }
  if (!/"role"\s*:/.test(authUserSchema) || !authUserSchema.includes('ADMIN')) {
    fail('AuthUserDto 必须包含 USER/ADMIN 角色');
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
  if (!detailSchema.includes('"passageId"') || !detailSchema.includes('"canReply"')) {
    fail('PostcardDetailDto 必须包含可空 passageId 与服务端计算的 canReply');
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
  if (!draftSchema.includes('"passageId"')) {
    fail('草稿契约必须包含可空 passageId，供共途上下文回显');
  }
  if (!draftSchema.includes('"replyToPostcardId"')) {
    fail('草稿契约必须包含可空 replyToPostcardId，供回信上下文回显');
  }

  const createDraftSchema = JSON.stringify(
    document.components?.schemas?.CreatePostcardDraftDto ?? {},
  );
  if (!createDraftSchema.includes('"passageId"')) {
    fail('创建草稿契约必须接受可选 passageId');
  }
  if (!createDraftSchema.includes('"replyToPostcardId"')) {
    fail('创建草稿契约必须接受可选 replyToPostcardId');
  }

  const recipientsOperation = document.paths['/api/v1/postcards/recipients']?.get as
    | OpenApiOperation
    | undefined;
  const passageQuery = recipientsOperation?.parameters?.find(
    (parameter) => parameter.in === 'query' && parameter.name === 'passageId',
  );
  if (!passageQuery) {
    fail('收件人契约必须支持可选 passageId 查询参数');
  }

  const publicListSchema = JSON.stringify(
    document.components?.schemas?.PublicStoryListDto ?? {},
  );
  const publicDetailSchema = JSON.stringify(
    document.components?.schemas?.PublicStoryDetailDto ?? {},
  );
  const publicStorySchema = `${publicListSchema}${publicDetailSchema}`;
  if (!publicStorySchema.includes('"authorNickname"') || !publicStorySchema.includes('"publishedAt"')) {
    fail('公开故事契约缺少作者昵称或公开时间');
  }
  if (/"email"\s*:/.test(publicStorySchema) || /authorId|centroidLat|centroidLon/.test(publicStorySchema)) {
    fail('公开故事契约不能包含 email、作者 ID 或经纬度');
  }
  if (/reviewNote|internalNote/.test(publicStorySchema)) {
    fail('公开故事契约不能包含审核内部备注');
  }

  const cityMemorySchema = JSON.stringify({
    list: document.components?.schemas?.CityMemoryListDto ?? {},
    item: document.components?.schemas?.CityMemoryItemDto ?? {},
    city: document.components?.schemas?.DiscoveryCityDto ?? {},
  });
  if (!cityMemorySchema.includes('"publicStoryCount"') || !cityMemorySchema.includes('"latestPublishedAt"')) {
    fail('世界记忆地图城市聚合契约缺少公开数量或最近公开时间');
  }
  if (/centroidLat|centroidLon|authorId|"email"/.test(cityMemorySchema)) {
    fail('世界记忆地图契约不能包含坐标、作者 ID 或 email');
  }

  const ownStorySchema = JSON.stringify(document.components?.schemas?.OwnStoryDto ?? {});
  if (!ownStorySchema.includes('"reviewStatus"') || !ownStorySchema.includes('"body"')) {
    fail('作者故事契约缺少审核状态或正文');
  }
  if (/"email"\s*:/.test(ownStorySchema)) {
    fail('作者故事契约不能包含 email');
  }

  const moderationSchema = JSON.stringify(
    document.components?.schemas?.ModerationStoryItemDto ?? {},
  );
  if (!moderationSchema.includes('"body"') || !moderationSchema.includes('"authorNickname"')) {
    fail('审核队列契约缺少正文或作者昵称');
  }
  if (/"email"\s*:/.test(moderationSchema) || /centroidLat|centroidLon/.test(moderationSchema)) {
    fail('审核队列契约不能包含 email 或经纬度');
  }

  const passageSchema = JSON.stringify({
    summary: document.components?.schemas?.PassageSummaryDto ?? {},
    self: document.components?.schemas?.PassageSelfDto ?? {},
    counterpart: document.components?.schemas?.PassageCounterpartDto ?? {},
    permissions: document.components?.schemas?.PassagePermissionsDto ?? {},
  });
  const passageCounterpartSchema = JSON.stringify(
    document.components?.schemas?.PassageCounterpartDto ?? {},
  );
  if (!passageCounterpartSchema.includes('"id"')) {
    fail('共途对方契约必须包含 id，供封锁入口使用');
  }
  if (/"email"\s*:/.test(passageCounterpartSchema)) {
    fail('共途对方契约不能包含 email');
  }
  if (
    !passageSchema.includes('"progressStatus"') ||
    !passageSchema.includes('"consentState"') ||
    !passageSchema.includes('"canSend"')
  ) {
    fail('共途契约缺少进度、意愿或许可字段');
  }
  if (
    /"email"\s*:/.test(passageSchema) ||
    /centroidLat|centroidLon|receptionMode|password|session/i.test(passageSchema)
  ) {
    fail('共途契约不能包含 email、坐标、接信状态、密码或会话字段');
  }
  if (!/ACTIVE/.test(passageSchema) || !/COMPLETED/.test(passageSchema) || !/ARCHIVED/.test(passageSchema)) {
    fail('共途契约缺少 ACTIVE/COMPLETED/ARCHIVED 进度状态');
  }

  const passageDetailSchema = responseSchemaName(document, '/api/v1/passages/{id}', 'get', '200');
  if (passageDetailSchema !== 'PassageSummaryDto') {
    fail(`共途详情响应必须使用 PassageSummaryDto，实际为 ${passageDetailSchema}`);
  }

  const blockListSchema = JSON.stringify(
    document.components?.schemas?.BlockListDto ?? {},
  );
  const blockedUserSchema = JSON.stringify(
    document.components?.schemas?.BlockedUserDto ?? {},
  );
  const blockInputSchema = JSON.stringify(
    document.components?.schemas?.BlockUserDto ?? {},
  );
  const blockSchema = `${blockListSchema}${blockedUserSchema}${blockInputSchema}`;
  if (
    !blockedUserSchema.includes('"userId"') ||
    !blockedUserSchema.includes('"nickname"') ||
    !blockedUserSchema.includes('"blockedAt"') ||
    !blockInputSchema.includes('"userId"')
  ) {
    fail('封锁契约缺少 userId、nickname 或 blockedAt');
  }
  if (/"email"\s*:/.test(blockSchema) || /centroidLat|centroidLon|password|session/i.test(blockSchema)) {
    fail('封锁契约不能包含 email、坐标、密码或会话字段');
  }

  const penpalOverviewSchema = JSON.stringify(
    document.components?.schemas?.PenpalOverviewDto ?? {},
  );
  const penpalCounterpartSchema = JSON.stringify(
    document.components?.schemas?.PenpalCounterpartDto ?? {},
  );
  const penpalConsentInputSchema = JSON.stringify(
    document.components?.schemas?.PenpalConsentDto ?? {},
  );
  const penpalResultSchema = JSON.stringify(
    document.components?.schemas?.PenpalConsentResultDto ?? {},
  );
  const penpalSchema = `${penpalOverviewSchema}${penpalCounterpartSchema}${penpalConsentInputSchema}${penpalResultSchema}`;

  for (const group of ['"active"', '"incoming"', '"outgoing"']) {
    if (!penpalOverviewSchema.includes(group)) {
      fail(`PenpalOverviewDto 缺少 ${group} 分组`);
    }
  }
  if (
    !penpalCounterpartSchema.includes('"id"') ||
    !penpalCounterpartSchema.includes('"nickname"') ||
    !penpalCounterpartSchema.includes('"city"')
  ) {
    fail('PenpalCounterpartDto 缺少 id、nickname 或 city');
  }
  if (!penpalConsentInputSchema.includes('"counterpartId"')) {
    fail('PenpalConsentDto 缺少 counterpartId');
  }
  if (!/ONE_SIDED/.test(penpalResultSchema) || !/ACTIVE/.test(penpalResultSchema)) {
    fail('PenpalConsentResultDto 缺少 ONE_SIDED/ACTIVE 状态');
  }
  if (
    /"email"\s*:|receptionMode|password|session|centroidLat|centroidLon|consentedAt|revokedAt/i.test(
      penpalSchema,
    )
  ) {
    fail('信友契约不能包含 email、接信状态、密码、会话、坐标或同意时间');
  }

  const penpalListSchemaName = responseSchemaName(document, '/api/v1/penpals', 'get', '200');
  if (penpalListSchemaName !== 'PenpalOverviewDto') {
    fail(`信友列表响应必须使用 PenpalOverviewDto，实际为 ${penpalListSchemaName}`);
  }
  const penpalConsentSchemaName = responseSchemaName(
    document,
    '/api/v1/penpals/consent',
    'post',
    '200',
  );
  if (penpalConsentSchemaName !== 'PenpalConsentResultDto') {
    fail(`信友同意响应必须使用 PenpalConsentResultDto，实际为 ${penpalConsentSchemaName}`);
  }

  const personalMemorySchema = JSON.stringify(
    document.components?.schemas?.PersonalMemoryDto ?? {},
  );
  const personalMemoryListSchema = JSON.stringify(
    document.components?.schemas?.PersonalMemoryListDto ?? {},
  );
  const createMemorySchema = JSON.stringify(
    document.components?.schemas?.CreatePersonalMemoryDto ?? {},
  );
  const updateMemorySchema = JSON.stringify(
    document.components?.schemas?.UpdatePersonalMemoryDto ?? {},
  );
  const memorySchema = `${personalMemorySchema}${personalMemoryListSchema}${createMemorySchema}${updateMemorySchema}`;

  for (const field of ['"id"', '"title"', '"body"', '"createdAt"', '"updatedAt"']) {
    if (!personalMemorySchema.includes(field)) {
      fail(`PersonalMemoryDto 缺少 ${field}`);
    }
  }
  if (!personalMemoryListSchema.includes('"items"')) {
    fail('PersonalMemoryListDto 缺少 items');
  }
  if (
    !createMemorySchema.includes('"title"') ||
    !createMemorySchema.includes('"body"')
  ) {
    fail('CreatePersonalMemoryDto 缺少 title 或 body');
  }
  if (!updateMemorySchema.includes('"title"') || !updateMemorySchema.includes('"body"')) {
    fail('UpdatePersonalMemoryDto 缺少 title 或 body');
  }
  if (
    /"email"\s*:|ownerId|password|session|sourceType|visibility|isPublic/i.test(
      memorySchema,
    )
  ) {
    fail('个人记忆契约不能包含 email、ownerId、密码、会话、来源或公开字段');
  }

  const memoryListSchemaName = responseSchemaName(
    document,
    '/api/v1/memories/personal',
    'get',
    '200',
  );
  if (memoryListSchemaName !== 'PersonalMemoryListDto') {
    fail(`个人记忆列表响应必须使用 PersonalMemoryListDto，实际为 ${memoryListSchemaName}`);
  }
  const memoryCreateSchemaName = responseSchemaName(
    document,
    '/api/v1/memories/personal',
    'post',
    '201',
  );
  if (memoryCreateSchemaName !== 'PersonalMemoryDto') {
    fail(`个人记忆创建响应必须使用 PersonalMemoryDto，实际为 ${memoryCreateSchemaName}`);
  }
  const memoryUpdateSchemaName = responseSchemaName(
    document,
    '/api/v1/memories/personal/{id}',
    'patch',
    '200',
  );
  if (memoryUpdateSchemaName !== 'PersonalMemoryDto') {
    fail(`个人记忆更新响应必须使用 PersonalMemoryDto，实际为 ${memoryUpdateSchemaName}`);
  }

  const decisionSchema = JSON.stringify(
    document.components?.schemas?.StoryDecisionDto ?? {},
  );
  if (!decisionSchema.includes('APPROVE') || !decisionSchema.includes('REJECT') || !decisionSchema.includes('REMOVE')) {
    fail('故事决策契约缺少 APPROVE/REJECT/REMOVE');
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
