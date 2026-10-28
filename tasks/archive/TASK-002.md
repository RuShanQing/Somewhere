# 当前开发任务 · TASK-002

状态：**DONE（TASK-002 已完成并通过门禁，等待下一任务指令）**  
任务名称：**AUTH 收敛与独立验收（注册 / 登录 / 会话 / 退出）**  
任务类型：认证契约收敛 / 安全回归 / 独立验收  
优先级：P0  
变更授权：本文件授权范围内；TASK-001 的验收记录已归档到 `tasks/archive/TASK-001.md`。

## 1. 背景与目标

TASK-001 已交付可运行的注册、登录、会话、退出与四导航壳，并通过 `pnpm verify`。TASK-002 **不重做认证**，也不迁移技术栈，只解决 TASK-001 遗留的契约与语义缺口：

1. `specs/02-auth.md` 规定成功响应为 `{ id, nickname, cityId?, emailVerified }`，只有 `/auth/me`（及本人设置接口）允许返回自己的邮箱；当前注册/登录也返回 email，需要收敛。
2. `specs/02-auth.md` 要求登录轮换会话，但未明确旧会话是否失效；TASK-002 定为**单活动会话策略**：登录成功后撤销该用户其他活动会话。
3. 补齐对应单元、集成、契约、E2E 与冒烟回归，并重新执行独立验收。

技术栈保持 **Prisma + Vitest**，不引入 Docker Compose、TypeORM、Jest 或新业务模块。

## 2. 范围

### 2.1 后端

- 新增会话用户 DTO：`id, nickname, emailVerified, cityId`；注册/登录只返回该 DTO。
- `/auth/me` 继续返回本人 email（受 `SessionGuard` 保护）。
- 登录成功后创建新会话并撤销该用户其他活动会话；注册只创建首个会话。
- 退出只撤销当前会话，保持原有语义。
- 不新增接口、不新增数据库表、不修改迁移。

### 2.2 前端

- 认证 store 的用户类型改为会话用户；页面不依赖注册/登录响应中的 email。
- 其余登录、注册、退出、路由守卫、四导航行为保持不变。

### 2.3 契约与测试

- OpenAPI 与 `packages/api-client/src/generated.ts` 同步生成；契约检查新增“注册/登录响应不含 email”断言。
- 集成测试新增响应字段、单会话轮换、旧 Cookie 失效、`/auth/me` 保留 email。
- 冒烟脚本同步注册响应断言。
- 全量 `pnpm verify` 与一次故意失败证明。

## 3. 明确不做

- 不实现邮箱验证、找回密码、设备会话列表、账号删除（`AUTH-07`）。
- 不实现个人资料、城市、接信状态（ProfileModule，后续任务）。
- 不实现邮局、明信片、发现、地图、共途、信友、纪念册、通知、审核。
- 不展开共途邀请专项测试与地图技术方案。
- 不迁移 TypeORM / Jest，不引入 Docker Compose。
- 不调整视觉风格或四导航空态文案。

## 4. 工作拆分

- [x] `T2-01` 归档 TASK-001，建立 TASK-002 范围与验收。
- [x] `T2-02` 先写失败测试：注册/登录响应不含 email、登录后旧会话失效、`/auth/me` 仍返回 email。
- [x] `T2-03` 实现会话用户 DTO 与单活动会话轮换。
- [x] `T2-04` 同步前端 store、OpenAPI 客户端与契约检查。
- [x] `T2-05` 同步冒烟脚本与文档（`specs/02-auth.md`、架构、测试、README）。
- [x] `T2-06` 执行全量 `pnpm verify`，记录证据；完成一次故意失败证明并恢复。

## 5. 验收条件

### AC-01 · 响应契约

Given 未登录用户调用注册或登录接口，When 请求成功，Then 响应只包含 `{ id, nickname, cityId, emailVerified }`，不包含 email、密码哈希或会话 Token；`GET /auth/me` 仍返回本人 email。

### AC-02 · 单活动会话

Given 同一账号已有一个活动会话，When 再次登录成功，Then 新会话可用、旧会话立即返回 401；数据库中该用户只有一个未撤销、未过期的会话。

### AC-03 · 过期与撤销

Given 会话过期、已撤销或伪造，When 访问 `/auth/me`，Then 返回 401 `AUTH_REQUIRED`；退出后旧 Cookie 同样失效。

### AC-04 · 前端与导航不退化

Given 用户通过浏览器注册并登录，When 刷新页面、切换四个主导航、退出，Then 行为与 TASK-001 一致；浏览器存储中无会话信息。

### AC-05 · 安全基线不退化

Cookie 属性、Origin 校验、限流、统一错误体、日志脱敏与安全响应头保持通过；注册/登录响应不泄露邮箱。

### AC-06 · 质量门禁

`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke` 全部实际运行并通过；`pnpm verify` 退出码 0。故意制造非敏感失败时 `pnpm verify` 必须返回非 0。

### AC-07 · 文档同步

`specs/02-auth.md` 明确响应字段与单活动会话策略；`docs/architecture.md`、`docs/testing.md`、`README.md` 与实现一致。

## 6. 实施顺序

1. 归档与任务范围（本文件）。
2. 先改集成测试，观察响应字段与旧会话仍有效的红灯。
3. 最小实现：DTO/映射 → 单会话轮换 → 前端类型。
4. 重新生成 OpenAPI 客户端，更新契约与冒烟。
5. 全量回归、失败证明、文档与证据回写。

## 7. 执行记录（实施后填写）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-28 12:55（UTC+8） |
| 环境 | macOS 26.4 arm64；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11（Homebrew）；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | `AuthSessionUserDto` / `AuthUserDto` 拆分；`SessionService.rotateForUser` + `SessionRepository.revokeOthers`；登录改为单活动会话；api-client 类型；Web auth store 类型；`scripts/verify.mjs` 与 E2E 证据目录跟随任务编号 |
| 新增/更新测试 | 集成 19（新增响应字段、单会话轮换、登录失败不撤销会话）；E2E 9（新增会话轮换）；Smoke 11 项（新增登录轮换与旧会话失效）；契约新增响应 schema 断言 |
| 实际运行命令 | `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify` |
| 通过项 | 最终 `pnpm verify` 9/9 子门禁 PASS，退出码 0；证据目录 `artifacts/verification/TASK-002/verify/2026-10-28T05-26-29-901Z` |
| 未通过 / 阻塞 | 无 |
| 验收结论 | **DONE · PASS** |

### 7.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 响应契约 | 集成测试断言注册/登录响应无 `email` 字段、`/auth/me` 返回本人 email；契约测试断言 register 201/login 200 引用 `AuthSessionUserDto`（无 email）、me 引用 `AuthUserDto` | PASS |
| AC-02 单活动会话 | 集成测试：登录后旧 Cookie 401、新 Cookie 200、数据库 2 条会话中仅 1 条 `revoked_at IS NULL`；E2E 清 Cookie 重新登录后旧 Cookie 重放 401；Smoke 断言登录响应无 email 且旧会话失效 | PASS |
| AC-03 过期与撤销 | 过期会话、退出撤销、伪造 Cookie 的集成测试均返回 401 `AUTH_REQUIRED`；退出后数据库 `revoked_at` 写入 | PASS |
| AC-04 前端与导航 | Playwright 9/9 通过：注册→刷新→四导航→退出、回跳、键盘、390×844；截图位于 `artifacts/verification/TASK-002/e2e/` | PASS |
| AC-05 安全基线 | 集成测试覆盖 Cookie 属性、恶意 Origin 403、限流 429、统一错误体、安全响应头、日志脱敏；响应不再包含 email | PASS |
| AC-06 质量门禁 | `pnpm verify` 9/9 PASS（exit 0）；临时把登录退化回 `issue` 后 verify 返回 exit 1，integration/E2E/Smoke 判 FAIL，恢复后重新 PASS | PASS |
| AC-07 文档同步 | `specs/02-auth.md` 增补响应字段与单活动会话；`docs/architecture.md`、`docs/testing.md`、`README.md` 已同步 | PASS |

补充说明：

- 红灯证据：先修改集成测试后运行，注册/登录仍返回 email 导致 2 条用例失败（`artifacts/verification/TASK-002/red/red-auth-contract.log`）。
- 故意失败证明日志：`artifacts/verification/TASK-002/red/verify-failure-proof.log`，退出码 1；恢复实现后最终日志 `artifacts/verification/TASK-002/final-verify.log`。
- 单活动会话的并发登录竞态未做数据库级串行化；当前单实例演示场景可接受，已在代码注释与 Spec 中说明。
- `pnpm verify` 与 Playwright 证据目录现在读取 `tasks/current.md` 的任务编号，不再写死 TASK-001。

## 8. 下一步

完成 TASK-002 全部验收后停止，等待用户批准下一个任务；不自动开始 Profile/City 或邮局模块。
