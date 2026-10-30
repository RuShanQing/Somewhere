# PENPAL · 双向信友授权

**优先级：P0** · 主导航：共途 · 归属：PenpalModule

> 实现状态（2026-10-30，TASK-010）：已实现双方分别同意、聚合状态、列表、撤销/拒绝、封锁优先、与邮局收件人的最小接入。**未实现**信友专属暂停、信友发起新共途、通知、纪念册。共途邀请/创建仍未实现。

## PENPAL-01 定义

**信友**是两人自愿保持持续通信的授权关系，不是完成共途后的升级奖励，也不强制用户长期参与。

**共途回答“我们一起经历了什么”；信友回答“现在是否允许我们持续联系”。** 一位信友可以和另一人完成多段共途；一段已完成的共途不必产生信友关系。

## PENPAL-02 业务规则

- 双方分别表达持续通信意愿后才视为有效信友；不能由单方操作替另一方同意。
- 同一对用户只保留一组逻辑关系记录，避免 A-B、B-A 两份关系；存储为两条单方同意记录，聚合状态派生。
- 任一方随时撤销本人持续联系许可，不需要对方批准。
- 撤销不等于删除双方已合法保留的信件和纪念册；记忆权独立于当前通信权。
- 关系停泊、个人接信状态、封锁属于不同约束；**封锁优先级最高**。
- 不公开双方成为信友的日期、通信次数、排名或对方是否已读。
- 信友请求必须以双方至少一段已完成共途为前提；浏览故事、完成共途或归档共途都不会自动建立信友。
- 撤销只关闭本人许可；对方仍保持 `ALLOW` 时，本人重新同意后关系可恢复 `ACTIVE`。

## PENPAL-03 数据与状态

两条单方同意记录：`penpal_consents(owner_id, counterpart_id, consent_state, consented_at?, revoked_at?)`，主键 `(owner_id, counterpart_id)`。

`consent_state = ALLOW | REVOKED`。不实现 `PAUSED`；暂停接信由 `profiles.reception_mode = RESTING` 表达，不改变信友同意记录。

聚合状态仅派生：

- `NONE`：没有有效意愿，也没有待回应请求；
- `ONE_SIDED`：只有一方表达意愿，不开放持续通信；
- `ACTIVE`：双方均 `ALLOW` 且没有封锁；
- `REVOKED`：一方 `REVOKED` 且另一方仍 `ALLOW`，持续权限关闭。

派生矩阵：

| 我的记录 | 对方记录 | 聚合状态 | 页面归类 |
|---|---|---|---|
| 无 | 无 | `NONE` | 不显示 |
| `ALLOW` | 无 | `ONE_SIDED` | 我发出的请求 |
| 无 | `ALLOW` | `ONE_SIDED` | 收到的请求 |
| `ALLOW` | `ALLOW` | `ACTIVE` | 已建立 |
| `REVOKED` | `ALLOW` | `REVOKED` | 不显示 |
| `ALLOW` | `REVOKED` | `REVOKED` | 不显示 |
| `REVOKED` | 无 | `NONE` | 不显示 |
| 无 | `REVOKED` | `NONE` | 不显示 |

被封锁并非 `ACTIVE`。任一方向封锁时列表隐藏、`canContinueContact = false`，但同意行保持不变；解除封锁后按双方原许可恢复。服务端不对外披露另一方具体拒绝原因或同意方向。

## PENPAL-04 API

| Method | Path | 说明 |
|---|---|---|
| `GET` | `/api/v1/penpals` | 返回 `active / incoming / outgoing` 三组；只含对方向公开资料 |
| `POST` | `/api/v1/penpals/consent` | body `{ counterpartId }`；记录本人持续通信意愿；幂等 |
| `DELETE` | `/api/v1/penpals/:counterpartId/consent` | 撤销本人意愿；若本人从未同意但对方有请求，则写入 `REVOKED` 关闭请求；幂等 |

规则：

- 未登录 401 `AUTH_REQUIRED`；
- 自己 422 `VALIDATION_ERROR`；
- 目标不存在、无已完成共途、非参与者统一 404 `RESOURCE_NOT_ACCESSIBLE`；
- 任一方向封锁 403 `CONTACT_BLOCKED`；
- 重复同意 200，不新增行、不改变 `consented_at`；
- 撤销不存在的记录 204；
- 响应只含 `counterpart{id,nickname,city}` 与分组，不含 email、角色、接信状态、对方同意状态或日期；
- 其他领域只调用 `PenpalPolicy.canContinueContact`，不直接读同意表判断。

## PENPAL-05 邮局接入

- `GET /postcards/recipients` 的默认收件人集合 = 演示白名单 ∪ 当前 `ACTIVE` 信友；
- 仍排除被封锁者、非 `OPEN` 接信状态与无城市账号；
- 发送时重新解析允许收件人，沿用既有封锁检查、每日额度、城市距离、幂等与在途保密规则；
- 不新增 `penpal_id` 草稿字段，不提供独立“信友写信”页面。

## PENPAL-06 验收（聚焦状态与权限）

- 没有双方明确许可的关系，不被标为“有效信友”。
- 任何一方撤销后，新的持续通信被拒绝；已存在合法记忆依旧遵循 MemoryPolicy。
- 完成、停泊、归档共途均不会自动创建信友许可或替某一方撤销许可。
- 被封锁者不能通过信友状态继续联系；解除封锁后按原许可恢复。
- 公开个人资料接口不返回对方的私密关系记录或撤销原因。
- 无已完成共途的用户不能通过任意 `counterpartId` 发起请求，避免陌生人触达与账号枚举。
- 有效信友可以成为邮局收件人；撤销或封锁后立即失效。

## PENPAL-07 非目标

- 信友专属暂停/恢复端点；
- 信友发起新共途（PAS-06）；
- 公开信友关系、通信统计、排名、已读回执；
- 通知、纪念册、举报与安全处置；
- 用户搜索、公开用户目录、按 email 查找。
