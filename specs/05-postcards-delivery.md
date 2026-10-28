# POSTCARD · 明信片编辑、距离延迟与投递

**优先级：P0** · 归属：PostcardModule + DeliveryModule  
本规范是时间、权限、状态的**核心事实源**。

> 实现状态（2026-10-28，TASK-004）：已实现文字草稿 CRUD、发送事务、Haversine + `min(7200, 720 + ceil(D*60/150))` 延迟、城市快照、`IN_TRANSIT → DELIVERED` Worker、草稿/幂等键防重复、在途正文保密与每日 10 张上限。
>
> TASK-004 的明确边界：收件人来自服务端环境变量白名单（`POSTCARD_DEMO_RECIPIENT_EMAILS`），不是正式共途/信友关系；未实现回信、`passage_id`、`reply_to_postcard_id`、模板、通知、审核/封锁处置。`RESTRICTED` 已保留为枚举并拒绝正文，但当前没有写入路径。Worker 只负责投递，不生成通知。

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
| GET | `/api/v1/postcards/recipients` | TASK-004 临时白名单收件人，不含邮箱/坐标 |
| GET | `/api/v1/postcards/drafts/:id` | 仅作者读取单条草稿 |

输入 `recipientId / passageId` 只能作为待验证的引用，不能代替服务端权限决策。对不允许的资源使用 `RESOURCE_NOT_ACCESSIBLE`，避免泄露对象存在与否。

TASK-004 的发送校验顺序：本人草稿 → 已发送幂等返回 → 正文 → 收件人非空/非本人 → 服务端白名单 → 双方资料与城市 → 接信状态 `OPEN` → 每日上限 → 事务写入。第 11 张成功寄出返回 429 `RATE_LIMITED`；失败不消耗草稿。

## POSTCARD-08 验收

- D=0 与 D 很大时分别满足 12h 和 120h 边界；延迟随距离不减。
- 用服务器时间定义 ETA，不受用户浏览器时钟/时区影响。
- 发送请求幂等；发送事务失败不会留下半张“已寄出”信。
- 在途收件人不能通过任何列表、详情和通知读到正文。
- Worker 重复触发仍只投递一次；本阶段不生成通知，通知去重留待后续任务；停机恢复后可继续投递。
- 后端权限检查覆盖作者、收件人、封锁、安全处置和已到达状态。
- 只有经正确授权、已送达的信，才能成为双城日记的来源。
