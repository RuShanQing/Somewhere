# NOTICE · 来信提醒与通知偏好

**优先级：来信通知 P0；细化设置 P1** · 归属：NotificationModule

## NOTICE-01 目标

只在真正重要的时刻提醒用户：一张明信片已经抵达、需要处理自己的账号安全事件。减少负担，不催促回信。

## NOTICE-02 P0 通知类型

| 事件 | 产生时机 | 内容 |
|---|---|---|
| `POSTCARD_DELIVERED` | Worker 把在途明信片成功改为 DELIVERED 后 | “有一封来自远方的信到了” |
| `STORY_REVIEW_DECIDED` | 本人提交的公开故事获得审核结论 | 仅通知状态，不公开审核详情 |
| `ACCOUNT_SECURITY` | 需要用户处理的账号安全事件 | 不包含凭证、明文密码 |

首版可以只支持站内通知和有限的邮箱提醒接口预留；外部推送和营销通知不作为 P0 必需能力。

## NOTICE-03 重要约束

- 通知绝不提前预览未送达信件的正文，也不展示收件人位置。
- 对于同一个成功投递事件，重试 / 重复 Worker 运行只能生成一条相同通知（唯一业务键）。
- 不发送“对方已读”“怎么还不回信”“连续几天没写信”等压力性提醒。
- 通知只由真实业务事件触发，不能由客户端伪造“已到达”事件。
- 用户可关闭非安全性的通知；关闭通知不改变邮寄状态或内容访问权。
- 已封锁用户的昵称、内容等敏感信息应被安全处理，不因通知泄露。

## NOTICE-04 数据与 API

`notifications(id, user_id, kind, target_type, target_id, event_key, created_at, dismissed_at)`。
唯一键 `event_key, user_id, kind`（或等价去重方案）。

- `GET /api/v1/notifications`：本人列表（分页）。
- `POST /api/v1/notifications/:id/dismiss`：本人标记已处理。
- `PATCH /api/v1/notifications/preferences`：P1 细化通知偏好。

通知列表不应返回私人明信片正文、邮件完整地址或他人报告详情。

## NOTICE-05 验收

- 同一张信多次 Worker 扫描只产生一次到达通知。
- 提前未送达时，不产生正式到达通知，不返回正文。
- 不能读取或标记他人的通知。
- 用户暂时不打开 App，也不会丢失真正已送达的站内通知。
- 不产生已读催促、回信排行、连续通信天数或强制转发提醒。
