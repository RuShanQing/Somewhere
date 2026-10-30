# PASSAGE · 共途：共同经历、续程、停泊与归档

**优先级：P0** · 主导航：共途 · 归属：PassageModule

> 实现状态（2026-10-29，TASK-007）：已实现三组状态中的前两组（经历进度、每人通信意愿）、列表 / 详情、停泊 / 续程 / 完成 / 归档与 `PassagePolicy.canSend`。**TASK-007 当时未实现**邀请与关系发起、邮局 `passage_id`、信友、纪念册、通知与封锁；邮局与封锁已由 TASK-008/009 补齐，信友授权已由 TASK-010 补齐。邀请/创建、信友发起新共途、纪念册与通知仍未实现。本文件不设计邀请环节的专项测试。

## PASSAGE-01 目标

两个人因共同的主题而通信，完成一段可被保存的经历。共途不是好友列表，不是必须永久持续的聊天；可以完成、停泊或归档，也可以在双方自愿情况下重新开启下一程。

**本文件定义共途业务状态与权限，不包含邀请环节的专项测试方案。**

> 实现状态（2026-10-30）：TASK-007 完成三表、6 个接口、停泊 / 续程 / 完成 / 归档与 `canSend`；TASK-008 把 `PassagePolicy.canSend` 接入邮局发送链路，并在草稿与明信片上保存可空 `passage_id`。TASK-009 让 `BlockPolicy` 叠加到 `canSend`，封锁优先于共途许可；`PassageSummaryDto.counterpart` 增加 `id` 供 Web 封锁入口使用。TASK-010 由 `PassageReader.hasCompletedPassageWith` 向信友模块提供“是否曾完成共途”的只读资格，不暴露主题或正文；共途 DTO 不携带信友状态。邀请 / 创建入口、信友发起新共途与纪念册仍未实现。
>
> TASK-012 实现（2026-10-30）：回信能力补齐 PAS-02 的“两封均已送达”。回信必须显式引用被回应的信，一张原信最多一次回信；回信不创建共途、不改变任何一方许可，也不代表成为信友。详见 `specs/05-postcards-delivery.md` POSTCARD-09 与本文件 PASSAGE-09。

## PASSAGE-02 共途类型与页面

- `ONE_OFF`：完成一次主题明信片交换后，可形成一页双城日记。
- `ONGOING`：围绕一个主题继续交换，但不会自动变成信友。
- `SEASONAL`：按季节低频分享（后续增强，可在 P0 仅作为主题标签）。
- 首页展示：正在进行的共途、当前主题、寄出的明信片、停泊 / 归档状态、已产生的共同记忆。
- “写明信片”进入通用编辑器，携带 `passageId`；服务端仍独立检查通信许可。TASK-008 已实现：收件人由服务端解析为共途对方，发送时强制 `PassagePolicy.canSend`。

## PASSAGE-03 将三组状态分离

### 经历进度 `passages.progress_status`

`ACTIVE | COMPLETED | ARCHIVED`。
- `ACTIVE`：共同经历尚未完成。
- `COMPLETED`：一次交换已按主题完成；无需继续也算成功。
- `ARCHIVED`：不再出现在进行中列表；已授权记忆可继续阅读。
- 归档是**经历级**状态，由任一参与者在 `ACTIVE` 或 `COMPLETED` 时触发，双方视图同时离开「进行中」；归档不删除历史、不改任何一方的 `consent_state`，也不自动公开或擦除记忆。TASK-007 按此语义实现，PASSAGE-06 中「归档本人视图」的措辞据此收敛。

### 每人当前通信意愿 `passage_participants`

`consent_state = ALLOW | PAUSED | CLOSED`，由该参与者独立控制。
- `ALLOW`：允许在这段共途中继续新的通信行为。
- `PAUSED`：本人暂时停泊；不接收新的共途互动请求。
- `CLOSED`：不再允许新的联系；历史查看权独立判断。
- 停泊到期**不自动**把 `PAUSED` 改成 `ALLOW`，必须经本人再次操作。
- `CLOSED` 由后续安全处置或信友撤销产生；TASK-007 只实现只读判定与拒绝，**不提供写入口**。

### 记忆访问权限

由 MemoryModule 单独判断 `PRIVATE / SHARED / REVOKED / REMOVED`，不能仅由 `passages.progress_status` 推导。

这三组状态不能合并成一个 `isFriend` 或 `isActive` 布尔值。

## PASSAGE-04 核心规则

1. 创建共途必须先明确共同主题、参与者和双方同意的通信范围；不能把浏览故事视为自动同意长期联系。
2. 一人停泊时不再创建新的共途邮寄行为；另一人可继续自己的其他共途与个人记忆。
3. 已经正式寄出的信原则上按原有时间送达；封锁/严重违规由安全政策另行拦截。
4. 完成一次交换后可以归档，也可以自愿继续另一主题；**不自动升级为信友**。
5. 归档不会自动删除历史已到达的通信与有权查看的双城日记。
6. 不显示对方在线状态、已读回执、亲密度、关系等级或回信倒计时。
7. 共途参与者只有两位；首版不支持群聊或多人共同编辑器。

## PASSAGE-05 数据模型与约束

- `passages(id, topic, kind, progress_status, created_at, updated_at, completed_at?, archived_at?)`
- `passage_participants(passage_id, user_id, consent_state, paused_at?, last_confirmed_at?)`
- `passage_events(id, passage_id, actor_id, event_type, metadata_redacted, created_at)`：记录改变状态的操作，禁止保存信件正文。

数据库唯一键 `(passage_id,user_id)`；参与者数必须恰好为 2（由服务层 + 事务约束）。写操作保证权限检查与状态修改在同一事务中，避免并发乱序。`resume_after` 暂不建列：本阶段不存在自动恢复任务，避免出现无人写入、语义又被误读为「到期自动续程」的字段。

## PASSAGE-06 API（建议）

| Method | URL | 规则 |
|---|---|---|
| GET | `/api/v1/passages?status=ALL\|ACTIVE\|COMPLETED\|ARCHIVED` | 我参与的共途列表；缺省 `ALL` |
| GET | `/api/v1/passages/:id` | 仅本人参与者读取；非参与者统一 404 |
| POST | `/api/v1/passages/:id/pause` | 只暂停本人授权；重复调用幂等 |
| POST | `/api/v1/passages/:id/resume` | 恢复本人意愿，但不覆盖他人状态 |
| POST | `/api/v1/passages/:id/complete` | 任一参与者可将 `ACTIVE` 置为 `COMPLETED`；不改双方许可 |
| POST | `/api/v1/passages/:id/archive` | 经历级归档，不擅自删除对方的内容 |

关系发起与双方意愿建立的产品流程将在后续单独任务实现；本轮不写其专项测试，也**不提供** `POST /api/v1/passages`。在缺少邀请 / 接受流程时，公开创建接口会让一方替另一方表达同意，违反 PASSAGE-04.1。测试与本地演示使用非生产脚本建立两人共途。

详情与列表返回本人可观察的 `permissions.canSend`，由 `PassagePolicy` 计算：查看者是参与者、恰好两名参与者、进度为 `ACTIVE`、双方均为 `ALLOW` 时才为 true。记忆可见性不参与该判定，也不由 `progress_status` 推导。

跨模块发送权限必须通过 `PassagePolicy.canSend` 提供，不能在邮局里硬编码状态。TASK-008 已接入邮局：由 `PassageReader.findSendContext()` 统一解析参与者与许可，`PostcardModule` 不直接访问共途表。TASK-009 起，`PassageService` 计算 `canSend` 时叠加 `BlockPolicy`；任一方向存在封锁时 `canSend=false`，邮局发送返回 403 `CONTACT_BLOCKED`，不会落到 409。封锁不修改 `passage_participants`，解除后原有许可恢复。

## PASSAGE-07 异常

- 无权限者访问共途详情 → 404 / 403（避免枚举）。
- 处于 `CLOSED` 或被封锁 → 拒绝新的通信行为。
- 一人停泊但对方试图恢复关系 → 不能强制改变停泊者的意愿。
- 归档后仍应能按用户权限在纪念册中访问对应页面。
- 一方退出不应让系统自动删除另一方已合法保留的内容；删除与公开传播另行遵循隐私政策。

## PASSAGE-08 验收（不含邀请专项测试）

- 一段共途完成后不自动成为信友；用户仍可阅读有权限的双城日记。
- 停泊 / 关闭阻断新的共途发送，但不在普通情形下取消已经发出的 ETA。
- 到期时不会自动恢复他人的通信授权。
- 双方独立授权；不能通过切换共途状态替另一方改变意愿。
- 一段经历归档后在进行中列表消失，但纪念册按其独立权限仍可读取。
- 封锁和安全拦截优先于曾经的共途权限。

## PASSAGE-09 回信与双向交换闭环（TASK-012 已实现）

> 2026-10-30 实现并验收。本节只补齐 PAS-02 缺失的“第二封信”，不涉及邀请环节。

### 9.1 规则

- 回信只能由原信收件人发起，且原信必须已 `DELIVERED`、属于某段共途。
- 回信自动继承原信的 `passage_id` 与对方参与者，不新建共途、不改共途进度。
- 一张原信最多一次回信；第二次回信返回 409 `POSTCARD_ALREADY_REPLIED`。
- 任一方停泊、共途已完成或已归档、任一方封锁时，不能新建回信；已寄出的回信仍按原定时间送达。
- 回信不改变任何一方的 `consent_state`，也不建立信友关系。

### 9.2 与 PAS-02 的关系

PAS-02 的“两封均已送达才完成一次双向交换”在 TASK-012 之后才具备完整数据基础：

```text
A 寄出原信（DELIVERED）
→ B 回信（reply_to_postcard_id = A 的原信，DELIVERED）
→ 形成一次完整双向交换
```

共途的 `progress_status` 仍是独立维度：回信完成不自动把 `ACTIVE` 改为 `COMPLETED`，也不影响记忆访问权限（见 PASSAGE-03）。

### 9.3 验收

- 回信落库后，原信与回信可通过 `reply_to_postcard_id` 可靠配对。
- 原信未送达、非参与者、非共途、已回信、停泊或封锁时，不能产生回信。
- 回信不改变双方许可、共途状态或信友关系。
- 已寄出的回信不受后续停泊影响，仍按既定时间送达。
