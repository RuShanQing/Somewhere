import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiRoot = join(root, 'apps/api');
const webDist = join(root, 'apps/web/dist');

loadDotenv({ path: join(apiRoot, '.env') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const demoRecipientEmail = `smoke.recipient.${Date.now()}@example.test`;
const API_PORT = 4302;
const WEB_PORT = 4273;
const apiBase = `http://127.0.0.1:${API_PORT}`;
const results = [];

function fail(message) {
  process.stderr.write(`[smoke] FAIL: ${message}\n`);
  process.exitCode = 1;
}

function pass(message) {
  results.push(message);
  process.stdout.write(`[smoke] PASS: ${message}\n`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (!existsSync(join(apiRoot, 'dist/main.js'))) {
  fail('缺少 apps/api/dist/main.js，请先运行 pnpm build');
  process.exit(1);
}
if (!existsSync(join(webDist, 'index.html'))) {
  fail('缺少 apps/web/dist/index.html，请先运行 pnpm build');
  process.exit(1);
}
if (!testDatabaseUrl.toLowerCase().includes('test')) {
  fail('TEST_DATABASE_URL 必须指向隔离测试库');
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
  WEB_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
  SESSION_COOKIE_NAME: 'sw_session',
  AUTH_REGISTER_MAX_PER_IP: '1000',
  AUTH_LOGIN_MAX_PER_IP: '1000',
  AUTH_LOGIN_MAX_PER_IDENTITY: '1000',
  POSTCARD_DEMO_RECIPIENT_EMAILS: demoRecipientEmail,
  POSTCARD_MAX_SENDS_PER_DAY: '10',
};

const prepare = spawnSync('node', ['scripts/prepare-test-db.mjs'], { cwd: apiRoot, env, stdio: 'inherit' });
const reset = spawnSync('node', ['scripts/reset-test-db.mjs'], { cwd: apiRoot, env, stdio: 'inherit' });
if (prepare.status !== 0 || reset.status !== 0) {
  fail('测试数据库准备失败');
  process.exit(1);
}

const apiProcess = spawn('node', ['dist/main.js'], { cwd: apiRoot, env, stdio: 'inherit' });

async function waitForHealth(attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/api/v1/health`);
      if (response.ok) {
        return response;
      }
    } catch {
      // 继续等待
    }
    await new Promise((item) => setTimeout(item, 500));
  }
  throw new Error('API 未在 30 秒内就绪');
}

function sessionCookieFrom(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith('sw_session='));
  assert(sessionCookie, '响应缺少会话 Cookie');
  return { pair: sessionCookie.split(';')[0], raw: sessionCookie };
}

function startWebServer() {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.map': 'application/json; charset=utf-8',
  };

  return new Promise((resolveServer) => {
    const server = createServer((request, response) => {
      const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
      const candidate = normalize(join(webDist, urlPath));
      const filePath = candidate.startsWith(webDist) && existsSync(candidate) && !candidate.endsWith('/')
        ? candidate
        : join(webDist, 'index.html');
      const body = readFileSync(filePath);
      response.writeHead(200, { 'content-type': mime[extname(filePath)] ?? 'application/octet-stream' });
      response.end(body);
    });
    server.listen(WEB_PORT, '127.0.0.1', () => resolveServer(server));
  });
}

async function runHttpChecks() {
  const health = await fetch(`${apiBase}/api/v1/health`);
  assert(health.status === 200, `健康检查返回 ${health.status}`);
  const healthBody = await health.json();
  assert(healthBody.status === 'ok' && healthBody.database === 'up', '健康检查未确认数据库连通');
  pass('健康检查 200 且 PostgreSQL 连通');

  const email = `smoke.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = 'fictional-smoke-passphrase';
  const origin = { 'content-type': 'application/json', origin: `http://127.0.0.1:${WEB_PORT}` };

  const registration = await fetch(`${apiBase}/api/v1/auth/register`, {
    method: 'POST',
    headers: origin,
    body: JSON.stringify({ email, password, nickname: '冒烟检查', adultConfirmed: true }),
  });
  assert(registration.status === 201, `注册返回 ${registration.status}`);
  const registrationBody = await registration.json();
  assert(!('email' in registrationBody), '注册响应不应包含 email');
  assert(!('passwordHash' in registrationBody), '注册响应泄露密码哈希');
  const session = sessionCookieFrom(registration);
  assert(/HttpOnly/i.test(session.raw), '会话 Cookie 缺少 HttpOnly');
  assert(/SameSite=Lax/i.test(session.raw), '会话 Cookie 缺少 SameSite=Lax');
  pass('注册 201，响应无 email / 密码字段，Cookie 为 HttpOnly + SameSite=Lax');

  const duplicate = await fetch(`${apiBase}/api/v1/auth/register`, {
    method: 'POST',
    headers: origin,
    body: JSON.stringify({ email: ` ${email.toUpperCase()} `, password, nickname: '重复注册', adultConfirmed: true }),
  });
  assert(duplicate.status === 409, `重复注册返回 ${duplicate.status}`);
  const duplicateBody = await duplicate.json();
  assert(duplicateBody.code === 'REGISTRATION_CONFLICT', '重复注册错误码不正确');
  pass('大小写/空格相同的重复注册返回 409 REGISTRATION_CONFLICT');

  const me = await fetch(`${apiBase}/api/v1/auth/me`, { headers: { cookie: session.pair } });
  assert(me.status === 200, `会话读取返回 ${me.status}`);
  const meBody = await me.json();
  assert(meBody.email === email, '会话返回了错误的用户');
  pass('会话 Cookie 可读取 /auth/me 且返回本人 email');

  const citiesResponse = await fetch(`${apiBase}/api/v1/cities`);
  assert(citiesResponse.status === 200, `城市目录返回 ${citiesResponse.status}`);
  const citiesBody = await citiesResponse.json();
  assert(Array.isArray(citiesBody) && citiesBody.length >= 30 && citiesBody.length <= 50, '城市数量不在 30–50 条');
  assert(
    citiesBody.every(
      (city) =>
        typeof city.id === 'string' &&
        typeof city.name === 'string' &&
        typeof city.countryCode === 'string' &&
        !('centroidLat' in city) &&
        !('centroidLon' in city),
    ),
    '城市目录字段不合法或暴露了经纬度',
  );
  pass('城市目录公开可读（30–50 条，无经纬度）');

  const unauthProfile = await fetch(`${apiBase}/api/v1/profile/me`);
  assert(unauthProfile.status === 401, `未登录资料接口返回 ${unauthProfile.status}`);

  const profile = await fetch(`${apiBase}/api/v1/profile/me`, {
    headers: { cookie: session.pair },
  });
  assert(profile.status === 200, `资料接口返回 ${profile.status}`);
  const profileBody = await profile.json();
  assert(profileBody.nickname === '冒烟检查', '资料昵称与注册时不一致');
  assert(profileBody.city === null, '新用户城市应为空');
  assert(profileBody.receptionMode === 'OPEN', '新用户接信状态应为 OPEN');
  assert(!('email' in profileBody), '资料响应不应包含 email');

  const cityId = citiesBody[0].id;
  const updatedProfile = await fetch(`${apiBase}/api/v1/profile/me`, {
    method: 'PATCH',
    headers: { ...origin, cookie: session.pair },
    body: JSON.stringify({ nickname: '冒烟旅人', cityId, receptionMode: 'RESTING' }),
  });
  assert(updatedProfile.status === 200, `修改资料返回 ${updatedProfile.status}`);
  const updatedProfileBody = await updatedProfile.json();
  assert(updatedProfileBody.city?.id === cityId, '城市修改未生效');
  assert(updatedProfileBody.receptionMode === 'RESTING', '接信状态修改未生效');

  const reloadedProfile = await fetch(`${apiBase}/api/v1/profile/me`, {
    headers: { cookie: session.pair },
  });
  assert(reloadedProfile.status === 200, '资料刷新失败');
  const reloadedProfileBody = await reloadedProfile.json();
  assert(reloadedProfileBody.nickname === '冒烟旅人', '昵称修改未持久化');
  assert(reloadedProfileBody.receptionMode === 'RESTING', '接信状态未持久化');

  const meAfterProfile = await fetch(`${apiBase}/api/v1/auth/me`, {
    headers: { cookie: session.pair },
  });
  assert(((await meAfterProfile.json()).nickname) === '冒烟旅人', '/auth/me 昵称未同步');

  const invalidCity = await fetch(`${apiBase}/api/v1/profile/me`, {
    method: 'PATCH',
    headers: { ...origin, cookie: session.pair },
    body: JSON.stringify({ cityId: '00000000-0000-4000-8000-000000000000' }),
  });
  assert(invalidCity.status === 422, `非法城市返回 ${invalidCity.status}`);
  pass('资料读取/修改/持久化与非法城市校验通过');

  const login = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: origin,
    body: JSON.stringify({ email, password }),
  });
  assert(login.status === 200, `登录返回 ${login.status}`);
  const loginBody = await login.json();
  assert(!('email' in loginBody), '登录响应不应包含 email');
  const loginSession = sessionCookieFrom(login);
  assert(loginSession.pair !== session.pair, '登录没有轮换会话 Token');

  const oldSessionReplay = await fetch(`${apiBase}/api/v1/auth/me`, {
    headers: { cookie: session.pair },
  });
  assert(oldSessionReplay.status === 401, `登录后旧会话仍有效（${oldSessionReplay.status}）`);
  const newSessionMe = await fetch(`${apiBase}/api/v1/auth/me`, {
    headers: { cookie: loginSession.pair },
  });
  assert(newSessionMe.status === 200, `新会话不可用（${newSessionMe.status}）`);
  pass('登录 200 且响应无 email；新会话生效，旧会话立即 401');

  // ---- 邮局：草稿、距离延迟、在途保密与 Worker ----
  const reopenedProfile = await fetch(`${apiBase}/api/v1/profile/me`, {
    method: 'PATCH',
    headers: { ...origin, cookie: loginSession.pair },
    body: JSON.stringify({ cityId, receptionMode: 'OPEN' }),
  });
  assert(reopenedProfile.status === 200, `恢复接信状态返回 ${reopenedProfile.status}`);

  const recipientRegistration = await fetch(`${apiBase}/api/v1/auth/register`, {
    method: 'POST',
    headers: origin,
    body: JSON.stringify({
      email: demoRecipientEmail,
      password,
      nickname: '演示收件人',
      adultConfirmed: true,
    }),
  });
  assert(recipientRegistration.status === 201, `收件人注册返回 ${recipientRegistration.status}`);
  const recipientBody = await recipientRegistration.json();
  const recipientSession = sessionCookieFrom(recipientRegistration);
  const recipientCityId = citiesBody[1]?.id;
  assert(recipientCityId, '城市目录不足两条');
  const recipientProfile = await fetch(`${apiBase}/api/v1/profile/me`, {
    method: 'PATCH',
    headers: { ...origin, cookie: recipientSession.pair },
    body: JSON.stringify({ cityId: recipientCityId, receptionMode: 'OPEN' }),
  });
  assert(recipientProfile.status === 200, `收件人资料更新返回 ${recipientProfile.status}`);

  const recipientList = await fetch(`${apiBase}/api/v1/postcards/recipients`, {
    headers: { cookie: loginSession.pair },
  });
  assert(recipientList.status === 200, `收件人列表返回 ${recipientList.status}`);
  const recipients = await recipientList.json();
  assert(
    recipients.some((recipient) => recipient.id === recipientBody.id && !('email' in recipient)),
    '白名单收件人列表不正确或泄露 email',
  );

  const draftResponse = await fetch(`${apiBase}/api/v1/postcards/drafts`, {
    method: 'POST',
    headers: { ...origin, cookie: loginSession.pair },
    body: JSON.stringify({ recipientId: recipientBody.id, body: '这是一封冒烟测试明信片。' }),
  });
  assert(draftResponse.status === 201, `创建草稿返回 ${draftResponse.status}`);
  const draftBody = await draftResponse.json();

  const sendResponse = await fetch(
    `${apiBase}/api/v1/postcards/drafts/${draftBody.id}/send`,
    {
      method: 'POST',
      headers: {
        ...origin,
        cookie: loginSession.pair,
        'Idempotency-Key': 'smoke-send-once',
      },
    },
  );
  assert(sendResponse.status === 201, `寄出明信片返回 ${sendResponse.status}`);
  const sendBody = await sendResponse.json();
  assert(sendBody.status === 'IN_TRANSIT' && sendBody.deliverAt, '寄出响应缺少在途状态或 ETA');
  const postcardId = sendBody.postcardId;

  const senderDetail = await fetch(`${apiBase}/api/v1/postcards/${postcardId}`, {
    headers: { cookie: loginSession.pair },
  });
  assert(senderDetail.status === 200, `寄件人详情返回 ${senderDetail.status}`);
  assert((await senderDetail.json()).body === '这是一封冒烟测试明信片。', '寄件人看不到自己的正文');

  const receiverEarly = await fetch(`${apiBase}/api/v1/postcards/${postcardId}`, {
    headers: { cookie: recipientSession.pair },
  });
  assert(receiverEarly.status === 404, `在途收件人提前读取返回 ${receiverEarly.status}`);
  const receiverEarlyBody = await receiverEarly.json();
  assert(receiverEarlyBody.code === 'RESOURCE_NOT_ACCESSIBLE', '在途读取错误码不正确');

  const senderSummary = await fetch(`${apiBase}/api/v1/post-office/summary`, {
    headers: { cookie: loginSession.pair },
  });
  const senderSummaryText = await senderSummary.text();
  assert(senderSummary.status === 200, `邮局摘要返回 ${senderSummary.status}`);
  assert(!senderSummaryText.includes('"body"'), '邮局摘要泄露了正文');

  const advance = spawnSync('node', ['scripts/test-advance-postcard.mjs', postcardId], {
    cwd: apiRoot,
    env,
    stdio: 'inherit',
  });
  assert(advance.status === 0, '测试时间推进或 Worker 执行失败');

  const secondScan = spawnSync('node', ['dist/tools/run-delivery-once.js'], {
    cwd: apiRoot,
    env,
    stdio: 'inherit',
  });
  assert(secondScan.status === 0, '第二次 Worker 扫描失败');

  const inbox = await fetch(`${apiBase}/api/v1/postcards/inbox`, {
    headers: { cookie: recipientSession.pair },
  });
  assert(inbox.status === 200, `收件箱返回 ${inbox.status}`);
  const inboxItems = await inbox.json();
  assert(inboxItems.length === 1, `收件箱应恰好一封，实际 ${inboxItems.length}`);
  const deliveredDetail = await fetch(`${apiBase}/api/v1/postcards/${postcardId}`, {
    headers: { cookie: recipientSession.pair },
  });
  assert(deliveredDetail.status === 200, `送达后收件人详情返回 ${deliveredDetail.status}`);
  assert((await deliveredDetail.json()).body === '这是一封冒烟测试明信片。', '送达后收件人读不到正文');
  pass('邮局：草稿→寄出→在途保密→Worker 只投递一次→收件人可读');

  // ---- 城市故事：草稿、审核、公开与撤回 ----
  const storyTitle = `冒烟城市故事 ${Date.now()}`;
  const storyBody = '雨落在旧书店的玻璃上，店里的人都没有说话，只有翻页的声音。';
  const storyCreate = await fetch(`${apiBase}/api/v1/stories`, {
    method: 'POST',
    headers: { ...origin, cookie: loginSession.pair },
    body: JSON.stringify({
      cityId,
      title: storyTitle,
      body: storyBody,
      topicTags: ['雨天', '书店'],
    }),
  });
  assert(storyCreate.status === 201, `创建故事草稿返回 ${storyCreate.status}`);
  const storyDraft = await storyCreate.json();
  assert(storyDraft.reviewStatus === 'DRAFT', '故事草稿状态不正确');

  const storySubmit = await fetch(`${apiBase}/api/v1/stories/${storyDraft.id}/submit`, {
    method: 'POST',
    headers: { ...origin, cookie: loginSession.pair },
  });
  assert(storySubmit.status === 200, `提交故事返回 ${storySubmit.status}`);
  assert((await storySubmit.json()).reviewStatus === 'PENDING', '故事提交后不是 PENDING');

  const publicBefore = await fetch(`${apiBase}/api/v1/stories`);
  const publicBeforeBody = await publicBefore.json();
  assert(
    !publicBeforeBody.items.some((item) => item.id === storyDraft.id),
    '待审核故事出现在公开列表',
  );

  const mapBefore = await fetch(`${apiBase}/api/v1/discovery/cities`);
  assert(mapBefore.status === 200, `地图城市入口返回 ${mapBefore.status}`);
  const mapBeforeBody = await mapBefore.json();
  assert(
    !mapBeforeBody.items.some((item) => item.city.id === cityId),
    '待审核故事的城市出现在地图入口',
  );

  const normalQueue = await fetch(`${apiBase}/api/v1/moderation/queue`, {
    headers: { cookie: loginSession.pair },
  });
  assert(normalQueue.status === 403, `普通用户审核队列返回 ${normalQueue.status}`);

  const adminEmail = `smoke.admin.${Date.now()}@example.test`;
  const adminRegistration = await fetch(`${apiBase}/api/v1/auth/register`, {
    method: 'POST',
    headers: origin,
    body: JSON.stringify({
      email: adminEmail,
      password,
      nickname: '冒烟管理员',
      adultConfirmed: true,
    }),
  });
  assert(adminRegistration.status === 201, `管理员注册返回 ${adminRegistration.status}`);
  const adminSession = sessionCookieFrom(adminRegistration);

  const grant = spawnSync('node', ['scripts/grant-admin.mjs', '--email', adminEmail], {
    cwd: apiRoot,
    env,
    stdio: 'inherit',
  });
  assert(grant.status === 0, '管理员授予脚本失败');

  const queue = await fetch(`${apiBase}/api/v1/moderation/queue`, {
    headers: { cookie: adminSession.pair },
  });
  assert(queue.status === 200, `管理员审核队列返回 ${queue.status}`);
  const queueBody = await queue.json();
  assert(queueBody.items.some((item) => item.id === storyDraft.id), '审核队列缺少待审核故事');

  const decision = await fetch(
    `${apiBase}/api/v1/moderation/stories/${storyDraft.id}/decision`,
    {
      method: 'POST',
      headers: { ...origin, cookie: adminSession.pair },
      body: JSON.stringify({ action: 'APPROVE' }),
    },
  );
  assert(decision.status === 200, `审核通过返回 ${decision.status}`);
  assert((await decision.json()).reviewStatus === 'APPROVED', '审核通过状态不正确');

  const publicAfter = await fetch(`${apiBase}/api/v1/stories`);
  const publicAfterText = await publicAfter.text();
  assert(publicAfter.status === 200, `公开故事列表返回 ${publicAfter.status}`);
  const publicAfterBody = JSON.parse(publicAfterText);
  assert(
    publicAfterBody.items.some((item) => item.id === storyDraft.id),
    '审核通过的故事没有出现在公开列表',
  );
  assert(!/"email"\s*:/.test(publicAfterText), '公开故事列表泄露 email');
  assert(!/centroidLat|centroidLon/.test(publicAfterText), '公开故事列表泄露经纬度');

  const publicDetail = await fetch(`${apiBase}/api/v1/stories/${storyDraft.id}`);
  assert(publicDetail.status === 200, `公开故事详情返回 ${publicDetail.status}`);
  assert((await publicDetail.json()).body === storyBody, '公开故事详情正文不正确');

  const mapAfter = await fetch(`${apiBase}/api/v1/discovery/cities`);
  const mapAfterText = await mapAfter.text();
  assert(mapAfter.status === 200, `地图城市入口返回 ${mapAfter.status}`);
  const mapAfterBody = JSON.parse(mapAfterText);
  const mapEntry = mapAfterBody.items.find((item) => item.city.id === cityId);
  assert(mapEntry, '审核通过的故事没有让城市出现在地图入口');
  assert(
    mapEntry.publicStoryCount === publicAfterBody.items.length,
    `地图数量 ${mapEntry.publicStoryCount} 与故事站 ${publicAfterBody.items.length} 不一致`,
  );
  assert(!/"email"\s*:/.test(mapAfterText), '地图入口泄露 email');
  assert(!/centroidLat|centroidLon/.test(mapAfterText), '地图入口泄露经纬度');
  assert(!/authorId/.test(mapAfterText), '地图入口泄露作者 ID');
  pass('世界记忆地图：城市入口与故事站同一数据源，响应无邮箱/坐标/作者 ID');

  const withdraw = await fetch(`${apiBase}/api/v1/stories/${storyDraft.id}/withdraw`, {
    method: 'POST',
    headers: { ...origin, cookie: loginSession.pair },
  });
  assert(withdraw.status === 200, `撤回故事返回 ${withdraw.status}`);
  const publicGone = await fetch(`${apiBase}/api/v1/stories/${storyDraft.id}`);
  assert(publicGone.status === 404, `撤回后公开详情仍可读（${publicGone.status}）`);

  const mapGone = await fetch(`${apiBase}/api/v1/discovery/cities`);
  const mapGoneBody = await mapGone.json();
  assert(
    !mapGoneBody.items.some((item) => item.city.id === cityId),
    '撤回后城市仍出现在地图入口',
  );
  pass('城市故事：草稿→审核→公开→撤回，地图与故事站同时消失');

  // ---- 共途：停泊、归档与进行中列表 ----
  const passageTopic = `冒烟共途 ${Date.now()}`;
  const passageSeed = spawnSync(
    'node',
    [
      'scripts/seed-passage.mjs',
      '--email-a',
      email,
      '--email-b',
      demoRecipientEmail,
      '--topic',
      passageTopic,
    ],
    { cwd: apiRoot, env, stdio: 'inherit' },
  );
  assert(passageSeed.status === 0, '共途 seed 脚本失败');

  const anonymousPassages = await fetch(`${apiBase}/api/v1/passages`);
  assert(anonymousPassages.status === 401, `匿名共途列表返回 ${anonymousPassages.status}`);

  const passageList = await fetch(`${apiBase}/api/v1/passages`, {
    headers: { cookie: loginSession.pair },
  });
  assert(passageList.status === 200, `共途列表返回 ${passageList.status}`);
  const passageListText = await passageList.text();
  const passageListBody = JSON.parse(passageListText);
  const seededPassage = passageListBody.items.find((item) => item.topic === passageTopic);
  assert(seededPassage, '共途列表缺少 seed 数据');
  assert(seededPassage.permissions.canSend === true, '双方 ALLOW 时 canSend 应为 true');
  assert(!/"email"\s*:/.test(passageListText), '共途列表泄露 email');
  assert(!/centroidLat|centroidLon|receptionMode/.test(passageListText), '共途列表泄露坐标或接信状态');

  const pauseResponse = await fetch(`${apiBase}/api/v1/passages/${seededPassage.id}/pause`, {
    method: 'POST',
    headers: { ...origin, cookie: loginSession.pair },
  });
  assert(pauseResponse.status === 200, `停泊返回 ${pauseResponse.status}`);
  const pausedBody = await pauseResponse.json();
  assert(pausedBody.me.consentState === 'PAUSED', '停泊后本人意愿不是 PAUSED');
  assert(pausedBody.permissions.canSend === false, '停泊后 canSend 仍为 true');

  const passageDraftResponse = await fetch(`${apiBase}/api/v1/postcards/drafts`, {
    method: 'POST',
    headers: { ...origin, cookie: loginSession.pair },
    body: JSON.stringify({ body: '停泊后不该寄出。', passageId: seededPassage.id }),
  });
  assert(passageDraftResponse.status === 201, `共途草稿返回 ${passageDraftResponse.status}`);
  const passageDraft = await passageDraftResponse.json();
  assert(passageDraft.passageId === seededPassage.id, '草稿未保存 passageId');

  const blockedPassageSend = await fetch(
    `${apiBase}/api/v1/postcards/drafts/${passageDraft.id}/send`,
    {
      method: 'POST',
      headers: {
        ...origin,
        cookie: loginSession.pair,
        'Idempotency-Key': `smoke-passage-${Date.now()}`,
      },
    },
  );
  assert(blockedPassageSend.status === 409, `停泊后共途发信返回 ${blockedPassageSend.status}`);
  assert(
    (await blockedPassageSend.json()).code === 'PASSAGE_STATE_CONFLICT',
    '停泊后共途发信错误码不正确',
  );

  const archiveResponse = await fetch(`${apiBase}/api/v1/passages/${seededPassage.id}/archive`, {
    method: 'POST',
    headers: { ...origin, cookie: loginSession.pair },
  });
  assert(archiveResponse.status === 200, `归档返回 ${archiveResponse.status}`);
  assert((await archiveResponse.json()).progressStatus === 'ARCHIVED', '归档后进度不是 ARCHIVED');

  const activePassages = await fetch(`${apiBase}/api/v1/passages?status=ACTIVE`, {
    headers: { cookie: loginSession.pair },
  });
  const activeBody = await activePassages.json();
  assert(
    !activeBody.items.some((item) => item.id === seededPassage.id),
    '归档后的共途仍出现在进行中列表',
  );
  pass('共途：停泊阻断 canSend，归档后退出进行中列表，响应无邮箱/坐标');

  const wrongPassword = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: origin,
    body: JSON.stringify({ email, password: 'wrong-fictional-passphrase' }),
  });
  const unknownAccount = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: origin,
    body: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-fictional-passphrase' }),
  });
  assert(wrongPassword.status === 401 && unknownAccount.status === 401, '错误凭据应返回 401');
  const wrongBody = await wrongPassword.json();
  const unknownBody = await unknownAccount.json();
  assert(wrongBody.code === 'AUTH_INVALID_CREDENTIALS', '错误凭据错误码不正确');
  assert(wrongBody.message === unknownBody.message, '错误密码与不存在账号的提示不一致');
  pass('错误密码与不存在账号返回一致的 401，不泄露账号存在性');

  const logout = await fetch(`${apiBase}/api/v1/auth/logout`, {
    method: 'POST',
    headers: { ...origin, cookie: loginSession.pair },
  });
  assert(logout.status === 204, `退出返回 ${logout.status}`);
  const replay = await fetch(`${apiBase}/api/v1/auth/me`, { headers: { cookie: loginSession.pair } });
  assert(replay.status === 401, `退出后旧 Cookie 仍可访问（${replay.status}）`);
  pass('退出 204，当前会话 Cookie 再访问 /auth/me 返回 401');

  const blockedOrigin = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ email, password }),
  });
  assert(blockedOrigin.status === 403, `跨站来源未被拒绝（${blockedOrigin.status}）`);
  pass('未知 Origin 的写请求返回 403');

  const missing = await fetch(`${apiBase}/api/v1/not-a-route`);
  assert(missing.status === 404, '未知路由未返回 404');
  const missingBody = await missing.json();
  assert(missingBody.code === 'NOT_FOUND' && missingBody.requestId, '未知路由错误体不符合契约');
  pass('未知路由返回统一 JSON 错误与 requestId');
}

let webServer;
try {
  await waitForHealth();
  pass('API 进程在 30 秒内就绪');

  await runHttpChecks();

  webServer = await startWebServer();
  const home = await fetch(`http://127.0.0.1:${WEB_PORT}/`);
  const homeHtml = await home.text();
  assert(home.status === 200 && homeHtml.includes('id="app"'), 'Web 产物首页不可用');
  const loginPage = await fetch(`http://127.0.0.1:${WEB_PORT}/auth/login`);
  assert(loginPage.status === 200, 'SPA 路由 /auth/login 不可用');
  const assetMatch = homeHtml.match(/src="(\/assets\/[^"]+\.js)"/);
  if (assetMatch?.[1]) {
    const asset = await fetch(`http://127.0.0.1:${WEB_PORT}${assetMatch[1]}`);
    assert(asset.status === 200, 'Web 主资源不可访问');
  }
  pass('Web 构建产物可访问，SPA 路由回退正常');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (webServer) {
    await new Promise((done) => webServer.close(done));
  }
  apiProcess.kill('SIGTERM');
}

if (process.exitCode === 1) {
  process.stderr.write('[smoke] 冒烟失败\n');
} else {
  process.stdout.write(`[smoke] 全部通过（${results.length} 项）\n`);
}
