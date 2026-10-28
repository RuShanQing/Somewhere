# Somewhere · 工程架构（目标架构）

状态：**目标架构 + TASK-001～TASK-004 已落地的最小切片**。`apps/web`、`apps/api`、`packages/api-client`、`users`/`sessions`/`cities`/`profiles`/`postcard_drafts`/`postcards`、认证 API、城市目录、最小资料、邮局三栏、明信片草稿/发送/Worker 投递已完成；发现、共途、纪念册、通知与审核仍是设计，仓库中不存在对应业务实现。技术栈以本科毕设、Web 优先、单人可持续维护为原则。本文是架构约束，不是地图视觉实现说明。

## 1. 架构目标与优先级

1. 首先支持可验证的完整链路：注册 / 登录 → 发现已审核故事 → 写明信片 → 按距离到达 → 共途 → 私有记忆。
2. 防止 AI 在不同功能中重复造轮子，统一身份、审核、投递、关系和权限边界。
3. 同一代码仓库可在本机、CI 和演示环境重复启动；允许以后升级，不提前微服务化。
4. 当业务逻辑与动画表现冲突时，业务权限和送达规则优先。

## 2. 技术选型（实施前固定具体版本）

| 层 | 建议 | 约束 |
|---|---|---|
| Web | Vue 3 + TypeScript strict + Vite | 组合式 API；组件不计算业务权限 |
| 路由和状态 | Vue Router + Pinia | Pinia 只保存会话 / UI 状态；服务端数据由 API 获取 |
| API | NestJS + REST + OpenAPI | DTO 统一校验，带版本前缀 `/api/v1` |
| 数据访问 | Prisma + PostgreSQL | 迁移可追溯；业务写入通过仓储或服务边界 |
| Worker | NestJS 同仓库独立进程 | 复用领域服务，数据库持久化，到期投递 |
| 单元测试 | Vitest | 业务规则纯函数优先 |
| API 集成 | NestJS 测试应用 + HTTP 客户端 + 专用 PostgreSQL | 不用内存假 DB 代替关键事务 |
| 端到端 | Playwright | 独立进程、真实 HTTP / 浏览器 |
| CI | GitHub Actions 或等价流水线（后续实现） | 先可本地运行，再迁移 CI |
| 日志 | JSON 结构化日志（含 requestId） | 禁止记录信件正文、密码、完整 Cookie |

不引入额外消息队列、微服务、复杂推荐 AI 或付费地图服务作为 P0 依赖。实际创建 `package.json` 时写入固定版本并提交 lockfile，不在文档中猜测库的具体最新版本。

## 3. 单仓目录

```text
somewhere/
├── AGENTS.md
├── docs/
│   ├── architecture.md
│   └── testing.md
├── specs/
│   └── *.md
├── tasks/
│   └── current.md
├── apps/
│   ├── web/
│   │   ├── src/app/               # 路由、入口、全局依赖
│   │   ├── src/features/          # 按邮局/发现/共途/纪念册划分
│   │   ├── src/shared/            # 通用 UI、API client、工具
│   │   └── tests/                 # 组件测试
│   └── api/
│       ├── src/modules/           # 领域模块（详见第 4 节）
│       ├── src/common/            # 守卫、过滤器、日志、异常
│       ├── src/worker/            # 送达处理入口
│       ├── prisma/                # schema、迁移、seed
│       └── test/                  # HTTP / DB 集成测试
├── packages/
│   └── api-client/                # 从 OpenAPI 自动生成的客户端类型
├── tests/
│   ├── e2e/                       # 黑盒浏览器测试
│   ├── contract/                  # 契约检查
│   └── architecture/              # 依赖边界检查
├── infra/                         # 开发 / 测试环境配置
└── artifacts/verification/        # 忽略 Git 的实际检查证据
```

**目录是未来目标**；TASK-001 已创建 `apps/web`、`apps/api`、`packages/api-client`、`tests/{e2e,contract,architecture,smoke}`、`infra/postgres` 与 `scripts/verify.mjs`；TASK-003 新增 `modules/profile`；TASK-004 新增 `modules/postcard`、`modules/delivery`、`src/worker` 与 `src/tools/run-delivery-once.ts`。`src/modules` 中除 `auth`/`health`/`profile`/`postcard`/`delivery` 之外的领域模块仍不存在，不得把目录图当成已实现功能。

## 4. 后端模块与依赖边界

| 模块 | 唯一职责 | 公开给其他模块的服务 |
|---|---|---|
| AuthModule | 注册、登录、会话和身份 | `SessionGuard`, `SessionService`, `AccountService` |
| ProfileModule | 昵称、城市、接信状态 | `CityService`, `ProfileReader` |
| PostcardModule | 草稿、发送、在途、收信、投递状态 | `PostcardService`, `PostcardDeliveryService` |
| DeliveryModule | 距离与延迟纯策略 | `DeliveryPolicy` |
| StoryModule | 城市故事及审核状态 | `ApprovedStoryReader` |
| DiscoveryModule | 发现入口、主题筛选 | 组合已审核内容；不复制故事表 |
| PassageModule | 共途经历状态、参与者、停泊 / 续程 | `PassagePolicy` |
| PenpalModule | 双向信友授权 | `PenpalPolicy` |
| MemoryModule | 双城日记、手帐、个人记忆 | `MemoryReader`, `MemoryPolicy` |
| RelayModule | 善意接力（P1） | 接力匿名聚合查询 |
| SafetyModule | 封锁、举报、审核、审计 | `BlockPolicy`, `ModerationPolicy` |
| NotificationModule | 送达通知、通知偏好 | `NotificationPublisher` |

依赖方向：`HTTP Controller → Application Service → Domain Policy → Repository / DB`。跨模块只能依赖对方导出的 `Reader/Policy/Service` 接口；**禁止**在另一模块中直接导入其 Prisma 表访问实现。领域策略只接受输入数据，不依赖 NestJS、Vue 或数据库。

TASK-004 的实际安排：`DeliveryModule` 只导出纯 `DeliveryPolicy`；`PostcardModule` 拥有明信片表并通过 `PostcardDeliveryService` 提供到期领取；`src/worker/main.ts` 是组合根，循环调用该服务。这样避免 Postcard 与 Delivery 循环依赖，Worker 不暴露 HTTP。

前端：`pages → features → shared`，功能之间通过 URL 和公开 API 契约衔接，不互相引入私有 store。前端校验负责体验；**权限和投递限制一定由后端重复校验**。

## 5. 核心数据模型（建议实体）

| 实体 / 表 | 关键字段 | 约束 |
|---|---|---|
| `users` | id, email_normalized, password_hash, email_verified_at, created_at | 邮箱唯一、密码不可逆哈希 |
| `sessions` | id, user_id, session_hash, expires_at, revoked_at | 不存明文 Cookie |
| `cities` | id, name, country_code, centroid_lat, centroid_lon | 静态城市目录，仅用于城市级信息 |
| `profiles` | user_id, nickname, city_id, languages, reception_mode | 公开资料不含邮箱 / 详细地址 |
| `postcards` | id, sender_id, receiver_id, passage_id?, reply_to_postcard_id?, origin_city_id, destination_city_id, body, status, sent_at, deliver_at, delivered_at | 在途不可读；发送后内容与时间不可变 |
| `postcard_drafts` | id, owner_id, recipient_id?, body, updated_at | 仅作者读写；草稿不等于已寄出 |
| `stories` | id, author_id, city_id, title, body, topic_tags, review_status, public_consent_at?, published_at?, archived_at? | 故事站与地图使用同一表；仅 APPROVED 且已发布未归档对外 |
| `passages` | id, topic, kind, progress_status, created_at, completed_at | 记录一段经历，不等于联系人 |
| `passage_participants` | passage_id, user_id, consent_state, paused_at?, resume_after?, last_confirmed_at? | 两人分别控制自己的许可 |
| `penpal_consents` | owner_id, counterpart_id, consent_state, consented_at?, revoked_at? | 长期联系必须双方同意 |
| `diary_pages` | id, passage_id, postcard_left_id, postcard_right_id, created_at | 仅由已送达且有权可见的内容形成 |
| `personal_memories` | id, owner_id, title, body, source_type, source_id?, created_at, updated_at | 私人默认，不随作者资料公开 |
| `shared_notebooks` | id, passage_id, title, status | P1，独立共享授权 |
| `user_blocks` | blocker_id, blocked_id, created_at | 最高优先级拒绝新的关系行为 |
| `reports` | id, reporter_id, target_type, target_id, reason, status | 仅审核人员可查投诉详情 |
| `moderation_actions` | id, moderator_id, target_type, target_id, action, created_at | 可追溯审核 |
| `notifications` | id, user_id, kind, target_id, event_key, created_at, dismissed_at | 不携带信件正文 |
| `relay_notes` | id, chain_id, sender_id, recipient_id?, body, review_status | P1；不推导“欠谁回信” |

当前实际落库与上表略有差异：昵称仍在 `users.nickname`，`profiles` 只存 `city_id` 与 `reception_mode`；`bio`、`languages`、`topicTags`、`profileVisibility` 尚未实现。完整 Profile 任务再评估是否迁移，避免双写。

TASK-004 的 `postcard_drafts` 存 `owner_id`、可空 `recipient_id`、`body`、`sent_postcard_id`（发送后标记已使用）；`postcards` 存双方 ID、正文、`status`、双方城市快照、`sent_at/deliver_at/delivered_at` 与可空 `idempotency_key`。没有 `passage_id`、`reply_to_postcard_id` 或模板字段，留给后续显式迁移。

索引建议：`postcards(receiver_id,status,deliver_at)`、`postcards(status,deliver_at)`、`stories(review_status,city_id,published_at)`、`reports(status,created_at)`；按实际 EXPLAIN 再优化。

约束建议：
- `receiver_id != sender_id`（邮寄给未来自己的产品扩展除外，当前不在 P0）。
- 同一公开故事只有一个审核状态来源。
- `delivered_at >= deliver_at`，`deliver_at >= sent_at`。
- 归档或封锁不能把未授权的共同记忆自动开放给第三方。
- 时间字段统一存储 UTC，由服务端产生。

## 6. 明信片投递与事务

输入：寄件人的城市 ID、收件人的城市 ID、服务器当前时间；不能上传客户端自报距离或自行指定的 `deliver_at`。

1. 由城市目录取中心点，使用 Haversine 计算球面距离 `D_km >= 0`。
2. 首版延迟：`delay_minutes = min(7200, 720 + ceil(D_km * 60 / 150))`。
   - 即同城至少 12 小时、最远不超过 120 小时、距离越远不得越快。
   - 这是**产品模拟送达速度**，不是现实物流承诺。
3. 发送事务内重新检查身份、封锁、接信许可、发送限额以及邮寄相关授权。
4. 在同一事务中写 `postcards(status=IN_TRANSIT, sent_at, deliver_at)`；此后正文及送达时刻不可由用户修改。
5. Worker 按 `status=IN_TRANSIT AND deliver_at<=NOW()` 扫描，数据库行锁（如 `FOR UPDATE SKIP LOCKED`）批处理，原子地更新为 `DELIVERED` 并写入 `delivered_at`。
6. 幂等：重试不会生成第二张信；本阶段不生成通知，通知去重由后续任务接入。当前通过草稿 `sent_postcard_id` 与 `(sender_id, idempotency_key)` 唯一约束保证。
7. 正文访问：`DELIVERED` 且接收者有权查看时才提供；`IN_TRANSIT` 的任何列表、搜索、通知及详情接口均不得回传正文。
8. 停泊只阻止新的关系行为；已在途默认继续送达。安全封锁、违规与账号处理以安全策略优先，并记录决定。

Worker 停机、重启或重复扫描不能丢信或提前送达；数据库是持久化事实源。

## 7. API 通用契约

基准地址 `/api/v1`；JSON；`createdAt` / `deliverAt` 使用 ISO 8601 UTC。写请求需要会话 Cookie、CSRF 或 Origin 防护、服务端校验；GET 不能修改状态。

示例路径（各功能详情以 Spec 为准）：
- `POST /auth/register`、`POST /auth/login`、`POST /auth/logout`、`GET /auth/me`
- `GET/PATCH /profile/me`
- `GET /post-office/summary`
- `GET /postcards/recipients`（TASK-004 演示白名单）
- `GET/POST /postcards/drafts`、`GET/PATCH/DELETE /postcards/drafts/:id`、`POST /postcards/drafts/:id/send`
- `GET /postcards/inbox`、`GET /postcards/transit`、`GET /postcards/:id`
- `GET /stories`、`POST /stories`、`GET /cities/:id/stories`
- `GET /passages`、`POST /passages/:id/pause`、`POST /passages/:id/archive`
- `GET /memories/diaries`、`GET/POST /memories/personal`
- `POST /safety/reports`、`POST /safety/blocks`

成功返回约定 DTO；错误统一 JSON：
```json
{
  "code": "RESOURCE_NOT_ACCESSIBLE",
  "message": "当前内容不可访问",
  "requestId": "req_example"
}
```

最低错误约定：401 未登录；403 已登录但无权限；404 对他人私有资源尽量不暴露存在性；409 冲突 / 重复；422 输入语义无效；429 限流。错误内容不暴露用户邮箱是否存在、审核人员备注或私信正文。

合同变更：先修改 DTO 与 OpenAPI → 生成客户端 → 更新契约检查 → 再变更 Web；禁止“前端猜你返回什么”。

## 8. 身份、权限与隐私

- 邮箱 + 密码登录。密码 `Argon2id`；会话使用高熵随机值，通过 `HttpOnly / Secure / SameSite=Lax` Cookie 承载，服务器只保存其哈希。
- 修改类请求实施 CSRF Token 或严格 Origin 校验；生产启用 HTTPS、限流与安全响应头。
- 邮箱在注册/登录流程使用，其他用户不能通过个人资料查询到邮箱。
- 初版仅面向自声明已满 18 岁的用户；年龄声明并非真实身份核验，公开部署前需另行评估合规。
- 地理信息停留在城市级，个人可以选择不公开所在地；不收集精确定位。
- 资源访问策略应检查：身份、所属者、成员资格、授权、封锁、安全状态、送达/审核状态。
- 被删除、撤回授权或审核下架的公开内容要从城市故事站和地图两个入口同时消失。
- 开发日志与自动化截图禁止含真实用户数据；测试使用虚构数据。

## 9. 前端信息架构（仅产品与路由）

| 导航 | 路由 | 子视图 |
|---|---|---|
| 邮局 | `/post-office` | 来信、在途、草稿 |
| 发现 | `/discover` | 城市故事站、善意接力、世界记忆地图 |
| 共途 | `/passages` | 我的共途、明信片、续程 / 停泊、信友 |
| 纪念册 | `/memories` | 双城日记、共同手帐、个人记忆 |
| 非主导航 | `/auth/*`, `/settings`, `/post-office/compose/:id?`, `/stories/:id`, `/postcards/:id` | 登录、设置、写信、详情 |

产品规则：发现中的“城市故事站”是内容列表入口，“世界记忆地图”是同一故事集合的城市入口；不新增独立的“地图故事”实体。本文**不规定地图渲染维度、引擎或组件**。

前端必须包含：加载 / 空态 / 错误态、键盘可用、表单标签、屏幕阅读器说明、移动及桌面响应式布局、操作前权限提示。

## 10. 版本范围（防止一口气做完）

- **P0 毕设核心**：项目基础、认证、个人设置、邮局、距离投递、已审核城市故事、世界记忆地图的业务入口、共途、双向信友、双城日记、个人记忆、安全审核。
- **P1 特色增强**：善意接力、共同手帐、纪念时间标注、细化通知偏好。
- **P2 未来功能**：多媒体手帐、音乐、时间胶囊、沉浸式地图视觉等。

P1 / P2 应有 Spec 供未来阅读，但当前任务未授权时不得实现。

## 11. 架构变更程序

触发：新增跨模块依赖、表结构大改、身份模型改变、异步基础设施调整、公开内容规则变化。
按顺序：写“原因、选项、取舍、受影响 Spec、迁移 / 回滚、验证”→ 更新本文件与 Spec → 取得用户认可 → 实施 → 测试及回归。不要让 AI 自动决定破坏性变更。

## 12. 架构就绪标准

- 各领域只通过明确服务接口协作；独立依赖检查不发现跨层违规。
- 已生成客户端契约与 API OpenAPI 定义一致。
- 部署 / 本地环境可在固定种子数据下复现核心业务。
- 数据权限不依赖前端的 `v-if` 或按钮禁用。
- Worker 失败可重试，异常可定位，不能因未收到请求而把信直接判定送达。

## 13. TASK-001 / TASK-002 / TASK-003 落地记录（实测）

### 13.1 版本与端口

| 项 | 实际值 |
|---|---|
| Node / pnpm | v24.20.0 / 12.15.0（`packageManager` 已锁定） |
| NestJS / Prisma / PostgreSQL | 11.2.x / 6.19.3 / 17.11 |
| Vue / Vite / Pinia / Vue Router | 3.5.x / 7.x / 3.x / 4.x |
| API / Web / preview | 4301 / 5273 / 4273（避免与其他本地项目默认端口冲突） |

端口与 `WEB_ORIGINS` 可通过 `apps/api/.env` 覆盖；Web 开发服务器把 `/api` 代理到 API，因此浏览器只做同源请求，会话 Cookie 不跨站。

### 13.2 已实现的模块与依赖方向

```text
apps/api/src/
├── app.module.ts / app.factory.ts / main.ts
├── config/            # 环境变量读取，APP_CONFIG 全局 provider
├── common/            # 错误模型、异常过滤器、Origin 守卫、日志、校验工厂
├── prisma/            # 唯一直接持有 PrismaClient 的位置 + 健康检查
└── modules/
    ├── auth/          # controller → service → repository；domain 为纯函数
    ├── profile/       # 城市目录、最小资料；导出 CityService / ProfileReader
    ├── delivery/      # 距离与延迟纯策略；不读写数据库
    ├── postcard/      # 草稿、发送、读取、投递领取；导出 PostcardService / PostcardDeliveryService
    └── health/        # 仅依赖 DatabaseHealthService
```

- `AuthModule` 导出 `SessionGuard`、`SessionService` 与 `AccountService`；`ProfileModule` 导出 `CityService` 与 `ProfileReader`；`DeliveryModule` 导出 `DeliveryPolicy`；`PostcardModule` 导出 `PostcardService` 与 `PostcardDeliveryService`。其他模块只能依赖这些公开入口，不得直接访问 `users`/`sessions`/`cities`/`profiles`/`postcards` 等表。
- `tests/architecture/check-boundaries.mjs` 强制：Prisma 只在 `src/prisma` 或 `*.repository.ts` 中出现、无跨模块深层导入、Web 不导入服务端、前端功能互不引用、Web 不使用 `localStorage`/`sessionStorage`。
- Web 依赖方向：`app → features → shared`；`packages/api-client` 只含类型与 fetch 客户端，不依赖 Node/Express/Prisma。

### 13.3 身份与会话实现

- 数据表（`apps/api/prisma/migrations/20261028032315_init`）：`users(id, email_normalized UNIQUE, password_hash, nickname, adult_confirmed_at, email_verified_at, created_at, updated_at)`；`sessions(id, user_id, session_hash UNIQUE, created_at, expires_at, revoked_at)`。
- 密码：Argon2id，19 MiB / 2 次迭代 / 并行度 1；数据库不保存明文，日志与响应不包含密码字段。
- 响应字段：注册/登录只返回 `{ id, nickname, cityId?, emailVerified }`；只有 `/auth/me` 返回本人 `email`。
- 会话：32 字节随机 Token（base64url）→ `HttpOnly + SameSite=Lax` Cookie（生产强制 `Secure`），数据库只存 SHA-256 哈希；登录创建新会话并撤销该用户其他活动会话（单活动会话），退出写入 `revoked_at` 并清理 Cookie。
- 账号不存在时执行一次等价开销的 Argon2 校验，避免通过响应时序判断邮箱是否已注册；登录失败文案统一。
- 写请求由全局 `OriginGuard` 校验白名单；`SameSite=Lax` 与服务端会话校验兜底。
- 认证限流为进程内固定窗口（注册按 IP、登录按 IP 与 IP+邮箱），返回 429 `RATE_LIMITED`；单实例足够，水平扩展时需替换为共享存储。置于反向代理后必须先配置可信代理，否则所有请求会共享代理 IP。
- 统一错误体 `{ code, message, requestId, details? }`；`requestId` 由中间件生成并回传响应头，日志为 JSON 且不记录请求体、Cookie、邮箱或密码。

### 13.3.1 TASK-003 城市与资料实现

- 数据表：`cities(id, name, country_code, centroid_lat, centroid_lon)`，`(name, country_code)` 唯一；`profiles(user_id PK/FK, city_id FK, reception_mode, created_at, updated_at)`。城市目录为 49 条手工种子，重复执行不产生重复记录。
- `ProfileModule` 提供 `GET /api/v1/cities`（公开，只返回 `id/name/countryCode`）、`GET/PATCH /api/v1/profile/me`（登录本人）；未来 Postcard 通过导出的 `CityService` 读取城市，不直接访问 `cities` 表。
- 昵称以 `users.nickname` 为唯一来源；ProfileModule 通过 AuthModule 导出的 `AccountService` 更新昵称，不直接写 `users` 表。资料行按需 upsert，默认城市为空、`receptionMode=OPEN`。
- Web 新增 `/settings`（登录后可见），复用 `app` 壳层；会话 store 位于 `shared/stores/auth.ts`，供 app、auth、settings 共同使用，避免功能模块互相引用。
- 架构检查允许跨模块依赖对方的 `*.module.ts`、`SessionGuard`、`AccountService`、`SessionService` 等公开入口，仍禁止 Repository、DTO、Controller 的深层导入。

### 13.4 契约与客户端生成

1. NestJS DTO + `@nestjs/swagger` 是唯一契约来源；`GET /api/docs-json` 仅在非生产环境暴露。
2. `pnpm openapi:export` 运行 `apps/api/dist/tools/export-openapi.js`（需要已构建，tsc 保留装饰器元数据）。
3. `pnpm api-client:generate` 导出 OpenAPI 并运行 `openapi-typescript` 写入 `packages/api-client/src/generated.ts`。
4. `pnpm test:contract` 重新生成到临时目录并逐字节比对；任何 DTO/路径变更都会使契约检查失败，除非同步更新生成产物。

### 13.5 TASK-004 邮局与投递实现

- 数据表：`postcard_drafts`、`postcards` 与 `PostcardStatus` 枚举；显式迁移 `20261028070751_add_postcards` 含正文/参与者/时间顺序检查约束与查询索引。
- `PostcardModule`：草稿 CRUD、`GET /postcards/recipients`、`GET /post-office/summary`、`POST /drafts/:id/send`、`GET /transit`、`GET /inbox`、`GET /postcards/:id`。
- `DeliveryModule`：只提供 `DeliveryPolicy`（Haversine + `min(7200, 720 + ceil(D*60/150))`），不读写数据库。
- Worker：`src/worker/main.ts` 定时调用 `PostcardDeliveryService.deliverDue()`；SQL 使用 `FOR UPDATE SKIP LOCKED` 与状态条件更新，重复扫描不会重复投递。`src/tools/run-delivery-once.ts` 供测试/运维单次扫描。
- 收件人：本阶段只允许 `POSTCARD_DEMO_RECIPIENT_EMAILS` 中的已注册、`OPEN`、已有城市的账号；服务端在发送时再次校验，不开放用户搜索。后续接入共途/信友时只替换该解析层。
- 每日上限：每账号滚动 24 小时最多 10 张成功寄出，配置 `POSTCARD_MAX_SENDS_PER_DAY`；失败不消耗草稿。
- 读取权限：寄件人始终可读自己的内容；收件人必须在 `status=DELIVERED` 且 `deliver_at <= 服务端当前时间` 后读取；在途详情返回 404 `RESOURCE_NOT_ACCESSIBLE`；`RESTRICTED` 不返回正文。
- Web：`/post-office` 三栏、`/post-office/compose/:id?`、`/postcards/:id`；加载/空/错误/重试、390px 与键盘基础。

### 13.6 本阶段刻意未实现

TASK-004 未实现回信、`passage_id`、`reply_to_postcard_id`、模板/多媒体、通知、举报/封锁/审核后台、共途、信友、纪念册、地图、CI 流水线。`RESTRICTED` 只有枚举和读取拒绝，没有写入路径；Worker 不生成通知，不能宣称通知去重已完成。Web 的发现/共途/纪念册仍只呈现真实空态，没有假数据或假按钮。
