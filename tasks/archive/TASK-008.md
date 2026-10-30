# 当前开发任务 · TASK-008

状态：**DONE（TASK-008 已完成并通过门禁，等待下一任务指令）**

任务名称：**PASSAGE-LINK 切片：共途通信许可接入邮局**

任务类型：P0 共途 / 通信许可

优先级：P0

变更授权：本文件授权范围内；TASK-007 验收记录已归档到 `tasks/archive/TASK-007.md`。

## 1. 背景与目标

TASK-007 已实现共途状态、参与者许可与 `PassagePolicy`，但邮局仍只使用演示收件人白名单，`PassagePolicy` 没有真实消费者。本任务把许可接入发送链路，让「停泊 / 关闭阻断新的共途通信」从策略变成可验证的外部行为。

核心闭环：

```text
共途详情（双方 ALLOW、ACTIVE）→ 写一张明信片（携带 passageId）
→ 收件人由服务端解析为共途对方 → 按城市距离计算 ETA → 正常投递
任一方停泊 → 新的 passage 明信片发送被拒绝（409）
→ 已在途的信仍按原 deliverAt 送达
```

**仍然不实现共途邀请 / 创建入口**；测试与本地演示使用非生产脚本建立共途。

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 数据 | `postcard_drafts`、`postcards` 各增加**可空** `passage_id`；只新增列、外键与索引，不修改既有行 |
| 收件人来源 | `passageId` 存在时，收件人由服务端解析为共途的另一位参与者；不开放用户搜索 |
| 兼容 TASK-004 | 无 `passageId` 的草稿继续走演示白名单，行为与测试不变 |
| 草稿绑定 | 仅创建草稿时接受 `passageId`；创建后不可改绑，避免草稿中途换关系 |
| 停泊时能否存草稿 | 可以保存草稿（草稿不是通信行为），但**不能寄出** |
| 发送被拒绝 | `409 PASSAGE_STATE_CONFLICT`，不创建明信片、不消耗每日额度、不消耗草稿 |
| 收件人列表 | `GET /postcards/recipients?passageId=`：参与者可读；仅在 `canSend` 且有城市且 `OPEN` 时返回对方一人，否则空数组 |
| 接信状态 | 仍独立校验；共途允许但对方 `RESTING/CLOSED` 时按现有 `recipient:notReceiving` 拒绝 |
| 修改既有发送事务 | 只在写入时增加 `passageId`；幂等、日限、草稿 claim、Worker 逻辑不变 |
| 邀请 / 信友 / 纪念册 | 不实现 |

## 3. 功能范围

### 3.1 数据库

新增迁移（仅新增）：

- `postcard_drafts.passage_id UUID NULL`，外键 → `passages(id)` `ON DELETE RESTRICT`；
- `postcards.passage_id UUID NULL`，外键 → `passages(id)` `ON DELETE RESTRICT`；
- 两个 `passage_id` 索引；
- 不新增表、不改变既有约束与状态枚举。

### 3.2 后端接口

| Method | Path | 变化 |
|---|---|---|
| GET | `/api/v1/postcards/recipients?passageId=` | 新增可选查询参数；缺失时保持演示白名单行为 |
| POST | `/api/v1/postcards/drafts` | 接受可选 `passageId`；服务端解析收件人 |
| PATCH | `/api/v1/postcards/drafts/:id` | 若草稿已绑定共途，收件人只能保持为对方；不允许改绑 |
| POST | `/api/v1/postcards/drafts/:id/send` | 绑定共途时校验 `PassagePolicy.canSend`，收件人以服务端解析为准 |
| GET | `/api/v1/postcards/drafts`、`/drafts/:id` | 响应新增 `passageId`（可空） |

规则：

- 非参与者对 `passageId` 一律 404 `RESOURCE_NOT_ACCESSIBLE`，不泄露共途是否存在；
- `canSend=false` 时发送返回 409 `PASSAGE_STATE_CONFLICT`；
- 草稿 `recipientId` 与共途对方不一致时返回 422 `VALIDATION_ERROR`；
- 共途明信片仍按双方城市快照与既有公式计算 `deliverAt`，客户端不能指定；
- 在途保密、送达后阅读、Worker 只投递一次的规则不变。

### 3.3 Web

- `/passages/:id`：`permissions.canSend=true` 时显示「写一张明信片」入口，跳转 `/post-office/compose?passageId=<id>`；停泊 / 关闭 / 完成后不显示入口；
- `/post-office/compose`：读取 `query.passageId`，加载共途详情与共途收件人，显示「这段共途 · <主题>」，收件人预选且不可改成其他人；
- 保存草稿后保留 `passageId`；寄出成功沿用现有明信片详情跳转；
- 不显示在线状态、已读回执、亲密度或倒计时；无入口时不渲染假按钮。

## 4. 明确不做

- 共途邀请、接受、拒绝、按用户搜索、公开用户目录；
- 信友、纪念册、双城日记、共同手帐、个人记忆；
- 通知、举报 / 封锁 / `RESTRICT`、`CLOSED` 写入口；
- 回信、`reply_to_postcard_id`、模板、多媒体、共同草稿；
- 善意接力、地图渲染、热度 / 点赞 / 评论 / 推荐；
- 修改 TASK-004 的延迟公式、每日上限、Worker 行为与在途保密规则；
- 邮箱验证、找回密码、OAuth、账号删除、设备会话。

## 5. 工作拆分

- [x] `T8-01` 任务卡与 `specs/05`、`specs/09`、`docs/architecture.md`、`docs/testing.md`、`specs/00-index.md` 口径。
- [x] `T8-02` RED：单元、集成、契约、E2E、Smoke 失败测试与证据。
- [x] `T8-03` 迁移：两个可空 `passage_id`、外键与索引。
- [x] `T8-04` `PassageReader`：共途参与者与 `canSend` 的唯一跨模块读取入口。
- [x] `T8-05` 邮局：草稿绑定、收件人列表、发送事务校验。
- [x] `T8-06` 重新生成 OpenAPI 客户端并更新契约检查。
- [x] `T8-07` Web：共途入口、写信页共途上下文、组件测试。
- [x] `T8-08` E2E、Smoke、全量 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 草稿绑定

Given 我是共途参与者，When `POST /postcards/drafts` 携带 `passageId`，Then 201 且 `passageId` 回显、`recipient` 为对方；Given 我不是参与者，Then 404 且不创建草稿；Given `recipientId` 指向第三人，Then 422 且不创建草稿。

### AC-02 · 共途收件人

Given 双方 `ALLOW` 且 `ACTIVE`，When `GET /postcards/recipients?passageId=`，Then 只返回对方一人且无 email/坐标；Given 任一方 `PAUSED/CLOSED` 或进度非 `ACTIVE`，Then 返回空数组；Given 非参与者，Then 404。

### AC-03 · 发送许可

Given 双方 `ALLOW` 且 `ACTIVE`，When 寄出绑定共途的草稿，Then 201、新明信片 `passageId` 正确、收件人为对方、`deliverAt` 由服务端按城市距离生成；Given 任一方已停泊或关闭，Then 409 `PASSAGE_STATE_CONFLICT`，数据库无新明信片、草稿仍可用、每日额度不变。

### AC-04 · 兼容与不回退

Given 无 `passageId` 的草稿，When 使用演示白名单寄出，Then 行为与 TASK-004 完全一致；`recipientId` 为空 / 自己 / 非白名单仍按原错误拒绝；幂等键、重复发送、每日 10 张上限、在途正文保密、Worker 只投递一次全部保持。

### AC-05 · 接信状态独立

Given 共途允许但对方 `receptionMode != OPEN`，When 寄出，Then 按现有规则返回 422，且不写 `postcards`；共途许可不能绕过接信状态或城市缺失。

### AC-06 · Web

Given `canSend=true`，When 打开共途详情，Then 显示「写一张明信片」；When 点击，Then 写信页显示共途主题与对方且收件人不可改为第三人；Given 停泊 / 关闭 / 完成 / 归档，Then 详情无该入口；390px 与键盘可操作。

### AC-07 · 数据库

只有一次新增迁移；空库 `migrate deploy` 可重放；`prisma migrate status` 无待执行；既有行回填为 `NULL`；外键阻止删除被引用的共途；新增列与索引符合 schema。

### AC-08 · 回归与安全

TASK-001～007 全部测试保持通过；非参与者 404、停泊 409、外站 Origin 403、注销会话 401；响应与日志不出现 email、坐标、正文或会话值。

### AC-09 · 质量门禁

`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke`、`pnpm verify` 实际运行并通过，退出码 0；故意制造一次非敏感失败时返回非 0 并恢复。

## 7. 开发步骤

1. 文档口径与本任务卡。
2. RED：`passage-postcards.spec.ts`、客户端/契约、E2E、Smoke 失败用例。
3. 迁移与 Prisma Client 生成。
4. `PassageReader` → 邮局 DTO / 服务 / 仓储。
5. 重新生成 OpenAPI 客户端与契约检查。
6. Web 共途入口与写信页共途上下文。
7. E2E、Smoke、全量回归、失败证明与证据归档。

## 8. 执行记录（实测）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-29（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | `prisma/schema.prisma` 与 `20261029090000_add_postcard_passage`：`postcard_drafts.passage_id`、`postcards.passage_id`、外键与索引；`passage/passage-reader.service.ts` 新增并导出；`postcard/domain/passage-binding.ts`；`postcard.service.ts` 草稿绑定、收件人解析、发送许可；`draft.dto.ts`、`recipients-query.dto.ts`、`postcard-response.dto.ts`、`postcards.controller.ts`、`postcard.module.ts`、`draft.repository.ts`、`postcard.repository.ts`；Web `ComposeView.vue` 共途上下文与返回入口、`PassageDetailView.vue` 共途写信入口；生成客户端与 `postcardRecipients(passageId?)` |
| 新增/更新测试 | 后端单元 15 文件 / 92 用例（新增 3）；Web 单元 8 文件 / 48 用例（新增 1）；集成 8 文件 / 80 用例（新增 8）；契约仍 30 条路径（新增 `passageId` 字段与查询参数断言）；Playwright 20 用例（扩展现有共途用例）；Smoke 17 项（原有共途检查加入停泊阻断发信） |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify` |
| 通过项 | `pnpm verify` 9/9 子门禁 PASS，退出码 0；证据目录 `artifacts/verification/TASK-008/verify/2026-10-29T08-32-54-678Z` |
| 未通过 / 阻塞 | 无 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 草稿绑定 | 集成：参与者创建带 `passageId` 草稿返回 201、`passageId` 回显、`recipient` 为对方；非参与者 404 且草稿数 0；`recipientId` 指向第三人 422 且不落库；已绑定草稿改收件人为第三人 422 | PASS |
| AC-02 共途收件人 | 集成：双方 ALLOW 时只返回对方且无 email/坐标；对方停泊后返回 `[]`；非参与者 404；契约断言查询参数存在 | PASS |
| AC-03 发送许可 | 集成：正常发送 201、`postcards.passage_id` 与收件人正确、`deliverAt >= sentAt`、草稿标记已使用；停泊后 409 `PASSAGE_STATE_CONFLICT`、`postcards` 计数 0、草稿 `sentPostcardId` 仍为空 | PASS |
| AC-04 兼容与不回退 | 集成：TASK-004 的 12 条邮局用例全部通过（TASK-008 后共 80 条）；无 `passageId` 的草稿仍走白名单，幂等、日限、在途保密与 Worker 单次投递未改 | PASS |
| AC-05 接信状态独立 | 集成：对方 `RESTING` 时返回 422，`postcards` 计数 0；共途许可未绕过接信状态 | PASS |
| AC-06 Web | E2E：续程后共途详情出现「写一张明信片」→ 写信页显示「这段共途 · 海边的冬天」→ 返回共途；停泊与完成后入口消失；390px 与键盘断言保持 | PASS |
| AC-07 数据库 | 8 次迁移（TASK-007 的 7 次 + 新增 1 次）；测试库 `migrate deploy` 重放、`migrate status` 已最新；新增列可空，既有行不受影响；外键与索引存在 | PASS |
| AC-08 回归与安全 | 集成 80、E2E 20、Smoke 17 全部通过；TASK-001～007 的认证、会话、Origin、限流、日志脱敏、故事、地图、共途状态未回退；响应无 email/坐标 | PASS |
| AC-09 质量门禁 | `pnpm verify` 9/9 PASS、exit 0；故障注入后 lint/integration/smoke 判 FAIL、总命令 exit 1，恢复后重新 PASS | PASS |

补充说明：

- 红灯证据：实现前 `postcard-passage-binding.spec.ts` 因模块不存在失败（`artifacts/verification/TASK-008/red/red-postcard-passage-unit.log`）；集成新增 8 条中 7 条失败、既有 73 条通过（`red/red-postcard-passage-api.log`）。
- 测试契约同步：`postcards.spec.ts` 中草稿响应键集合加入 `passageId`，这是 TASK-008 的显式契约变化；原有正文、权限、幂等断言未删除。
- 失败证明：把 `PassageReader.canSend` 临时改为 `true` 后，lint（未使用导入）、integration（停泊仍可发送）与 Smoke（期望 409）判 FAIL，`pnpm verify` exit 1（`red/verify-failure-proof.log`）；E2E 未捕获该注入，因为详情页入口使用 `PassageService` 的展示许可，而发送使用 `PassageReader`，两条路径由集成测试分别覆盖。恢复后重新 PASS。
- 迁移漂移检查：`prisma migrate status` 显示 8 次迁移且已最新；`prisma migrate diff` 仍只报告 TASK-005 遗留的 `stories(review_status, published_at, id)` 索引未写入 schema，本次新增列无漂移。
- 仍未实现：共途邀请与创建入口、回信、信友、纪念册、通知、举报/封锁、`RESTRICT` 处置、成员级归档。

## 9. 下一步

完成 TASK-008 后，建议下一任务为双向信友（`PenpalModule`）；在开放邀请或陌生人触达前必须先实现 SafetyModule 的封锁能力。不自动进入下一任务。

角色与权限扩展（`MODERATOR`、`ADMIN` 用户/角色管理、`CURATOR`）是后续独立任务，不改变上述顺序；规划见 `specs/15-roles-and-permissions.md`。其中 `ADMIN` 不允许查看其他用户的邮箱，也不允许读取私人信件或私人记忆。当前代码仍为 `USER | ADMIN`，未实现角色扩展。
