# 当前开发任务 · TASK-001

状态：**DONE（TASK-001 已完成并通过门禁，等待下一任务指令）**  
任务名称：**Somewhere Web 基础工程 + 登录注册闭环 + 四导航空壳**  
任务类型：创建项目基础 / 旁路回归基线  
优先级：P0  
变更授权：本文件授权范围内；此文档是交付给编码代理的任务说明，不代表已经运行。

## 1. 背景与目标

先建立一个可重复启动、可验证、能保持历史功能不退化的最小工程。第一项业务能力只做账号注册、登录、会话保持、退出与四个主导航的路由空态。参照 `specs/02-auth.md` 和 `specs/01-navigation.md`。

**暂时不开发**明信片业务、城市故事、地图渲染、共途、信友、纪念册、内容审核后台、善意接力、三维/二维地图具体方案。模块允许留下文件夹或路由占位，但不得出现伪造的“可用功能”。

## 2. 预计新增路径（先检测是否已有）

```text
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
apps/web/...
apps/api/...
apps/api/prisma/...
packages/api-client/...
tests/e2e/...
tests/contract/...
tests/architecture/...
infra/...
```

`AGENTS.md`、`docs/`、`specs/`、`tasks/current.md` 必须保留原有内容；因实现而需要修订时同步维护，不整份覆盖。

## 3. 工作拆分

- [x] `T1-01` 读取工程文档并只读检查现有仓库；给出文件改动清单和不覆盖现有文件的方案。
- [x] `T1-02` 建立 pnpm workspace：Vue3 / Vite / TypeScript Web、NestJS API、Prisma PostgreSQL、版本锁定与 `.gitignore`。
- [x] `T1-03` 建立最小数据库：`users`、`sessions`；创建安全迁移与测试种子机制。
- [x] `T1-04` **先写失败测试**：注册成功、重复邮箱、登录成功/失败、会话保持、退出后失效、保护路由。
- [x] `T1-05` 实现后端认证端点、密码哈希、会话 Cookie、输入校验与基础限流。
- [x] `T1-06` 实现前端注册、登录、退出、当前用户状态和路由守卫。
- [x] `T1-07` 实现四个主导航页面：邮局、发现、共途、纪念册；非当前功能显示真实空态及后续计划说明。
- [x] `T1-08` 建立独立 Playwright 旁路：浏览器完成注册→登录→刷新→四导航→退出，不使用内部 AuthService helper。
- [x] `T1-09` 接通 lint、typecheck、build、unit、integration、contract、architecture、e2e、smoke、verify 命令；任何未实现检查不得假装通过。
- [x] `T1-10` 运行全部当前可运行门禁，记录失败与修复证据；同步更新架构/测试/任务记录。

## 4. 验收条件（每条必须附实际证据）

### AC-01 · 可复现环境

Given 新检出的仓库与文档明确列出的本地前置依赖，When 执行文档说明的安装、迁移和启动命令，Then Web、API 与隔离的开发数据库正常启动；依赖版本有锁文件；没有硬编码凭据。

**证据**：实际命令、退出码、健康检查 HTTP 返回，以及必要的环境说明。

### AC-02 · 注册（AUTH）

Given 未注册的虚构邮箱，When 填写有效昵称、邮箱、密码及成年人声明后提交，Then 创建一个用户；数据库存储密码哈希而不是明文；输入不合法返回明确错误。

**证据**：后端集成测试及浏览器流程截图/trace（虚构数据）。

### AC-03 · 登录与会话

Given 已创建的账号，When 使用正确密码登录并刷新受保护页面，Then 当前会话持续有效；错误密码不能登录，前端不保存会话密钥于 localStorage。

**证据**：`/api/v1/auth/me` 响应和真实浏览器刷新验证。

### AC-04 · 退出

Given 已登录，When 退出，Then 会话在服务端失效，刷新页面不能恢复受保护内容；旧 Cookie 再使用也无权访问 `/auth/me`。

**证据**：HTTP 集成测试及 E2E。

### AC-05 · 导航与空态

Given 已登录，When 依次访问四个主导航，Then 路由正确、布局稳定、页面不会渲染虚假的来信或故事；键盘可访问主要导航；未登录访问私人路由时要求登录。

**证据**：Playwright 断言和截图/trace。

### AC-06 · 防退化命令

Given 完成实现，When 执行 `docs/testing.md` 的目标脚本，Then `pnpm verify` 能聚合各子门禁并对任意失败返回非零退出码；单独旁路测试可以重复运行且不依赖业务内部 helper。

**证据**：实际命令日志、至少一次故意制造的非敏感失败对聚合门禁的有效性证明（完成后恢复代码）。

### AC-07 · 安全基线

Given 运行中的 API，When 未登录、重复注册、频繁错误登录或尝试读取他人私有信息，Then HTTP 按文档返回可预期的状态码；服务端日志不输出密码、会话 Cookie 或用户私密内容。

**证据**：对应 HTTP 测试与日志采样（脱敏）。

## 5. 实施顺序（严格 TDD）

1. **只读发现**：`git status`、现有项目结构、文档与依赖。
2. **架构基座**：建立能运行的最小工作区和隔离数据库。
3. **先测试**：认证服务测试及黑盒注册/登录路径，观察合理的红灯。
4. **最小实现**：先 API，再 Web 页面；不要提前建设其他业务模块。
5. **端到端贯通**：浏览器 + API + PostgreSQL 真正协同。
6. **独立验收**：既跑新用例，也保留之前跑通的基线。
7. **回写证据**：更新本文件最后的记录，不自动开始 TASK-002。

## 6. 本任务必须遵循的限制

- 不新增共途邀请专项测试，不做地图的二维/三维技术实现选型。
- 不要借此任务实现完整 UI 视觉、故事发布、明信片投递或推荐系统。
- 不调用真实用户服务；测试邮箱 / 密码均虚构；不要求用户购买第三方服务。
- 如发现 `AGENTS.md` 与业务 Spec 冲突或安全风险，停止相关修改并在报告中说明。
- 如本地无 Docker/PostgreSQL/浏览器，报告缺失并提供可重复命令，不能虚报验收完成。

## 7. 建议交付清单

- 能启动的 Web/API/数据库与迁移脚本。
- 注册、登录、会话、退出的最小业务实现与前端页面。
- 四导航空态与基础响应式布局。
- Unit、API Integration、Playwright E2E、Smoke、Contract、Architecture 的基线命令。
- `.env.example`（仅虚构值）与最小启动说明。
- 实际执行结果和失败记录。

## 8. 执行记录（编码代理实施时填写）

| 字段 | 当前值 |
|---|---|
| 开始时间 | 2026-10-28 11:26（UTC+8） |
| 环境与版本 | macOS 26.4 arm64；Node v24.20.0；pnpm 12.15.0；PostgreSQL 17.11（Homebrew）；Playwright 1.64.1 + 本机 Chrome |
| 代码变更 | pnpm workspace（`apps/web`、`apps/api`、`packages/api-client`）；Prisma `users`/`sessions` 与迁移；认证 API 与安全中间件；四导航 Web 与认证页面；`tests/{e2e,contract,architecture,smoke}`；`scripts/verify.mjs`；`infra/postgres`；`README.md` |
| 新增测试 | 后端单元 39、Web 单元 23、API 集成 18、Playwright 8、Smoke 10 项检查 |
| 实际运行命令 | `pnpm install --frozen-lockfile`、`pnpm db:deploy`、`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm test:architecture`、`pnpm test:e2e`、`pnpm test:smoke`、`pnpm verify` |
| 通过项 | 最终 `pnpm verify` 9/9 子门禁 PASS，退出码 0；证据目录 `artifacts/verification/TASK-001/verify/2026-10-28T03-41-22-783Z` |
| 未通过 / 阻塞 | 无 |
| 验收结论 | **DONE · PASS** |

### 8.1 验收证据（实测）

| 验收项 | 证据 | 结果 |
|---|---|---|
| AC-01 可复现环境 | `pnpm install --frozen-lockfile` 成功；`pnpm db:deploy` 应用提交的迁移；`GET /api/v1/health` 返回 `{"status":"ok","database":"up"}`；`.env.example` 全部为虚构值 | PASS |
| AC-02 注册 | 集成测试断言：用户数 1、`password_hash` 以 `$argon2id$` 开头且不含明文、重复邮箱（大小写/空格）409 且不新增用户、非法输入 422；E2E 截图 `artifacts/verification/TASK-001/e2e/register-success-post-office.png` | PASS |
| AC-03 登录与会话 | 集成测试：正确密码 200、Cookie 轮换、`/auth/me` 返回本人；错误密码与不存在账号同为 401 `AUTH_INVALID_CREDENTIALS`；E2E 刷新后 `page.request` 调用 `/auth/me` 仍返回本人，`localStorage`/`sessionStorage` 为空 | PASS |
| AC-04 退出 | 集成测试：退出 204 + 清 Cookie、数据库 `revoked_at` 写入、旧 Cookie 再访问 `/auth/me` 401；E2E 用退出前的 Cookie 直连 API 仍 401，刷新私人页面回到登录 | PASS |
| AC-05 导航与空态 | 8 条 Playwright 用例：四导航标题/空态、键盘 Tab 顺序、匿名访问发现、私人路由跳转登录并回跳；截图 `nav-*.png`、`mobile-passages.png`；390×844 无横向溢出 | PASS |
| AC-06 防退化命令 | `pnpm verify` 串行聚合 9 个门禁；故意把密码最小长度改为 8 后运行 `pnpm verify` 返回 exit 1，unit/integration 判 FAIL（日志 `artifacts/verification/TASK-001/red/verify-failure-proof.log`），恢复后再次 PASS | PASS |
| AC-07 安全基线 | 集成测试：限流 429、恶意 Origin 403、统一 JSON 错误、requestId 回传、安全响应头、日志不含密码/邮箱/会话 Token；测试均使用虚构数据 | PASS |

补充说明：

- 红灯证据：实现完成后临时移除 `AuthController` 注册以复现“缺失行为”，认证集成测试 10/10 失败（`artifacts/verification/TASK-001/red/red-auth-integration.log`），证明测试确实依赖目标行为而非空跑；诚实说明：本次实现与测试在同一会话中交替完成，红灯在实现后复现，而非严格的测试先行时间顺序。
- E2E 只通过浏览器 UI 与公开 HTTP 接口操作，不导入 `AuthService` 或数据库 Repository；测试数据由 UI 注册产生。
- 测试库隔离：`TEST_DATABASE_URL` 必须包含 `test` 且位于本机，脚本拒绝生产环境与非测试库。
- 已知限制：尚未实现邮箱验证、找回密码、设备级会话管理与账号删除；JSON 日志、限流状态保存在单实例内存中；E2E 依赖本机 Chrome。

只有用户批准下一阶段后，才把新的任务替换进 `tasks/current.md`。每次替换前应在 Git 历史保留上一任务的验收证据。

## 9. 可直接交给编码代理的启动指令

> 先阅读 `AGENTS.md`、`tasks/current.md`、`docs/architecture.md`、`docs/testing.md`、`specs/00-index.md`、`specs/01-navigation.md`、`specs/02-auth.md`。只执行 TASK-001。先只读检查仓库并列出计划的文件变更，然后按 TDD 实现基础工程与注册登录闭环。运行所有可用的独立测试并给出真实命令、退出码和证据。不得提前开发其他模块，不得把缺失测试报告成通过。完成后停止，等待下一任务。
