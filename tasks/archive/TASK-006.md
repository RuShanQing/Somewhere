# 当前开发任务 · TASK-006

状态：**DONE（TASK-006 已完成并通过门禁，等待下一任务指令）**

任务名称：**MAP 垂直切片：世界记忆地图业务入口**

任务类型：P0 发现 / 地图业务入口

优先级：P0

变更授权：本文件授权范围内；TASK-005 验收记录已归档到 `tasks/archive/TASK-005.md`。

## 1. 背景与目标

TASK-005 已完成城市故事草稿、审核、公开故事站与详情。按 PRD 的 P0 顺序，下一阶段实现 `MAP-01 / MAP-02 / MAP-03 / MAP-05`：世界记忆地图的**业务入口**——按城市发现已审核公开故事。

核心闭环：

```text
管理员通过并发布故事 → 城市拥有活跃公开故事
→ 匿名访客在 /discover/map 看到该城市与公开数量
→ 进入 /discover/map/:cityId 读到该城故事（与故事站同一 Story ID）
→ 打开 /discover/stories/:id 同一个详情
→ 作者撤回 / 管理员下架 → 两个入口同时消失
```

**本阶段不实现任何地图渲染技术**（不引入地图引擎、瓦片、地理图层、2D/3D 方案），只实现“通过地点发现记忆”的业务入口。

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 技术栈 | 保持 Prisma + Vitest + Playwright；不引入 TypeORM / Docker Compose / Jest |
| 数据源 | 复用 `ApprovedStoryReader` 与同一 `Story ID`；不新增“地图故事”实体、不复制可见性条件 |
| 聚合端点归属 | 新增 `DiscoveryModule`，单向依赖 `ProfileModule` + `StoryModule`；不在 `ProfileModule` 的 `/cities` 上加 `hasPublicStories`（会形成循环依赖） |
| 聚合端点 | `GET /api/v1/discovery/cities?topic=` 返回有活跃公开故事的城市 + 数量 + 最近发布时间；只读、匿名可读 |
| 城市故事列表 | **不新增** `GET /cities/:id/stories`；复用 `GET /api/v1/stories?cityId=&topic=&cursor=`，保持单一可见性来源 |
| 详情链接 | 统一为现有页面路由 `/discover/stories/:id`；同步修订 `specs/07` MAP-03 原文 |
| 发现入口 | `/discover` 仍是城市故事站，顶部增加“城市故事站 / 世界记忆地图”分段入口，不改变既有路由与 E2E |
| 排序 | 城市按 `latestPublishedAt DESC, cityId ASC`；**不按故事数量排序**，避免演化为热度榜 |
| 数据库 | 零变更、零迁移；复用 `stories(review_status, city_id, published_at)` 索引 |
| 上地图开关 | 不新增 `show_on_map`；公开 = 审核通过 + 已发布 + 未归档 + 公开授权未撤回，四个条件同时成立即出现在地图 |
| 缓存 | 不引入缓存层；聚合直接读数据库 |

## 3. 功能范围

### 3.1 数据库

- 不新增表、字段、枚举或迁移。
- 复用既有 `stories` 与索引 `stories_review_status_city_id_published_at_idx`。
- 测试清库脚本不变（已清理 `stories`、`story_review_actions`）。

### 3.2 后端接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/discovery/cities?topic=` | 公开；只返回活跃公开故事数 ≥ 1 的城市；含 `publicStoryCount` 与 `latestPublishedAt` |

规则：

- 匿名可读，不挂 `SessionGuard`；返回 200，空库时 `items: []`，不使用样例数据；
- 只统计满足公开谓词的故事：`reviewStatus=APPROVED && publishedAt!=null && archivedAt==null && publicConsentAt!=null`；
- `APPROVED` 但 `publishedAt=null`（容量排队）的故事不计入，其城市不得出现；
- `topic` 为精确主题标签筛选，去空格，最长 24 字符，非法返回 422；
- 响应只含 `city{id,name,countryCode}`、`publicStoryCount`、`latestPublishedAt`；不含作者 ID、邮箱、坐标；
- 城市故事列表与详情复用既有 `/stories?cityId=`、`/stories/:id`，其契约不变。

### 3.3 公开谓词单点化（质量项）

- 新增 `story/domain/story-visibility.ts` 作为唯一公开谓词来源；
- `listPublic`、`findPublicById`、`promoteNextLocked` 与新增的城市聚合全部复用它；
- 该重构不改变任何对外行为，必须先跑通 TASK-005 既有 stories 集成测试再动新功能。

### 3.4 Web

- `/discover`：保留故事站；顶部增加“城市故事站 / 世界记忆地图”分段入口；行为与文案不回归；
- `/discover/map`：城市入口页，展示有公开故事的城市、公开数量、最近发布时间；主题筛选；加载/空/错误/重试四态；390px；键盘可操作；
- `/discover/map/:cityId`：单城市故事页，城市名解析复用 `GET /cities`；故事列表复用 `GET /stories?cityId=`；未知城市温和空态；返回地图与故事站入口；
- 抽取 `StoryCard.vue` 与 `usePublicFeed` 组合式函数，故事站与城市页共用，避免两套列表逻辑；
- 不显示点赞/浏览/在线/已读/热度；不使用假数据；不显示地图渲染占位。

## 4. 明确不做

- 世界记忆地图的二维/三维渲染实现、地图引擎、瓦片、地理图层、聚合算法、动画；
- `show_on_map` / `show_city` / 匿名作者 / `accept_passage_invites` 开关（见 `specs/14-story-deferred-scope.md`）；
- 在 `GET /api/v1/cities` 上新增 `hasPublicStories` 参数；
- 新增 `GET /api/v1/cities/:id/stories` 别名端点；
- 共途、共途邀请、信友、停泊/续程/归档；
- 纪念册、双城日记、共同手帐、个人记忆；
- 善意接力、通知、邮件提醒、未读计数；
- 举报、封锁、通用审核后台、`RESTRICT` 实际处置；
- 点赞、评论、关注、热度榜、推荐算法、全文搜索；
- 30 天自动轮换、每日轮播、每用户展示上限、缓存层；
- 邮箱验证、找回密码、OAuth、账号删除、设备会话管理；
- 二维/三维地图方案讨论与共途邀请专项测试。

## 5. 工作拆分

- [x] `T6-01` 写入任务卡并同步 `specs/07`、`docs/architecture.md`、`specs/00-index.md` 口径。
- [x] `T6-02` RED：先写集成、单元、E2E、契约失败测试并记录证据。
- [x] `T6-03` 公开谓词单点化重构，跑 TASK-005 既有 stories 测试证明零回归。
- [x] `T6-04` `DiscoveryModule` 聚合端点转绿；架构检查放行 `ApprovedStoryReader`。
- [x] `T6-05` 重新生成 OpenAPI 客户端并更新契约检查。
- [x] `T6-06` Web：分段入口、`StoryCard`、`usePublicFeed`、地图入口页、城市页、组件测试。
- [x] `T6-07` E2E、Smoke 启用 SMOKE-04 地图部分。
- [x] `T6-08` 执行 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 聚合接口

Given 空测试库，When 匿名 `GET /api/v1/discovery/cities`，Then 200 且 `items: []`；Given 有活跃公开故事，Then 返回对应城市、`publicStoryCount` 与 `latestPublishedAt`。非法 `topic` 返回 422。

### AC-02 · 可见性一致性

Given 某城市同时存在 `DRAFT`、`PENDING`、`REJECTED`、`REMOVED`、`APPROVED + publishedAt=null` 与已发布故事，When 匿名请求聚合与 `/stories?cityId=`，Then 聚合计数等于公开列表可见条数（不超过分页上限时），且城市集合与故事站可见城市一致；排队故事的城市不得出现。

### AC-03 · 状态变更同步

Given 城市只有一条公开故事，When 作者撤回或管理员下架，Then 该城市从聚合列表消失；When 另一条故事通过并发布，Then 城市重新出现且计数正确。

### AC-04 · 隐私

Then 聚合响应与城市页不含 `centroidLat`、`centroidLon`、`authorId`、`email`；页面不展示在线状态、已读回执、实时位置或热度元素。

### AC-05 · Web

Given 匿名 / 作者 / 管理员，When 使用 `/discover`、`/discover/map`、`/discover/map/:cityId`、`/discover/stories/:id`，Then 四态真实、筛选与加载更多可用、地图与故事站指向同一 Story ID、390px 可用、键盘可操作；无假按钮与假数据。

### AC-06 · 数据库

Then 无新增迁移；`prisma migrate status` 无待执行迁移；`migrate deploy` 在空库可重放；`stories` 表结构与 TASK-005 一致。

### AC-07 · 回归与安全

TASK-001～005 的认证、会话、Cookie、Origin、限流、日志脱敏、城市/资料、邮局/投递、故事站/审核全部保持通过；公开聚合接口匿名可读且无敏感字段。

### AC-08 · 质量门禁

`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke`、`pnpm verify` 实际运行并通过；`pnpm verify` 退出码 0；故意制造一次非敏感失败时返回非 0 并恢复。

## 7. 开发步骤

1. 文档口径：`specs/07`、`docs/architecture.md`、`specs/00-index.md`。
2. 先写失败测试：集成 `discovery.spec.ts`、单元 `story-visibility.spec.ts`、E2E `map.spec.ts`、契约路径。
3. 谓词单点化重构并跑旧 stories 测试。
4. `StoryRepository.groupPublicByCity` → `ApprovedStoryReader` → `DiscoveryService` → `DiscoveryController`。
5. 重新生成 OpenAPI 客户端；契约检查加入新路径与字段白名单。
6. Web 组件抽取、路由、两个页面与组件测试。
7. E2E、Smoke、全量回归、失败证明与证据归档。

## 8. 执行记录（实测）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-29（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | `story/domain/story-visibility.ts`（公开谓词单点化）、`story/story.types.ts`、`StoryRepository.groupPublicByCity`、`ApprovedStoryReader.listPublicCitySummaries`；新增 `modules/discovery`（module/controller/service/2 DTO）；`app.module.ts` 注册；`check-boundaries.mjs` 放行 `approved-story-reader.service`；Web 新增 `DiscoverNav`、`StoryCard`、`usePublicFeed`、`MapView`、`MapCityView`、两条路由与样式；`DiscoverView` 改为复用组件；`packages/api-client` 生成与新 `cityMemories()`；无数据库迁移 |
| 新增/更新测试 | 后端单元 12 文件 / 70 用例（新增 2）；Web 单元 7 文件 / 41 用例（新增 5）；集成 6 文件 / 61 用例（新增 11）；契约 24 条路径（新增 1）；Playwright 19 用例（新增 1）；Smoke 16 项（新增地图检查） |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify` |
| 通过项 | `pnpm verify` 9/9 子门禁 PASS，退出码 0；证据目录 `artifacts/verification/TASK-006/verify/2026-10-29T07-04-34-277Z` |
| 未通过 / 阻塞 | 无 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 聚合接口 | 匿名 `GET /api/v1/discovery/cities` 200；空库 `items: []`；`topic` 去空格生效、25 字符 422；未知城市故事列表 200 空数组 | PASS |
| AC-02 可见性一致性 | 草稿/待审/驳回/撤回均不产生城市；聚合计数与 `/stories?cityId=` 的 Story ID 集合一致；预置 50 条已发布故事后新通过故事排队，城市计数仍为 50 且排队故事不在公开列表 | PASS |
| AC-03 状态变更同步 | 作者撤回后城市消失、重新公开后恢复且计数为 1；管理员下架后城市消失；E2E 与 Smoke 均覆盖“两个入口同时消失” | PASS |
| AC-04 隐私 | 聚合响应字段白名单为 `city{id,name,countryCode}` + `publicStoryCount` + `latestPublishedAt`；集成与契约断言无 email、`centroidLat/Lon`、`authorId` | PASS |
| AC-05 Web | E2E：待审核不出现在地图 → 通过后显示「1 篇可读故事」→ 键盘可聚焦 → 单城市页 → 390px 无横向溢出 → 地图与故事站指向同一 `/discover/stories/:id` → 撤回后同时消失 | PASS |
| AC-06 数据库 | 无新增迁移；`stories` 表结构与 TASK-005 一致；测试清库脚本未改动 | PASS |
| AC-07 回归与安全 | TASK-001～005 的认证、会话、Cookie、Origin、限流、日志脱敏、城市/资料、邮局/投递、故事站/审核测试全部通过；公开聚合端点匿名可读且无敏感字段 | PASS |
| AC-08 质量门禁 | `pnpm verify` 9/9 PASS（exit 0）；临时在聚合查询写第二套可见性条件后 `pnpm verify` 在 `test:integration` FAIL、exit 1，恢复后重新 PASS | PASS |

补充说明：

- 红灯证据：实现前新增集成测试 10 条因 `/api/v1/discovery/cities` 404 失败，1 条既有基线用例通过；日志 `artifacts/verification/TASK-006/red/red-discovery-api.log`。
- 谓词重构零回归证据：改完 `story.repository.ts` 后先跑 `stories.spec.ts`，15 条全部通过，再动新功能。
- 失败证明：`artifacts/verification/TASK-006/red/verify-failure-proof.log`；最终日志 `artifacts/verification/TASK-006/final-verify.log`。
- 测试范围修正：`tests/e2e/navigation.spec.ts` 的 “当前导航项” 选择器从 `nav a[aria-current="page"]` 收窄为 `.main-nav a[aria-current="page"]`，因为发现页新增了真实可用的分栏导航；断言语义未变（仍要求主导航高亮当前项）。
- 仍未实现：任何地图渲染技术、`show_on_map`/`show_city` 开关、匿名作者、30 天轮换、共途、信友、纪念册、举报、封锁、通知。

## 9. 下一步

完成 TASK-006 后等待用户批准下一个业务任务；建议共途（P0 核心差异化）。不自动进入地图渲染、共途或纪念册。
