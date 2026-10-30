# 当前开发任务 · TASK-012

状态：**DONE（TASK-012 已完成并通过门禁，等待下一任务指令）**

任务名称：**PAS-02 收尾：共途回信与回信引用**

任务类型：P0 邮局 / 共途闭环

优先级：P0

变更授权：本文件授权范围内；TASK-011 验收记录已归档到 `tasks/archive/TASK-011.md`。本任务只做回信，不做双城日记。

## 1. 背景与目标

`specs/09-shared-passage.md` 的 PAS-02 要求“两封均已送达才完成一次双向交换”；`specs/11-memories.md` MEMORY-02.2 要求回复记录 `replyToPostcardId`，双城日记才能可靠配对且不重复生成。

当前状态（已核实）：

- `postcards` 只有单向发送，没有 `reply_to_postcard_id`；
- 没有任何回信接口或 Web 入口；
- `GET /postcards/:id` 不返回共途信息，也不返回“是否可回信”；
- 共途内的另一方只能新建普通草稿，无法表达“这是对哪一封信的回复”。

本任务补齐 PAS-02 的另一半：

```text
收件人打开一封已送达、属于共途的信
→ 点击「回信」
→ 服务端从原信推导收件人与共途
→ 按同一距离规则延迟送达
→ 明信片保存 reply_to_postcard_id
```

仍然不实现双城日记（TASK-013）、共途邀请、通知、举报与角色扩展。

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 回信范围 | 只允许回复“已送达、属于某段共途、自己是收件人”的信 |
| 原信归属 | 被回信必须已有 `passage_id`；非共途信不支持回信 |
| 收件人 | 服务端取原信寄件人；客户端传入只做一致性校验 |
| 共途 | 继承原信的 `passage_id`，回信不新建共途 |
| 次数 | 一张原信最多一次回信；重复回信 409 |
| 权限 | 停泊 / 完成 / 归档 / 封锁时不可回信 |
| 正文 | 1–2000 码点，规则与普通明信片一致 |
| 时间 | 沿用同一距离延迟公式与 Worker，不新增时间规则 |
| 展示 | 详情返回 `canReply`；前端不自行推导权限 |
| 日记 | 本任务不生成、不设计日记页面（TASK-013） |

## 3. 功能范围

### 3.1 数据库

新增迁移（仅新增列与索引）：

- `postcard_drafts.reply_to_postcard_id UUID NULL` → `postcards(id)` `ON DELETE RESTRICT`，索引；
- `postcards.reply_to_postcard_id UUID NULL` → `postcards(id)` `ON DELETE RESTRICT`；
- `CHECK (reply_to_postcard_id <> id)`；
- 唯一索引 `UNIQUE (reply_to_postcard_id)`：PostgreSQL 允许任意多个 NULL，非空引用只出现一次，保证一张原信最多一封回信。

不新增表，不改既有列，不改任何既有行。`postcard_drafts` 不建唯一索引：草稿可以放弃后重建，最终唯一性由发送时的明信片约束决定。

### 3.2 后端接口

| Method | Path | 变化 |
|---|---|---|
| POST | `/api/v1/postcards/drafts` | 新增可选 `replyToPostcardId`；服务端推导收件人与 `passageId` |
| PATCH | `/api/v1/postcards/drafts/:id` | 继续只接受 `body/recipientId`；`replyToPostcardId` 不可改（422） |
| GET | `/api/v1/postcards/:id` | 新增 `passageId`、`canReply` |
| POST | `/api/v1/postcards/drafts/:id/send` | 发送前重新校验回信资格；落库 `reply_to_postcard_id` |

优先级与错误：

- 未登录：401 `AUTH_REQUIRED`；
- 原信不存在、查看者非参与者、原信未送达：404 `RESOURCE_NOT_ACCESSIBLE`；
- 原信无共途、回复自己的信：422 `VALIDATION_ERROR`；
- 已回信：409 `POSTCARD_ALREADY_REPLIED`（需要在 `ErrorCode` 中新增）；
- 任一方封锁：403 `CONTACT_BLOCKED`；
- 共途停泊 / 完成 / 归档：409 `PASSAGE_STATE_CONFLICT`；
- 任一失败分支都不得创建明信片、不消耗草稿、不消耗每日额度。

`canReply` 为 true 的条件：查看者是原信收件人、原信 `DELIVERED`、原信有 `passageId`、双方无封锁、`PassageReader` 的 `canSend` 为真、该原信尚无回信。

创建草稿的校验顺序（在既有“已发送幂等返回”之后）：

1. 原信存在且查看者是收件人，否则 404；
2. 原信 `DELIVERED`，否则 404；
3. 原信有 `passageId`，否则 422；
4. 双方无封锁，否则 403；
5. `findSendContext` 非空且 `canSend` 为真，否则 404 / 409；
6. 该原信尚无回信，否则 409；
7. 客户端传入的 `recipientId` / `passageId` 与服务端推导一致，否则 422；
8. 写入草稿。

发送时重复 2–6；任一失败不落库。

### 3.3 Web

- 明信片详情：`canReply` 为真时显示「回信」，否则不显示；
- 写信页支持 `?replyToPostcardId=`：显示“回复某某的明信片”与共途主题，收件人只读，可返回原信；
- 四态、390px 无横向溢出、键盘可完成回信；
- 不显示已读回执、在线状态、回信倒计时或催促。

## 4. 明确不做

- 双城日记的生成、列表、详情（TASK-013）；
- 共途邀请 / 创建 / 拒绝 / 过期；
- 对非共途信的回复；对同一原信的再次回复；
- 撤回已寄出的信、编辑已发送的回信正文；
- 通知、举报、`RESTRICTED` 写入口、角色扩展、后台管理；
- 修改认证、会话、密码、Origin、限流与日志脱敏规则。

## 5. 工作拆分

- [x] `T12-01` 本文档、`specs/05`、`specs/09`、`docs/architecture.md`、`docs/testing.md` 口径。
- [x] `T12-02` RED：单元资格矩阵、集成 9 条、契约字段、E2E、Smoke，并保存失败证据。
- [x] `T12-03` 迁移：两个可空列、自引用外键、检查约束、唯一索引。
- [x] `T12-04` 后端：`domain/reply.ts`、仓储查询、`PostcardService` 校验、DTO、`ErrorCode` 扩展。
- [x] `T12-05` 重新生成 OpenAPI 客户端并更新契约检查。
- [x] `T12-06` Web：详情回信入口与写信页回信模式。
- [x] `T12-07` E2E、Smoke、全量 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 回信草稿

Given 已送达共途信 X 的收件人 B；When `POST /postcards/drafts { body, replyToPostcardId: X }`；Then 201，草稿的 `recipientId = X.senderId`、`passageId = X.passageId`、`replyToPostcardId = X`；客户端传入不一致的 `recipientId` 或 `passageId` 时 422。

### AC-02 · 资格边界

Given 原信在途 / 查看者非参与者 / 原信无共途 / 回复自己的信 / 已回信 / 停泊 / 封锁；Then 分别返回 404 / 404 / 422 / 422 / 409 / 409 / 403，且不创建草稿、不消耗每日额度。

### AC-03 · 发送与落库

Given 合法回信草稿；When 发送；Then 明信片 `status=IN_TRANSIT`、`reply_to_postcard_id` 落库、`deliverAt` 由双方城市距离计算；收件人在送达前读不到正文。

### AC-04 · 唯一与并发

Given 同一原信的两个回信草稿并发发送；Then 只有一封成功，另一封 409 `POSTCARD_ALREADY_REPLIED`；数据库只有一行带该 `reply_to_postcard_id`。

### AC-05 · 接口与隐私

Given `GET /postcards/:id`；Then 收件人看到的已送达共途信 `canReply=true`，寄件人看到 `false`；响应不含 email、坐标、`receptionMode` 或对方角色。

### AC-06 · Web

Given 收件人打开已送达共途信；When 点击回信、填写正文、发送；Then 页面与数据库一致；停泊后入口消失；390px 无横向溢出；键盘可完成。

### AC-07 · 数据库与回归

只有一次新增迁移；空库 `migrate deploy` 可重放；外键、检查约束、唯一索引存在；TASK-001～011 全部测试保持通过；`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke`、`pnpm verify` 实际运行并 exit 0；故障注入后返回非 0 并恢复。

## 7. 开发步骤

1. 文档口径与本任务卡。
2. RED：领域资格矩阵、`postcard-reply` 集成、契约、E2E、Smoke。
3. 迁移与 Prisma Client。
4. 后端回信校验、DTO 与错误码。
5. 生成 OpenAPI 客户端与契约检查。
6. Web 回信入口与写信页。
7. E2E、Smoke、全量回归、失败证明与证据归档。

## 8. 执行记录（实测）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-30（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | `schema.prisma` 与迁移 `20261030120000_add_postcard_reply`；`postcard/domain/reply.ts`；`PostcardService` 回信校验与 `canReply`；`PostcardRepository` / `DraftRepository`；DTO；`ErrorCode.POSTCARD_ALREADY_REPLIED`；Web 详情回信入口与写信页回信模式；契约检查；E2E 与 Smoke |
| 新增 / 更新测试 | 后端单元 19 文件 / 123 用例（新增 1 文件 / 8 用例）；Web 单元 10 文件 / 65 用例（新增 1 条）；集成 12 文件 / 120 用例（新增 1 文件 / 9 用例）；契约 37 条路径（字段新增，路径数不变）；Playwright 24 用例（新增 1 条）；Smoke 21 项（新增 1 项） |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify`；故障注入后再次 `pnpm verify` |
| 通过项 | 全部命令 exit 0；`pnpm verify` 9/9 PASS；证据 `artifacts/verification/TASK-012/final-verify.log`、`artifacts/verification/TASK-012/verify/2026-10-30T10-07-50-445Z` |
| 未通过 / 阻塞 | 首轮集成 2 条失败：回复自己的信期望 422、实现返回 404；封锁接口实际返回 200、测试期望 201。前者新增 `OWN_POSTCARD` 原因并映射 422，后者修正测试期望；复跑通过。无遗留阻塞 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 回信草稿 | 集成：收件人、`passageId`、`replyToPostcardId` 由服务端解析；客户端传第三人或另一共途 422；响应无 email/坐标 | PASS |
| AC-02 资格边界 | 集成：在途/非参与者 404，自己的信/非共途 422，重复回信 409，停泊 409，封锁 403，均不落库 | PASS |
| AC-03 发送与落库 | 集成：`reply_to_postcard_id` 落库，同城 720 分钟，送达前收件人 404，草稿已消费 | PASS |
| AC-04 唯一与并发 | 集成：同一原信并发两封只成功一封（201/409），数据库只有 1 行回信 | PASS |
| AC-05 接口与隐私 | 集成：`canReply` 随送达、停泊/续程、已回信变化；`PATCH` 改绑 422；响应无 email/坐标/接信状态 | PASS |
| AC-06 Web | E2E：A 寄出 → 推进送达 → B 回信 → 推进送达 → A 阅读；390px 无横向溢出；停泊后入口消失（集成） | PASS |
| AC-07 数据库与回归 | `prepare-test-db` 显示 12 次迁移；测试库可重放；`pnpm verify` 9/9 PASS；故障注入后 exit 1 | PASS |

补充说明：

- RED：单元因 `postcard/domain/reply` 不存在失败（`artifacts/verification/TASK-012/red/red-reply-unit.log`）；集成 8 条失败、1 条因字段白名单 422 误通过（`red/red-reply-api.log`）。
- 失败证明：临时让 `alreadyReplied` 恒为 false，`test:integration`、`test:e2e`、`test:smoke` FAIL、`pnpm verify` exit 1；日志 `artifacts/verification/TASK-012/red/verify-failure-proof.log`。恢复后重新运行全量门禁，9/9 PASS。
- 契约：`CreatePostcardDraftDto.replyToPostcardId`、`PostcardDraftResponseDto.replyToPostcardId`、`PostcardDetailDto.passageId/canReply`；显式断言不含 email、坐标、`receptionMode` 或角色。
- 测试基础设施：集成清库沿用既有顺序；本次未新增表，`reset-test-db.mjs` 无需改动。
- 仍未实现：双城日记（TASK-013）、共途邀请/创建、通知、举报、`RESTRICTED` 写入口、角色扩展。

## 9. 下一步

完成 TASK-012 后，再评估 TASK-013 双城日记（MEMORY-02/03）。不自动进入下一任务。
