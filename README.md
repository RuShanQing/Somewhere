# Somewhere · 慢社交 Web

Somewhere 是一个 Web 优先的慢社交产品：用按距离延迟抵达的明信片、城市故事、善意接力与「共途」，和远方的人交换生活片段。

当前仓库完成 **TASK-001～TASK-004**：可运行的基础工程、账号注册/登录/会话/退出（含单活动会话）、49 条城市目录、最小个人资料与 `/settings`，以及邮局三栏、明信片草稿、按城市距离延迟、独立 Worker 到期投递和在途正文保密。完整个人资料、城市故事、地图、共途、信友、纪念册、审核、通知等功能尚未实现。

## 当前进度

| 任务 | 状态 | 内容 |
|---|---|---|
| TASK-001 | DONE | pnpm workspace、NestJS + Vue 基础工程、认证闭环、四导航空态、质量门禁 |
| TASK-002 | DONE | AUTH 响应收敛、单活动会话、认证回归与证据 |
| TASK-003 | DONE | 城市目录（49 条）、最小资料、`/settings`、集成/契约/E2E/Smoke |
| TASK-004 | DONE | 邮局三栏、明信片草稿/发送、距离延迟、Worker、在途保密、每日上限 |
| 下一任务 | 未开始 | 建议城市故事站与审核最小闭环；等待批准 |

详细验收记录见 `tasks/current.md` 与 `tasks/archive/`；最近一次全量证据见 `artifacts/verification/TASK-004/`。

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

写信页只能选择 `POSTCARD_DEMO_RECIPIENT_EMAILS` 白名单中的账号。请在 `apps/api/.env` 中填入你本机演示账号的邮箱；这些账号需要先注册、设置城市并保持 `OPEN`。本阶段不提供用户搜索。

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
pnpm test:unit         # 认证策略、距离/延迟、正文、可见性、Web 路由/客户端
pnpm test:integration  # NestJS HTTP + 真实 PostgreSQL（隔离 test 库，含邮局/Worker）
pnpm test:contract     # OpenAPI 与 packages/api-client 生成产物一致性
pnpm test:architecture # 层次依赖、跨模块导入、浏览器存储禁令
pnpm test:e2e          # Playwright：认证、四导航、设置页、邮局寄出→送达闭环
pnpm test:smoke        # 构建产物 + 真实 HTTP 的 5–10 分钟冒烟（含 Worker 只投递一次）
pnpm verify            # 串行执行以上全部；任一失败返回非 0
```

`pnpm verify` 会把每一步的标准输出与结果写入
`artifacts/verification/<当前 TASK-ID>/verify/<时间戳>/`（任务编号读取 `tasks/current.md`，该目录不提交 Git）。

测试环境要求：

- `TEST_DATABASE_URL` 必须指向库名包含 `test` 的本机数据库；脚本会拒绝生产或非测试库。
- 集成测试与 E2E 在开始前执行 `prisma migrate deploy`，E2E 还会清空测试库中的 `postcard_drafts` / `postcards` / `profiles` / `users` / `sessions`，保留城市目录。
- E2E 需要本机 Chrome；如需改用 Playwright 自带浏览器，运行
  `pnpm exec playwright install chromium` 并移除 `tests/e2e/playwright.config.ts` 中的 `channel: 'chrome'`。

## API（TASK-004）

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/v1/auth/register` | 注册并建立会话；邮箱正规化后唯一；响应不含 email |
| POST | `/api/v1/auth/login` | 登录并轮换会话，撤销该账号其他活动会话；响应不含 email |
| POST | `/api/v1/auth/logout` | 撤销当前会话并清理 Cookie |
| GET | `/api/v1/auth/me` | 当前用户资料；唯一返回本人 email 的认证接口 |
| GET | `/api/v1/cities?query=` | 公开城市目录；只返回 `id/name/countryCode`，不返回经纬度 |
| GET | `/api/v1/profile/me` | 登录本人昵称、城市与接信状态 |
| PATCH | `/api/v1/profile/me` | 修改本人昵称、城市与接信状态 |
| GET | `/api/v1/postcards/recipients` | 演示白名单收件人；不含 email/坐标 |
| GET | `/api/v1/post-office/summary` | 邮局三栏摘要；不返回正文 |
| GET/POST | `/api/v1/postcards/drafts` | 列出/创建本人草稿 |
| GET/PATCH/DELETE | `/api/v1/postcards/drafts/:id` | 仅作者、仅未发送 |
| POST | `/api/v1/postcards/drafts/:id/send` | 原子发送；支持 `Idempotency-Key` |
| GET | `/api/v1/postcards/transit` | 本人寄出的在途信；不含正文 |
| GET | `/api/v1/postcards/inbox` | 本人已送达来信 |
| GET | `/api/v1/postcards/:id` | 寄件人可读；收件人仅送达后可读 |
| GET | `/api/v1/health` | API + 数据库连通性 |

注册/登录成功响应：

```json
{ "id": "uuid", "nickname": "海边写信的人", "emailVerified": false, "cityId": null }
```

`GET /auth/me` 在上述字段基础上额外返回本人 `email`。

错误响应统一为：

```json
{ "code": "AUTH_INVALID_CREDENTIALS", "message": "邮箱或密码不正确", "requestId": "..." }
```

错误码：`VALIDATION_ERROR(422)`、`REGISTRATION_CONFLICT(409)`、`AUTH_INVALID_CREDENTIALS(401)`、
`AUTH_REQUIRED(401)`、`ORIGIN_NOT_ALLOWED(403)`、`RATE_LIMITED(429)`、`NOT_FOUND(404)`、
`RESOURCE_NOT_ACCESSIBLE(404)`、`SERVICE_UNAVAILABLE(503)`。

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
apps/api/            NestJS API、Prisma schema / 迁移 / seed、投递 Worker
apps/web/            Vue 3 Web（四导航、认证页、邮局与写信/详情页）
packages/api-client/ OpenAPI 自动生成的类型 + 轻量 fetch 客户端
tests/e2e/           Playwright 黑盒路径
tests/contract/      OpenAPI 契约检查
tests/architecture/  依赖边界检查
tests/smoke/         构建产物冒烟
infra/postgres/      本地数据库初始化脚本
docs/ specs/ tasks/  架构、测试规范、功能规范与当前任务
```

## 当前阶段（TASK-004）明确不做

不实现回信、通知、城市故事、地图渲染、共途、信友、纪念册、审核后台、举报/封锁、善意接力；不实现完整 Profile（bio、语言、主题标签、可见性、公开资料页）、邮箱验证与找回密码；发现/共途/纪念册仍只展示真实空态，不提供伪造入口。`RESTRICTED` 只有枚举与读取拒绝，没有审核处置路径。
