# Somewhere · 测试与独立验收规则

> 当前状态：**测试策略与脚本命令契约 + TASK-001～TASK-011 已落地的可运行基线**。第 1–9 节是长期约束；第 11 节记录认证、城市与资料、邮局、城市故事、世界记忆地图、共途、共途发信、封锁、信友与个人记忆任务实际实现的命令与实测结果。除第 11 节列出的已验证能力外，不得据此声称其他业务测试已经通过。

## 1. 测试的目标

不是证明 AI 写出了“像样的代码”，而是**从业务外部检验它有没有真正守住规则**，尤其防止改新功能时把旧功能弄坏。

四个证据层次：
1. **静态**：格式、lint、TypeScript、敏感信息、依赖方向。
2. **单元**：距离算法、状态转移、权限决策纯函数。
3. **集成 / 契约**：真实数据库事务、NestJS HTTP、OpenAPI 响应约定。
4. **旁路黑盒**：另一测试入口从浏览器或公开 HTTP 操作运行中的系统，不依赖生产 Service 的私有函数。

TDD 的 `RED → GREEN → REFACTOR` 用于写新功能；旁路回归是额外的守门人，不能被“单测绿了”替代。

## 2. 目标命令契约

首次编码任务必须实现或建立对应脚本；在实际实现前，状态都是 **NOT IMPLEMENTED**。

| 命令（仓库根） | 预期行为 |
|---|---|
| `pnpm install --frozen-lockfile` | 依赖可复现 |
| `pnpm lint` | 全仓库 ESLint / 规范检查 |
| `pnpm typecheck` | 前后端 TypeScript strict |
| `pnpm build` | Web 与 API 构建 |
| `pnpm test:unit` | Vitest 纯函数 / 组件单元测试 |
| `pnpm test:integration` | API + 测试 PostgreSQL，隔离数据 |
| `pnpm test:contract` | OpenAPI 输出、客户端生成产物与响应契约一致 |
| `pnpm test:architecture` | 层次依赖、禁止深层跨模块导入 |
| `pnpm test:e2e` | Playwright 黑盒路径 |
| `pnpm test:smoke` | 可部署产物最关键的 5–10 分钟冒烟集 |
| `pnpm verify` | 上述必要命令的总入口；失败返回非 0 |

`pnpm verify` 不是仅打印“成功”的空壳：任何子步骤失败，都应导致总命令失败。测试命令不可依赖外部付费 API 和真实用户账号。

## 3. 环境、隔离与假数据

- 使用专用测试 PostgreSQL，数据库名称、账号、端口与开发/生产分离；**禁止连接生产数据库执行测试清空命令**。
- 用可重复的 migration + seed 初始化；测试运行前验证 `NODE_ENV=test`、`DATABASE_URL` 指向允许的测试数据库。
- `tests/fixtures` 提供虚构账号、城市和内容，包含不同地区、未审核/已审核故事、在途/已到达的信。
- 单测通过注入固定时钟（`Clock`）使时间可控；集成测试用受控时间源，**不允许真实等待 12–120 小时**。
- 浏览器旁路测试使用只在测试环境开放的 seed/bootstrap 操作，不使用真实生产数据或模拟绕过生产权限的隐藏 API。
- Playwright screenshot/video/trace 仅在隔离的虚构数据环境产生，调试失败时保存到 `artifacts/verification/`（该目录不提交真实隐私数据）。
- API、Web、Worker 必须是可独立启动的真实进程；旁路测试不能直接 import `DeliveryService` 或数据库 Repository 以“代替用户动作”。
- 不使用共享外网测试资源；需要第三方服务时使用本地假的 SMTP 捕获器等可审计替身。

## 4. 变更 → 检查范围矩阵

| 代码改动 | 最低必需测试 | 受影响的旁路回归 |
|---|---|---|
| 认证 / 会话 | 单元 + API 集成 + E2E | 注册→登录→刷新页面→退出 |
| 角色 / 后台权限 | 单元 + API 集成 + 契约 + E2E | 匿名/普通用户/审核员/管理员边界；角色变更即时生效；后台不泄露邮箱与私人内容 |
| 城市 / 距离 / 延迟投递 | 单元 + DB 集成 + E2E | 在途不可开信、到时送达、只送一次 |
| 公开故事 / 发现 | API 集成 + E2E | 待审核不可见、通过后故事站及地图同时可见 |
| 共途 / 信友 / 停泊 | 单元 + DB 集成 + E2E | 停泊阻止新的通信行为；已有记忆仍可读 |
| 纪念册 / 授权 | 单元 + API 集成 + E2E | 自己可见、陌生人不可见、双方共享规则 |
| 封锁 / 举报 / 审核 | API 集成 + E2E | 封锁生效；违规内容不可公开 |
| 纯 UI / 文案 | 组件 + 目标 E2E | 四导航与各页面的空态 / 错误态 |
| DTO、数据库、跨层依赖 | Contract + Integration + Architecture | 受影响业务路径及既有关键 smoke |
| 仅文档更改 | 文档路径 / 链接 / 术语检查 | 不得宣称运行了应用测试 |

即使改动“只涉及页面”，仍需检查页面没有泄露正文、邮箱或他人私人记录。

## 5. 旁路测试必须具备的基础路径

### SMOKE-01 · 注册与登录

- Given 未登录且使用全新虚构邮箱
- When 在注册页面填写有效资料并提交
- Then 页面呈现预期后续步骤；数据库只保存密码哈希；重复邮箱不产生第二个用户
- When 使用已创建账号登录、刷新受保护页面
- Then 会话保持，`GET /auth/me` 返回当前用户而不是其他人
- When 主动退出
- Then 旧会话不再能访问受保护数据
- And 错误账号 / 错误密码不泄露账号是否存在

### SMOKE-02 · 四个主导航

- Given 已登录
- When 依次进入邮局、发现、共途、纪念册
- Then 四个导航及页面标题正确、非目标功能展示诚实的空态，不展示假数据
- And 未登录访问私人页面被引导登录
- And 键盘 Tab 可访问导航和主要按钮

### SMOKE-03 · 邮局投递（功能实现后启用）

- Given 城市级邮寄资料有效，用户有发信权限
- When 寄出明信片
- Then 出现在「正在路上」，正文对收件人不可见，投递时间由服务端生成
- When 受控时间小于 `deliver_at`
- Then 收件人的收件列表和详情均无法提前读取
- When 到达 `deliver_at` 后 Worker 扫描两次
- Then 恰好投递一次，明信片出现在「新来信」；本阶段不生成通知，通知去重由后续通知任务验证

### SMOKE-04 · 故事站与记忆地图（功能实现后启用）

- Given 一条尚未批准的城市故事
- When 在发现、城市详情和世界记忆地图入口浏览
- Then 三者都不会显示这条故事
- When 审核为 APPROVED
- Then 故事站及地图城市详情展示同一个 story ID 和内容
- When 故事被作者撤回或审核下架
- Then 两个入口都同步不可见；私人记录从未自动被公开

### SMOKE-05 · 关系、记忆和安全（功能实现后启用）

- Given 两人已拥有可访问的共途记忆
- When 任一方选择停泊或归档
- Then 新的共途通信按权限限制，但历史记忆按原有合法授权可访问
- When 一方封锁另一方
- Then 新信件行为被拒绝，陌生人不可以读取两人的私人双城日记
- And 不得仅通过隐藏按钮假装完成权限控制

**本文件不设计共途邀请的专项测试场景；地图只核对数据一致性和权限，不核对二维/三维渲染技术。**

## 6. 单元测试的关键断言

### DISTANCE / DELIVERY
- 同城 `D=0` → 延迟 720 分钟。
- `D>=0`；负数、无效坐标必须被拒绝。
- 对随机单调递增的非负距离数组：`delay(D₂) >= delay(D₁)`。
- 所有延迟 `720 <= minutes <= 7200`。
- 边界 `D` 超出封顶距离时，仍保持 7200 分钟。
- UTC 下计算 `deliver_at`，时区偏移与客户端本地钟无关。
- 同一幂等请求重试不重复创建送达实体。
- 在途 `IN_TRANSIT` 不允许状态回退为草稿。

### PERMISSION / MODERATION
- 私人日记只允许拥有者或具有明确共享授权的人访问。
- `PENDING/REJECTED/REMOVED` 公开故事均不可查询。
- 封锁优先于已有关系授权；当前在途信按安全策略单独决定。
- 共途暂停状态、信友授权、记忆读取权彼此不能误用或互相覆盖。

### SECURITY
- 密码哈希不可逆；会话失效后不能复用。
- 权限响应一致，不返回其他用户的邮箱、内容、精确地址。
- 超过速率限制有确定错误码；输入验证覆盖长度、空白、编码异常。

## 7. TDD 交付顺序

1. 把任务验收项写成 Given / When / Then。
2. 先加最小失败用例，记录**因缺失业务行为**而失败的证据。
3. 实现可通过该用例的最小功能，运行目标测试。
4. 补边界用例：并发、权限、失败恢复、错误输入。
5. 运行历史回归，再运行当前任务必需的全部质量门禁。
6. 如果重构 API、Schema 或隐私规则，更新 Spec 与相应测试。
7. 以真实命令输出为准；失败先修复，不能靠跳过或修改期望来蒙混。

## 8. 全局质量门禁

每个任务在最终报告中注明：
- 静态检查：ESLint / TypeScript / build。
- 新行为的单元或集成测试，及所有受影响的旧回归。
- 最少一条与本任务有关的 Playwright / HTTP 旁路路径。
- 契约生成检查（如果影响接口）。
- 数据库迁移 / 回滚风险（如果影响持久化）。
- 检查后最新 Git diff 是否包含意外文件或密钥。

**不得宣称“已验收”**：仅能证明代码编译；只运行 mock 单测；E2E 未启动；存在失败用例；测试结果来源于 AI 的主观判断。

## 9. 可追溯证据模板

每次完成任务，在 `tasks/current.md` 的“执行记录”与本机忽略 Git 的验证目录中记录：

```text
Task ID: <TASK-ID>
Commit/Worktree: <hash or path>
Environment: Node / pnpm / PostgreSQL / OS versions
Spec IDs: AUTH-01, NAV-01
Command: pnpm test:e2e
Exit code: 0
Result: PASS | FAIL | NOT_RUN
Assertions: ...
Failure artifact (if any): artifacts/verification/<TASK-ID>/...
Notes: ...
```

不能将同一测试的多次重试挑选成功的一次而隐藏失败记录；失败发生后应说明原因及后续复测结论。

## 10. 首次落地的最低门槛

每个编码任务结束时，至少真实执行：
`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify`。

如果由于执行环境没有 PostgreSQL / 浏览器等依赖无法运行，应标记 `BLOCKED` 或 `PARTIAL`，明确列出缺失条件；禁止编造通过记录。

新增业务功能时，重复运行上述稳定基线，并逐步将 SMOKE-03～05 提升为默认门禁。旧功能不能因“新版 AI 更擅长”而减少验证。

## 11. TASK-001～TASK-009 落地状态（2026-10-29 实测）

命令契约已全部实现，且 `pnpm verify` 会串行执行下列门禁并对任一失败返回非 0。证据目录会读取 `tasks/current.md` 中的任务编号，自动写入 `artifacts/verification/<TASK-ID>/`。

| 命令 | 实现位置 | 实测结果 |
|---|---|---|
| `pnpm install --frozen-lockfile` | `pnpm-lock.yaml` + `pnpm-workspace.yaml`（`allowBuilds` 只放行 Prisma/argon2/esbuild/SWC） | PASS |
| `pnpm lint` | 根 `eslint.config.mjs`（TS + Vue + 测试） | PASS |
| `pnpm typecheck` | `apps/api` tsc、`apps/web` vue-tsc、`packages/api-client` tsc | PASS |
| `pnpm build` | Nest（tsc，保留装饰器元数据）+ Vite 构建 | PASS |
| `pnpm test:unit` | 后端 18 文件 / 115 用例；Web 10 文件 / 64 用例（Vitest + SWC） | PASS |
| `pnpm test:integration` | 11 文件 / 111 用例，NestJS HTTP + 真实 `somewhere_test` 数据库，跑前 `prisma migrate deploy` 与城市种子 | PASS |
| `pnpm test:contract` | 导出 OpenAPI → `openapi-typescript` → 与提交的 `packages/api-client/src/generated.ts` 比对；覆盖 37 条路径，断言故事公开、地图聚合、共途、封锁、信友与个人记忆契约无邮箱/作者 ID/坐标/接信状态/所有者 ID | PASS |
| `pnpm test:architecture` | `tests/architecture/check-boundaries.mjs`：跨层/跨模块导入、Prisma 访问边界、浏览器存储禁令；只允许公开 Module/Guard/Service | PASS |
| `pnpm test:e2e` | Playwright 23 用例，真实 API + PostgreSQL + Vite + Chrome；含故事、地图、邮局、共途、封锁、信友、个人记忆与移动端路径 | PASS |
| `pnpm test:smoke` | 构建产物 + 真实 HTTP 20 项检查（含故事闭环、地图同源、邮局闭环、共途状态、最小封锁、信友与个人记忆） | PASS |
| `pnpm verify` | 串行聚合 9 个子门禁，日志写入 `artifacts/verification/<TASK-ID>/verify/<时间戳>/` | PASS（exit 0） |

测试隔离与安全：

- `apps/api/scripts/test-db-safety.mjs`：仅允许本机、库名含 `test`、非 `NODE_ENV=production` 的数据库；集成测试清空前再次校验。
- E2E 在启动 API 前执行迁移与清库，使用唯一虚构邮箱；浏览器只通过 UI 和公开 HTTP 接口操作。
- 集成测试通过 `config` 覆盖限流上限，限流行为由独立应用实例验证，避免用例互相污染。
- 日志脱敏有单元测试（邮箱、password/token 字段、Bearer、控制字符、截断），并有 stdout 采样断言。

TASK-002 增补（AUTH 收敛）：

- 注册/登录成功响应只返回 `{ id, nickname, cityId?, emailVerified, role }`（`role` 由 TASK-005 增加）；`/auth/me` 是唯一返回本人 email 的认证接口。
- 登录采用单活动会话：新会话生效后，该用户其他活动会话立即撤销；集成、E2E、Smoke 与契约检查均覆盖。
- 红灯证据：先改测试后运行，注册/登录响应仍含 email 时 2 条集成用例失败（`artifacts/verification/TASK-002/red/red-auth-contract.log`）。
- 聚合门禁有效性证明：临时把登录退化回 `issue` 后，`pnpm verify` 返回 exit 1，integration/E2E/Smoke 判 FAIL（`artifacts/verification/TASK-002/red/verify-failure-proof.log`），恢复后重新 PASS。

TASK-003 增补（城市与最小资料）：

- 城市目录为 49 条手工种子，公开接口只返回 `id/name/countryCode`；集成、契约与 Smoke 都断言不出现经纬度。
- 资料接口覆盖本人读取、昵称/城市/接信状态修改、清空城市、非法城市 422、空请求体 422、跨用户隔离与未登录 401。
- E2E 覆盖 `/settings` 保存后刷新仍生效、Header 昵称同步、未登录跳转登录、390px 移动端可用；共 12 条 Playwright 用例。
- 红灯证据：实现前 `/api/v1/cities` 与 `/api/v1/profile/me` 返回 404（`artifacts/verification/TASK-003/red/red-profile-api.log`）。
- 聚合门禁有效性证明：临时跳过非法城市校验后 `pnpm verify` 返回 exit 1，integration/Smoke 判 FAIL（`artifacts/verification/TASK-003/red/verify-failure-proof.log`），恢复后重新 PASS。
- E2E `outputDir` 改为每次运行独立时间戳目录，避免历史失败附件累积触发本机批量删除保护。

TASK-004 增补（邮局与距离延迟投递）：

- 单元测试覆盖 Haversine 同城/已知距离/非法坐标、720–7200 分钟边界与单调性、UTC `deliverAt`、正文 1/2000/2001 与 emoji 码点、可见性矩阵、幂等键格式。
- 集成测试覆盖：401、白名单收件人（无邮箱/坐标）、草稿 CRUD 与跨用户隔离、2000 emoji、发送时间与城市快照、同城 12 小时、重复草稿/幂等键、缺城市/自我发送/非白名单/RESTING、每日 10 张上限与第 11 张 429、在途摘要/列表/详情不含正文、Worker 两次扫描与并发扫描只投递一次、送达后收件箱与正文、改城市不影响旧信。
- E2E 使用两个真实账号完成：保存草稿 → 刷新 → 寄出 → 收件人在途 404 → 测试脚本推进到期并运行真实 Worker → 收件箱恰好一封 → 打开正文；另覆盖 390px 写信页与未登录回跳。
- Smoke 在构建产物上验证同一闭环，并确认第二次 Worker 扫描不增加来信。
- 红灯证据：实现前新增集成测试 9 条因接口 404 失败（`artifacts/verification/TASK-004/red/red-postcards-api.log`）。
- 聚合门禁有效性证明：临时跳过收件人接信状态校验后 `pnpm verify` 返回 exit 1，integration 判 FAIL（`artifacts/verification/TASK-004/red/verify-failure-proof.log`），恢复后重新 PASS。
- 测试专用时间推进脚本 `apps/api/scripts/test-advance-postcard.mjs` 只允许本机测试库，更新 `deliver_at` 后调用真实 Worker；不修改生产延迟公式，也不开放隐藏 HTTP 接口。

TASK-005 增补（城市故事与最小审核）：

- 单元测试覆盖标题 1/80/81、正文 19/20/3000/3001 与全空白、emoji 码点、标签 3/4 与去重、状态转移、公开条件、城市容量、游标编解码。
- 集成测试覆盖：作者草稿/编辑/提交/撤回/删除、跨用户 404、公开列表对 PENDING/REJECTED/REMOVED 不可见、管理员通过/驳回/下架、普通用户 403、匿名 401、管理员自审 403 且不写审计、并发审核只成功一次、城市 50 条容量排队与释放提升、7 天第 4 次提交 429、城市/主题筛选与游标分页、公开响应无 email/坐标/作者 ID、注册不可写入 `role`、`/auth/me` 返回角色。
- E2E 覆盖：作者草稿→刷新→提交→匿名不可见；管理员 `/admin/moderation` 通过→公开列表与详情同一 Story ID；作者撤回→公开入口消失；普通用户进入 `/forbidden`；390px 写作页无横向溢出。
- Smoke 在构建产物上验证同一故事闭环，并断言普通用户审核队列 403、公开响应无邮箱/坐标。
- 红灯证据：实现前新增集成测试 10 条因接口 404 失败（`artifacts/verification/TASK-005/red/red-stories-api.log`）。
- 聚合门禁有效性证明：临时移除 `RolesGuard` 的 403 后 `pnpm verify` 返回 exit 1，integration/Smoke 判 FAIL（`artifacts/verification/TASK-005/red/verify-failure-proof.log`），恢复后重新 PASS。
- 管理员授予使用 `apps/api/scripts/grant-admin.mjs`（`pnpm --filter @somewhere/api admin:grant --email=<虚构账号>`），拒绝生产环境；E2E/Smoke 通过该脚本而不是隐藏 HTTP 接口授予角色。

TASK-006 增补（世界记忆地图业务入口）：

- 单元测试锁定公开谓词 `PUBLIC_STORY_CONDITION` 的四个字段与取值，防止后续为“让地图显示更多”而放宽条件；Web 新增 `usePublicFeed` 测试（分页追加、过期响应丢弃、错误不清空为用户可见空态）。
- 集成测试（`discovery.spec.ts`，11 条）覆盖：匿名 200 与空库空数组；`topic` 去空格与 25 字符 422；草稿/待审/驳回/撤回都不产生城市；聚合计数与 `/stories?cityId=` 返回同一 Story ID 集合；审核通过但排队（`publishedAt=null`）的故事不计入且城市数量仍为 50；撤回后城市消失、重新公开后恢复；管理员下架后城市消失；响应无 email/坐标/作者 ID 且字段白名单固定；城市按最近公开时间倒序而非数量；主题筛选与故事站一致；未知城市故事列表为空而不是 404。
- 契约测试新增 `/api/v1/discovery/cities`（24 条路径），断言 `CityMemoryItemDto` / `DiscoveryCityDto` 含公开数量与最近公开时间且不含坐标、作者 ID、email。
- E2E `map.spec.ts`：待审核时地图不出现城市 → 管理员通过 → 匿名看到城市与「1 篇可读故事」→ 键盘可聚焦 → 单城市页 → 390px 无横向溢出 → 地图与故事站链接指向同一 `/discover/stories/:id` → 作者撤回后两个入口同时消失。
- Smoke 启用 SMOKE-04 的世界记忆地图部分：待审故事的城市不出现、通过后地图计数与故事站条数一致、响应无邮箱/坐标/作者 ID、撤回后城市消失。
- 红灯证据：实现前新增集成测试 10 条因 `/api/v1/discovery/cities` 404 失败（`artifacts/verification/TASK-006/red/red-discovery-api.log`），1 条既有基线用例通过。
- 聚合门禁有效性证明：临时在聚合查询里写第二套可见性条件（去掉“已发布”与“公开授权”）后，`pnpm verify` 在 `test:integration` 判 FAIL 并返回 exit 1（`artifacts/verification/TASK-006/red/verify-failure-proof.log`），恢复后重新 PASS。

TASK-007 增补（共途状态与参与者许可）：

- 单元测试覆盖 `passage-state`：`ACTIVE→COMPLETED`、`ACTIVE/COMPLETED→ARCHIVED` 合法，`ARCHIVED` 终态、`COMPLETED→ACTIVE` 与已完成续程非法、同动作幂等；`passage-policy`：仅「查看者是参与者、恰好两人、进度 ACTIVE、双方 ALLOW」时 `canSend=true`，任一方 `PAUSED/CLOSED` 或进度非 ACTIVE 均为 false；参与者必须为两名不同用户。
- 集成测试（`passages.spec.ts`）：匿名 401、非参与者列表不含且详情 404、`ADMIN` 非参与者同样 404；字段白名单无 email / `receptionMode` / 坐标；A 停泊后 B 不能替 A 续程、双方 `canSend=false`；A 续程恢复；完成不改双方 `consentState`；重复动作幂等不重复写事件；完成后续程 409；归档后 `ACTIVE` 列表消失、`ARCHIVED` 可见、详情仍 200；`CLOSED` 参与者不能续程；并发停泊只产生一条事件；非法 `status` 422。
- 契约测试新增 6 条路径（24 → 30），断言 `PassageSummaryDto` 含 `progressStatus/me/counterpart/permissions`，且不含 email、坐标、`receptionMode`、会话字段。
- E2E `passages.spec.ts`：seed 两人共途 → A 停泊并刷新保持 → B 看到对方停泊且无法替其续程 → A 续程 → 完成 → 归档 → 进行中消失、已归档可读 → 390px 无横向溢出。
- Smoke 新增共途检查：匿名 401、停泊后 `canSend=false`、归档后进行中列表为空、响应无邮箱 / 坐标。
- 实测：后端单元 14 文件 / 89 用例、Web 单元 8 文件 / 47 用例、集成 7 文件 / 72 用例、契约 30 条路径、Playwright 20 用例、Smoke 17 项全部通过；`pnpm verify` 9/9 PASS、exit 0。
- 红灯证据：实现前单元 2 个套件因模块不存在失败、既有 70 条通过（`artifacts/verification/TASK-007/red/red-passage-unit.log`）；集成 11 条因表与接口缺失失败、既有 61 条通过（`red/red-passage-api.log`）。
- 聚合门禁有效性证明：临时让 `canSendPassage` 无条件返回 true 后，`pnpm verify` 在 unit、integration、E2E、Smoke 四处判 FAIL 并返回 exit 1（`red/verify-failure-proof.log`），恢复后重新 PASS。
- 并发覆盖：重复停泊与同人并发停泊均只写 1 条 `PAUSED` 事件；完成与归档并发时终态落在 `COMPLETED` 或 `ARCHIVED`，归档事件不超过 1 条。
- 测试夹具通过原始 SQL 写入三张表，不调用 `PassageService` 的辅助方法替代断言；生产代码没有 HTTP 创建入口。

TASK-008 增补（共途通信许可接入邮局）：

- 实测：后端单元 15 文件 / 92 用例、Web 单元 8 文件 / 48 用例、集成 8 文件 / 80 用例、契约 30 条路径、Playwright 20 用例、Smoke 17 项全部通过；`pnpm verify` 9/9 PASS、exit 0（`artifacts/verification/TASK-008/verify/2026-10-29T08-32-54-678Z`）。
- 集成新增 8 条：参与者绑定草稿、非参与者 404、第三人 422、共途收件人列表与停泊后空数组、正常发送写入 `passage_id`、停泊后 409 且不落库、`RESTING` 仍 422、已绑定草稿不可改收件人。
- 契约：`PostcardDraftResponseDto` 与 `CreatePostcardDraftDto` 断言 `passageId`，`/postcards/recipients` 断言可选 `passageId` 查询参数；TASK-005 的草稿响应键集合测试同步加入 `passageId`（显式契约变化，未删除旧断言）。
- E2E：扩展既有共途用例，验证续程后出现「写一张明信片」、写信页显示共途主题、返回共途、停泊与完成后入口消失。
- Smoke：原有共途检查加入「停泊后创建绑定草稿并发送返回 409 `PASSAGE_STATE_CONFLICT`」。
- 红灯证据：单元因模块不存在失败（`red/red-postcard-passage-unit.log`）；集成新增 8 条中 7 条失败、既有 73 条通过（`red/red-postcard-passage-api.log`）。
- 聚合门禁有效性证明：把 `PassageReader.canSend` 临时改为 `true` 后，lint、integration 与 Smoke 判 FAIL、`pnpm verify` exit 1（`red/verify-failure-proof.log`）。E2E 未捕获该注入，因为详情页入口使用 `PassageService` 的展示许可；两条路径分别由集成测试覆盖。恢复后重新 PASS。

TASK-009 增补（最小封锁）：

- 实测：后端单元 16 文件 / 97 用例（新增 5）、Web 单元 8 文件 / 49 用例（新增 1）、集成 9 文件 / 87 用例（新增 7）、契约 32 条路径（新增 2）、Playwright 21 用例（新增 1）、Smoke 18 项（新增 1），全部通过；`pnpm verify` 9/9 PASS、exit 0。
- 集成新增 7 条：匿名 401、封锁与列表幂等/无 email、默认收件人与共途草稿拦截、共途 `canSend` 与解除恢复、反向封锁发送 403、封锁不改参与者与历史、自己对自己 422 与目标不存在 404。
- 契约：`PassageCounterpartDto` 增加 `id`，并显式断言不包含 email；新增 `/safety/blocks` GET/POST/DELETE 契约。
- E2E：`safety.spec.ts` 从共途寄出 → 封锁 → 写信入口消失 → 设置中解除 → 恢复，并检查 390px 无横向溢出。
- Smoke：新增封锁列表、收件人排除、草稿 403、解除恢复与无 email 检查。
- RED：单元测试先因 `safety/domain/block-policy` 不存在失败；集成新增 7 条均因 `/safety/blocks` 404 失败，随后最小实现转绿。
- 聚合门禁有效性证明：临时把 `BlockRepository.findBetween` 改为只检查单向封锁，`test:integration` FAIL、`pnpm verify` exit 1；E2E 与 Smoke 因未覆盖该方向仍 PASS，说明集成层捕获了旁路遗漏。日志 `artifacts/verification/TASK-009/red/verify-failure-proof.log`。恢复后重新运行全量门禁。

TASK-010 增补（双向信友与邮局接入）：

- 实测：后端单元 17 文件 / 109 用例（新增 1 文件 / 12 用例）、Web 单元 9 文件 / 55 用例（新增 1 文件 / 6 用例）、集成 10 文件 / 102 用例（新增 1 文件 / 15 用例）、契约 35 条路径（新增 3 条）、Playwright 22 用例（新增 1 条）、Smoke 19 项（新增 1 项），全部通过。
- 单元：`derivePenpalStatus` 的 `NONE/ONE_SIDED/ACTIVE/REVOKED` 矩阵、`toPenpalView` 的三种列表归类、封锁覆盖、单方同意不可继续联系、资格判断；`PenpalPolicy` 以替身验证双方 ALLOW 且无封锁才允许继续联系。
- 集成新增 15 条：匿名 401；单方同意只出现在 outgoing/incoming；双方同意 ACTIVE 且重复同意不改变 `consentedAt`；并发同意不产生重复行或单方 ACTIVE；撤销/重复撤销与历史保留；拒绝收到的请求写入 REVOKED 且 `consentedAt` 为空；撤销后重新同意恢复 ACTIVE；正向/反向封锁隐藏列表、请求 403、解除后恢复；自我 422、目标不存在/无完成共途/非参与者 404；归档但曾完成仍具资格；第三方与 ADMIN 看不到他人关系；有效信友进入邮局收件人并可寄信，撤销后 404、封锁后 403；非 `OPEN` 信友不出现在收件人列表；数据库拒绝自指、重复与状态时间不一致的行。
- 契约：新增 `/api/v1/penpals`、`/api/v1/penpals/consent`、`/api/v1/penpals/{counterpartId}/consent`；`PenpalOverviewDto` 断言三组分组，`PenpalCounterpartDto` 只含 `id/nickname/city`，并显式断言不含 email、`receptionMode`、密码、会话、坐标、`consentedAt`、`revokedAt`。
- E2E：`penpals.spec.ts` 从完成共途 → A 请求 → B 在 `/penpals` 同意 → 双方 ACTIVE → 写信收件人包含信友 → A 封锁后列表消失 → 设置解除恢复 → 撤销后列表与收件人均消失；390px 无横向溢出；共途页信友入口可聚焦。
- Smoke：使用不在演示白名单中的第三个虚构账号，验证「双向同意 → ACTIVE → 加入收件人 → 撤销 → 移出收件人」，同时确认原演示白名单收件人仍在；响应无 email、接信状态或同意时间。
- RED：单元因 `penpal/domain/penpal-policy` 不存在失败；集成 14 条因 `/penpals` 404 失败、1 条数据库约束用例通过（`artifacts/verification/TASK-010/red/red-penpal-unit.log`、`red/red-penpal-api.log`）。
- 测试基础设施：集成与 E2E 清库列表加入 `penpal_consents`；`seedPassage` 支持 `COMPLETED` 与“已完成后再归档”夹具；架构白名单允许 `penpal-policy.service` 与 `penpal-reader.service`。
- 聚合门禁有效性证明：临时让 `PenpalService.list` 忽略封锁过滤，`test:integration` 与 `test:e2e` FAIL、`pnpm verify` exit 1；日志 `artifacts/verification/TASK-010/red/verify-failure-proof.log`。恢复后重新运行全量门禁，9/9 PASS。

TASK-011 增补（个人记忆 CRUD 与私有边界）：

- 实测：后端单元 18 文件 / 115 用例（新增 1 文件 / 6 用例）、Web 单元 10 文件 / 64 用例（新增 1 文件 / 8 用例，并补充 1 条 API 客户端用例）、集成 11 文件 / 111 用例（新增 1 文件 / 9 用例）、契约 37 条路径（新增 2 条）、Playwright 23 用例（新增 1 条）、Smoke 20 项（新增 1 项），全部通过。
- 单元：标题 1/80/81、正文 1/3000/3001、全空白/换行/制表符、emoji 码点、空更新、去首尾空白。
- 集成新增 9 条：匿名四个接口 401；创建后只返回本人列表且字段无 email/ownerId；标题/正文边界与空更新；编辑更新 `updatedAt` 与排序；删除只删除本人记录且共途/明信片不变；非本人/ADMIN/非法 UUID 统一 404；共途与信友关系不让渡读取权；分页与非法分页参数；数据库拒绝空白与超长标题/正文。
- 契约：新增 `/api/v1/memories/personal` 与 `/api/v1/memories/personal/{id}`；`PersonalMemoryDto` 只含 `id/title/body/createdAt/updatedAt`，显式断言不含 email、ownerId、密码、会话、来源或公开字段。
- E2E：`memories.spec.ts` 创建 → 刷新保持 → 编辑 → 390px 无横向溢出 → 焦点可用 → 删除 → 另一账号看不到；双城日记与共同手帐仍显示诚实空态。
- Smoke：匿名 401、创建/列表/编辑/删除、他人 PATCH 404、他人列表不含本人记录、响应无 email/ownerId。
- RED：单元因 `memory/domain/personal-memory` 不存在失败；集成 8 条因 `/memories/personal` 404 失败、1 条数据库约束用例最初因表缺失误通过，迁移后改为真实空白/超长约束验证。
- 测试基础设施：集成清库与测试库重置脚本加入 `personal_memories`；第 11 次迁移在测试库应用。
- 聚合门禁有效性证明：临时让 `MemoryRepository.listByOwner` 忽略 `ownerId`，`test:integration`、`test:e2e` 与 `test:smoke` FAIL、`pnpm verify` exit 1；日志 `artifacts/verification/TASK-011/red/verify-failure-proof.log`。恢复后重新运行全量门禁，9/9 PASS。

证据目录：

- 最终全量：`artifacts/verification/<TASK-ID>/final-verify.log`
- 逐命令日志：`artifacts/verification/<TASK-ID>/verify/<时间戳>/`
- E2E 截图：`artifacts/verification/<TASK-ID>/e2e/`
- TDD 红灯与聚合门禁失败证明：`artifacts/verification/<TASK-ID>/red/`
- TASK-002 最终证据：`artifacts/verification/TASK-002/verify/2026-10-28T05-26-29-901Z/`、`artifacts/verification/TASK-002/final-verify.log`
- TASK-003 最终证据：`artifacts/verification/TASK-003/verify/2026-10-28T06-29-17-323Z/`、`artifacts/verification/TASK-003/final-verify.log`
- TASK-004 最终证据：`artifacts/verification/TASK-004/verify/2026-10-28T08-25-27-878Z/`、`artifacts/verification/TASK-004/final-verify.log`
- TASK-005 最终证据：`artifacts/verification/TASK-005/verify/2026-10-29T06-15-10-298Z/`、`artifacts/verification/TASK-005/final-verify.log`
- TASK-006 最终证据：`artifacts/verification/TASK-006/verify/2026-10-29T07-04-34-277Z/`、`artifacts/verification/TASK-006/final-verify.log`
- TASK-007 最终证据：`artifacts/verification/TASK-007/verify/2026-10-29T08-08-19-988Z/`、`artifacts/verification/TASK-007/final-verify.log`
- TASK-008 最终证据：`artifacts/verification/TASK-008/verify/2026-10-29T08-32-54-678Z/`、`artifacts/verification/TASK-008/final-verify.log`
- TASK-009 最终证据：`artifacts/verification/TASK-009/verify/2026-10-29T13-45-48-601Z/`；失败证明 `artifacts/verification/TASK-009/red/verify-failure-proof.log`
- TASK-010 最终证据：`artifacts/verification/TASK-010/verify/2026-10-30T06-25-41-779Z/`、`artifacts/verification/TASK-010/final-verify.log`；失败证明 `artifacts/verification/TASK-010/red/verify-failure-proof.log`
- TASK-011 最终证据：`artifacts/verification/TASK-011/verify/2026-10-30T06-44-14-925Z/`、`artifacts/verification/TASK-011/final-verify.log`；失败证明 `artifacts/verification/TASK-011/red/verify-failure-proof.log`

尚未启用：SMOKE-05（关系与记忆权限）中的共途停泊 / 归档、共途发信许可、最小封锁、信友授权与个人记忆私有边界已由 TASK-007～TASK-011 的 E2E 与 Smoke 覆盖；完整 SMOKE-05 仍需双城日记实现后才能纳入门禁。SMOKE-04 的故事站与地图两部分已由 TASK-005 / TASK-006 启用。举报、通用安全处置、`RESTRICT`、通知、双城日记、共同手帐与 CI 流水线仍未实现。E2E 目前使用本机 Chrome（`channel: chrome`），CI 需改为 `pnpm exec playwright install chromium` 或提供等效浏览器。

## 12. 角色与权限测试计划（规划，未执行）

> 对应规范：`specs/15-roles-and-permissions.md`。当前代码仍为 `USER | ADMIN`；以下命令与用例尚未运行，不得写成已通过。

### 12.1 单元

- 角色蕴含矩阵：`USER`、`MODERATOR`、`CURATOR`、`ADMIN` 分别满足/不满足哪些 `@Roles`。
- `RolesGuard`：无用户 401；角色不足 403；`ADMIN` 满足 `MODERATOR`/`CURATOR`；`MODERATOR` 不满足 `CURATOR`/`ADMIN`。
- 角色变更规则：不能授予 `GUEST`、未知角色或空角色；不能降级最后一个 `ADMIN`；不能修改自己的角色；重复设置幂等。
- `GUEST` 不进入数据库角色枚举，不创建用户行。

### 12.2 集成

- 匿名访问 `/moderation/queue`、`/admin/users`、`/admin/role-changes` 全部 401。
- `USER` 访问审核/管理接口 403。
- `MODERATOR` 访问审核队列 200；访问 `/admin/users`、`/admin/role-changes` 403。
- `ADMIN` 访问审核与管理接口 200。
- `MODERATOR` 审核自己的故事 403，且 `story_review_actions` 不新增记录。
- `ADMIN` 修改用户角色成功；目标用户下一次请求获得新角色；`role_changes` 新增一条审计。
- 不能授予 `GUEST`；不能降级最后一个 `ADMIN`；不能修改自己的角色。
- 后台用户列表响应只含 `id/nickname/role/createdAt`，不含 email、掩码邮箱、邮箱域名或邮箱哈希。
- `ADMIN` / `MODERATOR` 访问他人明信片详情 404；未来访问他人个人记忆同样 404。
- 注册请求携带 `role` 仍被拒绝（422），不产生特权账号。

### 12.3 契约

- `UserRole` 枚举扩展后，登录/注册/`/auth/me` 的 `role` 字段仍存在且类型正确。
- `/admin/users`、`/admin/role-changes` 的响应字段白名单不含 email。
- 审核接口的 401/403/200 响应约定不泄露角色内部原因。

### 12.4 E2E

- `ADMIN` 在 `/admin/users` 按昵称或 ID 找到账号并授予 `MODERATOR`；页面不显示 email。
- `MODERATOR` 登录后能进入审核台并通过一条待审故事；看不到用户管理入口。
- 普通用户进入审核台被拒绝。
- `ADMIN` 查看角色变更审计；审计中没有 email。
- 角色变更后刷新页面/下一次请求即生效。

### 12.5 门禁

未来角色任务至少运行：

```text
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:architecture
pnpm test:e2e
pnpm test:smoke
pnpm verify
```

当前状态：**NOT RUN**。本文件只记录规划，不代表角色功能已实现或测试已通过。

## 13. TASK-012 实施记录与 TASK-013 规划测试

> 2026-10-30 记录。TASK-012 已实现并验收；TASK-013 仍为规划，未运行。

### 13.1 TASK-012 回信

单元：

- 回信资格矩阵：查看者为收件人、原信 `DELIVERED`、原信有 `passageId`、无既有回信、未封锁、`canSend` 为真时才允许。
- 正文 1/2000/2001 与全空白、emoji 码点；`replyToPostcardId` 不可通过 PATCH 修改。

集成：

- 匿名 401；原信在途 / 非参与者 / 回复自己的信 / 原信无共途 / 重复回信 / 停泊 / 封锁的返回码与“不落库”。
- 合法回信写入 `recipientId`、`passageId`、`reply_to_postcard_id`；客户端传第三人 422。
- 并发两封回信只成功一封；失败不消耗草稿与每日额度。
- `GET /postcards/:id` 的 `canReply` 只在收件人、已送达、共途、无封锁、可发送时为真。

契约：

- `CreatePostcardDraftDto` 增 `replyToPostcardId`；`PostcardDetailDto` 增 `passageId`、`canReply`；响应白名单不含 email、坐标、`receptionMode`、角色。

E2E / Smoke：

- 共途寄信 → 推进到期 + Worker → 收件人回信 → 推进到期 + Worker；停泊后回信入口消失；390px 无横向溢出。
- Smoke 覆盖 401、合法回信、停泊 409、重复回信 409、响应无 email。

实测（2026-10-30）：后端单元 19 文件 / 123 用例（新增 1 文件 / 8 用例）；Web 单元 10 文件 / 65 用例（新增 1 条 API 客户端用例）；集成 12 文件 / 120 用例（新增 1 文件 / 9 用例）；契约 37 条路径（字段新增，路径数不变）；Playwright 24 用例（新增 1 条）；Smoke 21 项（新增 1 项）；`pnpm verify` 9/9 PASS、exit 0。

- 红灯证据：`artifacts/verification/TASK-012/red/red-reply-unit.log`（模块不存在）、`red/red-reply-api.log`（8 条失败 / 1 条通过）。
- 故障注入：临时让 `alreadyReplied` 恒为 false，`test:integration`、`test:e2e`、`test:smoke` FAIL、`pnpm verify` exit 1；日志 `artifacts/verification/TASK-012/red/verify-failure-proof.log`。恢复后全量门禁重新 PASS。

### 13.2 TASK-013 双城日记（依赖已具备，未执行）

单元：

- 配对纯函数：`right.replyTo = left.id`、两封 `DELIVERED`、同 `passageId`、不同作者、`left` 早于 `right`。
- 可读矩阵：参与者 × 两封状态（`DELIVERED`/`IN_TRANSIT`/`RESTRICTED`）× 是否封锁。

集成：

- 只有一封送达不生成；两封送达恰好一页；Worker 连续两次、并发两次仍一页。
- 列表只返回元数据且只含本人可读页；详情含两封正文；第三人、`ADMIN`、非法 UUID 404。
- 任一封 `RESTRICTED` 后详情 404、列表隐藏；归档/完成/停泊/撤销信友后仍可读。
- 相邻两页共享一封信时，两页都能读取且正文只存一份。

契约：

- 新增 `/memories/diaries` 与 `/memories/diaries/{id}`；列表无正文字段；详情字段白名单无 email、userId、ownerId、坐标。

E2E / Smoke：

- 双向交换 → 双方在 `/memories` 看到同一页 → 打开双页 → 第三人 404 → 归档后仍可读 → 390px 无横向溢出。

### 13.3 门禁

```text
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:architecture
pnpm test:e2e
pnpm test:smoke
pnpm verify
```

当前状态：TASK-012 **PASS**；TASK-013 **NOT RUN**。
