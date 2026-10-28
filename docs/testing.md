# Somewhere · 测试与独立验收规则

> 当前状态：**测试策略与脚本命令契约 + TASK-001/TASK-002/TASK-003 已落地的可运行基线**。第 1–9 节是长期约束；第 11 节记录认证、城市与资料任务实际实现的命令与实测结果。除第 11 节列出的已验证能力外，不得据此声称其他业务测试已经通过。

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

## 11. TASK-001～TASK-004 落地状态（2026-10-28 实测）

命令契约已全部实现，且 `pnpm verify` 会串行执行下列门禁并对任一失败返回非 0。证据目录会读取 `tasks/current.md` 中的任务编号，自动写入 `artifacts/verification/<TASK-ID>/`。

| 命令 | 实现位置 | 实测结果 |
|---|---|---|
| `pnpm install --frozen-lockfile` | `pnpm-lock.yaml` + `pnpm-workspace.yaml`（`allowBuilds` 只放行 Prisma/argon2/esbuild/SWC） | PASS |
| `pnpm lint` | 根 `eslint.config.mjs`（TS + Vue + 测试） | PASS |
| `pnpm typecheck` | `apps/api` tsc、`apps/web` vue-tsc、`packages/api-client` tsc | PASS |
| `pnpm build` | Nest（tsc，保留装饰器元数据）+ Vite 构建 | PASS |
| `pnpm test:unit` | 后端 10 文件 / 57 用例；Web 5 文件 / 30 用例（Vitest + SWC） | PASS |
| `pnpm test:integration` | 4 文件 / 35 用例，NestJS HTTP + 真实 `somewhere_test` 数据库，跑前 `prisma migrate deploy` 与城市种子 | PASS |
| `pnpm test:contract` | 导出 OpenAPI → `openapi-typescript` → 与提交的 `packages/api-client/src/generated.ts` 比对；覆盖 15 条路径，断言摘要无正文、收件人无邮箱/坐标 | PASS |
| `pnpm test:architecture` | `tests/architecture/check-boundaries.mjs`：跨层/跨模块导入、Prisma 访问边界、浏览器存储禁令；只允许公开 Module/Guard/Service | PASS |
| `pnpm test:e2e` | Playwright 15 用例，真实 API + PostgreSQL + Vite + Chrome；含邮局寄出/在途保密/Worker 送达 | PASS |
| `pnpm test:smoke` | 构建产物 + 真实 HTTP 14 项检查（含邮局闭环与 Worker 只投递一次） | PASS |
| `pnpm verify` | 串行聚合 9 个子门禁，日志写入 `artifacts/verification/<TASK-ID>/verify/<时间戳>/` | PASS（exit 0） |

测试隔离与安全：

- `apps/api/scripts/test-db-safety.mjs`：仅允许本机、库名含 `test`、非 `NODE_ENV=production` 的数据库；集成测试清空前再次校验。
- E2E 在启动 API 前执行迁移与清库，使用唯一虚构邮箱；浏览器只通过 UI 和公开 HTTP 接口操作。
- 集成测试通过 `config` 覆盖限流上限，限流行为由独立应用实例验证，避免用例互相污染。
- 日志脱敏有单元测试（邮箱、password/token 字段、Bearer、控制字符、截断），并有 stdout 采样断言。

TASK-002 增补（AUTH 收敛）：

- 注册/登录成功响应只返回 `{ id, nickname, cityId?, emailVerified }`；`/auth/me` 是唯一返回本人 email 的认证接口。
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

证据目录：

- 最终全量：`artifacts/verification/<TASK-ID>/final-verify.log`
- 逐命令日志：`artifacts/verification/<TASK-ID>/verify/<时间戳>/`
- E2E 截图：`artifacts/verification/<TASK-ID>/e2e/`
- TDD 红灯与聚合门禁失败证明：`artifacts/verification/<TASK-ID>/red/`
- TASK-002 最终证据：`artifacts/verification/TASK-002/verify/2026-10-28T05-26-29-901Z/`、`artifacts/verification/TASK-002/final-verify.log`
- TASK-003 最终证据：`artifacts/verification/TASK-003/verify/2026-10-28T06-29-17-323Z/`、`artifacts/verification/TASK-003/final-verify.log`
- TASK-004 最终证据：`artifacts/verification/TASK-004/verify/2026-10-28T08-25-27-878Z/`、`artifacts/verification/TASK-004/final-verify.log`

尚未启用：SMOKE-04～05（故事/地图、关系与记忆权限）要等对应业务任务实现后再纳入门禁；通知、审核处置与 CI 流水线同样未实现。E2E 目前使用本机 Chrome（`channel: chrome`），CI 需改为 `pnpm exec playwright install chromium` 或提供等效浏览器。
