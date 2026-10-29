# ROLE · 账号角色与后台权限

**状态：规划（未实现）。** 截至 2026-10-29，仓库实际角色仍为 `USER | ADMIN`，城市故事审核仍只允许 `ADMIN`。本文件记录已确认的角色设计、权限边界和分阶段实施顺序，**不代表代码已经具备这些能力**。

**优先级建议：**
- MODERATOR 最小切片与 ADMIN 用户/角色管理：P1；当前 ADMIN 已能完成 P0 审核，角色拆分属于后台完善。
- CURATOR：P1，且必须先有“精选故事 / 城市专题”产品规范；当前不实现。
- USER 与 GUEST：维持现状，不需要新阶段。

**关联规范：**
- [02-auth.md](02-auth.md) 的 AUTH-08（当前实现）、AUTH-09（规划）
- [12-safety-and-moderation.md](12-safety-and-moderation.md)
- `docs/architecture.md`、`docs/testing.md`

## ROLE-01 目标

1. 把“未登录游客”和“正式账号角色”分开。
2. 把内容审核、内容策展、系统管理三种后台职责分开，避免所有后台能力都集中在 `ADMIN`。
3. 保持最小权限、职责分离和可追溯授权。
4. 明确后台角色不能绕过原有的私人内容边界。

## ROLE-02 角色定义

| 角色 | 标识 | 说明 | 是否存库 |
|---|---|---|---|
| 普通用户 | `USER` | 使用 Somewhere 的慢社交功能 | 是 |
| 内容审核员 | `MODERATOR` | 审核公开内容、处理举报 | 是 |
| 城市故事策展人 | `CURATOR` | 管理精选城市故事和专题 | 是 |
| 系统管理员 | `ADMIN` | 用户管理、角色授权、平台维护 | 是 |
| 未登录游客 | `GUEST` | 只代表没有有效会话 | **否** |

### ROLE-02.1 GUEST

`GUEST` 不是正式账号角色，不写入 `users.role`，不创建 guest 用户行，也不发放会话。

- 匿名可以读取已审核公开的城市故事和地图城市入口。
- 匿名访问邮局、共途、信友、纪念册、审核后台等私人资源时返回 401。
- 前端登录引导只是体验；后端鉴权仍是唯一事实源。
- 现有 `SessionGuard` 已经实现这一语义，不需要新增枚举值。

### ROLE-02.2 USER

`USER` 是所有正式账号的基础角色，拥有现有 Spec 规定的普通业务权限：

- 邮局：草稿、寄出、收信、在途状态；
- 发现：浏览公开故事、发布自己的故事；
- 共途：参与共同经历、停泊 / 续程 / 完成 / 归档；
- 信友：在双方同意后保持持续通信许可；
- 纪念册：个人记忆与有权限的共同内容。

`USER` 不能访问审核、策展、用户管理、角色授权和平台配置接口。

### ROLE-02.3 MODERATOR

负责：

- 查看待审核的公开城市故事；
- 审核通过、驳回、下架公开故事；
- 处理用户举报（依赖 SafetyModule 举报功能）；
- 查看与审核职责有关的必要记录；
- 对自己权限范围内的公开内容执行安全处置。

限制：

- 不能管理用户；
- 不能授予或修改角色；
- 不能修改平台配置；
- 不能读取用户私人明信片、私人记忆或未授权的共同内容；
- 不能审核自己创作的故事；
- 不能通过审核权限绕过既有隐私规则；
- 不能访问全量管理员审计；只能查看与本人审核职责相关的记录。

### ROLE-02.4 CURATOR

负责：

- 查看已经审核通过且允许公开的城市故事；
- 选择和管理精选故事；
- 整理城市故事专题；
- 维护专题展示内容和排序。

限制：

- 不具有内容审核最终决定权，不能执行 `APPROVE / REJECT / REMOVE`；
- 不能管理用户和角色；
- 不能修改平台配置；
- 不能访问用户私人内容；
- 不能把未审核、未授权、已撤回或已下架的内容设为公开精选；
- 不能形成独立于 `ApprovedStoryReader` 的第二套公开数据源。

**依赖：** 当前 PRD 与 Spec 没有“精选故事 / 城市专题”实体，也没有 `show_on_map`、`show_city` 等字段。CURATOR 必须先等待独立的产品规范，不能先造一个空角色或只改前端页面。

### ROLE-02.5 ADMIN

负责：

- 管理普通用户与工作人员账号；
- 管理后台角色与权限；
- 管理必要的平台配置；
- 查看平台管理信息；
- 执行授权范围内的内容管理操作。

限制：

- **不能查看其他用户的邮箱。** 后台用户列表和角色变更接口不返回 email、email 哈希、掩码邮箱或邮箱域名；本人通过 `/auth/me` 查看自己的 email 不受影响。
- 不能无条件读取用户的私人明信片、共同日记和个人记忆。
- 不能绕过审核、送达、封锁或记忆授权规则。
- 不能在没有审计的情况下变更角色或执行敏感管理操作。
- 不能删除或降级最后一个管理员。

## ROLE-03 角色模型决策

### ROLE-03.1 单枚举 + 权限蕴含（本轮采用）

`users.role` 保持单值枚举，增加 `MODERATOR`；`CURATOR` 在精选专题任务中再增加。

权限蕴含：

```text
USER       -> { USER }
MODERATOR  -> { USER, MODERATOR }
CURATOR    -> { USER, CURATOR }
ADMIN      -> { USER, MODERATOR, CURATOR, ADMIN }
```

含义：

- `@Roles('MODERATOR')` 允许 `MODERATOR` 和 `ADMIN`；
- `@Roles('CURATOR')` 允许 `CURATOR` 和 `ADMIN`；
- `@Roles('ADMIN')` 只允许 `ADMIN`；
- 普通业务接口不要求后台角色，只要求有效会话。

### ROLE-03.2 一人多角色

本轮不支持同一账号同时持有 `MODERATOR` 和 `CURATOR`。如果后续确认工作人员需要兼任：

- 必须单独做架构变更；
- 改为 `user_roles(user_id, role, granted_by, granted_at)`；
- 登录/注册响应从 `role` 改为 `roles`；
- 更新守卫、契约、测试和后台 UI；
- 不得用 `ADMIN` 代替所有兼任角色，以免违反最小权限。

### ROLE-03.3 角色生效

`role` 是账号属性，不是新的会话状态。会话每次请求从数据库解析当前角色；角色变更后，下一次请求立即生效，不要求重新登录。

## ROLE-04 权限矩阵

| 能力 | GUEST | USER | MODERATOR | CURATOR | ADMIN |
|---|---|---|---|---|---|
| 浏览公开故事 / 地图 | 允许 | 允许 | 允许 | 允许 | 允许 |
| 发布、编辑自己的故事 | 禁止 | 允许 | 允许 | 允许 | 允许 |
| 查看审核队列 | 禁止 | 禁止 | 允许 | 禁止 | 允许 |
| 通过 / 驳回 / 下架故事 | 禁止 | 禁止 | 允许 | 禁止 | 允许 |
| 处理举报 | 禁止 | 禁止 | 允许（举报功能实现后） | 禁止 | 允许 |
| 管理精选 / 专题 | 禁止 | 禁止 | 禁止 | 允许（功能实现后） | 允许 |
| 查看用户列表 | 禁止 | 禁止 | 禁止 | 禁止 | 允许 |
| 授予 / 撤销角色 | 禁止 | 禁止 | 禁止 | 禁止 | 允许 |
| 查看角色变更审计 | 禁止 | 禁止 | 禁止 | 禁止 | 允许 |
| 修改平台配置 | 禁止 | 禁止 | 禁止 | 禁止 | 允许（仅具体配置项） |
| 查看其他用户邮箱 | 禁止 | 禁止 | 禁止 | 禁止 | **禁止** |
| 读取他人私人明信片 | 禁止 | 禁止 | 禁止 | 禁止 | **禁止** |
| 读取他人私人记忆 | 禁止 | 禁止 | 禁止 | 禁止 | **禁止** |

说明：

- `MODERATOR`、`CURATOR`、`ADMIN` 同时也是 `USER`，仍可使用邮局、共途、信友和纪念册。
- 后台角色不改变任何普通业务接口的私人内容可见性。
- 前端隐藏按钮只影响体验，不构成权限控制。

## ROLE-05 数据模型（规划）

### ROLE-05.1 角色枚举

第一阶段只新增：

```text
UserRole = USER | MODERATOR | ADMIN
```

`CURATOR` 在精选专题任务中与对应业务表一起新增，避免出现没有业务能力的空角色。

### ROLE-05.2 角色变更审计

新增只追加的审计表：

```text
role_changes
- id
- actor_id          UUID NOT NULL  FK users(id)
- target_user_id    UUID NOT NULL  FK users(id)
- from_role         UserRole NOT NULL
- to_role           UserRole NOT NULL
- created_at        TIMESTAMPTZ NOT NULL
```

约束：

- 只允许 `ADMIN` 写入；
- 不保存 email、密码、会话值或用户私人内容；
- 与角色更新在同一事务中完成；
- 审计记录不可由普通接口修改或删除。

### ROLE-05.3 不新增

- 不新增 `GUEST` 枚举值；
- 不新增 guest 用户行；
- 不在本轮新增 `user_roles` 多角色表；
- 不在 `users` 表新增 email 可见性字段；
- 不为后台用户列表开放 email。

## ROLE-06 API（规划）

| Method | Path | 允许角色 | 说明 |
|---|---|---|---|
| GET | `/api/v1/moderation/queue` | `MODERATOR`, `ADMIN` | 故事审核队列；当前实现仍只允许 `ADMIN` |
| POST | `/api/v1/moderation/stories/:id/decision` | `MODERATOR`, `ADMIN` | 通过 / 驳回 / 下架；不能审核自己的故事 |
| GET | `/api/v1/admin/users?query=&cursor=` | `ADMIN` | 用户列表；只返回 `id/nickname/role/createdAt`，不返回 email |
| PATCH | `/api/v1/admin/users/:id/role` | `ADMIN` | 修改角色；body `{ role }`，不接受 `GUEST` |
| GET | `/api/v1/admin/role-changes` | `ADMIN` | 角色变更审计；不返回 email |
| CURATOR 相关接口 | 待定 | `CURATOR`, `ADMIN` | 必须由精选专题 Spec 定义后再实现 |

### ROLE-06.1 用户列表与查找

由于 ADMIN 不能查看其他用户的邮箱，用户列表和查找必须使用非邮箱标识：

- 返回字段固定为 `id`、`nickname`、`role`、`createdAt`；
- 支持按 `id` 精确查找；
- 支持按 `nickname` 查找；昵称不唯一时返回多条，由后台根据 `id` 区分；
- 不提供按 email 查找；
- 不返回 email 的明文、掩码、哈希或域名；
- 角色变更以列表中的 `id` 为目标，不由客户端提交 email。

管理员本人通过 `/auth/me` 查看自己的 email 不受影响；本限制针对查看其他用户的邮箱。这是有意的隐私取舍：管理员可以完成角色管理，但不能把后台变成邮箱查询工具。

### ROLE-06.2 角色变更规则

- 只有 `ADMIN` 可以修改角色；
- 不能授予 `GUEST`、未知角色或空角色；
- 不能把最后一个 `ADMIN` 降级；
- 建议禁止管理员修改自己的角色，必须由另一名 `ADMIN` 操作；
- 重复设置同一角色应幂等，不写重复审计；
- 目标用户不存在返回 404 `RESOURCE_NOT_ACCESSIBLE`；
- 角色变更成功后，目标用户下一次请求即使用新角色。

## ROLE-07 分阶段实施

### R0 · 现状与 GUEST 语义（现在）

- 保持 `USER | ADMIN`；
- 保持 `ADMIN` 故事审核；
- 补文档与测试：GUEST 不落库、匿名公开可读、私人接口 401；
- 不改认证、邮箱、密码和会话。

### R1 · MODERATOR 最小切片

前置：TASK-009/010 的最小封锁与双向信友完成，避免同时改多个领域。

实现：

- `UserRole` 增加 `MODERATOR`；
- `RolesGuard` 支持权限蕴含；
- 审核接口允许 `MODERATOR`；
- 非生产脚本支持 `--role=MODERATOR`；
- 测试 USER 403、MODERATOR 200、ADMIN 200、自审 403、私人内容 404。

不实现：

- 举报处理（依赖 SafetyModule 举报）；
- 用户管理；
- 角色管理 UI；
- CURATOR。

### R2 · ADMIN 用户与角色管理

实现：

- `GET /admin/users`；
- `PATCH /admin/users/:id/role`；
- `GET /admin/role-changes`；
- 最后一个管理员保护、禁止自我降级、角色变更审计；
- 后台用户列表页面与确认流程；
- 管理员不能查看 email 的契约与 E2E 断言。

### R3 · MODERATOR 举报处理

前置：SafetyModule 的举报、封锁、必要证据读取完成。

实现：

- 举报队列与处理权限；
- 只返回与举报职责相关的最小字段；
- 每次证据读取写审计；
- MODERATOR 仍不能批量读取私人明信片或私人记忆。

### R4 · CURATOR（P1）

前置：

- “精选故事 / 城市专题”进入 PRD 与独立 Spec；
- 明确专题表、排序、公开入口和撤回联动；
- 继续复用 `ApprovedStoryReader` 的公开谓词。

实现：

- `UserRole` 增加 `CURATOR`；
- 专题管理接口与页面；
- 只能选择已审核、已发布、已授权、未归档的故事；
- 故事撤回/下架后专题同步消失；
- CURATOR 不能审核、不能管理用户、不能查看私人内容。

## ROLE-08 安全与隐私规则

1. **邮箱最小暴露**
   - 注册/登录只用于本人认证；
   - 他人资料、公开故事、审核队列、后台用户列表都不返回 email；
   - ADMIN 也不能查看其他用户的邮箱；本人通过 `/auth/me` 查看自己的 email 不受影响；
   - 日志、错误、审计不记录 email。

2. **私人内容边界**
   - ADMIN 和 MODERATOR 都不因角色获得私人明信片、共同日记、个人记忆的读取权；
   - 现有 `PostcardService`、未来的 `MemoryReader` 不得增加“管理员直通”分支；
   - 举报证据读取必须是独立、最小、受审计的流程。

3. **审核与策展分离**
   - MODERATOR 决定内容是否公开；
   - CURATOR 只能在已公开内容中组织和排序；
   - CURATOR 不能把未审核内容变为公开；
   - ADMIN 可以执行两类操作，但必须遵守同一套公开谓词和审计。

4. **角色授权**
   - 只有 ADMIN 能修改角色；
   - 不能授予 GUEST；
   - 最后一个 ADMIN 不能降级；
   - 每次变更写审计；
   - 前端隐藏入口不是权限控制。

5. **GUEST**
   - 不存库、不发会话、不创建账号；
   - 只通过“是否有有效会话”判断；
   - 公开资源匿名可读，私人资源 401。

## ROLE-09 验收（未来任务使用）

> 以下为规划验收项；当前均未执行。

### ROLE-AC-01 · GUEST 与 USER 边界

匿名访问公开故事 200；匿名访问 `/penpals`、`/postcards/inbox`、`/moderation/queue` 401；数据库中不存在 `GUEST` 角色行。

### ROLE-AC-02 · MODERATOR 审核

USER 访问审核队列 403；MODERATOR 200；ADMIN 200；MODERATOR 可以通过/驳回/下架；MODERATOR 审核自己的故事 403 且不写审计。

### ROLE-AC-03 · MODERATOR 限制

MODERATOR 访问用户管理、角色管理、平台配置接口 403；访问他人私人明信片/记忆 404；不能查看全量角色审计。

### ROLE-AC-04 · ADMIN 用户与角色管理

ADMIN 可以按 `id` 或 `nickname` 找到用户；响应不含 email；可以修改角色；目标用户下一次请求获得新权限；非 ADMIN 调用返回 403。

### ROLE-AC-05 · 角色变更安全

不能授予 `GUEST`；不能把最后一个 ADMIN 降级；不能修改自己的角色；每次成功变更写一条审计；重复设置幂等。

### ROLE-AC-06 · ADMIN 私人内容边界

ADMIN 访问他人明信片详情、未来他人个人记忆均 404；不得通过后台接口批量读取或导出私人内容；错误与日志不出现正文、email、会话值。

### ROLE-AC-07 · CURATOR（未来）

CURATOR 只能操作 `APPROVED + published + consented + not archived` 的故事；不能审核；不能把未审核/已撤回/已下架故事放入专题；故事撤回后专题公开结果同步消失。

### ROLE-AC-08 · 回归与门禁

TASK-001～008 全部测试保持通过；`pnpm lint`、`typecheck`、`build`、`test:unit`、`test:integration`、`test:contract`、`test:architecture`、`test:e2e`、`test:smoke`、`pnpm verify` 实际运行并通过。

## ROLE-10 非目标

- 不实现通用 RBAC 权限表、权限点编辑器或可视化权限树；
- 不实现一人多角色（除非另行批准架构变更）；
- 不把 GUEST 写入数据库；
- 不实现完整举报、封锁、`RESTRICT` 处置（属于 SafetyModule）；
- 不实现精选故事/专题（属于 CURATOR 前置功能）；
- 不允许 ADMIN 查看其他用户的邮箱；
- 不允许任何角色绕过私人信件、私人记忆和送达规则；
- 不新增管理员专用登录入口；
- 不新增“申请管理员”或“申请审核员”的公开接口。

## ROLE-11 依赖与顺序

```text
当前：USER | ADMIN
  ↓
TASK-009/010：最小封锁、双向信友
  ↓
R1：MODERATOR 最小切片
  ↓
R2：ADMIN 用户与角色管理
  ↓
R3：MODERATOR 举报处理（依赖举报功能）
  ↓
R4：CURATOR + 精选专题（P1，依赖独立产品 Spec）
```

角色扩展不得与信友、纪念册、举报功能混在同一个任务中；每个阶段必须有独立的任务卡、RED 测试和验收证据。
