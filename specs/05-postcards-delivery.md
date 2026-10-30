# POSTCARD · 明信片编辑、距离延迟与投递

**优先级：P0** · 归属：PostcardModule + DeliveryModule  
本规范是时间、权限、状态的**核心事实源**。

> 实现状态（2026-10-28，TASK-004）：已实现文字草稿 CRUD、发送事务、Haversine + `min(7200, 720 + ceil(D*60/150))` 延迟、城市快照、`IN_TRANSIT → DELIVERED` Worker、草稿/幂等键防重复、在途正文保密与每日 10 张上限。
>
> TASK-004 的明确边界：收件人来自服务端环境变量白名单（`POSTCARD_DEMO_RECIPIENT_EMAILS`），不是正式共途/信友关系；未实现回信、`passage_id`、`reply_to_postcard_id`、模板、通知、审核/封锁处置。`RESTRICTED` 已保留为枚举并拒绝正文，但当前没有写入路径。Worker 只负责投递，不生成通知。
>
> TASK-008 实现状态（2026-10-29）：`postcard_drafts` 与 `postcards` 增加可空 `passage_id`；带 `passageId` 的草稿由服务端把收件人解析为共途对方，发送时强制 `PassagePolicy.canSend`（停泊 / 关闭 / 非 ACTIVE 返回 409）。无 `passageId` 的草稿继续走演示白名单，TASK-004 行为不变。回信、通知与审核处置仍未实现。
>
> TASK-009 实现状态（2026-10-29）：新增 `user_blocks` 与最小封锁接口。默认收件人与共途收件人排除被封锁者；草稿创建/修改指向被封锁者返回 403 `CONTACT_BLOCKED`；发送前先判封锁（403），再判共途许可（409）；不创建明信片、不消耗草稿或每日额度。封锁不删除历史，已送达信件的读取权不变。
>
> TASK-010 实现状态（2026-10-30）：默认收件人来源扩展为「演示白名单 ∪ 当前 `ACTIVE` 信友」。信友由 `PenpalReader.listActiveCounterpartIds` 提供，已排除任一方向封锁；撤销或封锁后下一次收件人列表与发送立即失效。未新增 `penpal_id` 草稿字段，发送事务、距离延迟、幂等、每日上限与在途保密规则不变。
>
> TASK-012 规划（2026-10-30，**未实现**）：新增共途内回信能力与 `reply_to_postcard_id`。回信只允许针对「已送达、属于共途、自己是收件人」的信；收件人与 `passageId` 由服务端从原信推导；一张原信最多一次回信。详见 POSTCARD-09。双城日记仍不在本文件范围。

## POSTCARD-01 用例

1. 用户写一张文字明信片，保存草稿。
2. 用户在已允许的收信/共途关系中选择接收方，确认寄出。
3. 系统根据两人的城市级距离生成预计到达时间；信显示“在途”。
4. 收件人到时才可以阅读；之后可选择回信，不承担回复义务。
5. 系统将有权访问的已到达内容交给纪念册用于形成共同记忆。

首版模板与文字优先。自定义上传照片、录音、插画编辑器与真实邮政配送不在 P0。

## POSTCARD-02 编辑与长度限制

草稿字段：`id, ownerId, recipientId?, passageId?, body, templateId?, updatedAt`。
- `body`：1–2000 个 Unicode 字符（按实际字符数验证，拒绝全空白）。
- 草稿可反复保存和删除；只允许作者访问和编辑。
- 发出后生成 `postcards` 中不可变内容，原草稿删除或标记为已使用。
- `passageId` 只在创建草稿时绑定，创建后不可改绑；存在 `passageId` 时收件人由服务端解析为共途对方，客户端提供的 `recipientId` 必须与之一致（否则 422），不能借草稿接口联系第三人。
- 发送请求支持 `Idempotency-Key`；重复网络请求不可寄出多张相同信。
- 前端预览与发送确认界面显示距离等待时间**预计值**，真正 `deliverAt` 以服务端最终响应为准。

## POSTCARD-03 发送状态与状态机

```text
草稿表:
DRAFT ──用户确认发送──> postcards.IN_TRANSIT
  └──用户删除──> 删除草稿

postcards:
IN_TRANSIT ──(server_now >= deliver_at + 合法投递)──> DELIVERED
IN_TRANSIT / DELIVERED ──(安全处理)──> RESTRICTED
```

- `RESTRICTED` 是安全处置状态，不表示普遍可撤回所有已送达信件。
- `DELIVERED` 不回退为 `IN_TRANSIT`；收件人打开信不产生公开已读状态。
- `sentAt`、`deliverAt`、`originCityId`、`destinationCityId`、正文在发送后冻结。
- 发送失败必须明确告知是“未寄出”，不得在失败后展示“正在路上”。

## POSTCARD-04 距离和送达算法

城市目录提供城市中心坐标，不采集精确居住地点。

1. 获取发送时**双方城市快照**。无法取得任一城市时拒绝模拟距离投递，提示用户补充城市，而不是猜测地址。
2. `D_km = Haversine(origin.cityCenter, destination.cityCenter)`，要求非负、有限数字。
3. `delayMinutes = min(7200, 720 + ceil(D_km * 60 / 150))`。
4. `deliverAt = serverSentAtUTC + delayMinutes`。

例：同城为 12 小时；无论距离多远，最长为 5 天。该值是 Somewhere 的**产品拟定邮速**，不是实际邮政承诺。需要产品负责人批准才能改公式。

距离不改变已寄信件的 ETA；用户后来更改城市对旧信无效；前端改系统时间或请求体时间无效。

## POSTCARD-05 服务端事务与后台任务

发送流程（一个数据库事务）：
- 验证 Session、收件人有效、封锁、接信意愿、速率限制与当前通信权限；
- 读取城市记录并计算投递时间；
- 锁定或幂等处理草稿 / 幂等键；
- 写入 `IN_TRANSIT` 状态和时间快照；
- 返回不含对方私人位置的发送结果。

到期 Worker：
- 从 DB 取 `status=IN_TRANSIT AND deliver_at<=NOW()`；
- 使用事务 + 行锁（例如 `SKIP LOCKED`）claim，转 `DELIVERED` 并设置 `delivered_at`；
- 本阶段只保证投递状态只变一次，不生成通知；通知去重属于后续 `13-notifications.md` 任务；
- 遇到异常释放/回滚，下一轮重试；保留错误与 requestId，不记录信件正文。

## POSTCARD-06 数据可见性与封锁

| 状态 | 寄件人 | 收件人 | 他人 |
|---|---|---|---|
| 草稿 | 可读可改 | 不可读 | 不可读 |
| 在途 | 可读自己发送的内容及 ETA | **不可读正文**；也不开放正文预览 | 不可读 |
| 已到达 | 可读自己发送的内容 | 可读已到达内容 | 不可读 |
| 受限 | 根据审核处置查看受限提示 | 根据审核处置查看受限提示 | 不可读 |

关系停泊不改变已经产生的 `deliverAt`；封锁、违规与平台安全处理优先，按受限状态执行。无公开已读时间字段。

## POSTCARD-07 API

| Method | Endpoint | 作用 |
|---|---|---|
| GET | `/api/v1/postcards/drafts` | 我的草稿列表 |
| POST | `/api/v1/postcards/drafts` | 创建草稿 |
| PATCH | `/api/v1/postcards/drafts/:id` | 更新我的草稿 |
| DELETE | `/api/v1/postcards/drafts/:id` | 删除我的草稿 |
| POST | `/api/v1/postcards/drafts/:id/send` | 原子发送，返回 `postcardId, deliverAt` |
| GET | `/api/v1/postcards/transit` | 我发送的在途信 |
| GET | `/api/v1/postcards/inbox` | 我有权查看的已送达信 |
| GET | `/api/v1/postcards/:id` | 后端检查作者/收件人及送达状态 |
| GET | `/api/v1/postcards/recipients?passageId=` | 缺省为「演示白名单 ∪ 当前有效信友」并排除被封锁者；带 `passageId` 时只返回共途对方（`canSend` 为真、可接信且未被封锁时），不含邮箱/坐标 |
| GET | `/api/v1/postcards/drafts/:id` | 仅作者读取单条草稿 |

输入 `recipientId / passageId` 只能作为待验证的引用，不能代替服务端权限决策。对不允许的资源使用 `RESOURCE_NOT_ACCESSIBLE`，避免泄露对象存在与否。

TASK-004 的发送校验顺序：本人草稿 → 已发送幂等返回 → 正文 → 收件人非空/非本人 → 服务端白名单 → 双方资料与城市 → 接信状态 `OPEN` → 每日上限 → 事务写入。第 11 张成功寄出返回 429 `RATE_LIMITED`；失败不消耗草稿。

TASK-008 的附加分支：若草稿带 `passageId`，在「本人草稿 → 已发送幂等返回」之后先解析共途发送上下文（非参与者 404），再校验 `canSend`（false → 409 `PASSAGE_STATE_CONFLICT`），收件人使用对方参与者 ID；其余城市、接信状态、每日上限与事务步骤不变。

TASK-009 的封锁优先级：无 `passageId` 的草稿在收件人校验处先判封锁，再判演示白名单；带 `passageId` 的草稿先判封锁（403 `CONTACT_BLOCKED`），再判 `canSend`（409）。封锁失败不写 `postcards`、不消耗草稿与每日额度。`GET /postcards/recipients` 两种模式都排除被封锁者。已送达信件的读取权本轮不变。

TASK-010 的信友来源：无 `passageId` 时，允许收件人集合为「演示白名单 ∪ 当前 `ACTIVE` 信友」，两者都不构成公开用户搜索；发送前仍先判封锁，再判集合成员，随后检查双方城市与接信状态。信友撤销后集合立即收缩，已有草稿保持可读但发送返回 404 `RESOURCE_NOT_ACCESSIBLE`；被封锁时返回 403 `CONTACT_BLOCKED`。

## POSTCARD-08 验收

- D=0 与 D 很大时分别满足 12h 和 120h 边界；延迟随距离不减。
- 用服务器时间定义 ETA，不受用户浏览器时钟/时区影响。
- 发送请求幂等；发送事务失败不会留下半张“已寄出”信。
- 在途收件人不能通过任何列表、详情和通知读到正文。
- Worker 重复触发仍只投递一次；本阶段不生成通知，通知去重留待后续任务；停机恢复后可继续投递。
- 后端权限检查覆盖作者、收件人、封锁、安全处置和已到达状态。
- 只有经正确授权、已送达的信，才能成为双城日记的来源。

## POSTCARD-09 回信（TASK-012 规划，未实现）

> 2026-10-30 确认范围，代码与迁移均未开始。本节不改变 POSTCARD-01～08 的既有行为。

### 9.1 目标与边界

回信用于把 PAS-02 的“单次双向交换”闭合：收件人针对一封已送达的共途信写回应，回应本身仍是一张按距离延迟送达的明信片。

- 只支持**共途内回信**：原信必须有 `passageId`，查看者必须是原信收件人。
- 不开放“回复非共途信”，不新增收件人来源，不改变演示白名单与信友集合。
- 回信不会创建或重启共途；共途状态仍由 PASSAGE-03 的规则决定。
- 回信正文与普通明信片同规则：1–2000 码点、拒绝全空白、发送后不可改。

### 9.2 数据

- `postcard_drafts.reply_to_postcard_id UUID NULL` → `postcards(id)` `ON DELETE RESTRICT`，索引；创建后不可改。
- `postcards.reply_to_postcard_id UUID NULL` → `postcards(id)` `ON DELETE RESTRICT`。
- `CHECK (reply_to_postcard_id <> id)`。
- 部分唯一索引 `UNIQUE (reply_to_postcard_id) WHERE reply_to_postcard_id IS NOT NULL`：一张原信最多一封回信。
- 草稿不建唯一索引：允许放弃草稿后重建，最终唯一性由发送时的明信片约束保证。

### 9.3 API 与状态码

| Method | Endpoint | 变化 |
|---|---|---|
| POST | `/api/v1/postcards/drafts` | body 增加可选 `replyToPostcardId`；服务端推导 `recipientId` 与 `passageId` |
| PATCH | `/api/v1/postcards/drafts/:id` | 仍只接受 `body/recipientId`；提交 `replyToPostcardId` 视为非法字段（422） |
| GET | `/api/v1/postcards/:id` | 增加 `passageId: string \| null`、`canReply: boolean` |
| POST | `/api/v1/postcards/drafts/:id/send` | 发送前重新校验回信资格，成功后写入 `reply_to_postcard_id` |

创建草稿的校验顺序（置于既有“本人草稿 → 已发送幂等返回”之后）：

1. 原信存在且查看者是收件人 → 否则 404 `RESOURCE_NOT_ACCESSIBLE`；
2. 原信 `DELIVERED` → 否则 404；
3. 原信有 `passage_id` → 否则 422 `VALIDATION_ERROR`；
4. 双方无封锁 → 否则 403 `CONTACT_BLOCKED`；
5. `PassageReader.findSendContext` 非空且 `canSend` 为真 → 否则 404 / 409 `PASSAGE_STATE_CONFLICT`；
6. 原信尚无回信 → 否则 409 `POSTCARD_ALREADY_REPLIED`；
7. 客户端传入的 `recipientId` / `passageId` 与服务端推导一致 → 否则 422；
8. 写入草稿。

发送时重复 2–6；任一失败不写 `postcards`、不消耗草稿与每日额度。

`canReply` 由服务端计算，条件全部满足才为 true：查看者是原信收件人、原信 `DELIVERED`、原信有 `passageId`、双方无封锁、`canSend` 为真、该原信尚无回信。前端不得自行推导。

### 9.4 非目标

- 不生成双城日记（TASK-013）；
- 不支持对同一原信的第二次回信；
- 不支持撤回、编辑已发送的回信；
- 不新增通知、举报或 `RESTRICTED` 写入口。

### 9.5 验收

- 合法回信：草稿与明信片的收件人、`passageId`、`replyToPostcardId` 均由服务端推导，客户端不能指定第三人。
- 原信在途、查看者非参与者、原信无共途、回复自己的信、重复回信、停泊、封锁：返回约定的 404 / 422 / 409 / 403，且不落库。
- 并发发送同一原信的两封回信：只有一封成功，数据库只有一行对应 `reply_to_postcard_id`。
- 回信仍按城市距离延迟；送达前收件人不能读取正文。
- `GET /postcards/:id` 不因新增字段泄露 email、坐标、`receptionMode` 或角色。
