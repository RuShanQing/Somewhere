# 当前开发任务 · TASK-007

状态：**DONE（TASK-007 已完成并通过门禁，等待下一任务指令）**

任务名称：**PASSAGE 垂直切片：共途状态、参与者许可与列表 / 详情**

任务类型：P0 共途 / 关系状态

优先级：P0

变更授权：本文件授权范围内；TASK-006 验收记录已归档到 `tasks/archive/TASK-006.md`。

## 1. 背景与目标

TASK-006 已完成世界记忆地图业务入口。按 PRD 的 P0 顺序与 `specs/00-index.md` 的建议，下一阶段实现共途的最小业务闭环：一段两个人共同参与、可停泊、可续程、可完成、可归档的经历。

核心闭环：

```text
两个人已有一段 ACTIVE 共途（测试用非生产 seed 脚本建立）
→ 任一方在 /passages 看到它
→ 打开 /passages/:id，看到自己的许可、对方的许可与 canSend
→ 本人停泊：双方 canSend 变为 false，但对方无法替本人续程
→ 本人续程：canSend 恢复
→ 任一方完成：进度变为 COMPLETED，双方许可不变
→ 任一方归档：从「进行中」消失，出现在「已归档」，详情仍可读
```

**本阶段不实现邀请流程、不写共途邀请专项测试、不接入邮局发信、不实现信友与纪念册。**

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 任务编号 | TASK-007（TASK-006 已是世界记忆地图且 DONE） |
| 技术栈 | 保持 Prisma + Vitest + Playwright；不引入新框架、Redis、消息队列 |
| 数据模型 | `passages` + `passage_participants` + `passage_events`；参与者恰好两人由服务层与测试保证 |
| 关系创建 | **不提供** `POST /api/v1/passages`；没有邀请/接受流程时，公开创建接口等于让一方替另一方同意 |
| 测试与演示数据 | 非生产脚本 `apps/api/scripts/seed-passage.mjs` 建立两人共途；仿照 `admin:grant` 与 `test-advance-postcard` |
| 三组状态 | 进度 `progress_status`、每人意愿 `consent_state`、记忆可见性（本阶段不实现）严格分离，不合并布尔值 |
| 停泊 / 续程 | 只改本人 `passage_participants` 行；不能替对方恢复；`PAUSED` 到期**不自动**恢复 |
| 完成 | 任一参与者可执行；只改 `progress_status` 与 `completed_at`，**不改任何一方 `consent_state`**；重复完成幂等 |
| 归档 | 经历级 `progress_status=ARCHIVED`；不影响历史可读性与双方许可；重复归档幂等 |
| `CLOSED` | 保留枚举与判定，**不提供写入口**（与 `RESTRICTED` 先例一致），由后续安全或信友任务产生 |
| `resume_after` | 本阶段不建列，也不做自动恢复任务 |
| `permissions.canSend` | 详情与列表返回，由 `PassagePolicy` 计算；让停泊规则在本阶段可被外部验证 |
| 非参与者访问 | 统一 404 `RESOURCE_NOT_ACCESSIBLE`；管理员也不是参与者，同样 404 |
| 分页 | 首版不做游标分页；按 `updatedAt DESC, id DESC` 返回本人全部共途 |
| 错误码 | 新增 `PASSAGE_STATE_CONFLICT`（409）；其余沿用现有错误体系 |

## 3. 功能范围

### 3.1 数据库

新增一次迁移，只新增表与枚举，不修改任何既有表：

- `passages(id, topic, kind, progress_status, created_at, updated_at, completed_at?, archived_at?)`
- `passage_participants(passage_id, user_id, consent_state, paused_at?, last_confirmed_at?)`，主键 `(passage_id, user_id)`
- `passage_events(id, passage_id, actor_id, event_type, metadata_redacted?, created_at)`
- 枚举：`PassageKind(ONE_OFF/ONGOING/SEASONAL)`、`PassageProgressStatus(ACTIVE/COMPLETED/ARCHIVED)`、`PassageConsentState(ALLOW/PAUSED/CLOSED)`、`PassageEventType(CREATED/PAUSED/RESUMED/COMPLETED/ARCHIVED)`
- 检查约束：主题非全空白且 1–80 字符；`COMPLETED` 必须有 `completed_at`；`ARCHIVED` 必须有 `archived_at`；`PAUSED` 必须有 `paused_at` 且反之亦然
- 索引：`passages(progress_status, updated_at)`、`passage_participants(user_id, passage_id)`、`passage_events(passage_id, created_at)`
- 外键一律 `Restrict`；事件 `metadata_redacted` 只保存状态迁移，不保存任何用户文本

### 3.2 后端接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/passages?status=ALL\|ACTIVE\|COMPLETED\|ARCHIVED` | 本人参与；缺省 `ALL`；非法值 422 |
| GET | `/api/v1/passages/:id` | 本人参与；非参与者 404 |
| POST | `/api/v1/passages/:id/pause` | 本人 `ALLOW → PAUSED`；重复调用 200 不重复写事件 |
| POST | `/api/v1/passages/:id/resume` | 本人 `PAUSED → ALLOW`；不改对方；已 `COMPLETED/ARCHIVED` 或本人 `CLOSED` 时 409 |
| POST | `/api/v1/passages/:id/complete` | `ACTIVE → COMPLETED`；重复调用 200；已归档 409 |
| POST | `/api/v1/passages/:id/archive` | `ACTIVE/COMPLETED → ARCHIVED`；重复调用 200 |

响应字段白名单：

```text
id, topic, kind, progressStatus, createdAt, updatedAt,
completedAt, archivedAt,
me { consentState, pausedAt },
counterpart { nickname, city?, consentState },
permissions { canSend }
```

规则：

- 不返回 email、角色、`receptionMode`、经纬度、会话、任何正文；
- `counterpart.city` 只含 `id/name/countryCode`；
- 列表与详情同构，列表为 `{ items: [...] }`；
- 所有写接口挂 `SessionGuard`，并继承全局 `OriginGuard`；
- 状态冲突返回 `409 PASSAGE_STATE_CONFLICT`；非法 UUID 与非参与者统一 404。

### 3.3 领域规则

- `PassagePolicy.canSend`：查看者是参与者、恰好两名参与者、`progressStatus=ACTIVE`、双方 `consentState=ALLOW`，四者同时成立才为 true；
- 记忆可见性不参与 `canSend`，也不由 `progressStatus` 推导；
- 状态机：`ACTIVE → COMPLETED`、`ACTIVE/COMPLETED → ARCHIVED`；`ARCHIVED` 为终态；不存在回到 `ACTIVE` 的路径；
- 所有写操作在事务内完成：权限检查、条件更新、事件写入；
- 「恰好两人」在服务层校验：两名、去重后仍为两名、不含自己与自己。

### 3.4 Web

- `/passages`：真实列表，分「进行中」与「已归档」；卡片显示主题、对方昵称与城市、进度、本人意愿、`canSend` 提示；加载 / 空 / 错误重试 / 有数据四态；无数据时保留标题「还没有正在进行的共途」；
- `/passages/:id`：详情与操作面板；按状态与本人意愿显示停泊 / 续程 / 完成 / 归档；操作后原地更新；404 与 409 温和提示；
- 不显示在线状态、已读回执、亲密度、关系等级、回信倒计时、热度；
- 不提供「写明信片」或「邀请共途」入口；
- 390px 无横向溢出、键盘可操作、错误态可重试。

### 3.5 非生产数据脚本

`apps/api/scripts/seed-passage.mjs`：

- 参数 `--email-a`、`--email-b`、`--topic`、可选 `--kind`；
- 拒绝 `NODE_ENV=production`；
- 校验两个账号存在且不同；
- 在一个事务中写入 `passages`、两条 `ALLOW` 参与者与一条 `CREATED` 事件；
- 只用于测试、E2E 与本地演示，不暴露 HTTP 创建入口。

## 4. 明确不做

- 共途邀请、接受、拒绝、邀请通知、邀请专项测试；
- 信友、`penpal_consents`、完成共途自动成为信友；
- 邮局 `passage_id`、共途内写明信片、收件人白名单替换、回信；
- 纪念册、双城日记、共同手帐、个人记忆、`MemoryPolicy`；
- 通知、邮件、未读计数、提醒；
- 举报、封锁、`RESTRICT` 实际处置、通用审核后台；
- `CLOSED` 写入口、停泊到期自动恢复、定时完成、`resume_after`；
- 善意接力（P1）、地图渲染、点赞 / 评论 / 关注 / 热度、全文搜索、推荐；
- 邮箱验证、找回密码、OAuth、账号删除、设备会话管理；
- 多人共途、群聊、多人共同编辑器。

## 5. 工作拆分

- [x] `T7-01` 写入任务卡并同步 `specs/09`、`docs/architecture.md`、`docs/testing.md`、`specs/00-index.md` 口径。
- [x] `T7-02` RED：先写单元、集成、契约、E2E 失败测试并记录证据。
- [x] `T7-03` 数据模型与新增迁移：三张表、四个枚举、检查约束与索引。
- [x] `T7-04` `PassageModule`：状态机、策略、仓储、服务、6 个接口。
- [x] `T7-05` 重新生成 OpenAPI 客户端并更新契约检查。
- [x] `T7-06` Web：共途列表、详情、路由、组合式函数与组件测试。
- [x] `T7-07` E2E、Smoke、全量 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 接口与权限

匿名访问六个端点全部 401 `AUTH_REQUIRED`；非参与者调用列表不包含该共途、调用详情返回 404 `RESOURCE_NOT_ACCESSIBLE`；`ADMIN` 不是参与者时同样 404。

### AC-02 · 字段最小化

列表与详情响应键集合与白名单完全一致；不含 email、`role`、`receptionMode`、`centroidLat/Lon`、会话值或任何正文。

### AC-03 · 停泊与续程

Given A、B 均 `ALLOW` 且进度 `ACTIVE`，When A 停泊，Then A 的 `consentState=PAUSED` 且 `pausedAt` 非空，B 行不变，A/B 的 `canSend` 均为 false；When B 尝试续程，Then A 仍 `PAUSED`；When A 续程，Then `ALLOW`、`pausedAt=null`、`canSend` 恢复。重复停泊返回 200 且不重复写事件。

### AC-04 · 完成与归档

Given `ACTIVE`，When A 完成，Then `COMPLETED` 且 `completedAt` 非空，双方 `consentState` 不变，事件记录 A；When 再完成，Then 200 且不重复写事件；When 归档，Then `ARCHIVED` 且 `archivedAt` 非空；`?status=ACTIVE` 不再返回，`?status=ARCHIVED` 返回，详情仍 200；已完成共途续程返回 409。

### AC-05 · 状态隔离

`complete` / `archive` 不写 `passage_participants`；不存在任何创建信友记录的代码路径（信友表尚未存在）；`CLOSED` 参与者 `canSend=false` 且 `resume` 返回 409。

### AC-06 · 数据库

只有一次新增迁移；空库 `prisma migrate deploy` 可重放；`prisma migrate status` 无待执行迁移；既有 `users/sessions/cities/profiles/postcards/stories` 结构与 TASK-006 一致；检查约束逐条生效；`passage_participants` 主键拒绝重复参与者。

### AC-07 · Web

Given 匿名 / 参与者 / 非参与者，When 使用 `/passages`、`/passages/:id`，Then 四态真实、操作后刷新仍保持、非参与者看到不可访问提示、390px 无横向溢出、键盘可操作；空数据时「还没有正在进行的共途」仍可见；页面无假按钮、无热度或在线状态。

### AC-08 · 回归与安全

TASK-001～006 的认证、会话、Cookie、Origin、限流、日志脱敏、城市/资料、邮局/投递、故事站/审核、地图聚合全部保持通过；外站 Origin 的写请求被拒绝；注销后的会话访问 `/passages` 返回 401；日志不包含共途主题或事件元数据中的用户文本。

### AC-09 · 质量门禁

`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke`、`pnpm verify` 实际运行并通过；`pnpm verify` 退出码 0；故意制造一次非敏感失败时返回非 0 并恢复。

## 7. 开发步骤

1. 文档口径：本任务卡、`specs/09`、`docs/architecture.md`、`docs/testing.md`、`specs/00-index.md`。
2. RED：单元 `passage-state.spec.ts`、`passage-policy.spec.ts`；集成 `passages.spec.ts`；契约路径；E2E `passages.spec.ts`。
3. 迁移：三张表、四个枚举、检查约束；`migrate deploy` 到测试库。
4. 领域层 → 仓储 → 服务 → 控制器；注册 `PassageModule`。
5. 重新生成 OpenAPI 客户端；契约检查加入新路径与字段白名单。
6. Web 组合式函数、列表、详情、路由与组件测试。
7. E2E、Smoke、全量回归、失败证明与证据归档。

## 8. 执行记录（实测）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-29（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | 新增 `passage/domain/{passage-state,passage-policy}.ts`、`repositories/passage.repository.ts`、`passage.service.ts`、`passage-policy.service.ts`、`passages.controller.ts`、`dto/{passage,passage-response}.dto.ts`、`passage.module.ts`、`passage.types.ts`；`prisma/schema.prisma` 新增 3 模型 + 4 枚举与 `20261029080000_add_passages` 迁移；`app.module.ts` 注册模块；`app-error.ts` 新增 `PASSAGE_STATE_CONFLICT`；`scripts/seed-passage.mjs`；Web 新增 `features/passages/{passage-groups,messages}.ts`、`composables/usePassages.ts`、`views/{PassagesView,PassageDetailView}.vue`、路由与样式；`packages/api-client` 重新生成并新增 6 个方法；`nest-cli.json` 关闭构建前整目录删除 |
| 新增/更新测试 | 后端单元 14 文件 / 89 用例（新增 19）；Web 单元 8 文件 / 47 用例（新增 6）；集成 7 文件 / 72 用例（新增 11）；契约 30 条路径（新增 6）；Playwright 20 用例（新增 1）；Smoke 17 项（新增 1 组） |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify` |
| 通过项 | `pnpm verify` 9/9 子门禁 PASS，退出码 0；证据目录 `artifacts/verification/TASK-007/verify/2026-10-29T08-08-19-988Z` |
| 未通过 / 阻塞 | 无 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 接口与权限 | 集成测试：匿名六端点全部 401 `AUTH_REQUIRED`；非参与者列表为空、详情 404 `RESOURCE_NOT_ACCESSIBLE`；`ADMIN` 非参与者同样 404 | PASS |
| AC-02 字段最小化 | 集成与契约断言键集合为 `id/topic/kind/progressStatus/createdAt/updatedAt/completedAt/archivedAt/me/counterpart/permissions`；响应文本无 email、`receptionMode`、坐标、密码或会话字段 | PASS |
| AC-03 停泊与续程 | 集成：A 停泊后 A `PAUSED`、`pausedAt` 非空、B 行不变、双方 `canSend=false`；B 续程不改变 A；A 续程恢复；重复/并发停泊各只写 1 条 `PAUSED` 事件；E2E 刷新后仍保持 | PASS |
| AC-04 完成与归档 | 集成：完成置 `COMPLETED` + `completedAt` 且双方许可不变，重复完成仅 1 条事件；完成后续程 409；归档置 `ARCHIVED`，`?status=ACTIVE` 消失、`?status=ARCHIVED` 可见、详情仍 200；E2E 走完完成→归档 | PASS |
| AC-05 状态隔离 | 集成：complete/archive 不写 `passage_participants`；`CLOSED` 参与者 `canSend=false` 且 resume 409；仓库中不存在 `penpal_consents` 或任何自动信友路径 | PASS |
| AC-06 数据库 | 7 次迁移（TASK-006 的 6 次 + 新增 1 次）；`prisma migrate deploy` 在测试库重放成功、`migrate status` 无待执行；检查约束与 `(passage_id,user_id)` 主键生效；既有表结构未修改 | PASS |
| AC-07 Web | E2E：列表卡片 → 详情 → 停泊 → 刷新保持 → 对方看到「对方状态：已停泊」且无「续程」按钮 → 续程 → 完成 → 归档 → 进行中空态 + 已归档可见；390px 无横向溢出；操作按钮可聚焦；无假按钮与热度元素 | PASS |
| AC-08 回归与安全 | 集成 72 条、E2E 20 条、Smoke 17 项全部通过；认证、Cookie、Origin、限流、日志脱敏、邮局、故事站与地图均未回归；注销会话访问 `/passages` 返回 401；请求日志只含路径、状态与 userId | PASS |
| AC-09 质量门禁 | `pnpm verify` 9/9 PASS、exit 0；故障注入后 unit/integration/e2e/smoke 判 FAIL、总命令 exit 1，恢复后重新 PASS | PASS |

补充说明：

- 红灯证据：实现前单元测试 2 个套件因模块不存在失败、既有 70 条通过（`artifacts/verification/TASK-007/red/red-passage-unit.log`）；集成测试 11 条因表与接口缺失失败、既有 61 条通过（`red/red-passage-api.log`）。
- 失败证明：临时让 `canSendPassage` 无条件返回 true 后，`pnpm verify` 在 unit、integration、E2E、Smoke 四处判 FAIL 并返回 exit 1（`red/verify-failure-proof.log`），恢复后重新 PASS。
- 测试代码修正：匿名 401 用例改为顺序构造 supertest 请求，避免同一服务端上并发创建测试实例导致的 `address` 读取竞争；断言语义不变。
- 构建配置：`apps/api/nest-cli.json` 的 `deleteOutDir` 改为 `false`。本机安全删除保护会在同一轮内第二次整目录删除超过阈值时拦截构建；构建仍由 tsc 覆盖输出，CI 干净环境不受影响。该改动不改变运行时行为与产物内容。
- 仍未实现：共途邀请与创建入口、邮局 `passage_id` 接入、信友、纪念册、通知、举报/封锁、成员级归档。
- 迁移漂移检查：`prisma migrate status` 在测试库显示 7 次迁移且已是最新；`prisma migrate diff` 仅报告一处**既有**差异——TASK-005 手工索引 `stories(review_status, published_at, id)` 未写入 `schema.prisma`。本次新增的 `passages` / `passage_participants` / `passage_events` 与 schema 完全一致，无新增漂移。该历史差异留给后续独立清理任务，不在本任务顺手修改 Story 模型。

## 9. 下一步

完成本任务并通过门禁后，建议下一任务为「通信许可接入邮局」（`postcards.passage_id`、`PassagePolicy.canSend`、收件人解析替换）。在开放邀请或陌生人触达前，必须先实现 SafetyModule 的封锁能力。不自动进入下一任务。
