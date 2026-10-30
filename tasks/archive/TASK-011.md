# 当前开发任务 · TASK-011

状态：**DONE（TASK-011 已完成并通过门禁，等待下一任务指令）**

任务名称：**MEMORY-02 切片：个人记忆 CRUD 与私有边界**

任务类型：P0 私人内容 / 纪念册

优先级：P0

变更授权：本文件授权范围内；TASK-010 验收记录已归档到 `tasks/archive/TASK-010.md`。

## 1. 背景与目标

`specs/11-memories.md` 要求个人记忆默认只归本人查看，支持保存、编辑和删除；它不能因为参与共途、成为信友或封锁关系而自动开放给他人。当前 `/memories` 只有诚实空态，没有任何个人记忆业务。

本任务只做**个人记忆最小闭环**：

```text
登录用户创建一条只属于自己的记录
→ 刷新后仍能读取
→ 可以编辑标题与正文
→ 可以删除
→ 其他用户（包括 ADMIN）通过 ID 猜测只能得到 404
→ 删除不影响任何明信片、共途、信友或他人的记录
```

仍然不实现双城日记、共同手帐、来源明信片引用、公开分享、导出、通知、举报、角色扩展与共途邀请。

## 2. 已确认的范围决策

| 决策 | 结论 |
|---|---|
| 数据 | 新增 `personal_memories` 表；只新增，不改既有表 |
| 所有者 | `owner_id` 来自会话；客户端不能传 `ownerId` |
| 私人性 | 模块级不变量：所有读写都带 `owner_id`，本任务不提供公开/共享字段 |
| 来源引用 | 本任务不实现 `source_type/source_id`；只做手工记录，后续任务再迁移 |
| 标题 | 1–80 字符，去首尾空白后不得为空 |
| 正文 | 1–3000 字符，去首尾空白后不得为空；支持换行与 emoji |
| 列表 | 只返回本人记录，`updatedAt DESC, id DESC`，`limit` 1–50 默认 20，`offset` 默认 0 |
| 读取 | 不提供单条详情接口；列表返回本人完整正文 |
| 编辑 | 只能改本人记录；标题/正文至少提供一个；越权/不存在统一 404 |
| 删除 | 硬删除本人记录；重复删除 404；不影响任何其他表 |
| 角色 | `ADMIN` 不获得读取他人个人记忆的直通权限 |
| 关系 | 共途、信友、封锁都不改变个人记忆的归属与可见性 |

## 3. 功能范围

### 3.1 数据库

新增迁移（仅新增）：

- `personal_memories`：
  - `id UUID PRIMARY KEY`
  - `owner_id UUID NOT NULL` → `users(id)` `ON DELETE CASCADE`
  - `title VARCHAR(80) NOT NULL`
  - `body VARCHAR(3000) NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `CHECK (char_length(title) BETWEEN 1 AND 80)`
  - `CHECK (char_length(body) BETWEEN 1 AND 3000)`
  - `CHECK (btrim(title) <> '')`
  - `CHECK (btrim(body) <> '')`
  - `INDEX (owner_id, updated_at DESC, id DESC)`

不新增 `visibility`、`is_public`、`shared_with`、`source_type/source_id` 或软删除字段。

### 3.2 后端接口

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/v1/memories/personal` | 我的个人记忆列表；支持 `limit/offset` |
| POST | `/api/v1/memories/personal` | body `{ title, body }`；201 |
| PATCH | `/api/v1/memories/personal/:id` | body `{ title?, body? }`；200 |
| DELETE | `/api/v1/memories/personal/:id` | 204 |

规则：

- 未登录 401 `AUTH_REQUIRED`；
- 标题/正文空白、超长、空 PATCH 422 `VALIDATION_ERROR`；
- 非本人记录、记录不存在、非法 UUID 一律 404 `RESOURCE_NOT_ACCESSIBLE`；
- 响应只含 `id/title/body/createdAt/updatedAt`，不含 email、ownerId、角色或关系字段；
- 服务端生成时间，客户端不能指定 `createdAt/updatedAt`；
- 写请求由全局 OriginGuard 校验，外站 Origin 403；
- 列表按 `updatedAt DESC, id DESC` 返回。

### 3.3 Web

- `/memories` 保留“双城日记”与“共同手帐”的诚实空态；
- “个人记忆”区域提供创建、列表、编辑、删除；
- 四态：loading / empty / error / ready；
- 删除使用内联确认；编辑复用同一表单并显示“正在编辑”；
- 文案明确“只归你个人查看，不会进入城市故事或地图”；
- 390px 无横向溢出；表单标签、按钮与焦点可用；
- 不显示公开、分享、导出、点赞、评论或计数。

## 4. 明确不做

- 双城日记生成、读取与权限（MEMORY-02/03）；
- 共同手帐、条目版本、媒体上传（P1）；
- `source_type/source_id`、引用已收到明信片；
- 公开发布、分享、导出、搜索他人记忆；
- 通知、举报、审核处置、`RESTRICT`；
- 角色扩展、`MODERATOR/CURATOR`、后台用户管理；
- 共途邀请/创建、信友发起新共途、地图渲染；
- 修改认证、会话、密码、邮局、故事、共途、封锁、信友规则。

## 5. 工作拆分

- [x] `T11-01` 任务卡与 `specs/11`、`specs/00-index.md`、`docs/architecture.md`、`docs/testing.md` 口径。
- [x] `T11-02` RED：单元、集成、契约、架构、E2E、Smoke 失败测试与证据。
- [x] `T11-03` 迁移：`personal_memories`、外键、检查约束、索引。
- [x] `T11-04` `MemoryModule`：领域校验纯函数、`MemoryRepository`、`MemoryService`、`MemoriesController`。
- [x] `T11-05` 重新生成 OpenAPI 客户端并更新契约检查。
- [x] `T11-06` Web：`/memories` 个人记忆列表、创建/编辑/删除、四态与移动端。
- [x] `T11-07` E2E、Smoke、全量 `pnpm verify`、失败证明与证据归档。

## 6. 验收条件

### AC-01 · 创建与读取

Given 已登录用户 A；When `POST /memories/personal { title, body }`；Then 201，数据库新增一行 `owner_id=A`；When `GET /memories/personal`；Then 返回该记录，字段无 email/ownerId；刷新页面后仍可见。

### AC-02 · 校验边界

Given 标题 1/80/81 字符、正文 1/3000/3001 字符、全空白或只有换行/制表符；Then 合法值成功，非法值 422；emoji 按实际码点计数；空 PATCH 422。

### AC-03 · 编辑与删除

Given A 自己的记录；When `PATCH`；Then 200，`updatedAt` 前进且列表排序更新；When `DELETE`；Then 204，列表不再返回；重复 DELETE 404；其他表行数不变。

### AC-04 · 私有边界

Given A 的记录；When B（包括与 A 有共途/信友关系）`PATCH` 或 `DELETE` 该 ID；Then 404，A 的记录不变；When B `GET` 列表；Then 不含 A 的记录；`ADMIN` 同样 404；非法 UUID 404。

### AC-05 · Web

Given A 打开 `/memories`；When 创建、刷新、编辑、删除；Then 页面状态与数据库一致；空态/错误态/加载态可用；390px 无横向溢出；键盘可完成创建与删除；不显示公开/分享入口。

### AC-06 · 数据库

只有一次新增迁移；空库 `migrate deploy` 可重放；`prisma migrate status` 无待执行；外键、长度检查、空白检查与索引存在；既有表与行不受影响。

### AC-07 · 回归与门禁

TASK-001～010 全部测试保持通过；响应/日志无 email、密码、Cookie、正文泄露给非本人；外站 Origin 403；`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke`、`pnpm verify` 实际运行并 exit 0；故障注入后返回非 0 并恢复。

## 7. 开发步骤

1. 文档口径与本任务卡。
2. RED：领域校验、`memories-personal` 集成、契约、E2E、Smoke。
3. 迁移与 Prisma Client。
4. `MemoryModule` + 仓储/服务/控制器。
5. 重新生成 OpenAPI 客户端与契约检查。
6. Web 个人记忆区域。
7. E2E、Smoke、全量回归、失败证明与证据归档。

## 8. 执行记录（实测）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-30（UTC+8） |
| 环境 | macOS；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | `prisma/schema.prisma` 与 `20261030110000_add_personal_memories`；新增 `MemoryModule`（domain/repository/service/controller/DTO）；`AppModule` 注册；生成客户端；Web `/memories` 个人记忆表单、列表、编辑、删除确认与样式；集成/测试库清库加入 `personal_memories` |
| 新增/更新测试 | 后端单元 18 文件 / 115 用例（新增 6）；Web 单元 10 文件 / 64 用例（新增 8，并补充 1 条 API 客户端用例）；集成 11 文件 / 111 用例（新增 9）；契约 37 条路径（新增 2）；Playwright 23 用例（新增 1）；Smoke 20 项（新增 1） |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify`；故障注入后再次 `pnpm verify` |
| 通过项 | 全部命令 exit 0；`pnpm verify` 9/9 PASS；最终证据 `artifacts/verification/TASK-011/verify/2026-10-30T06-44-14-925Z`、`artifacts/verification/TASK-011/final-verify.log` |
| 未通过 / 阻塞 | 首轮集成测试的数据库空白检查使用 `btrim`，只去空格不去换行/制表符，导致 `'\n\t'` 被接受；已改为 `~ '[^[:space:]]'` 并仅在测试库重放该次迁移，复跑通过。无遗留阻塞 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 创建与读取 | 集成：创建 201、列表只含本人、字段白名单无 email/ownerId；E2E 刷新后仍可见 | PASS |
| AC-02 校验边界 | 单元与集成：标题 1/80/81、正文 1/3000/3001、空白/换行/制表符、emoji 码点、空 PATCH；数据库层同样拒绝 | PASS |
| AC-03 编辑与删除 | 集成：编辑更新 `updatedAt` 并改变排序；删除 204、重复删除 404；共途/明信片行数不变 | PASS |
| AC-04 私有边界 | 集成：非本人、ADMIN、非法 UUID 统一 404；共途与信友关系不让渡读取权；列表不泄露他人记录 | PASS |
| AC-05 Web | E2E：创建→刷新→编辑→390px 无横向溢出→键盘焦点→删除→另一账号看不到；双城日记/共同手帐保持诚实空态 | PASS |
| AC-06 数据库 | 第 11 次迁移应用；外键、长度检查、非空白检查与索引存在；测试库可重放 | PASS |
| AC-07 回归与门禁 | 单元 115、Web 64、集成 111、契约 37、E2E 23、Smoke 20 全部通过；认证/邮局/故事/地图/共途/封锁/信友未回退；响应无 email/ownerId；外站 Origin 403 | PASS |

补充说明：

- RED：单元因 `memory/domain/personal-memory` 不存在失败；集成 8 条因 `/memories/personal` 404 失败、1 条数据库约束用例最初因表缺失误通过（`artifacts/verification/TASK-011/red/red-memory-unit.log`、`red/red-memory-api.log`）。
- 失败证明：临时让 `MemoryRepository.listByOwner` 忽略 `ownerId`，`test:integration`、`test:e2e` 与 `test:smoke` FAIL、`pnpm verify` exit 1；日志 `artifacts/verification/TASK-011/red/verify-failure-proof.log`。恢复后重新运行全量门禁，9/9 PASS。
- 数据库：`prepare-test-db` 显示 11 次迁移，`add_personal_memories` 已应用；未运行生产迁移。
- 契约同步：新增 2 条路径；`PersonalMemoryDto` 只含 `id/title/body/createdAt/updatedAt`，显式排除 email、ownerId、密码、会话、来源与公开字段。
- 测试基础设施：集成清库与 `reset-test-db.mjs` 加入 `personal_memories`。
- 仍未实现：双城日记、共同手帐、`source_type/source_id`、公开/分享/导出、通知、举报、`RESTRICT`、角色扩展。

## 9. 下一步

完成 TASK-011 后，再评估双城日记（MEMORY-02/03）或共途邀请/创建（PAS-01）。不自动进入下一任务。
