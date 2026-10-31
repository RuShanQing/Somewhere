# 当前开发任务 · TASK-013

状态：**DONE（TASK-013 已完成并通过门禁，等待下一任务指令）**

任务名称：**MEMORY-02/03 切片：双城日记生成、列表与只读双页**

任务类型：P0 纪念册 / 私人记忆

优先级：P0

变更授权：本文件授权范围内；TASK-012 验收记录已归档到 `tasks/archive/TASK-012.md`。

## 1. 背景与目标

`specs/11-memories.md` 已确认双城日记的形态与生成条件：一段共途内，一封原信和它的回信都已 `DELIVERED`，形成一张只读双页；`left = 被回信的原信`，`right = 回信`；同一段共途的多次交换形成多页，不向同一页追加。

TASK-012 已补齐 `replyToPostcardId`，但仓库中仍没有 `diary_pages`、日记生成、列表与详情。本任务只做：

```text
两封均已送达
→ Worker 幂等生成一页 diary_pages
→ 仅双方参与者可以读取
→ /memories 看到页面列表（无正文）
→ /memories/diaries/:id 只读双页（有正文）
```

不实现共同手帐、公开/分享/导出、通知、举报、邀请与角色扩展。

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 形态 | 册（共途）/ 页（一次交换）/ 左右（原信与回信） |
| 生成条件 | `right.replyToPostcardId = left.id`、两封均 `DELIVERED`、同共途、不同作者 |
| 生成方 | Worker 组合根在投递后调用；不提供 HTTP 创建 |
| 幂等 | 唯一键 `(postcard_left_id, postcard_right_id)` + 跳过重复 |
| 读取 | 仅该页两封的收发者；第三人、`ADMIN`、非法 UUID 统一 404 |
| 受限 | 任一封变为 `RESTRICTED` 或不再是 `DELIVERED` 时，列表隐藏、详情 404 |
| 关系变化 | 归档 / 完成 / 停泊 / 撤销信友不删除、不隐藏已形成页面 |
| 封锁 | 不隐藏已形成页面（与已送达信件读取权一致） |
| 列表 | 只返回元数据，不返回正文 |
| 正文 | 只存于 `postcards`，`diary_pages` 只存引用，不复制 |
| 删除 | 本阶段不提供删除、软删除或 `hidden_at` |

## 3. 功能范围

### 3.1 数据库

新增迁移（仅新增表）：

- `diary_pages`：
  - `id UUID PRIMARY KEY`
  - `passage_id UUID NOT NULL` → `passages(id)` `ON DELETE RESTRICT`
  - `postcard_left_id UUID NOT NULL` → `postcards(id)` `ON DELETE RESTRICT`
  - `postcard_right_id UUID NOT NULL` → `postcards(id)` `ON DELETE RESTRICT`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `CHECK (postcard_left_id <> postcard_right_id)`
  - `UNIQUE (postcard_left_id, postcard_right_id)`
  - `INDEX (passage_id, created_at DESC)`

不新增 `visibility`、`is_public`、`body`、`status` 或软删除字段。

### 3.2 后端接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/memories/diaries` | 我有权阅读的页面列表；`limit` 1–50 默认 20，`offset` 默认 0；只含元数据 |
| GET | `/api/v1/memories/diaries/:id` | 单页详情；仅参与者且两封均有效时返回正文 |

规则：

- 未登录 401 `AUTH_REQUIRED`；
- 非参与者、页面不存在、非法 UUID、任一封受限：404 `RESOURCE_NOT_ACCESSIBLE`；
- 列表按 `created_at DESC, id DESC`；响应不含 email、userId、ownerId、坐标；
- 不提供 `POST/PATCH/DELETE`；
- 生成不由 HTTP 触发。

### 3.3 跨模块接口

- `PostcardModule` 导出 `PostcardReader`：
  - `listDiaryCandidates(limit)`：只返回 `{ replyPostcardId, targetPostcardId, passageId }`；
  - `readDeliveredPair(viewerId, leftId, rightId)`：仅当两封均 `DELIVERED`、引用与参与者关系成立、查看者是收发者时返回窄快照（正文、时间、昵称、城市）。
- `PassageModule` 的 `PassageReader` 增加 `listParticipantContexts(userId)`：只返回 `{ id, topic }`。
- `MemoryModule` 单向依赖 `PostcardModule` 与 `PassageModule`；`PostcardModule` 不得反向依赖 `MemoryModule`。

### 3.4 Web

- `/memories` 的“双城日记”区块：加载 / 空 / 错误 / 列表；卡片显示共途主题、城市对、两封日期；
- 新增 `/memories/diaries/:id`：桌面左右双页、移动上下堆叠；只读正文、时间与城市；
- 四态、390px 无横向溢出、键盘可用；
- 不显示编辑、公开、分享、导出、评论、点赞。

## 4. 明确不做

- 共同手帐、条目版本、媒体上传（P1）；
- 日记删除、软删除、公开、分享、导出、搜索他人日记；
- 手动创建、追加、合并、编辑页面；
- `source_type/source_id`、引用个人记忆；
- 通知、举报、`RESTRICTED` 写入口、角色扩展；
- 共途邀请/创建、地图渲染；
- 修改认证、会话、密码、邮局发送与回信规则。

## 5. 工作拆分

- [x] `T13-01` 任务卡、`specs/11`、`specs/00-index.md`、`docs/architecture.md`、`docs/testing.md` 口径。
- [x] `T13-02` RED：配对纯函数、生成幂等、列表/详情权限、契约、E2E、Smoke。
- [x] `T13-03` 迁移：`diary_pages`、外键、检查、唯一键、索引；清库顺序。
- [x] `T13-04` `PostcardReader`、`PassageReader.listParticipantContexts`、`MemoryRepository`、`MemoryService`、`DiariesController`。
- [x] `T13-05` Worker 与 `run-delivery-once` 接入生成。
- [x] `T13-06` 重新生成 OpenAPI 客户端并更新契约检查。
- [x] `T13-07` Web：`/memories` 列表与 `/memories/diaries/:id`。
- [x] `T13-08` E2E、Smoke、全量 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 生成

Given 同一共途内 A 的原信与 B 的回信都已 `DELIVERED`；When Worker 运行；Then 恰好生成一页，`left` 是原信、`right` 是回信；只有一封送达时不生成；Worker 重试或并发扫描不重复。

### AC-02 · 列表

Given 参与者 A；When `GET /memories/diaries`；Then 只返回 A 参与的页面，字段只含主题、城市对、两封日期与 `createdAt`，不含正文、email、userId、坐标；第三人列表为空。

### AC-03 · 详情

Given 参与者 A；When `GET /memories/diaries/:id`；Then 返回左右两封正文与时间；B 同样可读；第三人、`ADMIN`、非法 UUID 404。

### AC-04 · 受限与关系变化

Given 任一封变为 `RESTRICTED`；Then 列表隐藏、详情 404；When 共途归档 / 完成 / 停泊或信友撤销；Then 页面仍可读。

### AC-05 · 数据库

只有一次新增迁移；唯一键、外键、自指检查与索引存在；空库可重放；同一对卡片不能重复；`postcard_left_id = postcard_right_id` 被拒绝。

### AC-06 · Web

Given 双方完成一次交换；When 进入 `/memories` 并打开详情；Then 显示同一页的双份正文与城市；空态/错误态/加载态可用；390px 无横向溢出；键盘可打开与返回；不显示公开/分享入口。

### AC-07 · 回归与门禁

TASK-001～012 全部测试保持通过；`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke`、`pnpm verify` 实际运行并 exit 0；故障注入后返回非 0 并恢复。

## 7. 开发步骤

1. 文档口径与本任务卡。
2. RED：配对纯函数、`memories-diaries` 集成、契约、E2E、Smoke。
3. 迁移与 Prisma Client；更新清库顺序。
4. 跨模块读取接口与 Memory 子域。
5. Worker 生成接入。
6. OpenAPI 与契约。
7. Web 页面。
8. E2E、Smoke、全量回归、失败证明与证据归档。

## 8. 执行记录（待填写）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-30（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | `schema.prisma` 与迁移 `20261030130000_add_diary_pages`；`postcard/postcard-reader.service.ts`；`PassageReader.listParticipantContexts`；`memory/domain/diary.ts`、`diary` DTO、`DiariesController`；`MemoryRepository` / `MemoryService` 日记方法；Worker 与 `run-delivery-once` 生成接入；Web `/memories` 列表、`DiaryDetailView`、路由；契约、E2E、Smoke；清库顺序 |
| 新增 / 更新测试 | 后端单元 20 文件 / 130 用例（新增 1 文件 / 7 用例）；Web 单元 10 文件 / 66 用例（新增 1 条）；集成 13 文件 / 126 用例（新增 1 文件 / 6 用例）；契约 39 条路径（新增 2 条）；Playwright 24 用例（扩展现有回信用例）；Smoke 22 项（新增 1 项） |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify`；故障注入后再次 `pnpm verify` |
| 通过项 | 全部命令 exit 0；`pnpm verify` 9/9 PASS；证据 `artifacts/verification/TASK-013/final-verify.log`、`artifacts/verification/TASK-013/verify/2026-10-30T10-58-57-335Z` |
| 未通过 / 阻塞 | 首次架构检查 2 处跨模块导入：记忆领域直接引用邮局状态类型、Memory 深层导入 PostcardReader。已改为本地状态联合类型并把 `postcard-reader.service` 加入公开入口白名单，复跑通过。无遗留阻塞 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 生成 | 集成：只有一封送达不生成；两封送达恰好一页；重复调用不重复；`left/right/passage` 正确 | PASS |
| AC-02 列表 | 集成：A/B 各 1 页；第三人、`ADMIN` 为空；字段白名单无正文、email、userId、坐标；分页与多页 | PASS |
| AC-03 详情 | 集成：A/B 返回两份正文；第三人、`ADMIN`、随机 UUID、非法 UUID 全部 404；未登录 401 | PASS |
| AC-04 受限与关系 | 集成：停泊、完成、归档后仍可读；任一封 `RESTRICTED` 后列表隐藏、详情 404 | PASS |
| AC-05 数据库 | 第 13 次迁移；唯一键、外键、自指检查与索引；自指与重复页面被数据库拒绝 | PASS |
| AC-06 Web | E2E：回信送达后 `/memories` 出现日记；列表不含正文；详情展示双份正文；390px 无横向溢出；无分享/导出入口 | PASS |
| AC-07 回归与门禁 | 单元 130、Web 66、集成 126、契约 39、E2E 24、Smoke 22 全部通过；`pnpm verify` 9/9 PASS；故障注入 exit 1 | PASS |

补充说明：

- RED：单元因 `memory/domain/diary` 不存在失败（`artifacts/verification/TASK-013/red/red-diary-unit.log`）；契约因缺少 `/memories/diaries` 路径失败（`red/red-diary-contract.log`）。
- 失败证明：前两次注入（读取层放宽、关闭 `skipDuplicates`）被二次校验与预过滤挡住，未产生可观察失败；最终把列表 `limit` 固定为 50，分页用例 FAIL、`pnpm verify` exit 1（`red/verify-failure-proof.log`）。恢复后重新运行全量门禁，9/9 PASS。
- 契约：新增 `DiarySummaryDto`、`DiaryPostcardDto`、`DiaryDetailDto`、`DiaryListDto`；显式断言列表无正文，详情无 email、用户 ID、坐标、密码或会话字段。
- 测试基础设施：集成清库与 `reset-test-db.mjs` 把 `diary_pages` 放在 `postcards` / `passages` 之前；E2E 复用 `test-advance-postcard.mjs`，由 `run-delivery-once` 同步生成日记。
- 仍未实现：共同手帐、日记删除、公开/分享/导出、通知、举报、`RESTRICTED` 写入口、角色扩展、共途邀请。

## 9. 下一步

完成 TASK-013 后，再评估共途邀请/创建（PAS-01）或其他 P0 缺口。不自动进入下一任务。
