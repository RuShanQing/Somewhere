# 当前开发任务 · TASK-009

状态：**DONE（TASK-009 已完成并通过门禁，等待下一任务指令）**

任务名称：**SAFETY-BLOCK 切片：最小封锁与通信拦截**

任务类型：P0 安全 / 关系拒绝

优先级：P0

变更授权：本文件授权范围内；TASK-008 验收记录已归档到 `tasks/archive/TASK-008.md`。

## 1. 背景与目标

TASK-008 已完成共途通信许可接入邮局，但系统仍没有用户级封锁能力。PRD、`specs/12-safety-and-moderation.md` 与 `specs/10-penpals.md` 都要求封锁优先于共途、信友和其他通信授权。

本任务只做**最小封锁闭环**：

```text
A 封锁 B
→ A、B 的收件人列表互不出现
→ 新建/修改草稿不能指向被封锁者
→ 已有草稿发送被拒绝，且不创建明信片、不消耗草稿与每日额度
→ 共途详情 permissions.canSend 变为 false
→ 带 passageId 的发送返回 403，而不是 409
→ A 解除封锁后，新的通信能力恢复
```

**仍然不实现举报、审核处置、`RESTRICT`、信友、纪念册和通知。** `BlockPolicy` 作为公开入口导出，供后续 `PenpalModule` 消费。

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 数据 | 新增 `user_blocks` 表，`blocker_id + blocked_id` 复合主键；只新增，不改既有表 |
| 封锁方向 | 记录是单向的（谁封锁谁），但**通信拦截对双方生效** |
| 自我封锁 | 422 `VALIDATION_ERROR` |
| 目标不存在 | 404 `RESOURCE_NOT_ACCESSIBLE`，不泄露用户是否存在 |
| 重复封锁 | 幂等，返回 200，不重复写行 |
| 解除封锁 | 只允许解除本人发起的封锁；重复解除 204 幂等 |
| 收件人列表 | 默认收件人与共途收件人都排除被封锁者 |
| 草稿 | 新建/修改草稿指向被封锁者返回 403 `CONTACT_BLOCKED` |
| 发送 | 无 passageId 与有 passageId 都在写入前检查封锁；返回 403，不落库、不消耗草稿/额度 |
| 共途详情 | 封锁后 `permissions.canSend=false`；不改变任何 `passage_participants.consent_state` |
| 已送达历史 | **本轮不改变已送达信件的读取权**；封锁只阻止新的通信行为，不删除历史 |
| 信友 | 不实现；`BlockPolicy` 先导出，TASK-010 再接入 |
| 举报 / RESTRICT | 不实现 |
| 角色 | 不修改 `USER | ADMIN`；不需要角色变更 |

## 3. 功能范围

### 3.1 数据库

新增迁移（仅新增）：

- `user_blocks(id? 不新增，使用复合主键)`：
  - `blocker_id UUID NOT NULL` → `users(id)` `ON DELETE CASCADE`
  - `blocked_id UUID NOT NULL` → `users(id)` `ON DELETE CASCADE`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `PRIMARY KEY (blocker_id, blocked_id)`
  - `CHECK (blocker_id <> blocked_id)`
  - `INDEX (blocked_id, created_at)`

不新增 `reason`、`note` 或公开举报字段；封锁不需要理由。

### 3.2 后端接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/safety/blocks` | 我发起的封锁列表；返回 `userId/nickname/blockedAt`，不含 email |
| POST | `/api/v1/safety/blocks` | body `{ userId }`；封锁；幂等 |
| DELETE | `/api/v1/safety/blocks/:userId` | 解除本人发起的封锁；204 幂等 |

规则：

- 未登录 401 `AUTH_REQUIRED`；
- 自己封锁自己 422 `VALIDATION_ERROR`；
- 目标不存在 404 `RESOURCE_NOT_ACCESSIBLE`；
- 重复封锁 200，不新增行；
- 解除不存在或不属于本人的封锁 204，不泄露是否存在；
- 列表只返回本人发起的封锁，不返回“谁封锁了我”；
- 响应与日志不出现 email、会话值、坐标或用户私人内容。

### 3.3 邮局接入

| 位置 | 变化 |
|---|---|
| `GET /postcards/recipients` | 默认白名单与共途收件人都排除被封锁者 |
| `POST /postcards/drafts` | 收件人为被封锁者时 403 `CONTACT_BLOCKED`；共途分支同样检查 |
| `PATCH /postcards/drafts/:id` | 改收件人为被封锁者时 403，不落库 |
| `POST /postcards/drafts/:id/send` | 发送前检查封锁；403，不创建明信片、不消耗草稿、不消耗每日额度 |
| 共途发送 | 先判封锁 403，再判 `canSend` 409，封锁优先 |
| 在途/收件箱/详情 | 本轮不改变；已送达历史仍按原权限可读 |

### 3.4 共途接入

- `PassageModule` 依赖 `SafetyModule.BlockPolicy`。
- `PassageService` 列表/详情在计算 `permissions.canSend` 时叠加封锁判断。
- `PostcardService` 在共途发送上下文中直接调用 `BlockPolicy`；`PassageReader` 不暴露封锁方向。
- 封锁不修改 `passage_participants`，解除后原有许可状态恢复生效。
- `PassageSummaryDto.counterpart` 增加 `id`，供 Web 封锁入口使用；这是显式契约变化。

### 3.5 Web

- `/postcards/:id`：对寄件人/收件人显示“封锁这位用户”；内联确认；封锁后提示并提供返回邮局/设置。
- `/passages/:id`：对参与者显示“封锁对方”；使用 `counterpart.id`；不显示对方是否封锁了你。
- `/settings`：新增“已封锁的用户”区域，列出昵称与时间，可解除封锁。
- 所有页面保持 loading / empty / error / ready 四态、390px 与键盘可用。
- 不显示封锁原因、不显示“对方封锁了你”、不提供用户搜索。

## 4. 明确不做

- 举报、举报队列、证据读取、审核处置、`RESTRICT`；
- 封锁后隐藏/删除已送达信件或历史记录；
- 信友、纪念册、共途邀请、回信、通知；
- 角色扩展、`MODERATOR`、`CURATOR`、后台用户管理；
- 用户搜索、公开用户目录、按 email 查找；
- 封锁原因、申诉、自动过期；
- 修改 TASK-004/005/007/008 的延迟公式、审核状态机或在途保密规则。

## 5. 工作拆分

- [x] `T9-01` 任务卡与 `specs/05`、`specs/09`、`specs/12`、`docs/architecture.md`、`docs/testing.md`、`specs/00-index.md` 口径。
- [x] `T9-02` RED：单元、集成、契约、E2E、Smoke 失败测试与证据。
- [x] `T9-03` 迁移：`user_blocks`、外键、检查约束、索引。
- [x] `T9-04` `SafetyModule`：`BlockRepository`、`BlockPolicy`、`SafetyService`、`SafetyController`。
- [x] `T9-05` 邮局：收件人、草稿、发送、共途分支接入封锁。
- [x] `T9-06` 共途：`canSend` 叠加封锁，`counterpart.id` 契约。
- [x] `T9-07` 重新生成 OpenAPI 客户端并更新契约检查。
- [x] `T9-08` Web：明信片详情、共途详情、设置页封锁列表与解除。
- [x] `T9-09` E2E、Smoke、全量 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 封锁与解除

Given 已登录用户 A 和目标 B；When `POST /safety/blocks { userId: B }`；Then 200，`user_blocks` 新增一行；重复调用仍 200 且只有一行；When `GET /safety/blocks`；Then 只返回 A 发起的封锁，字段无 email；When `DELETE /safety/blocks/B`；Then 204，行删除；重复解除仍 204。

Given 自己封锁自己；Then 422。Given 目标不存在；Then 404。Given 未登录；Then 401。

### AC-02 · 邮局拦截

Given A 封锁 B；When A 或 B 获取收件人列表；Then 对方不出现。When 新建/修改草稿指向对方；Then 403 `CONTACT_BLOCKED`，不落库。When 发送已有草稿；Then 403，`postcards` 不新增，草稿仍可用，每日额度不变。

Given A 解除封锁；When 重新获取收件人/发送；Then 按原白名单或共途许可恢复。

### AC-03 · 共途拦截

Given A/B 有一段 `ACTIVE` 且双方 `ALLOW` 的共途；When A 封锁 B；Then A 的共途详情 `permissions.canSend=false`；When 发送绑定该共途的草稿；Then 403 `CONTACT_BLOCKED`，不是 409；`passage_participants` 不变。When A 解除封锁；Then `canSend=true`，发送恢复。

### AC-04 · 历史与数据

封锁不删除明信片、草稿、共途或事件；已送达信件的读取权不变；解除封锁后不自动新增任何通信记录。

### AC-05 · Web

Given A 打开与 B 相关的明信片或共途详情；When 点击封锁并确认；Then 页面显示已封锁状态；When 打开设置；Then 看到 B 并可解除；390px 与键盘可用；不显示“对方封锁了你”或封锁原因。

### AC-06 · 数据库

只有一次新增迁移；空库 `migrate deploy` 可重放；`prisma migrate status` 无待执行；复合主键、外键、`blocker_id <> blocked_id` 检查与索引存在；既有行不受影响。

### AC-07 · 回归与安全

TASK-001～008 全部测试保持通过；TASK-004/008 的邮局行为、TASK-007 的共途状态机、TASK-005/006 的故事与地图不回退；响应/日志无 email、坐标、正文或会话值；外站 Origin 403。

### AC-08 · 质量门禁

`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke`、`pnpm verify` 实际运行并通过，退出码 0；故意制造一次非敏感失败时返回非 0 并恢复。

## 7. 开发步骤

1. 文档口径与本任务卡。
2. RED：`block-policy` 单元、`safety-blocks` 集成、契约、E2E、Smoke。
3. 迁移与 Prisma Client。
4. `SafetyModule` + `BlockPolicy`。
5. 邮局与共途接入。
6. 重新生成 OpenAPI 客户端与契约检查。
7. Web 封锁入口与设置页。
8. E2E、Smoke、全量回归、失败证明与证据归档。

## 8. 执行记录（实测）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-29（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | `prisma/schema.prisma` 与 `20261029100000_add_user_blocks`；新增 `SafetyModule`、`SafetyController`、`SafetyService`、`BlockRepository`、`BlockPolicy` 与纯领域策略；`PostcardService` 收件人/草稿/发送接入封锁；`PassageService` 叠加封锁并增加 `counterpart.id`；`AppError.CONTACT_BLOCKED`；`AppModule`、模块依赖、架构白名单；生成客户端；Web 明信片/共途/设置页封锁与解除、错误文案和样式 |
| 新增/更新测试 | 后端单元 16 文件 / 97 用例（新增 5）；Web 单元 8 文件 / 49 用例（新增 1）；集成 9 文件 / 87 用例（新增 7）；契约 32 条路径（新增 2）；Playwright 21 用例（新增 1）；Smoke 18 项（新增 1） |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify`；故障注入后再次 `pnpm verify` |
| 通过项 | 全部命令 exit 0；`pnpm verify` 9/9 PASS；最终证据目录 `artifacts/verification/TASK-009/verify/2026-10-29T13-45-48-601Z` |
| 未通过 / 阻塞 | 无。E2E 首轮因两个 status 元素与「前往设置」链接导致定位歧义失败，已修正定位并复跑通过 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 封锁与解除 | 集成：封锁 200、重复封锁仍一行且时间不变；列表只返回本人主动封锁且无 email；解除 204 且重复解除幂等；匿名 401、自封锁 422、目标不存在 404 | PASS |
| AC-02 邮局拦截 | 集成：默认收件人排除被封锁者；新建/修改指向被封锁者 403；已有草稿发送 403 且不写 postcards；解除后白名单恢复；反向封锁仍发送 403 | PASS |
| AC-03 共途拦截 | 集成：封锁后 `canSend=false`、发送 403 而非 409，参与者行不变；解除后 `canSend=true` 且发送 201；`counterpart.id` 存在且无 email/坐标 | PASS |
| AC-04 历史与数据 | 集成：封锁后草稿与共途仍存在；已送达历史不删除；数据库检查确认参与者未改；无自动通信记录 | PASS |
| AC-05 Web | E2E：共途寄出 → 封锁 → 写信入口消失 → 设置解除 → 恢复；390px 无横向溢出；不显示对方是否封锁自己 | PASS |
| AC-06 数据库 | `prisma migrate deploy` 应用第 9 次迁移；测试库重放成功；复合主键、外键、非自封锁检查与索引存在；无既有表修改 | PASS |
| AC-07 回归与安全 | 单元 97、集成 87、契约 32、E2E 21、Smoke 18 全部通过；TASK-001～008 行为未回退；响应无 email/坐标/会话值 | PASS |
| AC-08 质量门禁 | `pnpm verify` 9/9 PASS、exit 0；注入单向封锁缺陷后 `test:integration` FAIL、`pnpm verify` exit 1，恢复后重新 PASS | PASS |

补充说明：

- RED：实现前单元因 `safety/domain/block-policy` 不存在失败；集成 7/7 因 `/safety/blocks` 404 失败。
- 失败证明：临时把 `BlockRepository.findBetween` 改为只检查单向封锁，`test:integration` FAIL、`pnpm verify` exit 1；日志 `artifacts/verification/TASK-009/red/verify-failure-proof.log`。该注入使反向封锁仍能发送；E2E 与 Smoke 未覆盖该方向而仍 PASS，说明集成层发现了旁路遗漏。
- 契约同步：`PassageCounterpartDto` 新增 `id`，这是 TASK-009 的显式契约变化；原有 email/坐标/接信状态排除断言未删除。
- 数据库：`prepare-test-db` 显示 9 次迁移且 `add_user_blocks` 已应用；未运行生产迁移。
- 仍未实现：举报、完整审核处置、`RESTRICT`、封锁后隐藏历史、信友、纪念册、通知、角色扩展。

## 9. 下一步

完成 TASK-009 后，进入双向信友（`PenpalModule`），并让 `PenpalPolicy` 消费 `BlockPolicy`。不自动进入下一任务。
