# 当前开发任务 · TASK-005

状态：**DONE（TASK-005 已完成并通过门禁，等待下一任务指令）**

任务名称：**STORY 垂直切片：城市故事草稿、管理员审核与公开故事站**

任务类型：P0 发现 / 城市故事 / 内容审核

优先级：P0

变更授权：本文件授权范围内；TASK-004 验收记录已归档到 `tasks/archive/TASK-004.md`。

## 1. 背景与目标

TASK-004 已完成邮局与距离延迟投递。按 PRD 的 P0 顺序，下一阶段实现 `DIS-01 / DIS-02 / SEC-02`：故事草稿、提交审核、管理员审核、公开故事站与详情。故事站与世界记忆地图共用同一 `Story ID` 和审核状态；本任务不实现地图页面。

核心闭环：

```text
作者创建草稿 → 提交审核 → PENDING → 管理员通过 → APPROVED → 有空位则公开
→ 匿名访客在 /discover 与 /discover/stories/:id 看到同一条故事
→ 作者撤回 / 管理员下架 → 两个入口同时消失
```

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 技术栈 | 保持 Prisma + Vitest + Playwright；不引入 TypeORM / Docker Compose / Jest |
| 故事合同 | 以 `specs/06-city-stories.md` 为准：标题 1–80、正文 20–3000、标签最多 3、每城市 50 条活跃、每账号每 7 天最多提交 3 条 |
| 草稿 | 持久化 `DRAFT`；`POST /stories` 创建草稿，`POST /stories/:id/submit` 进入 `PENDING` |
| 审核模块 | 审核状态、审核接口与审核审计放在 `StoryModule`，同一事务完成；通用 `SafetyModule` 后续再抽 |
| 审核角色 | 新增 `USER | ADMIN`，审核接口仅 `ADMIN`；注册不可自选角色 |
| 自审 | 管理员不得审核自己创作的故事，返回 403 `FORBIDDEN`，不写审核动作 |
| 暂缓能力 | 显示城市 / 上地图 / 接受共途邀请开关、匿名作者、30 天轮换、每日 24 张、每用户 2 条展示上限，见 `specs/14-story-deferred-scope.md` |
| 公开作者 | 只显示昵称；不返回 email、城市坐标或审核备注 |
| 缓存 | 本阶段不引入缓存层；公开查询直接读数据库 |

## 3. 功能范围

### 3.1 数据库

- `users.role`：`UserRole` 枚举 `USER / ADMIN`，默认 `USER`。
- 新增 `stories`：
  - `id`、`author_id`、`city_id`、`title`、`body`、`topic_tags`；
  - `review_status`：`DRAFT / PENDING / APPROVED / REJECTED / REMOVED`；
  - `public_consent_at?`、`submitted_at?`、`reviewed_at?`、`reviewed_by?`；
  - `published_at?`、`archived_at?`、`removed_by?`（`AUTHOR / MODERATOR`）；
  - `created_at`、`updated_at`。
- 新增 `story_review_actions`：`id`、`story_id`、`moderator_id`、`action`、`reason_code?`、`created_at`。
- 约束：标题/正文长度与全空白、标签最多 3、`published_at IS NULL OR review_status='APPROVED'`、参与者不能自审。
- 索引：审核队列、公开城市列表、作者列表。
- 新增显式迁移；测试清库脚本清理 `story_review_actions`、`stories`，保留 `cities`。

### 3.2 后端接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/stories?cityId=&topic=&cursor=&limit=` | 公开列表；仅 `APPROVED + publishedAt + 未归档 + 有公开授权` |
| GET | `/api/v1/stories/:id` | 公开详情；非公开统一 404 |
| POST | `/api/v1/stories` | 登录；创建 `DRAFT` |
| GET | `/api/v1/stories/mine` | 登录；本人全部状态 |
| GET | `/api/v1/stories/mine/:id` | 登录；本人单条详情 |
| PATCH | `/api/v1/stories/:id` | 登录；仅作者、仅 `DRAFT/REJECTED` |
| POST | `/api/v1/stories/:id/submit` | 登录；`DRAFT/REJECTED → PENDING` |
| DELETE | `/api/v1/stories/:id` | 登录；仅作者、仅 `DRAFT` |
| POST | `/api/v1/stories/:id/withdraw` | 登录；`PENDING/APPROVED → REMOVED` |
| GET | `/api/v1/moderation/queue?cursor=&limit=` | `ADMIN`；只返回 `PENDING` |
| POST | `/api/v1/moderation/stories/:id/decision` | `ADMIN`；`APPROVE / REJECT / REMOVE` |

规则：

- 未登录 401 `AUTH_REQUIRED`；普通用户访问审核 403 `FORBIDDEN`；跨用户故事 404 `RESOURCE_NOT_ACCESSIBLE`。
- 作者只能编辑 `DRAFT/REJECTED`；`PENDING/APPROVED/REMOVED` 不可直接改写。
- 提交时服务端设置 `submittedAt`、`publicConsentAt`、`PENDING`；重新提交重置审核字段。
- 审核决策使用事务 + 城市行锁 + 条件更新；重复决策 409 `STORY_STATE_CONFLICT`；审计只写一次。
- 通过时若城市活跃故事未满 50 条则写 `publishedAt`，否则 `APPROVED + publishedAt=null` 排队。
- 撤回/下架释放名额后，按 `reviewedAt, id` 提升最早排队的已通过故事。
- 每账号每 7 天最多 3 次提交；第 4 次 429 `RATE_LIMITED`。
- 公开列表/详情不返回正文以外的敏感字段；公开作者只显示昵称。
- 公开列表使用 `publishedAt DESC, id DESC` 游标分页；非法游标 422。

### 3.3 Web

- `/discover`：真实故事列表、城市/主题筛选、游标加载更多、加载/空/错误/重试；匿名可读；写故事入口。
- `/discover/stories/:id`：公开详情；未公开统一温和不可用状态；不显示共途邀请按钮。
- `/discover/write/:id?`：新建/编辑草稿、城市选择、标签、保存草稿、提交审核、422 提示、状态提示。
- `/discover/mine`：我的故事列表与状态、编辑/提交/撤回。
- `/admin/moderation`：最小审核台；`ADMIN` 可访问，普通用户无权限；通过/驳回/下架需确认。
- 390px 可用、键盘可操作、表单有 label；不显示点赞/浏览/在线/已读/催促；不使用假数据。

## 4. 明确不做

- 世界记忆地图页面与渲染；只保留 `cityId` 公开筛选。
- 共途、共途邀请、信友、停泊/续程/归档。
- 纪念册、双城日记、共同手帐、个人记忆。
- 善意接力、通知、邮件提醒、未读计数。
- 举报、封锁、通用审核后台、`RESTRICT` 实际处置。
- 点赞、评论、关注、热度榜、推荐算法、全文搜索。
- 图片/录音/多媒体、模板、匿名作者、显示城市/上地图/接受邀请开关。
- 30 天自动轮换、每日 24 张、每用户 2 条展示上限。
- 邮箱验证、找回密码、OAuth、账号删除、设备会话管理。
- TypeORM / Jest / Docker Compose 迁移。
- 二维/三维地图方案与共途邀请专项测试。

## 5. 工作拆分

- [x] `T5-01` 写入任务卡与 Spec 口径；确认已归档 TASK-004。
- [x] `T5-02` Prisma schema、迁移、测试清库脚本、管理员授予脚本。
- [x] `T5-03` RED：先写故事/审核/公开可见性的失败测试并记录证据。
- [x] `T5-04` StoryModule：领域纯函数、作者端接口、审核端接口。
- [x] `T5-05` 公开列表/详情、游标、容量与配额、并发控制。
- [x] `T5-06` Web 五个页面、路由、API client 与组件测试。
- [x] `T5-07` 契约、架构、E2E、Smoke、文档同步。
- [x] `T5-08` 执行 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 数据库与迁移

Given 空测试库，When 执行 `db:deploy`，Then `users.role`、`stories`、`story_review_actions`、枚举、索引和检查约束存在；既有用户默认 `USER`；清库后 `cities` 保留。

### AC-02 · 作者端

Given 已登录作者，When 创建/编辑/提交/撤回/删除，Then 仅本人可操作；`DRAFT/REJECTED` 可编辑，`PENDING/APPROVED/REMOVED` 不可直接编辑；标题/正文/标签边界返回 422；第 4 次提交返回 429。

### AC-03 · 审核端与权限

Given 匿名 / 普通用户 / 管理员，When 访问审核接口，Then 401 / 403 / 200；队列只含 `PENDING`；通过、驳回、下架正确更新状态；管理员不能审核自己的故事；重复决策 409；审计只写一条。

### AC-04 · 公开可见性与隐私

Given 未公开故事，When 匿名访问列表、城市筛选、详情，Then 不可见且详情 404；Given 已公开故事，Then 列表与详情 ID 一致；撤回/下架后立即消失；响应不含 email、坐标、审核备注、草稿正文。

### AC-05 · 容量与配额

Given 某城市已有 50 条活跃故事，When 新的故事通过审核，Then 该故事 `publishedAt=null` 排队且不出现在公开列表；When 释放一个名额，Then 最早排队故事被提升；公开数量不超过 50；7 天内第 4 次提交 429。

### AC-06 · Web

Given 匿名 / 作者 / 管理员，When 使用 `/discover`、详情、写作、我的故事、审核台，Then 四态真实、草稿刷新仍在、提交/撤回/审核闭环可用；390px 与键盘可用；无假按钮、无社交热度元素。

### AC-07 · 回归与安全

TASK-001～004 的认证、会话、Cookie、Origin、限流、日志脱敏、城市/资料、邮局/投递全部保持通过；角色不能被注册请求写入；公开/审核接口无敏感字段；故事正文按纯文本渲染。

### AC-08 · 质量门禁

`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke`、`pnpm verify` 实际运行并通过；`pnpm verify` 退出码 0；故意制造一次非敏感失败时返回非 0 并恢复。

## 7. 开发步骤

1. 数据模型与迁移；更新清库脚本与管理员授予脚本。
2. 先写 HTTP 集成失败测试，记录 404/403 红灯。
3. 领域纯函数 → Repository → Service → Controller。
4. 审核事务、自审限制、容量排队与释放、提交配额。
5. 重新生成 OpenAPI 客户端；Web 页面与路由。
6. 契约、架构、E2E、Smoke、文档同步。
7. 全量回归、失败证明与证据归档。

## 8. 执行记录（实测）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-29（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | Prisma `UserRole`、`StoryReviewStatus`、`StoryReviewAction` 等枚举与 `stories`/`story_review_actions`；迁移 `20261029053935_add_stories`、`20261029060000_fix_story_published_constraint`、`20261029061500_fix_story_whitespace_checks`；`StoryModule`（作者端/审核端/公开读取）、`ApprovedStoryReader`、`RolesGuard`、`admin:grant` 脚本；Web `/discover`、故事详情、写作、我的故事、`/admin/moderation` 与 API client；文档同步 |
| 新增/更新测试 | 后端单元 11 文件 / 68 用例；Web 单元 6 文件 / 36 用例；集成 5 文件 / 50 用例；契约 23 条路径；Playwright 18 用例；Smoke 15 项 |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify` |
| 通过项 | 最终 `pnpm verify` 9/9 子门禁 PASS，退出码 0；证据目录 `artifacts/verification/TASK-005/verify/2026-10-29T06-15-10-298Z` |
| 未通过 / 阻塞 | 无 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 数据库与迁移 | 两个显式迁移通过 `migrate deploy`；`users.role` 默认 `USER`；`stories`/`story_review_actions` 含长度、标签数量、公开状态与审核人一致性约束；清库脚本保留 `cities` | PASS |
| AC-02 作者端 | 草稿/读取/编辑/提交/撤回/删除、跨用户 404、标题 81/正文 19/3001/4 标签/全空白 422、第 4 次提交 429 | PASS |
| AC-03 审核端 | 匿名 401、普通用户 403、管理员队列/通过/驳回/下架；自审 403 且不写审计；重复决策 409；并发审核只成功一次、审计一条 | PASS |
| AC-04 公开可见性 | PENDING/REJECTED/REMOVED 不出现在列表/城市筛选/详情；公开后列表与详情同一 ID；撤回/下架立即消失；响应无 email、作者 ID、坐标、审核备注 | PASS |
| AC-05 容量与配额 | 预置 50 条活跃故事后新通过故事排队；释放名额后提升最早排队故事；公开数量不超过 50；7 天第 4 次提交 429 | PASS |
| AC-06 Web | Playwright：草稿→刷新→提交→匿名不可见→管理员通过→公开详情→作者撤回→消失；普通用户 `/forbidden`；390px 写作页无溢出 | PASS |
| AC-07 回归与安全 | TASK-001～004 全部旧测试通过；注册携带 `role` 返回 422；故事正文纯文本渲染；公开/审核响应无敏感字段；架构检查通过 | PASS |
| AC-08 质量门禁 | `pnpm verify` 9/9 PASS（exit 0）；临时移除 `RolesGuard` 403 后 integration/Smoke FAIL、exit 1，恢复后重新 PASS | PASS |

补充说明：

- 红灯证据：实现前新增集成测试 10 条因接口 404 失败，日志 `artifacts/verification/TASK-005/red/red-stories-api.log`（2 条认证基线用例通过）。
- 失败证明：`artifacts/verification/TASK-005/red/verify-failure-proof.log`；最终日志 `artifacts/verification/TASK-005/final-verify.log`。
- 管理员通过 `pnpm --filter @somewhere/api admin:grant --email=<虚构账号>` 授予；脚本拒绝生产环境，不开放公开接口。
- 仍未实现：世界记忆地图页面、显示城市/上地图/接受共途邀请开关、匿名作者、30 天轮换、每日 24 张、每用户 2 条展示上限；证据见 `specs/14-story-deferred-scope.md`。
- 未实现举报、封锁、通知、共途、信友、纪念册；不能宣称通用审核后台已完成。

## 9. 下一步

等待用户批准下一个业务任务；建议世界记忆地图业务入口，复用 `ApprovedStoryReader` 与同一 Story ID。不自动进入地图渲染、共途或纪念册。
