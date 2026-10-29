# 当前开发任务 · TASK-004

状态：**DONE（TASK-004 已完成并通过门禁，等待下一任务指令）**  
任务名称：**POSTCARD 薄切片：明信片草稿、距离延迟、投递 Worker 与邮局三栏**  
任务类型：P0 邮局 / 明信片 / 异步投递  
优先级：P0  
变更授权：本文件授权范围内；TASK-001/002/003 的验收记录已归档到 `tasks/archive/`。

## 1. 背景与目标

认证（TASK-002）与城市/接信状态（TASK-003）已完成。按 PRD 的 P0 顺序，下一阶段实现 `OFF-01 / OFF-02 / OFF-03`：明信片草稿、发送、按城市距离延迟、邮局的新来信/在途/草稿。

本任务只做**邮局与明信片薄切片**，不实现共途、信友、城市故事、纪念册、通知与审核后台。

核心闭环：

```text
写草稿 → 选择收件人 → 服务端计算 deliverAt → 在途 → 到期 Worker 投递一次
→ 收件人“新来信”可读 → 寄件人仍可查看自己寄出的内容
```

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 收件人来源 | 本阶段使用环境变量 `POSTCARD_DEMO_RECIPIENT_EMAILS` 配置的演示收件人；服务端强制白名单，不开放用户搜索 |
| 每日发送上限 | 每账号滚动 24 小时最多 **10 张成功寄出**；配置项 `POSTCARD_MAX_SENDS_PER_DAY=10`；第 11 张返回 429 |
| 回信 | 本阶段不做；不渲染无实际功能的回信按钮 |
| 通知 | 本阶段不做；Worker 只保证投递状态只变一次，不伪造通知去重 |
| 审核/封锁 | 本阶段不实现举报、封锁、审核后台；`RESTRICTED` 只保留枚举与拒绝正文读取 |
| 技术栈 | 保持 Prisma + Vitest + Playwright；不引入 TypeORM / Docker Compose / Jest |
| 收件人城市 | 发送时冻结双方城市快照；发送后改城市不影响旧信 |
| 正文 | 1–2000 个 Unicode 码点；拒绝全空白；发送后不可修改 |

## 3. 功能范围

### 3.1 数据库

- 新增 `postcard_drafts`：`id`、`owner_id`、`recipient_id?`、`body`、`sent_postcard_id?`、`created_at`、`updated_at`。
- 新增 `postcards`：`id`、`sender_id`、`receiver_id`、`body`、`status`、`origin_city_id`、`destination_city_id`、`sent_at`、`deliver_at`、`delivered_at?`、`idempotency_key?`、`created_at`、`updated_at`。
- 枚举 `PostcardStatus`：`IN_TRANSIT / DELIVERED / RESTRICTED`。
- 约束：正文长度与全空白、`sender_id <> receiver_id`、`deliver_at >= sent_at`、`delivered_at >= deliver_at`；`(sender_id, idempotency_key)` 唯一。
- 索引：`(receiver_id, status, deliver_at)`、`(status, deliver_at)`、`(sender_id, status)`、草稿 `(owner_id, updated_at)`。
- 新增显式迁移；测试清库脚本清理新表并保留 `cities`。

### 3.2 后端接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/postcards/recipients` | 登录；只返回配置允许、状态 OPEN 且已有城市的演示收件人 |
| GET | `/api/v1/post-office/summary` | 登录；三组摘要，不含正文 |
| GET | `/api/v1/postcards/drafts` | 本人未发送草稿 |
| POST | `/api/v1/postcards/drafts` | 创建草稿 |
| GET | `/api/v1/postcards/drafts/:id` | 仅作者读取草稿 |
| PATCH | `/api/v1/postcards/drafts/:id` | 仅作者、未发送 |
| DELETE | `/api/v1/postcards/drafts/:id` | 仅作者、未发送 |
| POST | `/api/v1/postcards/drafts/:id/send` | 原子发送；支持 `Idempotency-Key` |
| GET | `/api/v1/postcards/transit` | 本人寄出的在途信 |
| GET | `/api/v1/postcards/inbox` | 本人已送达的来信 |
| GET | `/api/v1/postcards/:id` | 寄件人可读自己的内容；收件人仅送达后可读 |

规则：

- 未登录 401 `AUTH_REQUIRED`；他人草稿/明信片/未送达详情返回 404 `RESOURCE_NOT_ACCESSIBLE`。
- 延迟：`delayMinutes = min(7200, 720 + ceil(D_km * 60 / 150))`，`deliverAt = sentAt + delayMinutes`，全部服务端 UTC。
- 发送事务内校验发件人、收件人、白名单、接信状态、城市、自我发送与每日上限；写入城市快照。
- 同一草稿或同一幂等键重复发送只产生一张明信片。
- 在途列表、摘要、收件箱不返回正文；收件人详情在送达前 404。

### 3.3 Web

- `/post-office`：新来信、正在路上、草稿三栏；加载/空态/错误态/重试；真实空态。
- `/post-office/compose`：收件人选择、正文编辑、字数提示、保存草稿、寄出确认、失败提示。
- `/postcards/:id`：详情；送达前收件人不可访问；正文只按服务端权限返回。
- 390px 可用、键盘可操作、表单有 label；不显示在线/已读/催促/连续天数。

## 4. 明确不做

- 回信、对话、模板、图片/录音/插画、多媒体。
- 通知、邮件提醒、未读计数、公开已读回执、在线状态。
- 举报、封锁、审核后台、`RESTRICTED` 的实际处置动作。
- 城市故事、世界记忆地图、善意接力。
- 共途、信友、停泊/续程/归档、双城日记、共同手帐、个人记忆。
- 用户搜索、陌生人发现、公开资料页、自建城市。
- 邮箱验证、找回密码、设备会话、账号删除、OAuth。
- TypeORM、Docker Compose、Jest 迁移。
- 二维/三维地图与共途邀请专项测试。

## 5. 工作拆分

- [x] `T4-01` 写入任务卡与 Spec 边界；确认每日上限 10。
- [x] `T4-02` Prisma schema、迁移、测试清库脚本。
- [x] `T4-03` 失败测试：距离/延迟、正文、可见性、草稿、发送、读取、Worker。
- [x] `T4-04` PostcardModule + DeliveryModule + Worker + 全部 API。
- [x] `T4-05` Web 邮局三栏、写信页、详情页、API 客户端。
- [x] `T4-06` 契约、架构、E2E、Smoke、文档同步。
- [x] `T4-07` 执行 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 数据库与迁移

Given 空测试库，When 执行 `db:deploy`，Then 两张表、枚举、索引和检查约束存在；约束拒绝空正文、2001 字符、自我发送与非法时间；清库后 `cities` 保留。

### AC-02 · 草稿

Given 已登录用户，When 创建/读取/修改/删除草稿，Then 仅本人可操作；2001 字符与全空白返回 422；已发送草稿不再出现在列表且不可修改。

### AC-03 · 发送与距离

Given 双方已设置城市且收件人允许接信，When 寄出，Then 服务端生成 `sentAt/deliverAt` 并冻结城市快照；同城 12 小时、最远 120 小时；改城市不影响旧信；重复发送只产生一张；缺城市/自我发送/非白名单/CLOSED/RESTING 被拒绝；第 11 张返回 429。

### AC-04 · 在途保密

Given 明信片仍在途，When 收件人访问摘要、收件箱或详情，Then 任何响应都不含正文，详情为 404；寄件人仍可读取自己的正文；所有响应不含 email、密码或 Session。

### AC-05 · 到期投递

Given 明信片已到期，When Worker 扫描两次或并发扫描，Then 状态只变为 `DELIVERED` 一次，`deliveredAt` 不被覆盖；收件箱恰好出现一封；刷新不回退。

### AC-06 · 邮局页面

Given 已登录用户，When 使用邮局与写信页，Then 三栏状态真实、草稿保存后刷新仍在、寄出后进入在途、收件人提前访问失败、送达后可读；390px 与键盘可用；无在线/已读/催促元素。

### AC-07 · 回归与安全

TASK-001/002/003 的认证、会话轮换、Cookie、Origin、限流、日志脱敏、城市/资料全部保持通过；跨用户访问统一返回 401/404；前端不使用 localStorage/sessionStorage。

### AC-08 · 质量门禁

`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke` 实际运行并通过；`pnpm verify` 退出码 0；故意制造一次非敏感失败时 verify 返回非 0 并恢复。

## 7. 开发步骤

1. 只读检查现有 schema、迁移、测试清库脚本、路由与测试工具。
2. 先写 HTTP 集成失败测试，记录 404 红灯。
3. 迁移与数据模型 → 领域纯函数 → 仓储/服务/控制器。
4. 发送事务、幂等、每日上限与 Worker。
5. 重新生成 OpenAPI 客户端；补充契约、E2E、Smoke。
6. 全量回归、失败证明、文档与证据回写。

## 8. 执行记录（实施后填写）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-28 15:55（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | Prisma `postcard_drafts`/`postcards` 与迁移 `20261028070751_add_postcards`；`PostcardModule`、`DeliveryModule`、`src/worker`、`run-delivery-once`；Web `/post-office`、`/post-office/compose/:id?`、`/postcards/:id`；API client 新方法与类型 |
| 新增/更新测试 | 后端单元 10 文件 / 57 用例；Web 单元 5 文件 / 30 用例；集成 4 文件 / 35 用例；Playwright 15 用例；Smoke 14 项；契约 15 条路径 |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify` |
| 通过项 | 最终 `pnpm verify` 9/9 子门禁 PASS，退出码 0；证据目录 `artifacts/verification/TASK-004/verify/2026-10-28T08-25-27-878Z` |
| 未通过 / 阻塞 | 无 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 数据库与迁移 | 迁移 `20261028070751_add_postcards` 在测试库 `migrate deploy` 成功；检查约束含正文/参与者/时间顺序；集成测试验证 2000/2001 字符与非法发送 | PASS |
| AC-02 草稿 | 创建/读取/修改/删除、跨用户 404、2001 字/全空白 422、已发送草稿 404 与列表排除 | PASS |
| AC-03 发送与距离 | 同城 `deliverAt - sentAt = 720 分钟`；城市快照与发送后改城市不变；重复草稿/幂等键只一封；缺城市/自我/非白名单/RESTING 拒绝；第 11 张 429 | PASS |
| AC-04 在途保密 | 收件人 summary/inbox/transit 无正文，详情 404 `RESOURCE_NOT_ACCESSIBLE`；寄件人可读；响应无 email；390px 写信页 | PASS |
| AC-05 到期投递 | 到期前 0；两次扫描只 1 次；`deliveredAt` 不被第二次覆盖；并发扫描合计 1 次；收件箱恰好一封 | PASS |
| AC-06 邮局页面 | Playwright：草稿保存刷新仍在 → 寄出 → 在途 → 收件人提前 404 → 真实 Worker 送达 → 打开正文；移动端与未登录回跳 | PASS |
| AC-07 回归与安全 | 认证、会话轮换、Cookie、Origin、限流、日志脱敏、城市/资料测试全部通过；架构检查通过 | PASS |
| AC-08 质量门禁 | `pnpm verify` 9/9 PASS（exit 0）；临时跳过接信状态校验后 exit 1，integration FAIL；恢复后重新 PASS | PASS |

补充说明：

- 红灯证据：实现前新增集成测试 9 条因接口 404 失败，日志 `artifacts/verification/TASK-004/red/red-postcards-api.log`。
- 故意失败证明：`artifacts/verification/TASK-004/red/verify-failure-proof.log`；最终日志 `artifacts/verification/TASK-004/final-verify.log`。
- 收件人使用 `POSTCARD_DEMO_RECIPIENT_EMAILS` 白名单；E2E 使用固定虚构邮箱，启动前清空测试库。
- E2E 首轮失败根因：演示邮箱在 Playwright 配置的多个进程中按时间戳生成，注册邮箱与 API 白名单不一致；改为固定虚构邮箱后通过。第二轮失败根因：`getByText('正在路上')` 同时匹配导航描述，改为 `.letter-meta .status-pill` 精确定位后通过。两次失败日志均保留在 `artifacts/verification/TASK-004/e2e-*-run.log`。
- 每日上限默认 10 张/滚动 24 小时，配置 `POSTCARD_MAX_SENDS_PER_DAY`；第 11 张 429，失败不消耗草稿。
- Worker 独立进程 `pnpm --filter @somewhere/api worker`；测试/运维单次扫描 `pnpm --filter @somewhere/api delivery:run-once`。
- `RESTRICTED` 只有枚举与读取拒绝，没有审核写入路径；通知、回信、共途/信友来源均未实现。

## 9. 下一步

等待用户批准下一个业务任务；不自动进入城市故事、共途或纪念册。
