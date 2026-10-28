# STORY · 城市故事站

**优先级：P0** · 主导航：发现 · 归属：StoryModule / DiscoveryModule

## STORY-01 目标与产品形态

故事站是一个容量有限、经过审核、由真实生活片段组成的公共故事池。它**不是公开动态流**：不显示社交热度排行榜、点赞竞赛、无限刷新的个人动态。

用户可以按城市、主题和时间阅读；作者必须主动选择公开并通过审核。世界记忆地图只是另一种城市入口，复用相同的 Story ID 和审核状态。

## STORY-02 内容生命周期

```text
DRAFT ─→ PENDING ─→ APPROVED ─→ （有公开名额）ACTIVE
                  └→ REJECTED
APPROVED(排队) ─→ ACTIVE
ACTIVE ─→ ARCHIVED（容量轮换）/ REMOVED（作者撤回或安全下架）
```

为了减少状态混用，持久化上建议拆分：
- `review_status`: `DRAFT | PENDING | APPROVED | REJECTED | REMOVED`；
- `published_at`: 非空才进入公开集合；
- `archived_at`: 非空则退出当前公开池。

**公开条件**：`review_status=APPROVED AND published_at IS NOT NULL AND archived_at IS NULL`，且作者公开授权未撤回。审核通过不等于一定立刻公开。

## STORY-03 容量与筛选

初版**建议配置值**：每个城市同时展示最多 50 条活跃故事；用户每 7 天最多提交 3 条新稿。此为产品初始假设，后续可由配置调整而不改变业务代码。

容量满时，审核通过的内容等待发布位置；通过安全筛选和运营规则轮换，**不得默认依据点赞、粉丝量或社交热度排序**。允许按主题、城市或时间筛选；禁止算法自动把私人记忆转成故事。

## STORY-04 内容模型

`Story(id, authorId, cityId, title, body, topicTags, reviewStatus, publishedAt?, archivedAt?, createdAt, publicConsentAt?)`。

约束：
- 标题 1–80 字符；正文 20–3000 字符。
- 必须有城市级归属，但作者可以单独隐藏自己的个人城市信息。
- 发布授权必须是显式操作；私信和私人日记不会成为自动公开来源。
- 公开作者显示昵称或匿名标识（由授权决定），不显示邮箱、收件地址、精确坐标。

## STORY-05 API

- `GET /api/v1/stories?cityId=&topic=&cursor=`：仅活跃审核通过，支持分页。
- `GET /api/v1/stories/:id`：公开可见的详情。
- `POST /api/v1/stories`：作者提交，初始 PENDING。
- `GET /api/v1/stories/mine`：作者查看自己的各状态记录。
- `POST /api/v1/stories/:id/withdraw`：作者撤回公开授权。
- 审核端点属于 [12-safety-and-moderation.md](12-safety-and-moderation.md)，需审核员身份。

API 搜索缓存必须以公开状态为准；撤回/下架后的缓存需要失效或有受控短时效与严格权限保护。

## STORY-06 安全与审核

发布前审核：个人联系方式、隐私泄露、骚扰、仇恨与违法内容等；不能让模型自由“跳过审核”来提升体验。可用规则与人工复核协作，首版允许人工审核。拒绝后只向作者展示可理解的状态，不公开内部审核笔记。

## STORY-07 验收

- 作者在草稿、待审核、驳回状态的故事只对作者及授权审核人员可见。
- 审核通过且进入活跃池后，故事站和地图城市入口读取同一个 Story ID。
- 公开池达到配置容量时，新内容不能无上限占用活跃名额。
- 作者撤回或审核下架后，两个发现入口同时消失。
- 公开 API 不暴露作者邮箱、Session、精准位置、私信或私人纪念册内容。
- 不出现点赞榜、粉丝排名或把未审核内容直接公开的后门。
