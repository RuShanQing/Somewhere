# PASSAGE · 共途：共同经历、续程、停泊与归档

**优先级：P0** · 主导航：共途 · 归属：PassageModule

## PASSAGE-01 目标

两个人因共同的主题而通信，完成一段可被保存的经历。共途不是好友列表，不是必须永久持续的聊天；可以完成、停泊或归档，也可以在双方自愿情况下重新开启下一程。

**本文件定义共途业务状态与权限，不包含邀请环节的专项测试方案。**

## PASSAGE-02 共途类型与页面

- `ONE_OFF`：完成一次主题明信片交换后，可形成一页双城日记。
- `ONGOING`：围绕一个主题继续交换，但不会自动变成信友。
- `SEASONAL`：按季节低频分享（后续增强，可在 P0 仅作为主题标签）。
- 首页展示：正在进行的共途、当前主题、寄出的明信片、停泊 / 归档状态、已产生的共同记忆。
- “写明信片”进入通用编辑器，携带 `passageId`；服务端仍独立检查通信许可。

## PASSAGE-03 将三组状态分离

### 经历进度 `passages.progress_status`

`ACTIVE | COMPLETED | ARCHIVED`。
- `ACTIVE`：共同经历尚未完成。
- `COMPLETED`：一次交换已按主题完成；无需继续也算成功。
- `ARCHIVED`：不再出现在进行中列表；已授权记忆可继续阅读。

### 每人当前通信意愿 `passage_participants`

`consent_state = ALLOW | PAUSED | CLOSED`，由该参与者独立控制。
- `ALLOW`：允许在这段共途中继续新的通信行为。
- `PAUSED`：本人暂时停泊；不接收新的共途互动请求。
- `CLOSED`：不再允许新的联系；历史查看权独立判断。
- 停泊到期**不自动**把 `PAUSED` 改成 `ALLOW`，必须经本人再次操作。

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

- `passages(id, topic, kind, progress_status, created_at, completed_at?, archived_at?)`
- `passage_participants(passage_id, user_id, consent_state, paused_at?, resume_after?, last_confirmed_at?)`
- `passage_events(id, passage_id, actor_id, event_type, created_at, metadata_redacted)`：记录改变状态的操作，禁止保存信件正文。

建议数据库唯一键 `(passage_id,user_id)`；参与者数必须恰好为 2（由服务层 + 事务约束）。写操作保证权限检查与状态修改在同一事务中，避免并发乱序。

## PASSAGE-06 API（建议）

| Method | URL | 规则 |
|---|---|---|
| GET | `/api/v1/passages` | 我参与的共途列表 |
| GET | `/api/v1/passages/:id` | 仅本人参与者读取 |
| POST | `/api/v1/passages/:id/pause` | 只暂停本人授权 |
| POST | `/api/v1/passages/:id/resume` | 恢复本人意愿，但不覆盖他人状态 |
| POST | `/api/v1/passages/:id/complete` | 依据主题与双方已有贡献执行完成流程 |
| POST | `/api/v1/passages/:id/archive` | 归档本人视图，不擅自删除对方的内容 |

关系发起与双方意愿建立的产品流程将在后续单独任务实现；本轮不写其专项测试。跨模块发送权限必须通过 `PassagePolicy.canSend` 提供，不能在邮局里硬编码状态。

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
