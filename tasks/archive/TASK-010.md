# 当前开发任务 · TASK-010

状态：**DONE（TASK-010 已完成并通过门禁，等待下一任务指令）**

任务名称：**PENPAL-01 切片：双向信友授权与邮局最小接入**

任务类型：P0 关系授权 / 邮局通信来源

优先级：P0

变更授权：本文件授权范围内；TASK-009 验收记录已归档到 `tasks/archive/TASK-009.md`。

## 1. 背景与目标

TASK-009 已完成最小封锁，并将 `BlockPolicy` 作为公开入口导出。PRD 的 `PAS-05` 与 `specs/10-penpals.md` 要求信友必须双方分别同意、任一方可撤销、封锁优先级最高；信友不是完成共途后的自动奖励。

本任务只做**信友授权闭环 + 邮局最小接入**：

```text
两人有至少一段已完成共途
→ A 表达持续通信意愿，B 看到请求
→ B 同意后双方成为 ACTIVE 信友
→ 有效信友出现在双方邮局收件人中，可以正常寄信
→ 任一方撤销后，新通信停止，历史不删除
→ 任一方向封锁优先于信友；解除封锁后按双方原许可恢复
```

仍然不实现共途邀请/创建、信友发起新共途、纪念册、通知、举报、`RESTRICT` 与角色扩展。

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 数据 | 新增 `penpal_consents` 表，复合主键 `(owner_id, counterpart_id)`；只新增，不改既有表 |
| 记录方式 | 两条单方同意记录；聚合状态由纯函数派生，不落库为单一布尔值 |
| 同意状态 | `ALLOW / REVOKED`；不新增 `PAUSED`，暂停沿用全局 `receptionMode=RESTING` |
| 请求资格 | 双方必须存在至少一段 `completed_at` 非空的共途；归档但曾完成也算 |
| 无资格 / 目标不存在 | 统一 404 `RESOURCE_NOT_ACCESSIBLE`，不泄露账号是否存在 |
| 自我请求 | 422 `VALIDATION_ERROR` |
| 重复同意 | 幂等 200，不新增行、不改变原 `consented_at` |
| 撤销 | 只写本人记录；重复撤销 204 幂等 |
| 拒绝收到的请求 | 使用 `DELETE /penpals/:counterpartId/consent`，写入本人 `REVOKED`，不新增独立拒绝端点 |
| 撤销后再同意 | 对方原 `ALLOW` 继续有效；本人重新 `ALLOW` 后恢复 `ACTIVE` |
| 封锁 | 任一方向封锁时信友不生效、列表隐藏、请求 403；不修改同意行 |
| 邮局 | 有效信友加入现有收件人解析层；不新增 `penpal_id` 字段或单独写信入口 |
| 日期字段 | 响应不返回成为信友或请求日期；排序由服务端完成 |
| 信友暂停 | 本任务不实现信友专属暂停 |
| 角色 | 不修改 `USER | ADMIN`；`ADMIN` 不能读取他人的信友关系 |

## 3. 功能范围

### 3.1 数据库

新增迁移（仅新增）：

- 枚举 `PenpalConsentState { ALLOW, REVOKED }`；
- `penpal_consents`：
  - `owner_id UUID NOT NULL` → `users(id)` `ON DELETE CASCADE`
  - `counterpart_id UUID NOT NULL` → `users(id)` `ON DELETE CASCADE`
  - `consent_state PenpalConsentState NOT NULL DEFAULT 'ALLOW'`
  - `consented_at TIMESTAMPTZ(3) NULL`
  - `revoked_at TIMESTAMPTZ(3) NULL`
  - `PRIMARY KEY (owner_id, counterpart_id)`
  - `CHECK (owner_id <> counterpart_id)`
  - `CHECK ((consent_state = 'ALLOW' AND consented_at IS NOT NULL AND revoked_at IS NULL) OR (consent_state = 'REVOKED' AND revoked_at IS NOT NULL))`
  - `INDEX (counterpart_id, consent_state)`

不新增 `reason`、`note`、关系 ID 或公开字段。

### 3.2 后端接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/penpals` | 返回 `active / incoming / outgoing` 三组；只含 `counterpart{id,nickname,city}` |
| POST | `/api/v1/penpals/consent` | body `{ counterpartId }`；记录本人意愿；幂等 |
| DELETE | `/api/v1/penpals/:counterpartId/consent` | 撤销本人意愿或关闭收到的请求；204 幂等 |

规则：

- 未登录 401 `AUTH_REQUIRED`；
- 自己 422；无资格/目标不存在 404；封锁 403 `CONTACT_BLOCKED`；
- 只返回本人视角的关系，不返回“谁封锁了我”、对方撤销原因或同意方向；
- 响应与日志不出现 email、会话值、坐标、角色或信件正文。

### 3.3 邮局接入

| 位置 | 变化 |
|---|---|
| `GET /postcards/recipients` | 默认收件人 = 演示白名单 ∪ 当前有效信友；仍排除被封锁者、非 `OPEN`、无城市账号 |
| `POST /postcards/drafts` | 指向有效信友时允许；撤销/封锁后按现有错误拒绝 |
| `PATCH /postcards/drafts/:id` | 同上 |
| `POST /postcards/drafts/:id/send` | 发送时重新解析允许收件人；每日额度、距离延迟、幂等与在途保密不变 |
| 共途发送 | 保持 TASK-008/009 行为，不因信友改动 |

不新增 `postcard_drafts.penpal_id`，不改变发送事务结构。

### 3.4 共途接入

- `PassageReader` 新增只读方法 `hasCompletedPassageWith(userId, counterpartId)`；只回答资格，不暴露主题、正文或事件。
- `PassageModule` 不得依赖 `PenpalModule`，避免循环依赖。
- 共途 DTO 不增加信友字段；Web 单独读取 `/penpals`。

### 3.5 Web

- `/penpals`：已建立 / 收到的请求 / 我发出的请求；加载、空、错误、可用四态；390px 与键盘可用。
- `/passages`：增加信友入口链接；**不新增第五个主导航项**。
- `/passages/:id`：`completedAt` 非空时显示信友区域；支持请求、等待、同意、撤销；已封锁时不显示入口。
- `/post-office/compose`：收件人提示改为“演示白名单和你的信友；不提供公开用户搜索”。
- 不显示成为信友日期、通信次数、排名、已读状态或“对方拒绝了你”。

## 4. 明确不做

- 共途邀请/创建、接受流程与邀请专项测试；
- 信友发起新共途（PAS-06）；
- 信友专属 `PAUSED` 状态与暂停端点；
- 回信、通知、未读提示、催促；
- 纪念册：双城日记、共同手帐、个人记忆；
- 举报、审核处置、`RESTRICT`、封锁后隐藏历史；
- `MODERATOR`、`CURATOR`、后台用户与角色管理；
- 用户搜索、公开用户目录、公开资料页、按 email 查找；
- `postcard_drafts.penpal_id` 或单独的“信友写信”页面；
- 邮箱验证、找回密码、设备会话、账号删除、OAuth；
- 二维/三维地图实现与地图视觉方案；
- CI 流水线、付费服务、新基础设施或大型依赖。

## 5. 工作拆分

- [x] `T10-01` 任务卡与 `specs/10`、`specs/05`、`specs/12`、`docs/architecture.md`、`docs/testing.md`、`specs/00-index.md` 口径。
- [x] `T10-02` RED：单元、集成、契约、架构、E2E、Smoke 失败测试与证据。
- [x] `T10-03` 迁移：`penpal_consents`、枚举、外键、检查约束、索引。
- [x] `T10-04` `PenpalModule`：领域纯函数、`PenpalRepository`、`PenpalService`、`PenpalController`、`PenpalPolicy`、`PenpalReader`。
- [x] `T10-05` 共途资格：`PassageReader.hasCompletedPassageWith` 与仓储查询。
- [x] `T10-06` 邮局：收件人解析层合并有效信友；草稿与发送回归。
- [x] `T10-07` 重新生成 OpenAPI 客户端并更新契约检查。
- [x] `T10-08` Web：`/penpals`、共途入口、详情信友区域、写信页文案、四态与移动端。
- [x] `T10-09` E2E、Smoke、全量 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 同意与幂等

Given A/B 有一段已完成共途；When A `POST /penpals/consent { counterpartId: B }`；Then 200，`penpal_consents` 新增 A→B `ALLOW`；A 的 `outgoing` 出现 B，B 的 `incoming` 出现 A，双方 `active` 为空；重复调用仍 200，行数与 `consented_at` 不变。

### AC-02 · 双向生效

Given A 已同意；When B 同意；Then 双方 `GET /penpals.active` 均包含对方；`PenpalPolicy.canContinueContact` 双向为 true；响应不含 email、角色、对方同意状态或日期。

### AC-03 · 撤销与拒绝

Given 双方 `ACTIVE`；When A `DELETE /penpals/B/consent`；Then 204，A 行为 `REVOKED`，B 的 `active` 不再包含 A，`canContinueContact` 为 false；重复 DELETE 仍 204；共途、明信片、草稿数量不变。

Given B 收到 A 的请求；When B DELETE；Then A 的 `outgoing` 为空，B 的 `incoming` 为空，不产生 `ACTIVE`。

### AC-04 · 封锁优先

Given 双方 `ACTIVE`；When A 封锁 B；Then 双方列表隐藏该关系；`POST consent` 返回 403 `CONTACT_BLOCKED`；同意行不被删除；When A 解除封锁；Then 若双方仍为 `ALLOW`，关系恢复 `ACTIVE`；反向封锁同样成立。

### AC-05 · 资格与防枚举

Given 无已完成共途（不存在、仅 `ACTIVE`、非参与者）；When `POST consent`；Then 404 `RESOURCE_NOT_ACCESSIBLE`，不写行；Given 自己；Then 422；Given `ARCHIVED` 但 `completedAt` 非空；Then 允许；错误文案不区分“用户不存在”和“无资格”，不返回 email。

### AC-06 · 邮局

Given 双方 `ACTIVE`；When A 打开写信页；Then 收件人包含 B；When A 向 B 寄出；Then 201，明信片按城市距离延迟；When A 撤销或封锁；Then B 不再出现在可寄收件人中，新建草稿按现有 404/403 拒绝。

### AC-07 · Web 与数据库

Given A 打开已完成共途；Then 可请求成为信友并看到等待状态；When B 打开 `/penpals`；Then 可同意；双方看到已建立；A 撤销后 B 的 active 为空；390px 无横向溢出、键盘可用；不显示拒绝原因或日期。

数据库只有一次新增迁移；空库 `migrate deploy` 可重放；`prisma migrate status` 无待执行；复合主键、外键、自指检查、状态时间检查与索引存在；既有表不受影响。

### AC-08 · 回归与安全

TASK-001～009 全部测试保持通过；认证、邮局、故事、地图、共途状态机、封锁行为不回退；新接口匿名 401、外站 Origin 403、`ADMIN` 不能读取他人信友关系；响应/日志无 email、密码、坐标或正文；`pnpm verify` 9/9 PASS、exit 0；故障注入返回非 0 并恢复。

## 7. 开发步骤

1. 文档口径与本任务卡。
2. RED：`penpal-policy` 单元、`penpals` 集成、契约、架构、E2E、Smoke。
3. 迁移与 Prisma Client。
4. `PenpalModule` 与 `PenpalPolicy` / `PenpalReader`。
5. 共途资格查询与邮局解析层接入。
6. 重新生成 OpenAPI 客户端与契约检查。
7. Web 信友页、共途入口与写信页文案。
8. E2E、Smoke、全量回归、失败证明与证据归档。

## 8. 执行记录（实测）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-30（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | `prisma/schema.prisma` 与 `20261030100000_add_penpal_consents`；新增 `PenpalModule`（domain/repository/service/controller/policy/reader/DTO）；`PassageReader.hasCompletedPassageWith` 与仓储查询；`PostcardService.allowedRecipientIds`/`listRecipients` 合并有效信友；`AppModule`、`PostcardModule` 依赖；生成客户端；Web `/penpals`、共途入口、详情信友区域、写信页文案与样式 |
| 新增/更新测试 | 后端单元 17 文件 / 109 用例（新增 12）；Web 单元 9 文件 / 55 用例（新增 6）；集成 10 文件 / 102 用例（新增 15）；契约 35 条路径（新增 3）；Playwright 22 用例（新增 1）；Smoke 19 项（新增 1） |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify`；故障注入后再次 `pnpm verify` |
| 通过项 | 全部命令 exit 0；`pnpm verify` 9/9 PASS；最终证据 `artifacts/verification/TASK-010/verify/2026-10-30T06-25-41-779Z`、`artifacts/verification/TASK-010/final-verify.log` |
| 未通过 / 阻塞 | 无。首轮 E2E 因“还没有信友”同时匹配空态标题与描述失败，已改为精确文本后复跑通过；首轮 Smoke 因收件人同时属于演示白名单，无法区分信友来源，已改用非白名单第三账号后通过 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 同意与幂等 | 集成：单方同意只进入 outgoing/incoming；重复同意 200 且行数、`consentedAt` 不变；并发同意不产生重复行 | PASS |
| AC-02 双向生效 | 集成：双方同意后 ACTIVE；响应无 email、接信状态或同意时间 | PASS |
| AC-03 撤销与拒绝 | 集成：撤销 204、REVOKED、列表清空；拒绝写入 REVOKED 且 `consentedAt` 为空；撤销后重新同意恢复 ACTIVE；共途/草稿/明信片数量不变 | PASS |
| AC-04 封锁优先 | 集成与 E2E：正向/反向封锁隐藏列表、请求 403、撤销仍可用、解除后恢复；故障注入证明列表过滤被门禁捕获 | PASS |
| AC-05 资格与防枚举 | 集成：自我 422；不存在/仅 ACTIVE/非参与者统一 404；归档但曾完成允许；第三方与 ADMIN 看不到他人关系 | PASS |
| AC-06 邮局 | 集成：有效信友进入收件人并可寄信；撤销后 404、封锁后 403；`RESTING` 信友被列表过滤但同意记录不变；Smoke 使用非白名单账号验证加入/移出 | PASS |
| AC-07 Web 与数据库 | E2E：完成共途→请求→同意→ACTIVE→写信收件人→封锁→解除→撤销；390px 无横向溢出、入口可聚焦；第 10 次迁移应用，约束与索引存在 | PASS |
| AC-08 回归与安全 | 单元 109、Web 55、集成 102、契约 35、E2E 22、Smoke 19 全部通过；认证/邮局/故事/地图/共途/封锁未回退；响应无 email/坐标/会话值；外站 Origin 403 | PASS |

补充说明：

- RED：实现前单元因 `penpal/domain/penpal-policy` 不存在失败；集成新增 15 条中 14 条因 `/penpals` 404 失败、1 条数据库约束用例通过（`artifacts/verification/TASK-010/red/red-penpal-unit.log`、`red/red-penpal-api.log`）。
- 失败证明：临时让 `PenpalService.list` 忽略封锁过滤，`test:integration` 与 `test:e2e` FAIL、`pnpm verify` exit 1；日志 `artifacts/verification/TASK-010/red/verify-failure-proof.log`。恢复后重新运行全量门禁，9/9 PASS。
- 数据库：`prepare-test-db` 显示 10 次迁移，`add_penpal_consents` 已应用；未运行生产迁移。
- 契约同步：新增 3 条路径；`PenpalCounterpartDto` 显式排除 email、角色、接信状态、坐标与同意时间。
- 测试基础设施：集成/E2E 清库加入 `penpal_consents`；`seedPassage` 支持 `COMPLETED` 与“已完成后再归档”；架构白名单加入 `penpal-policy.service`、`penpal-reader.service`。
- 仍未实现：共途邀请/创建、信友发起新共途、信友专属暂停、通知、纪念册、举报、`RESTRICT`、角色扩展。

## 9. 下一步

完成 TASK-010 后，再评估共途邀请/创建（PAS-01）或个人记忆（MEM-02）。不自动进入下一任务。
