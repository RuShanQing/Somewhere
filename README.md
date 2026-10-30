# Somewhere · 慢社交 Web

Somewhere 是一个 Web 优先的慢社交产品：用按距离延迟抵达的明信片、城市故事、善意接力与「共途」，和远方的人交换生活片段。

当前仓库完成 **TASK-001～TASK-011**：可运行的基础工程、账号注册/登录/会话/退出（含单活动会话）、49 条城市目录、最小个人资料与 `/settings`、邮局三栏与距离延迟投递、城市故事草稿/提交/管理员审核/公开故事站、世界记忆地图的业务入口（城市聚合与单城市故事页）、共途的列表/详情与停泊/续程/完成/归档、共途通信许可接入邮局、最小封锁、双向信友授权，以及只归本人可见的个人记忆。共途邀请、共途回信（TASK-012，已立项未编码）、双城日记、共同手帐、通知、举报与完整安全处置、角色扩展等功能尚未实现；地图仍不包含任何渲染技术。

## 当前进度

| 任务 | 状态 | 内容 |
|---|---|---|
| TASK-001 | DONE | pnpm workspace、NestJS + Vue 基础工程、认证闭环、四导航空态、质量门禁 |
| TASK-002 | DONE | AUTH 响应收敛、单活动会话、认证回归与证据 |
| TASK-003 | DONE | 城市目录（49 条）、最小资料、`/settings`、集成/契约/E2E/Smoke |
| TASK-004 | DONE | 邮局三栏、明信片草稿/发送、距离延迟、Worker、在途保密、每日上限 |
| TASK-005 | DONE | 城市故事草稿/提交/撤回、`ADMIN` 审核、公开故事站与详情、城市容量与提交配额 |
| TASK-006 | DONE | 世界记忆地图业务入口：城市聚合接口、`/discover/map` 城市入口、单城市故事页、公开谓词单点化 |
| TASK-007 | DONE | 共途三表与 6 个接口、列表/详情、停泊/续程/完成/归档、`canSend`、非生产 seed、并发与幂等 |
| TASK-008 | DONE | 草稿/明信片 `passage_id`、共途收件人、发送时强制 `canSend`、共途写信入口与上下文 |
| TASK-009 | DONE | 最小封锁：`user_blocks`、封锁列表/创建/解除、邮局与共途拦截、解除后恢复 |
| TASK-010 | DONE | 双向信友：两条单方同意、三组列表、封锁优先、邮局收件人接入 |
| TASK-011 | DONE | 个人记忆：`personal_memories`、仅本人 CRUD、非本人/`ADMIN` 统一 404 |
| TASK-012 | READY | 共途回信与 `replyToPostcardId`（PAS-02 收尾）；已确认范围，尚未编码 |

详细验收记录见 `tasks/current.md` 与 `tasks/archive/`；最近一次全量证据见 `artifacts/verification/TASK-011/`。TASK-012 的 Spec 口径已同步，代码与迁移尚未开始。

## 技术栈

| 层 | 实现 |
|---|---|
| Web | Vue 3 + TypeScript（strict）+ Vite + Vue Router + Pinia |
| API | NestJS 11 + REST `/api/v1` + Swagger |
| 数据 | PostgreSQL 17 + Prisma 6（显式迁移） |
| 认证 | Argon2id 密码哈希 + HttpOnly 会话 Cookie（数据库只存 Token 哈希） |
| 测试 | Vitest（单元/集成）、Playwright（黑盒 E2E）、Node smoke |

## 本地前置依赖

- Node.js ≥ 22.12（本仓库在 Node 24 上验证）
- pnpm 12.x（`packageManager` 已锁定）
- PostgreSQL 17（本仓库在 17.11 上验证）
- Google Chrome（Playwright 使用 `channel: chrome`，无需额外下载 Chromium）

macOS 安装 PostgreSQL 示例：

```bash
brew install postgresql@17
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"
pg_ctl -D "$(brew --prefix)/var/postgresql@17" -l /tmp/somewhere-pg.log start
```

## 启动步骤

```bash
# 1. 依赖
pnpm install --frozen-lockfile

# 2. 环境变量（示例文件均为虚构值）
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. 创建隔离的开发 / 测试数据库（幂等，需要 psql）
pnpm db:setup

# 4. 应用迁移（提交在 apps/api/prisma/migrations）
pnpm db:deploy

# 5. 写入 49 条城市目录与演示账号（seed 只使用 .env 中的虚构配置）
pnpm db:seed

# 6. 同时启动 API 与 Web
pnpm dev

# 7. 另开终端启动投递 Worker（需要先 build）
pnpm --filter @somewhere/api build
pnpm --filter @somewhere/api worker
```

- Web：http://localhost:5273
- API：http://localhost:4301/api/v1
- 健康检查：http://localhost:4301/api/v1/health
- Swagger（非生产）：http://localhost:4301/api/docs

收件人来自「`POSTCARD_DEMO_RECIPIENT_EMAILS` 白名单 ∪ 当前有效信友」，两者都不构成公开用户搜索。请在 `apps/api/.env` 中填入你本机演示账号的邮箱；这些账号需要先注册、设置城市并保持 `OPEN`。共途内写信时，收件人由服务端解析为共途对方。

### 端口说明

| 端口 | 用途 | 环境变量 |
|---|---|---|
| 4301 | API | `PORT` |
| 5273 | Vite 开发服务器（`/api` 代理到 API） | `VITE_API_PROXY_TARGET` |
| 4273 | `vite preview` | `apps/web/vite.config.ts` |
| 4302 / 4273 | smoke 自检临时进程 | `tests/smoke/smoke.mjs` |

## 质量门禁

```bash
pnpm lint              # ESLint（TS + Vue）
pnpm typecheck         # 前端、后端、api-client 严格类型检查
pnpm build             # Nest 编译 + Vite 构建
pnpm test:unit         # 认证策略、距离/延迟、明信片、故事状态、共途、封锁、信友、记忆、Web 路由/客户端
pnpm test:integration  # NestJS HTTP + 真实 PostgreSQL（含故事审核、邮局/Worker、共途、封锁、信友、记忆）
pnpm test:contract     # OpenAPI 与 packages/api-client 生成产物一致性
pnpm test:architecture # 层次依赖、跨模块导入、浏览器存储禁令
pnpm test:e2e          # Playwright：认证、四导航、设置、故事/地图、邮局、共途、封锁、信友、记忆
pnpm test:smoke        # 构建产物 + 真实 HTTP 冒烟（含故事/邮局/共途/封锁/信友/记忆闭环）
pnpm verify            # 串行执行以上全部；任一失败返回非 0
```

`pnpm verify` 会把每一步的标准输出与结果写入
`artifacts/verification/<当前 TASK-ID>/verify/<时间戳>/`（任务编号读取 `tasks/current.md`，该目录不提交 Git）。

测试环境要求：

- `TEST_DATABASE_URL` 必须指向库名包含 `test` 的本机数据库；脚本会拒绝生产或非测试库。
- 集成测试与 E2E 在开始前执行 `prisma migrate deploy`，E2E 还会清空测试库中的业务数据（包括 `personal_memories`、`penpal_consents`、`user_blocks`、`passage_events`、`passage_participants`、`passages`、`story_review_actions`、`stories`、`postcard_drafts`、`postcards`、`profiles`、`users`、`sessions`），保留城市目录。
- E2E 需要本机 Chrome；如需改用 Playwright 自带浏览器，运行
  `pnpm exec playwright install chromium` 并移除 `tests/e2e/playwright.config.ts` 中的 `channel: 'chrome'`。

## API 一览（TASK-001～TASK-011）

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/v1/auth/register` | 注册并建立会话；邮箱正规化后唯一；响应不含 email |
| POST | `/api/v1/auth/login` | 登录并轮换会话，撤销该账号其他活动会话；响应不含 email |
| POST | `/api/v1/auth/logout` | 撤销当前会话并清理 Cookie |
| GET | `/api/v1/auth/me` | 当前用户资料与本人角色；唯一返回本人 email 的认证接口 |
| GET | `/api/v1/cities?query=` | 公开城市目录；只返回 `id/name/countryCode`，不返回经纬度 |
| GET | `/api/v1/profile/me` | 登录本人昵称、城市与接信状态 |
| PATCH | `/api/v1/profile/me` | 修改本人昵称、城市与接信状态 |
| GET | `/api/v1/postcards/recipients?passageId=` | 缺省为演示白名单；带 `passageId` 时只返回共途对方，不含 email/坐标 |
| GET | `/api/v1/post-office/summary` | 邮局三栏摘要；不返回正文 |
| GET/POST | `/api/v1/postcards/drafts` | 列出/创建本人草稿；创建时可选 `passageId`，收件人由共途对方解析 |
| GET/PATCH/DELETE | `/api/v1/postcards/drafts/:id` | 仅作者、仅未发送 |
| POST | `/api/v1/postcards/drafts/:id/send` | 原子发送；支持 `Idempotency-Key` |
| GET | `/api/v1/postcards/transit` | 本人寄出的在途信；不含正文 |
| GET | `/api/v1/postcards/inbox` | 本人已送达来信 |
| GET | `/api/v1/postcards/:id` | 寄件人可读；收件人仅送达后可读 |
| GET | `/api/v1/stories` | 公开故事列表；仅审核通过、已发布、未归档；支持城市/主题/游标 |
| GET | `/api/v1/stories/:id` | 公开故事详情；非公开统一 404 |
| POST | `/api/v1/stories` | 登录；创建故事草稿 |
| GET | `/api/v1/stories/mine` | 登录；我的全部状态故事 |
| GET | `/api/v1/stories/mine/:id` | 登录；我的单条故事详情 |
| PATCH | `/api/v1/stories/:id` | 登录；仅作者、仅草稿/未通过 |
| POST | `/api/v1/stories/:id/submit` | 登录；提交审核；7 天最多 3 次 |
| POST | `/api/v1/stories/:id/withdraw` | 登录；撤回公开授权 |
| DELETE | `/api/v1/stories/:id` | 登录；仅删除草稿 |
| GET | `/api/v1/discovery/cities` | 公开；世界记忆地图城市入口，只返回有活跃公开故事的城市与数量；支持主题筛选 |
| GET | `/api/v1/passages?status=` | 登录；本人参与的共途，支持 ALL/ACTIVE/COMPLETED/ARCHIVED |
| GET | `/api/v1/passages/:id` | 登录；仅参与者，非参与者统一 404 |
| POST | `/api/v1/passages/:id/pause` | 登录；只停泊本人许可，幂等 |
| POST | `/api/v1/passages/:id/resume` | 登录；只续程本人许可，不能替代对方 |
| POST | `/api/v1/passages/:id/complete` | 登录；任一参与者完成经历，不改双方许可 |
| POST | `/api/v1/passages/:id/archive` | 登录；经历级归档，历史与详情仍可读 |
| GET | `/api/v1/safety/blocks` | 登录；本人主动封锁列表；不返回“谁封锁了我” |
| POST | `/api/v1/safety/blocks` | 登录；封锁某用户；自我封锁 422 |
| DELETE | `/api/v1/safety/blocks/:userId` | 登录；解除封锁，幂等 |
| GET | `/api/v1/penpals` | 登录；`active` / `incoming` / `outgoing` 三组信友关系 |
| POST | `/api/v1/penpals/consent` | 登录；记录本人同意；需曾完成共途 |
| DELETE | `/api/v1/penpals/:counterpartId/consent` | 登录；撤销或拒绝；幂等 |
| GET/POST | `/api/v1/memories/personal` | 登录；本人个人记忆列表/创建；只含本人 |
| PATCH/DELETE | `/api/v1/memories/personal/:id` | 登录；本人编辑/删除；非本人或不存在统一 404 |
| GET | `/api/v1/moderation/queue` | 仅 `ADMIN`；待审核故事队列 |
| POST | `/api/v1/moderation/stories/:id/decision` | 仅 `ADMIN`；通过/驳回/下架，不能自审 |
| GET | `/api/v1/health` | API + 数据库连通性 |

注册/登录成功响应：

```json
{ "id": "uuid", "nickname": "海边写信的人", "emailVerified": false, "cityId": null, "role": "USER" }
```

`GET /auth/me` 在上述字段基础上额外返回本人 `email`。只有 `ADMIN` 可访问审核接口；角色通过非生产脚本授予：`pnpm --filter @somewhere/api admin:grant --email=<虚构账号>`。

错误响应统一为：

```json
{ "code": "AUTH_INVALID_CREDENTIALS", "message": "邮箱或密码不正确", "requestId": "..." }
```

错误码：`VALIDATION_ERROR(422)`、`REGISTRATION_CONFLICT(409)`、`AUTH_INVALID_CREDENTIALS(401)`、
`AUTH_REQUIRED(401)`、`FORBIDDEN(403)`、`ORIGIN_NOT_ALLOWED(403)`、`RATE_LIMITED(429)`、`NOT_FOUND(404)`、
`RESOURCE_NOT_ACCESSIBLE(404)`、`STORY_STATE_CONFLICT(409)`、`PASSAGE_STATE_CONFLICT(409)`、`CONTACT_BLOCKED(403)`、`SERVICE_UNAVAILABLE(503)`、`INTERNAL_ERROR(500)`。

## 安全基线

- 密码使用 Argon2id（19 MiB / 2 次迭代 / 并行度 1），数据库只存哈希。
- 会话 Token 为 32 字节随机值，只通过 `HttpOnly + SameSite=Lax` Cookie 下发；数据库只存 SHA-256 哈希；生产环境强制 `Secure`。
- 单活动会话：登录成功后创建新会话并撤销该账号其他活动会话；旧设备再访问受保护接口返回 401。
- 注册/登录响应不返回 email、密码哈希或会话 Token；只有 `/auth/me` 返回本人 email。
- 城市只保存城市中心坐标，公开城市接口不返回经纬度；不收集住址、实时定位或通讯录。
- 前端不使用 `localStorage` / `sessionStorage` 保存任何会话信息（架构检查会强制）。
- 写请求执行 Origin 白名单校验；读取接口不需要 Origin。
- 登录失败文案统一，账号不存在时也执行等价开销的密码校验，避免时序泄露。
- 结构化 JSON 日志不记录请求体、Cookie、邮箱或密码；`sanitizeForLog` 有单元测试覆盖。
- 注册 / 登录按 IP（登录还叠加 IP+邮箱）限流，返回 429 `RATE_LIMITED`；当前为单实例内存实现，置于反向代理后需先配置可信代理。
- 明信片在途时，摘要、在途列表、收件箱与详情都不返回正文；收件人只有在服务端确认 `DELIVERED` 且到达时间后才可读。
- 收件人只来自服务端环境变量白名单；不开放用户搜索。每账号滚动 24 小时最多成功寄出 10 张（可配置），第 11 张返回 429。
- 发送时间、城市快照与 `deliverAt` 全部由服务端生成；请求体中的时间、状态、发件人字段会被 DTO 白名单拒绝。

## 目录

```text
apps/api/            NestJS API、Prisma schema / 迁移 / seed、投递 Worker、故事审核、发现聚合
apps/web/            Vue 3 Web（四导航、认证页、邮局、故事站、地图入口、共途与审核台）
packages/api-client/ OpenAPI 自动生成的类型 + 轻量 fetch 客户端
tests/e2e/           Playwright 黑盒路径
tests/contract/      OpenAPI 契约检查
tests/architecture/  依赖边界检查
tests/smoke/         构建产物冒烟
infra/postgres/      本地数据库初始化脚本
docs/ specs/ tasks/  架构、测试规范、功能规范与当前任务
```

## 当前阶段（TASK-012）明确不做

不实现共途邀请 / 创建入口与邀请专项测试；不实现双城日记（TASK-013 规划）、共同手帐与来源引用；不实现通知、举报、通用安全处置、`RESTRICTED` 写入口、角色扩展与后台用户管理；不实现善意接力（P1）；不实现任何地图渲染技术（地图引擎、瓦片、地理图层、二维/三维方案）与显示城市/上地图开关、匿名作者、30 天轮换；不实现完整 Profile（bio、语言、主题标签、可见性、公开资料页）、邮箱验证、找回密码与账号删除。共途没有 HTTP 创建入口，测试与本地演示使用非生产脚本 `apps/api/scripts/seed-passage.mjs`。TASK-012 的回信（`reply_to_postcard_id`）已立项未编码。`RESTRICTED` 只有枚举与读取拒绝，`CLOSED` 只有只读判定，均没有通用处置路径。故事审核台只处理城市故事，并禁止管理员审核自己的故事。世界记忆地图只复用已审核公开故事，不新增“地图故事”实体。无 `passageId` 的邮局草稿使用「演示白名单 ∪ 有效信友」，不开放用户搜索。
