# PROFILE · 个人资料、城市与收信意愿

**优先级：P0** · 归属：ProfileModule / 设置页

## TASK-003 薄切片实现范围（2026-10-28 已实现）

- 已实现：昵称（沿用 `users.nickname`）、`profiles(city_id, reception_mode)`、`GET /cities`、`GET/PATCH /profile/me` 与最小 `/settings` 页面。
- 城市目录为手工种子 49 条，含 `country_code` 与城市中心坐标；公开接口只返回 `id/name/countryCode`，不返回经纬度；不接受用户自建城市。
- 资料行按需创建：没有 `profiles` 行时返回城市为空、`OPEN`；修改时 upsert。
- 新用户 `receptionMode` 默认 `OPEN`。
- 仍未实现：`bio`、`languages`、`topicTags`、`profileVisibility`、公开资料页与完整设置项。

## PROFILE-01 目标

用户用最少的信息表达自己，允许发现远方的故事，但不因使用产品而暴露精确位置或实时在线状态。

## PROFILE-02 字段

| 属性 | 规则 | 是否默认公开 |
|---|---|---|
| `nickname` | 1–32 字符，可修改 | 是 |
| `bio` | 可选，最多 300 字符 | 用户设置 |
| `cityId` | 选择静态城市目录；支持未知/隐藏 | 仅用户选择展示城市时 |
| `languages` | 支持多选，遵守 BCP 47 | 主题匹配必要范围内 |
| `topicTags` | 主题偏好，限制数量与长度 | 用户设置 |
| `receptionMode` | `OPEN / RESTING / CLOSED` | 仅以“可否接新信”展示 |
| `profileVisibility` | `CITY_VISIBLE / REGION_ONLY / HIDDEN` | 由本人选择 |

不收集精确 GPS、街道住址、实时定位、通讯录或在线时间；公开作者资料不展示邮箱。

## PROFILE-03 接信状态

- `OPEN`：可参与新的收信流程（仍受容量、权限和安全规则限制）。
- `RESTING`：暂时不参与新的相遇；已经在途的信照既定规则送达，除非安全策略拦截。
- `CLOSED`：拒绝新的陌生人通信；不自动取消自己的历史记忆访问权。
- 改变此设置不等于自动关闭已同意的信友关系或清除共途；需要各自专门操作。

## PROFILE-04 API

- `GET /api/v1/profile/me`；`PATCH /api/v1/profile/me`（用户本人）。
- `GET /api/v1/profiles/:id/public`（严格筛除敏感字段）。
- `GET /api/v1/cities?query=...`（公开城市目录，仅包含城市级信息）。
- 用户只能修改自己的个人资料。服务端计算可公开资料时必须遵守可见性枚举与封锁关系。

## PROFILE-05 数据与一致性

`profiles.user_id` 唯一；`cities.id` 受静态城市目录控制。邮寄时冻结收寄城市 ID 及用于计算的城市快照，后续搬家不改变已经发送信件的 `deliver_at`。显示城市可隐藏，但私人投递城市信息不能通过公开故事暴露。

## PROFILE-06 验收

- 用户修改昵称/语言/城市，刷新后仍正确显示。
- 将资料城市设为隐藏，匿名公共 API 不返回个人具体城市。
- 设置休息后不再接收新的陌生人通信行为，已送达历史记录仍可读。
- `GET /profiles/:id/public` 永远不返回 email、password_hash、Session 或内部审核标记。
- 更改城市不影响旧明信片的预计送达时间。
