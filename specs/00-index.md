# Somewhere · 功能规范索引

**这是面向编码代理的“需求事实源”**，不是功能已经完成的证明。开发阶段按 `tasks/current.md` 选择对应文件，只允许实现已授权范围。文档编号用于稳定交叉引用；发生技术变更时同步检查相关模块。

## 0. 当前实现进度（2026-10-29）

> 截至 TASK-008 完成。这里只记录代码与验收状态，不代表 PRD 全部完成；实际结果以 `tasks/current.md` 和 `artifacts/verification/` 为准。

| 规范 | 当前状态 | 已实现 | 尚未实现 |
|---|---|---|---|
| [01-navigation.md](01-navigation.md) | 基础完成 | 四导航、路由守卫、登录/注册页、设置页、诚实空态、键盘与移动端 | 纪念册业务页 |
| [02-auth.md](02-auth.md) | 基础完成 | 注册/登录/退出、`/auth/me`、Argon2id、Cookie、单活动会话、限流、Origin、日志脱敏、`USER/ADMIN` 角色 | 邮箱验证、找回密码、设备会话、账号删除、OAuth |
| [03-profiles.md](03-profiles.md) | 薄切片完成 | 49 条城市目录、昵称/城市/接信状态、最小 `/settings` | bio、语言、主题标签、可见性、公开资料页、自建城市 |
| [04-post-office.md](04-post-office.md) | 基础完成 | 邮局三栏摘要、写信页、详情页、加载/空/错误态、移动端 | 回信、通知、审核隔离 |
| [05-postcards-delivery.md](05-postcards-delivery.md) | TASK-008 完成 | 草稿 CRUD、发送事务、按城市距离延迟、Worker 只投递一次、在途保密、演示白名单、共途来源、每日上限 | 信友来源、回信、模板、通知、审核处置 |
| [06-city-stories.md](06-city-stories.md) | TASK-005 完成 | 故事草稿/提交/撤回、管理员审核、公开故事站与详情、城市容量与提交配额 | 显示城市/上地图/共途邀请开关、匿名作者、30 天轮换 |
| [07-world-memory-map.md](07-world-memory-map.md) | TASK-006 完成 | 城市聚合接口、`/discover/map` 城市入口页、单城市故事页；复用同一 `Story ID` 与审核状态 | 地图渲染技术（MAP-06 明确列为非目标） |
| [08-goodwill-relay.md](08-goodwill-relay.md) | 未开始（P1） | 无 | 接力匹配、匿名、终止 |
| [09-shared-passage.md](09-shared-passage.md) | TASK-008 完成 | 列表/详情、停泊/续程/完成/归档、`canSend`、非生产 seed、并发与幂等、邮局 `passage_id` 接入 | 邀请、信友联动、纪念册 |
| [10-penpals.md](10-penpals.md) | 未开始 | 无 | 双向信友授权 |
| [11-memories.md](11-memories.md) | 未开始 | 无 | 双城日记、共同手帐、个人记忆 |
| [12-safety-and-moderation.md](12-safety-and-moderation.md) | 故事审核完成 | 通用 Origin/限流/错误基线、`ADMIN` 故事审核与审计 | 举报、封锁、通用安全处置、`RESTRICT` |
| [13-notifications.md](13-notifications.md) | 未开始 | 无 | 送达通知、通知偏好 |
| [14-story-deferred-scope.md](14-story-deferred-scope.md) | 范围决策 | TASK-005 已按边界实现 | 显示城市/上地图/共途邀请开关、匿名作者、30 天轮换等 |
| [15-roles-and-permissions.md](15-roles-and-permissions.md) | 规划（未实现） | 当前仍为 `USER/ADMIN`；`GUEST` 仅表示未登录 | `MODERATOR` 最小切片、`ADMIN` 用户/角色管理、`CURATOR` 与精选专题 |

**最近任务**：TASK-001 基础工程与认证；TASK-002 AUTH 收敛；TASK-003 城市与最小资料；TASK-004 邮局与距离延迟投递；TASK-005 城市故事站与最小审核闭环；TASK-006 世界记忆地图业务入口；TASK-007 共途状态与参与者许可；TASK-008 共途通信许可接入邮局（DONE）。
**建议下一任务**：双向信友（`PenpalModule`），之后再做纪念册。仍不展开共途邀请专项测试，也不进入二维/三维地图渲染。开放邀请或陌生人触达前必须先实现 SafetyModule 的封锁能力。尚未获批准，不得自动开始。
**角色规划**：四角色设计已记录在 [15-roles-and-permissions.md](15-roles-and-permissions.md)，但不改变上述顺序；`MODERATOR`、`ADMIN` 角色管理、`CURATOR` 均需另立任务，当前不得实现。`ADMIN` 不允许查看其他用户的邮箱，也不允许读取私人信件或私人记忆。

## 1. 四个主导航与规格映射

| 主导航 / 基础能力 | 详细规范 | 优先级 |
|---|---|---|
| 主导航、全局路由、空态 | [01-navigation.md](01-navigation.md) | P0 |
| 登录注册与会话 | [02-auth.md](02-auth.md) | P0 |
| 个人资料 / 城市级隐私 / 接信状态 | [03-profiles.md](03-profiles.md) | P0 |
| 邮局首页：新来信、在途、继续写信 | [04-post-office.md](04-post-office.md) | P0 |
| 明信片：草稿、发送、按距离延迟投递 | [05-postcards-delivery.md](05-postcards-delivery.md) | P0 |
| 发现：城市故事站 | [06-city-stories.md](06-city-stories.md) | P0 |
| 发现：世界记忆地图（仅产品功能） | [07-world-memory-map.md](07-world-memory-map.md) | P0 |
| 发现：善意的接力 | [08-goodwill-relay.md](08-goodwill-relay.md) | P1 |
| 共途：共同经历 / 停泊 / 续程 / 归档 | [09-shared-passage.md](09-shared-passage.md) | P0 |
| 共途：双向信友联系 | [10-penpals.md](10-penpals.md) | P0 |
| 纪念册：双城日记 / 手帐 / 个人记忆 | [11-memories.md](11-memories.md) | P0/P1 |
| 安全、审核、举报与封锁 | [12-safety-and-moderation.md](12-safety-and-moderation.md) | P0 |
| 来信通知与用户通知偏好 | [13-notifications.md](13-notifications.md) | P0/P1 |
| 城市故事分阶段实现边界（非新功能） | [14-story-deferred-scope.md](14-story-deferred-scope.md) | 范围决策 |

## 2. 产品最重要的概念区别

- **明信片**：一次发送和投递的独立内容；不等于一段关系。
- **城市故事**：用户主动授权公开、通过审核的生活片段，故事站与地图共享数据源。
- **共途（Passage）**：围绕某个主题开展的可完成经历，可暂停或归档；不自动建立永久联系人。
- **信友（Penpal）**：双方同意的持续通信许可；与共途是否完成相互独立。
- **双城日记**：来自实际双方交换的私密配对页面，不等于公众故事。
- **共同手帐**：长期双方可编辑的独立作品（P1），需要额外授权。
- **个人记忆**：只归个人查看，不能因为参与共途就自动分享。
- **善意接力**：非对称、非债务、非强制回应的弱连接（P1）。

## 3. 如何阅读和实现单个功能

1. 阅读 `AGENTS.md`、`docs/architecture.md`、`docs/testing.md`。
2. 阅读 `tasks/current.md`，确定本次被批准的功能与范围。
3. 阅读本索引及该功能的详细 Spec；从现有仓库核实是否已经实现一部分。
4. 优先维持不变量，再按 Spec 写可复现的失败测试（不含本轮明确排除的专项内容）。
5. 完成后检查 API 合同、数据隐私、旧回归与任务验收，不以“看起来正常”代替外部证据。

## 4. 共同术语与状态

- 状态采用大写枚举，传输字段用 `camelCase`，数据库列使用 `snake_case`。
- 所有日期时间内部使用 UTC；前端展示可以本地化。
- 公开 = 审核通过 + 作者授权 + 未被移除；私人 = 后端强制鉴权。
- `P0` 代表毕设必须完成；`P1` 代表增强；`P2` 代表未来版本。
- 用户此前已明确：**不展开共途邀请专项测试；不展开二维/三维地图的具体实现技术**。
- 当“UI 设计稿”和规范冲突时，除非任务明确批准修订，先遵守本规范及安全边界。
