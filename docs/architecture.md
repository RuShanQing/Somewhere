# Somewhere · 工程架构（目标架构）

状态：**目标架构 + TASK-001～TASK-008 已落地的最小切片**。`apps/web`、`apps/api`、`packages/api-client`、`users`/`sessions`/`cities`/`profiles`/`postcard_drafts`/`postcards`/`stories`/`story_review_actions`/`passages`/`passage_participants`/`passage_events`、认证 API、城市目录、最小资料、邮局三栏、明信片草稿/发送/Worker 投递、城市故事草稿/提交/管理员审核/公开故事站、世界记忆地图业务入口、共途状态与邮局通信许可接入已完成；共途邀请、信友、纪念册、通知、举报与封锁仍是设计，仓库中不存在对应业务实现。技术栈以本科毕设、Web 优先、单人可持续维护为原则。本文是架构约束，不是地图视觉实现说明。

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

**目录是未来目标**；TASK-001 已创建 `apps/web`、`apps/api`、`packages/api-client`、`tests/{e2e,contract,architecture,smoke}`、`infra/postgres` 与 `scripts/verify.mjs`；TASK-003 新增 `modules/profile`；TASK-004 新增 `modules/postcard`、`modules/delivery`、`src/worker` 与 `src/tools/run-delivery-once.ts`；TASK-005 新增 `modules/story` 与 Web `features/moderation`；TASK-006 新增 `modules/discovery`；TASK-007 新增 `modules/passage`。`src/modules` 中除 `auth`/`health`/`profile`/`postcard`/`delivery`/`story`/`discovery`/`passage` 之外的领域模块仍不存在，不得把目录图当成已实现功能。

## 4. 后端模块与依赖边界

| 模块 | 唯一职责 | 公开给其他模块的服务 |
|---|---|---|
| AuthModule | 注册、登录、会话、身份和角色 | `SessionGuard`, `SessionService`, `AccountService`；规划中的 `RoleService` 负责角色变更与审计 |
| ProfileModule | 昵称、城市、接信状态 | `CityService`, `ProfileReader` |
| PostcardModule | 草稿、发送、在途、收信、投递状态 | `PostcardService`, `PostcardDeliveryService` |
| DeliveryModule | 距离与延迟纯策略 | `DeliveryPolicy` |
| StoryModule | 城市故事及审核状态 | `ApprovedStoryReader` |
| DiscoveryModule | 发现入口、主题筛选、世界记忆地图城市聚合 | 组合 `ApprovedStoryReader` + `CityService`；只读；不复制故事表、不新增可见性条件 |
| PassageModule | 共途经历状态、参与者、停泊 / 续程 | `PassagePolicy`, `PassageReader` |
| PenpalModule | 双向信友授权 | `PenpalPolicy` |
| MemoryModule | 双城日记、手帐、个人记忆 | `MemoryReader`, `MemoryPolicy` |
| RelayModule | 善意接力（P1） | 接力匿名聚合查询 |
| SafetyModule | 封锁、举报、审核、审计 | `BlockPolicy`, `ModerationPolicy` |
| NotificationModule | 送达通知、通知偏好 | `NotificationPublisher` |

依赖方向：`HTTP Controller → Application Service → Domain Policy → Repository / DB`。跨模块只能依赖对方导出的 `Reader/Policy/Service` 接口；**禁止**在另一模块中直接导入其 Prisma 表访问实现。领域策略只接受输入数据，不依赖 NestJS、Vue 或数据库。

TASK-005 的实际安排：城市故事的状态、审核决定与审核审计同属 `StoryModule`，由该模块提供最小审核接口；这样状态更新和审计写入保持同一事务。通用 `SafetyModule` 的举报、封锁与跨内容处置仍待后续任务，不在 TASK-005 中提前实现。

TASK-006 的实际安排：世界记忆地图的城市聚合放在新的 `DiscoveryModule`，它单向依赖 `ProfileModule.CityService` 与 `StoryModule.ApprovedStoryReader`，只做组合与映射，不持有任何表。**没有**在 `ProfileModule` 的 `/cities` 上增加 `hasPublicStories`，也没有新增 `/cities/:id/stories` 别名，因为前者会形成 `ProfileModule ⇄ StoryModule` 循环依赖，后者会制造第二套公开查询。公开谓词统一由 `story/domain/story-visibility.ts` 定义。

TASK-007 的实际安排：`PassageModule` 拥有 `passages`、`passage_participants`、`passage_events`，单向依赖 `AuthModule.SessionGuard` 与 `ProfileModule.ProfileReader`（只取对方昵称与城市名）；领域状态机与 `canSend` 是 `domain/` 下的纯函数，`PassagePolicy` 只是可注入包装，尚未被其他模块消费。**没有**提供 `POST /passages`：在邀请 / 接受流程实现前，公开创建接口会让一方替另一方表达同意。邮局尚未绑定 `passage_id`，因此停泊规则目前通过响应中的 `permissions.canSend` 对外可验证，TASK-008 再接入发送事务。

TASK-004 的实际安排：`DeliveryModule` 只导出纯 `DeliveryPolicy`；`PostcardModule` 拥有明信片表并通过 `PostcardDeliveryService` 提供到期领取；`src/worker/main.ts` 是组合根，循环调用该服务。这样避免 Postcard 与 Delivery 循环依赖，Worker 不暴露 HTTP。

前端：`pages → features → shared`，功能之间通过 URL 和公开 API 契约衔接，不互相引入私有 store。前端校验负责体验；**权限和投递限制一定由后端重复校验**。

## 5. 核心数据模型（建议实体）

| 实体 / 表 | 关键字段 | 约束 |
|---|---|---|
| `users` | id, email_normalized, password_hash, role, email_verified_at, created_at | 邮箱唯一、密码不可逆哈希；`role` 为 `USER | ADMIN` |
| `sessions` | id, user_id, session_hash, expires_at, revoked_at | 不存明文 Cookie |
| `cities` | id, name, country_code, centroid_lat, centroid_lon | 静态城市目录，仅用于城市级信息 |
| `profiles` | user_id, nickname, city_id, languages, reception_mode | 公开资料不含邮箱 / 详细地址 |
| `postcards` | id, sender_id, receiver_id, passage_id?, reply_to_postcard_id?, origin_city_id, destination_city_id, body, status, sent_at, deliver_at, delivered_at | 在途不可读；发送后内容与时间不可变 |
| `postcard_drafts` | id, owner_id, recipient_id?, body, updated_at | 仅作者读写；草稿不等于已寄出 |
| `stories` | id, author_id, city_id, title, body, topic_tags, review_status, public_consent_at?, submitted_at?, reviewed_at?, published_at?, archived_at? | 故事站与地图使用同一表；仅 APPROVED 且已发布未归档对外 |
| `story_review_actions` | id, story_id, moderator_id, action, reason_code?, created_at | 故事审核审计；只追加，不向公众展示 |
| `passages` | id, topic, kind, progress_status, created_at, updated_at, completed_at?, archived_at? | 记录一段经历，不等于联系人；归档为经历级终态 |
| `passage_participants` | passage_id, user_id, consent_state, paused_at?, last_confirmed_at? | 两人分别控制自己的许可；主键 `(passage_id,user_id)`；不建 `resume_after` |
| `passage_events` | id, passage_id, actor_id, event_type, metadata_redacted?, created_at | 只记录状态迁移，不保存任何信件或用户文本 |
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

TASK-005 的 `stories` 存作者/城市、标题/正文/标签、五个审核状态、公开授权与提交/审核/发布/归档时间、`removed_by`；`story_review_actions` 存固定原因码审计。没有 `show_city`、`show_on_map`、`accept_passage_invites` 字段，暂缓项见 `specs/14-story-deferred-scope.md`。

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
- `GET /stories?cityId=&topic=&cursor=`、`GET /stories/:id`、`POST /stories`、`GET /stories/mine`、`PATCH /stories/:id`、`POST /stories/:id/submit`、`POST /stories/:id/withdraw`、`DELETE /stories/:id`
- `GET /discovery/cities?topic=`（世界记忆地图城市聚合；匿名可读，只读）
- `GET /moderation/queue`、`POST /moderation/stories/:id/decision`（仅 `ADMIN`）
- `GET /passages?status=`、`GET /passages/:id`、`POST /passages/:id/pause|resume|complete|archive`（无创建 / 邀请端点）
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
- TASK-005 已实现：用户角色为 `USER | ADMIN`，只有 `ADMIN` 可访问城市故事审核接口；角色通过非生产脚本 `admin:grant` 授予，注册不可自选；会话每次从数据库解析当前角色。详见 `specs/02-auth.md` 的 AUTH-08 与 `specs/12-safety-and-moderation.md`。
- 角色扩展为规划：目标角色 `USER | MODERATOR | CURATOR | ADMIN`，`GUEST` 只是未登录状态，不写入数据库。采用单枚举 + 权限蕴含；`ADMIN` 不能查看其他用户的邮箱，也不能读取私人明信片、共同日记或个人记忆。完整边界见 `specs/15-roles-and-permissions.md`；当前代码尚未实现 `MODERATOR` / `CURATOR` 或后台用户管理。
- 被删除、撤回授权或审核下架的公开内容要从城市故事站和地图两个入口同时消失。
- 开发日志与自动化截图禁止含真实用户数据；测试使用虚构数据。

## 9. 前端信息架构（仅产品与路由）

| 导航 | 路由 | 子视图 |
|---|---|---|
| 邮局 | `/post-office` | 来信、在途、草稿 |
| 发现 | `/discover`、`/discover/map`、`/discover/map/:cityId` | 城市故事站、世界记忆地图城市入口、单城市故事 |
| 共途 | `/passages` | 我的共途、明信片、续程 / 停泊、信友 |
| 纪念册 | `/memories` | 双城日记、共同手帐、个人记忆 |
| 非主导航 | `/auth/*`, `/settings`, `/post-office/compose/:id?`, `/discover/stories/:id`, `/postcards/:id` | 登录、设置、写信、故事详情 |

规划中的后台路由（当前不存在，不得实现假页面）：`/moderation`（故事审核，`MODERATOR/ADMIN`）、`/admin/users`（用户与角色管理，`ADMIN`）、`/admin/role-changes`（角色变更审计，`ADMIN`）。现有 `/admin/moderation` 在角色扩展任务中再评估是否改名为 `/moderation`。

产品规则：发现中的“城市故事站”是内容列表入口，“世界记忆地图”是同一故事集合的城市入口；不新增独立的“地图故事”实体，详情页路由统一为 `/discover/stories/:id`。本文**不规定地图渲染维度、引擎或组件**。

前端必须包含：加载 / 空态 / 错误态、键盘可用、表单标签、屏幕阅读器说明、移动及桌面响应式布局、操作前权限提示。

## 10. 版本范围（防止一口气做完）

- **P0 毕设核心**：项目基础、认证、个人设置、邮局、距离投递、已审核城市故事、世界记忆地图的业务入口、共途、双向信友、双城日记、个人记忆、安全审核。
- **P1 特色增强**：善意接力、共同手帐、纪念时间标注、细化通知偏好、`MODERATOR` 与 `ADMIN` 后台角色管理；`CURATOR` 依赖精选专题立项。
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
    ├── story/         # 故事草稿、审核、公开读取；导出 StoryService / ApprovedStoryReader
    ├── discovery/     # 发现入口只读组合：城市聚合；不持有数据表
    └── health/        # 仅依赖 DatabaseHealthService
```

- `AuthModule` 导出 `SessionGuard`、`SessionService` 与 `AccountService`；`ProfileModule` 导出 `CityService` 与 `ProfileReader`；`DeliveryModule` 导出 `DeliveryPolicy`；`PostcardModule` 导出 `PostcardService` 与 `PostcardDeliveryService`；`StoryModule` 导出 `StoryService` 与 `ApprovedStoryReader`。其他模块只能依赖这些公开入口，不得直接访问 `users`/`sessions`/`cities`/`profiles`/`postcards`/`stories` 等表。
- `tests/architecture/check-boundaries.mjs` 强制：Prisma 只在 `src/prisma` 或 `*.repository.ts` 中出现、无跨模块深层导入、Web 不导入服务端、前端功能互不引用、Web 不使用 `localStorage`/`sessionStorage`。
- Web 依赖方向：`app → features → shared`；`packages/api-client` 只含类型与 fetch 客户端，不依赖 Node/Express/Prisma。

### 13.3 身份与会话实现

- 数据表（`apps/api/prisma/migrations/20261028032315_init`）：`users(id, email_normalized UNIQUE, password_hash, nickname, adult_confirmed_at, email_verified_at, created_at, updated_at)`；`sessions(id, user_id, session_hash UNIQUE, created_at, expires_at, revoked_at)`。
- 密码：Argon2id，19 MiB / 2 次迭代 / 并行度 1；数据库不保存明文，日志与响应不包含密码字段。
- 响应字段：注册/登录返回 `{ id, nickname, cityId?, emailVerified, role }`；只有 `/auth/me` 返回本人 `email`。`role` 为 `USER | ADMIN`，TASK-005 起由 `RolesGuard` 用于审核接口。
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

TASK-004 未实现回信、`passage_id`、`reply_to_postcard_id`、模板/多媒体、通知、举报/封锁/审核后台、共途、信友、纪念册、地图、CI 流水线。`RESTRICTED` 只有枚举和读取拒绝，没有写入路径；Worker 不生成通知，不能宣称通知去重已完成。TASK-004 时发现/共途/纪念册仍只呈现真实空态；其中发现页已由 TASK-005 替换为故事站，共途/纪念册仍为空态。

### 13.7 TASK-005 城市故事与最小审核实现

- 数据表：`users.role`（`USER | ADMIN`，默认 `USER`）；`stories`（作者、城市、标题/正文/标签、`review_status`、公开授权、提交/审核/公开/归档时间、撤回来源）；`story_review_actions`（故事、管理员、动作、固定原因码、时间）。迁移 `20261029053935_add_stories` 含长度、标签数量、公开状态与审核人一致性检查；`20261029060000_fix_story_published_constraint` 允许已撤回/下架保留历史 `published_at`；`20261029061500_fix_story_whitespace_checks` 让全空白标题/正文（含换行与制表符）被数据库拒绝。
- `StoryModule`：`/stories` 公开列表与详情、`/stories/mine` 作者读取、`/stories` 作者创建/编辑/提交/撤回/删除草稿、`/moderation` 审核队列与决策。公开读取只能经过 `ApprovedStoryReader`；未来地图不得另写可见性条件。
- 状态：`DRAFT → PENDING → APPROVED/REJECTED`；`PENDING/APPROVED → REMOVED`（作者撤回或管理员下架）。公开条件为 `APPROVED + published_at 非空 + archived_at 为空 + public_consent_at 非空`。
- 权限：审核接口由 `SessionGuard + RolesGuard` 强制 `ADMIN`；普通用户 403、匿名 401；管理员不能审核自己的故事（403，不写审计）。`ADMIN` 通过非生产脚本 `admin:grant` 授予，注册 DTO 不接受角色。
- 容量与配额：每城市 50 条活跃故事（`STORY_MAX_ACTIVE_PER_CITY`），每账号滚动 7 天最多 3 次提交（`STORY_MAX_SUBMISSIONS_PER_WINDOW` / `STORY_SUBMISSION_WINDOW_DAYS`）。审核和撤回/下架在事务中锁定城市行、条件更新并写审计；满容量时 `APPROVED + published_at=null` 排队，释放名额后按审核时间提升最早排队故事。
- Web：`/discover` 公开故事站、`/discover/stories/:id` 详情、`/discover/write/:id?` 写作、`/discover/mine` 我的故事、`/admin/moderation` 审核台；普通用户进入审核台跳转 `/forbidden`，但后端仍独立校验。
- 仍未实现：地图/显示城市/接受共途邀请开关、匿名作者、30 天轮换、每日 24 张、每用户 2 条展示上限、举报/封锁/通知、共途/信友/纪念册。详见 `specs/14-story-deferred-scope.md`。

### 13.8 TASK-006 世界记忆地图业务入口实现

- 数据表：**无变更、无迁移**；复用 `stories` 与索引 `stories(review_status, city_id, published_at)`。
- 公开谓词单点化：新增 `story/domain/story-visibility.ts` 的 `PUBLIC_STORY_CONDITION`（`APPROVED + publishedAt 非空 + archivedAt 为空 + publicConsentAt 非空`）；`listPublic`、`findPublicById`、审核时的城市容量统计、排队提升与新增的城市聚合全部复用它。
- `StoryModule`：`StoryRepository.groupPublicByCity(topic)` 用 `groupBy(cityId)` + `_count` + `_max(publishedAt)` 聚合；经由 `ApprovedStoryReader.listPublicCitySummaries()` 暴露，返回 `story.types.ts` 的窄类型而不是 Prisma `Story`。
- `DiscoveryModule`（新增，只读、无表）：`GET /api/v1/discovery/cities?topic=` 组合 `ApprovedStoryReader` + `CityService`，返回 `city{id,name,countryCode}`、`publicStoryCount`、`latestPublishedAt`；按 `latestPublishedAt DESC, cityId ASC` 排序，不按数量排序；空库返回 `items: []`。
- 边界决策：没有在 `GET /cities` 上加 `hasPublicStories`（会形成 `ProfileModule ⇄ StoryModule` 循环依赖），也没有新增 `/cities/:id/stories` 别名；城市故事列表复用既有 `GET /stories?cityId=`，保证单一可见性来源。架构检查 `PUBLIC_MODULE_API` 增加 `approved-story-reader.service` 作为允许的跨模块公开入口。
- Web：`features/discover` 新增 `components/{DiscoverNav,StoryCard}.vue`、`composables/usePublicFeed.ts`、`views/{MapView,MapCityView}.vue`；`/discover` 保留故事站并增加“城市故事站 / 世界记忆地图”分段入口；城市页通过 `GET /cities` 解析城市名，未知城市显示温和空态。
- 仍未实现：任何地图渲染技术、`show_on_map`/`show_city` 开关、匿名作者、30 天轮换、共途/信友/纪念册、举报/封锁/通知。详见 `specs/07-world-memory-map.md` 与 `specs/14-story-deferred-scope.md`。

### 13.9 TASK-007 共途状态与参与者许可实现

- 数据表：新增 `passages`、`passage_participants`、`passage_events` 与 4 个枚举；迁移 `20261029080000_add_passages` 只新增对象，不修改既有表。检查约束保证：主题 1–80 字符、`COMPLETED` 必有 `completed_at`、`ARCHIVED` 必有 `archived_at`、`PAUSED` 与 `paused_at` 同时成立；`passage_participants` 主键 `(passage_id,user_id)` 防止重复参与者。
- `PassageModule`：`PassageRepository` 是唯一 Prisma 访问点；`domain/passage-state.ts` 与 `domain/passage-policy.ts` 为纯函数；`PassageService` 负责组装 `ProfileReader` 的对方昵称 / 城市；`PassagePolicy` 作为可注入包装导出，当前无消费者。
- API：`GET /passages?status=`、`GET /passages/:id`、`POST /passages/:id/{pause,resume,complete,archive}`。非参与者统一 404；状态冲突 409 `PASSAGE_STATE_CONFLICT`；写操作在事务内做条件更新并追加事件，重复动作幂等且不重复写事件。
- 状态语义：停泊 / 续程只改本人 `passage_participants` 行；完成与归档只改 `passages.progress_status` 与时间戳，**不写**任何参与者许可；归档为经历级终态，历史与详情对参与者继续可读。
- 创建边界：**没有** `POST /passages`。在邀请 / 接受流程实现前，公开创建接口会让一方替另一方表达同意，违反 PASSAGE-04.1；测试与本地演示通过非生产脚本 `apps/api/scripts/seed-passage.mjs` 建立数据。
- Web：`features/passages` 新增 `passage-groups.ts`（分组与标签纯函数）、`composables/usePassages.ts`、`views/PassagesView.vue`（保留原空态文案）、`views/PassageDetailView.vue`；路由 `/passages/:id`。页面只暴露本人许可、对方意愿与 `canSend`，不显示在线状态、已读回执、亲密度或倒计时。
- 仍未实现：邀请与创建入口、信友、纪念册、通知、举报 / 封锁、成员级归档与 `resume_after`。

### 13.10 TASK-008 共途通信许可接入邮局实现

- 数据表：`postcard_drafts.passage_id`、`postcards.passage_id` 均为可空 UUID，外键指向 `passages(id)` `ON DELETE RESTRICT`，各带索引；迁移 `20261029090000_add_postcard_passage` 只新增列与约束，既有行保持 `NULL`。
- `PassageModule` 新增并导出 `PassageReader.findSendContext(passageId, userId)`：一次性返回对方参与者 ID 与 `canSend`，内部复用纯函数 `canSendPassage`。`PostcardModule` 依赖 `PassageModule`，但不访问共途表；架构检查允许 `passage-reader.service` 作为跨模块公开入口。
- 草稿：`POST /postcards/drafts` 接受可选 `passageId`；服务端解析对方并写入 `recipientId`，客户端传入的 `recipientId` 只做一致性校验（不一致 422）；`passageId` 创建后不可改绑，`PATCH` 不接受该字段。
- 收件人：`GET /postcards/recipients?passageId=` 仅参与者可读；`canSend=false`、对方非 `OPEN` 或无城市时返回 `[]`；无参数时保持 TASK-004 演示白名单。
- 发送：带 `passageId` 的草稿在幂等返回之后、城市计算之前校验 `canSend`；false 返回 409 `PASSAGE_STATE_CONFLICT`，不创建明信片、不消耗草稿与每日额度。收件人固定为共途对方，第三方 `recipientId` 不会被采纳。
- Web：共途详情在 `permissions.canSend` 为真时显示「写一张明信片」，跳转 `/post-office/compose?passageId=`；写信页显示共途主题，收件人由共途决定且下拉禁用，提供「返回共途」；停泊 / 完成 / 归档后入口消失。
- 仍未实现：邀请与创建入口、回信、信友、纪念册、通知、举报 / 封锁、`CLOSED` 写入口与成员级归档。

## 14. 角色与权限规划（未实现）

> 2026-10-29 记录，当前代码仍为 `USER | ADMIN`。完整规范见 `specs/15-roles-and-permissions.md`；不得把本节当作已实现能力。

### 14.1 角色模型

- 目标角色：`USER | MODERATOR | CURATOR | ADMIN`。
- `GUEST` 只表示未登录，不写入 `users.role`，不创建 guest 用户行，不发放会话。
- 采用单枚举 + 权限蕴含：
  - `USER -> {USER}`
  - `MODERATOR -> {USER, MODERATOR}`
  - `CURATOR -> {USER, CURATOR}`
  - `ADMIN -> {USER, MODERATOR, CURATOR, ADMIN}`
- 暂不支持同一账号同时持有 `MODERATOR` 和 `CURATOR`；如后续确认需要兼任，另做 `user_roles` 架构变更，不先建空表。
- `role` 是账号属性；会话每次请求从数据库解析，角色变更下一次请求生效。

### 14.2 职责边界

- `MODERATOR`：故事审核、举报处理（举报功能实现后）、必要的审核记录；不能管理用户/角色/配置，不能读取私人内容，不能审核自己的故事。
- `CURATOR`：仅管理已审核、已发布、已授权、未归档的公开故事精选与专题；不能审核，不能访问私人内容；依赖独立精选专题 Spec。
- `ADMIN`：用户管理、角色授权、必要平台配置、授权范围内内容管理；**不能查看其他用户的邮箱**（本人 email 仍可通过 `/auth/me` 查看），不能读取私人明信片、共同日记或个人记忆。

### 14.3 后台 API 与数据边界（规划）

- `GET /api/v1/admin/users?query=&cursor=`：仅 `ADMIN`；返回 `id/nickname/role/createdAt`，不返回 email、掩码邮箱或邮箱域名；按 `id` 或 `nickname` 查找，不提供 email 查询。
- `PATCH /api/v1/admin/users/:id/role`：仅 `ADMIN`；不能授予 `GUEST`；不能降级最后一个 `ADMIN`；建议禁止修改自己的角色；成功后写 `role_changes` 审计。
- `GET /api/v1/admin/role-changes`：仅 `ADMIN`；只追加审计，不含 email 或私人内容。
- 角色管理与审计归 `AuthModule.RoleService`（规划），与 `users` 更新保持同一事务；不新增独立 `AdminModule` 访问 `users` 表，避免绕过 AuthModule 边界。
- 审核接口从当前 `@Roles('ADMIN')` 调整为允许 `MODERATOR`（ADMIN 蕴含），在独立任务中完成。
- 任何后台角色都不获得 `PostcardService` / 未来 `MemoryReader` 的私人内容直通权限；举报证据读取必须是独立、最小、受审计的流程。

### 14.4 分阶段

1. R0：保持现状，补 GUEST 匿名/401 回归测试。
2. R1：`MODERATOR` 最小切片（枚举、权限蕴含、审核接口、非生产授予脚本、测试）。
3. R2：`ADMIN` 用户与角色管理（用户列表、角色变更、审计、最后管理员保护、后台页面）。
4. R3：`MODERATOR` 举报处理（依赖 SafetyModule 举报）。
5. R4：`CURATOR` + 精选专题（P1，依赖独立产品 Spec）。

角色扩展不得与信友、纪念册、举报功能混在同一个任务中。
